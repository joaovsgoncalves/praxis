import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';
import { copyToFirestore, seedInsights, INSIGHTS_TABLES, TODAY, WEEK_END, WEEK_START } from './test-support/insightsFixture.fase4.mjs';

/**
 * Contrato do domínio de leitura `insightsRead` (tabelas de tarefas, hábitos, foco, bem-estar, capturas e
 * frentes, lidas pelos insights). O SQLite roda as consultas da rota antiga; o Firestore tem de devolver
 * exatamente o mesmo, linha a linha, em ordem e nos tetos, sobre a mesma massa.
 */
function build(kind) {
  const scope = new AsyncLocalStorage();
  const db = createTestDb({ withProjects: true, withCaptureQueue: true });
  seedInsights(db);
  if (kind === 'sqlite') {
    return { storage: createStorage({ driver: createSqliteDriver({ open: () => db }), currentOwner: () => scope.getStore() }), as: (o, fn) => scope.run(o, fn), db, close: async () => db.close() };
  }
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
  const client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
  const root = client.collection('storageContractRuns').doc(randomUUID());
  const driver = createFirestoreDriver({ client, root });
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore() }), as: (o, fn) => scope.run(o, fn), db, root,
    seed: () => copyToFirestore(root.collection('users').doc('alice'), db),
    close: async () => { db.close(); await client.terminate(); },
  };
}

const CALLS = [
  ['completedTasksOfWeek', [WEEK_START, WEEK_END]], ['completedTasksOfWeek', ['2026-10-01', '2026-10-02']], ['completedTasksOfWeek', ['2030-01-01', '2030-01-07']],
  ['stalePendingTasks', [WEEK_START]], ['stalePendingTasks', ['2026-09-01']],
  ['activeHabits', []], ['habitLogs', [WEEK_START, WEEK_END]], ['habitLogs', ['2026-10-14', TODAY]], ['habitLogs', ['2031-01-01', '2031-01-02']],
  ['taskDayCounts', [WEEK_START, WEEK_END]], ['taskDayCounts', ['2026-10-18', '2026-10-18']],
  ['focusTotals', [WEEK_START, WEEK_END]], ['focusTotals', [TODAY, TODAY]], ['focusTotals', ['2031-01-01', '2031-01-02']],
  ['wellnessBetween', [WEEK_START, WEEK_END]], ['wellnessSince', ['2026-10-12']], ['wellnessSince', ['2040-01-01']],
  ['ideaCounts', [WEEK_START, WEEK_END]], ['promissoras', []],
  ['projectNames', []], ['projectUpdatesBetween', [WEEK_START, WEEK_END]], ['completedTasksForHistory', [WEEK_START, WEEK_END]],
  ['focusSessionsSince', ['2026-10-12 10:00:00']], ['focusSessionsSince', ['2026-10-12T10:00:00.000Z']],
  ['overdueTasks', [TODAY]], ['overdueTasks', ['2026-10-03']], ['floatingTasks', ['2026-10-08']], ['staleIdeas', ['2026-10-08']],
  ['closedHabitIds', ['2026-10-14']], ['closedHabitIds', [TODAY]], ['skippedHabitIds', ['2026-10-14']],
  ['skippedHabitCounts', ['2026-10-08', TODAY]], ['skippedHabitCounts', ['2026-10-12', '2026-10-13']],
  ['failedCaptureCount', []], ['pendingTodayCount', [TODAY]], ['pendingTodayCount', ['2030-01-01']],
];

const reference = new Map();
async function results(f) {
  return f.as('alice', async () => {
    const out = [];
    for (const [method, args] of CALLS) out.push(await f.storage.insightsRead[method](...args));
    return out;
  });
}

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato da leitura dos insights (consultas, ordem, tetos, NULL)`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = build(kind); t.after(f.close);
    if (f.seed) await f.seed();
    await assert.rejects(() => f.storage.insightsRead.activeHabits(), { code: 'tenant_scope_missing' });
    const got = await results(f);
    if (kind === 'sqlite') {
      // Tetos e filtros do SQL antigo, lidos no SQLite como referência.
      const [week, , empty, stale] = got;
      assert.equal(week.length, 50, 'LIMIT 50 das concluídas da semana');
      assert.equal(empty.length, 0);
      assert.equal(stale.length, 10, 'LIMIT 10 das atrasadas');
      assert.ok(week.every((r) => r.category !== null && r.category !== 'ideias'), 'categoria NULL e ideias ficam fora');
      assert.equal(got[CALLS.findIndex(([m, a]) => m === 'overdueTasks' && a[0] === TODAY)].length, 24, 'LIMIT 24 do cockpit');
      assert.equal(got[CALLS.findIndex(([m]) => m === 'floatingTasks')].length, 5);
      assert.equal(got[CALLS.findIndex(([m]) => m === 'staleIdeas')].length, 5);
      assert.equal(got[CALLS.findIndex(([m]) => m === 'completedTasksForHistory')].length, 80, 'LIMIT 80 do histórico');
      assert.equal(got[CALLS.findIndex(([m]) => m === 'promissoras')].length, 5);
      assert.equal(got[CALLS.findIndex(([m]) => m === 'failedCaptureCount')], 2);
      assert.deepEqual(got[CALLS.findIndex(([m]) => m === 'focusTotals')], { sessions: 7, total_seconds: 6300 });
      reference.set('sqlite', got);
    } else {
      // Mesma massa: o Firestore devolve exatamente o que o SQLite devolveu.
      const expected = reference.get('sqlite') ?? await (async () => { const s = build('sqlite'); try { return await results(s); } finally { await s.close(); } })();
      for (let i = 0; i < CALLS.length; i += 1) assert.deepEqual(got[i], expected[i], `${CALLS[i][0]}(${CALLS[i][1].join(', ')})`);
    }
    // Dentro de transação (retrato único) devolve o mesmo.
    const inTx = await f.as('alice', () => f.storage.transaction(async (tx) => [await tx.insightsRead.activeHabits(), await tx.insightsRead.pendingTodayCount(TODAY)]));
    assert.deepEqual(inTx[0], got[CALLS.findIndex(([m]) => m === 'activeHabits')]);
    assert.equal(inTx[1], got[CALLS.findIndex(([m, a]) => m === 'pendingTodayCount' && a[0] === TODAY)]);
    // Outra conta não vê nada.
    if (kind === 'firestore') assert.deepEqual(await f.as('bob', () => f.storage.insightsRead.activeHabits()), []);
  });

  test(`${kind}: argumento de data inválido é recusado antes de consultar`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = build(kind); t.after(f.close);
    await f.as('alice', async () => {
      for (const bad of [5, null, undefined, {}, ['2026-10-12']]) {
        await assert.rejects(() => f.storage.insightsRead.habitLogs(bad, '2026-10-12'), { code: 'invalid_insights_argument' });
        await assert.rejects(() => f.storage.insightsRead.pendingTodayCount(bad), { code: 'invalid_insights_argument' });
      }
      await assert.rejects(() => f.storage.insightsRead.pendingTodayCount(), { code: 'invalid_insights_argument' });
      assert.throws(() => f.storage.insightsRead.nope(), TypeError);
    });
  });
}

test('firestore: documento sem `_row` desempata pelo id (ordem de inserção desconhecida)', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const f = build('firestore'); t.after(f.close);
  const userDoc = f.root.collection('users').doc('alice');
  for (const id of ['z', 'a', 'm']) await userDoc.collection('tasks').doc(id).set({ id, title: id, date: '2026-10-01', status: 'pending', category: 'pessoal', priority: 'low', created_date: '2026-09-01 09:00:00', updated_date: '2026-09-01 09:00:00' });
  const rows = await f.as('alice', () => f.storage.insightsRead.overdueTasks(TODAY));
  assert.deepEqual(rows.map((r) => r.id), ['a', 'm', 'z']);
});

test('firestore: soma de foco recusa valor que o SQLite trataria como texto', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const f = build('firestore'); t.after(f.close);
  const userDoc = f.root.collection('users').doc('alice');
  await userDoc.collection('focusSessions').doc('x').set({ id: 'x', date: '2026-10-12', duration_seconds: 'abc' });
  await assert.rejects(() => f.as('alice', () => f.storage.insightsRead.focusTotals('2026-10-12', '2026-10-12')), { code: 'sqlite_coercion_unsupported' });
});
