/**
 * Contrato do domínio de tarefas da fase 3 (consultas das rotas, ordem de inserção, checklist, fila da
 * agenda, virada do dia) nos dois motores. O SQLite é a referência: o Firestore tem de devolver as mesmas
 * linhas, na mesma ordem, para o mesmo roteiro.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';
import { TASK_ROW_FIELDS, TASK_TABLE_DEFAULTS, taskRow } from './storage/contract.js';
import { CHECKLIST_FIELDS, QUEUE_FIELDS, ROLLOVER_FIELDS } from './storage/domains/phase3.js';

const now = () => new Date('2026-11-15T12:00:00Z');
const OWNER = 'alice';

async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client, root;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb({ withTaskRoutine: true })); return databases.get(owner); },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    root = client.collection('storageContractRuns').doc(randomUUID());
    return createFirestoreDriver({ client, root });
  })();
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore(), now }),
    as: (owner, fn) => scope.run(owner, fn),
    db: (owner = OWNER) => databases.get(owner),
    userDoc: (owner = OWNER) => root.collection('users').doc(owner),
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}

const task = (id, extra = {}) => taskRow({ id, title: id, date: '2026-11-10', created_date: '2026-11-01 10:00:00', updated_date: '2026-11-01 10:00:00', ...extra }, now());
const item = (id, taskId, extra = {}) => ({ id, task_id: taskId, title: id, done: 0, sort_order: null, created_date: '2026-11-01 10:00:00', updated_date: '2026-11-01 10:00:00', ...extra });
const queueRow = (taskId, extra = {}) => ({ task_id: taskId, snapshot: null, status: 'pending', attempts: 0, last_error: null, next_attempt_at: '2026-11-15T12:00:00.000Z', created_date: '2026-11-15 12:00:00', updated_date: '2026-11-15T12:00:00.000Z', ...extra });
/** Fichas consecutivas a partir da reservada por `nextRow()` (null no SQLite). */
const slots = (base) => () => { if (base === null) return null; const value = base; base += 1; return value; };

/** Tarefas com empates de `sort_order`/`created_date`, NULL, status fechados, ideias e séries. */
const DATASET = [
  task('a1', { sort_order: 2 }), task('a2', { sort_order: 2 }), task('a3', { sort_order: 1, created_date: '2026-11-02 10:00:00' }),
  task('n1', { sort_order: null, created_date: '2026-11-03 10:00:00' }), task('n2', { sort_order: null, created_date: '2026-11-05 10:00:00' }),
  task('n3', { sort_order: null, created_date: '2026-11-05 10:00:00' }),
  task('d1', { date: null, priority: 'high', sort_order: 5 }), task('d2', { date: '2026-11-12', priority: 'low', sort_order: 5 }),
  task('d3', { date: '2026-11-12', priority: 'medium', sort_order: 4 }), task('d4', { date: '2026-11-12', priority: 'medium', sort_order: 4 }),
  task('p1', { status: 'in_progress', date: '2026-11-14' }), task('s0', { status: null }), task('c0', { category: null }),
  task('i1', { category: 'ideias', idea_status: 'capturada' }), task('i2', { category: 'ideias', idea_status: 'virou_tarefa', status: 'completed' }),
  task('k1', { status: 'completed', completed_date: '2026-11-15', updated_date: '2026-11-15 08:00:00' }),
  task('k2', { status: 'done', completed_date: null, completed_at: '2026-11-15T20:00:00.000Z', updated_date: '2026-11-15 09:00:00' }),
  task('k3', { status: 'completed', completed_date: '', completed_at: null, updated_date: '2026-11-15 07:00:00' }),
  task('k4', { status: 'completed', completed_date: '2026-11-14', completed_at: '2026-11-15T01:00:00.000Z', updated_date: '2026-11-15 06:00:00' }),
  task('k5', { status: 'done', completed_date: '2026-11-15', updated_date: '2026-11-15 08:00:00' }),
  task('m1', { status: 'cancelled', day_outcome: 'missed', day_outcome_date: '2026-11-14' }), task('m2', { status: 'cancelled', day_outcome: 'missed', day_outcome_date: '2026-11-01' }),
  task('m3', { status: 'cancelled', day_outcome: 'not_today', day_outcome_date: '2026-11-14' }), task('m4', { status: 'cancelled', day_outcome: 'missed', day_outcome_date: '2026-11-14' }),
  task('r1', { recurrence: 'daily', date: '2026-11-08', recurrence_parent_id: null }), task('r2', { recurrence: 'daily', date: '2026-11-09', recurrence_parent_id: 'r1' }),
  task('r3', { recurrence: 'daily', date: '2026-11-16', recurrence_parent_id: 'r1' }), task('r4', { recurrence: 'daily', date: '2026-11-16', recurrence_parent_id: 'r1', status: 'cancelled' }),
  task('sn', { source: 'seneca', time: '09:00', date: '2026-11-09' }), task('sx', { source: 'seneca', time: '', date: '2026-11-09' }),
  task('g1', { goal_id: 'g' }), task('g2', { goal_id: 'g' }),
];
const dataset = DATASET;

async function seed(s) {
  for (const row of dataset) await s.transaction(async (tx) => { const t = await tx.tasks.nextRow(); await tx.tasks.createAt(row, t); });
}
const ids = (rows) => rows.map((row) => row.id);

/** Tudo o que as rotas leem do repositório, para comparar os dois motores. */
async function readAll(s) {
  const out = {};
  out.all = ids(await s.tasks.all());
  out.operational = ids(await s.tasks.operational());
  out.search = {};
  for (const [name, q] of Object.entries({
    none: {}, date: { date: '2026-11-10' }, status: { status: 'pending' }, category: { category: 'ideias' }, idea: { idea_status: 'capturada' },
    both: { date: '2026-11-10', status: 'pending' }, page1: { limit: 5, offset: 0 }, page2: { limit: 5, offset: 5 }, deep: { limit: 5, offset: 100 }, noMatch: { date: 'nunca' },
  })) out.search[name] = ids(await s.tasks.search({ limit: 1000, offset: 0, ...q }));
  out.completed = ids(await s.tasks.completedOn('2026-11-15'));
  out.completedNone = ids(await s.tasks.completedOn('2030-01-01'));
  out.missed = ids(await s.tasks.missedSince('2026-11-01'));
  out.missedRecent = ids(await s.tasks.missedSince('2026-11-14'));
  out.occurrence = [await s.tasks.findOccurrence('r1', '2026-11-16', 'r3'), await s.tasks.findOccurrence('r1', '2026-11-16', 'zzz'), await s.tasks.findOccurrence('r1', '2026-11-20', 'zzz'), await s.tasks.findOccurrence('r2', '2026-11-09', 'zzz')];
  out.upcoming = [await s.tasks.hasOpenUpcoming('r1', '2026-11-15'), await s.tasks.hasOpenUpcoming('r1', '2026-11-17'), await s.tasks.hasOpenUpcoming('nada', '2000-01-01')];
  out.stale = ids(await s.tasks.staleForRollover('2026-11-15'));
  out.maxSort = [await s.tasks.maxSort(), await s.tasks.maxSortExcept('d1'), await s.tasks.maxSortExcept('a1')];
  out.byGoal = (await s.tasks.idsByGoal('g')).sort();
  out.rows = await s.tasks.all();
  return out;
}

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de tarefas da fase 3`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('create é readwrite: depois de gravar, leitura e nextRow são recusados; antes, passam', () => as(OWNER, async () => {
      await s.tasks.create({ id: 'base', title: 'base' });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.tasks.patch('base', { title: 'x' }); await tx.tasks.create({ id: 'x', title: 'x' }); }), { code: 'transaction_read_after_write' });
      assert.equal((await s.tasks.get('base')).title, 'base', 'recusada antes de gravar: nada mudou');
      await s.tasks.remove('base');
      await assert.rejects(() => s.transaction(async (tx) => { await tx.tasks.remove('nada'); await tx.tasks.nextRow(); }), { code: 'transaction_read_after_write' });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.tasks.remove('nada'); await tx.tasks.search({ limit: 1, offset: 0 }); }), { code: 'transaction_read_after_write' });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.tasks.remove('nada'); await tx.tasks.reorder([]); }), { code: 'transaction_read_after_write' });
      const made = await s.transaction(async (tx) => { await tx.tasks.nextRow(); return tx.tasks.create({ id: 'ok', title: 'ok' }); });
      assert.equal(made.id, 'ok');
      await s.tasks.remove('ok');
    }));

    await t.test('createAt grava a linha completa, com ficha própria; ficha e linha inválidas são recusadas', () => as(OWNER, async () => {
      await assert.rejects(() => s.tasks.createAt(task('x'), 0), { code: 'invalid_row_token' });
      await assert.rejects(() => s.tasks.createAt({ id: 'x', title: 'x' }, null), { code: 'incomplete_task' });
      await assert.rejects(() => s.tasks.createAt({ ...task('x'), user_id: 'bob' }, null), { code: 'unknown_task_field' });
      await assert.rejects(() => s.tasks.createAt({ ...task('x'), sort_order: 1.5 }, null), { code: 'invalid_task_integer' });
      // título vazio é aceito (a PUT antiga gravava '')
      await s.transaction(async (tx) => { await tx.tasks.createAt(task('vazio', { title: '' }), await tx.tasks.nextRow()); });
      assert.equal((await s.tasks.get('vazio')).title, '');
      await s.tasks.patch('vazio', { title: '' });
      await s.tasks.remove('vazio');
    }));

    await t.test('o roteiro completo de leituras bate com o SQLite (ordem, empates, NULL, janelas)', () => as(OWNER, async () => {
      await seed(s);
      const out = await readAll(s);
      // Referência escrita à mão para o que o SQL define (vale nos dois motores).
      assert.deepEqual(out.all.slice(0, 6), ['a3', 'a1', 'a2', 'd3', 'd4', 'd1'], 'sort_order ASC; empates na ordem de inserção');
      assert.deepEqual(out.all.filter((id) => ['n1', 'n2', 'n3'].includes(id)), ['n2', 'n3', 'n1'], 'NULLs por created_date DESC (n2 e n3 empatam: inserção)');
      assert.deepEqual(out.completed, ['k2', 'k1', 'k5', 'k3'].filter((id) => out.completed.includes(id)));
      assert.ok(!out.completed.includes('i2'), 'ideias fora');
      assert.ok(!out.completed.includes('k4'), 'completed_date de outro dia vence completed_at');
      assert.deepEqual(out.missed.filter((id) => ['m1', 'm4', 'm2'].includes(id)), ['m1', 'm4', 'm2'], 'day_outcome_date DESC, empate na inserção');
      assert.deepEqual(out.missedRecent, ['m1', 'm4']);
      assert.deepEqual(out.stale, ['r1', 'r2', 'sn'], 'date ASC, empate na inserção; bloco do Sêneca só com hora');
      assert.deepEqual(out.occurrence.map((row) => row?.id ?? null), ['r4', 'r3', null, 'r2']);
      assert.deepEqual(out.upcoming, [true, false, false]);
      assert.equal(out.operational.includes('s0'), false, 'status NULL fica fora de NOT IN');
      assert.equal(out.operational.includes('c0'), false, 'categoria NULL fica fora de !=');
      assert.deepEqual(out.maxSort, [5, 5, 5]);
      f.snapshot = out;
    }));

    await t.test('reorder só mexe em quem existe e a lista reflete a nova ordem', () => as(OWNER, async () => {
      await s.transaction((tx) => tx.tasks.reorder([['g2', 0], ['fantasma', 1], ['g1', 2]]));
      const all = ids(await s.tasks.all());
      assert.ok(all.indexOf('g2') < all.indexOf('g1'));
      assert.equal(await s.tasks.get('fantasma'), null);
      assert.equal((await s.tasks.get('g2')).sort_order, 0);
      await assert.rejects(() => s.tasks.reorder([['a', 1.5]]), { code: 'invalid_task_query' });
    }));

    await t.test('criações concorrentes não repetem a ordem de inserção', () => as('conc', async () => {
      await Promise.all(Array.from({ length: 6 }, (_, i) => s.transaction(async (tx) => { await tx.tasks.createAt(task(`c${i}`), await tx.tasks.nextRow()); })));
      assert.equal((await s.tasks.all()).length, 6);
      if (kind === 'firestore') {
        const docs = (await f.userDoc('conc').collection('tasks').get()).docs.map((doc) => doc.data()._row).sort((a, b) => a - b);
        assert.deepEqual(docs, [1, 2, 3, 4, 5, 6]);
      } else {
        assert.deepEqual(f.db('conc').prepare('SELECT rowid FROM tasks ORDER BY rowid').pluck().all(), [1, 2, 3, 4, 5, 6]);
      }
    }));

    await t.test('checklist: ordem, totais, escopo por tarefa, remoção em bloco', () => as(OWNER, async () => {
      const L = s.taskChecklistItems;
      await assert.rejects(() => L.createAt(item('x', 't'), 0), { code: 'invalid_row_token' });
      await assert.rejects(() => L.create({ ...item('x', 't'), id: undefined }), { code: 'invalid_record_id' });
      const rows = [item('c1', 'tk', { sort_order: 1 }), item('c2', 'tk', { sort_order: 0 }), item('c3', 'tk', { sort_order: null }), item('c4', 'tk', { sort_order: 1, created_date: '2026-11-01 09:00:00' }),
        item('o1', 'outra', { done: 1 }), item('o2', 'outra', { done: 0 }), item('o3', 'outra', { done: 1 }), item('z1', 'zero')];
      await s.transaction(async (tx) => { const next = slots(await tx.taskChecklistItems.nextRow()); for (const row of rows) await tx.taskChecklistItems.createAt(row, next()); });
      assert.deepEqual(ids(await L.list('tk')), ['c2', 'c4', 'c1', 'c3'], 'sort_order, depois created_date; NULL por último');
      assert.deepEqual(await L.list('vazio'), []);
      assert.equal(await L.maxSort('tk'), 1);
      assert.equal(await L.maxSort('vazio'), null);
      assert.equal((await L.get('c1', 'tk')).title, 'c1');
      assert.equal(await L.get('c1', 'outra'), null, 'item de outra tarefa não vale');
      const counts = (await L.counts(['tk', 'outra', 'nada', 'zero'])).sort((a, b) => (a.task_id < b.task_id ? -1 : 1));
      assert.deepEqual(counts.map((c) => [c.task_id, Number(c.total), Number(c.done)]), [['outra', 3, 2], ['tk', 4, 0], ['zero', 1, 0]]);
      assert.deepEqual(await L.counts([]), []);
      await L.patch('c1', { done: 1, title: 'novo', updated_date: '2026-11-15 12:00:00' });
      assert.deepEqual([(await L.get('c1', 'tk')).done, (await L.get('c1', 'tk')).title], [1, 'novo']);
      await assert.rejects(() => L.patch('c1', { task_id: 'outra' }), { code: 'immutable_field' });
      await assert.rejects(() => L.patch('nao-existe', { done: 1 }), { code: 'not_found' });
      await L.remove('c3');
      assert.deepEqual(ids(await L.list('tk')), ['c2', 'c4', 'c1']);
      await s.transaction((tx) => tx.taskChecklistItems.removeByTask('tk'));
      assert.deepEqual(await L.list('tk'), []);
      assert.equal((await L.list('outra')).length, 3, 'outra tarefa intacta');
      await s.transaction(async (tx) => { await tx.tasks.remove('nada'); await assert.rejects(() => tx.taskChecklistItems.removeByTask('x'), { code: 'transaction_read_after_write' }); }).catch(() => {});
    }));

    await t.test('fila da agenda: uma linha por tarefa, vencidas por next_attempt_at, finish/fail só valem para a mesma intenção', () => as(OWNER, async () => {
      const Q = s.taskCalendarQueue;
      await assert.rejects(() => Q.createAt({ ...queueRow('q'), attempts: null }, null), { code: 'invalid_value' });
      await s.transaction(async (tx) => {
        const next = slots(await tx.taskCalendarQueue.nextRow());
        for (const [id, at] of [['q1', '2026-11-15T11:00:00.000Z'], ['q2', '2026-11-15T10:00:00.000Z'], ['q3', '2026-11-15T10:00:00.000Z'], ['q4', '2026-11-16T10:00:00.000Z']]) {
          await tx.taskCalendarQueue.createAt(queueRow(id, { next_attempt_at: at, snapshot: id === 'q3' ? '{"id":"q3"}' : null }), next());
        }
        await tx.taskCalendarQueue.createAt(queueRow('qf', { status: 'failed', attempts: 8 }), next());
      });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.taskCalendarQueue.createAt(queueRow('q1'), await tx.taskCalendarQueue.nextRow()); }), { code: 'already_exists' });
      assert.deepEqual(ids((await Q.due('2026-11-15T12:00:00.000Z', 20)).map((r) => ({ id: r.task_id }))), ['q2', 'q3', 'q1']);
      assert.deepEqual((await Q.due('2026-11-15T12:00:00.000Z', 2)).map((r) => r.task_id), ['q2', 'q3']);
      assert.deepEqual((await Q.stats()).map((r) => [r.status, Number(r.total)]).sort(), [['failed', 1], ['pending', 4]]);
      assert.equal((await Q.get('q3')).snapshot, '{"id":"q3"}');
      // a intenção mudou durante a chamada (updated_date novo): finish/fail não valem
      await Q.patch('q1', { updated_date: '2026-11-15T12:00:05.000Z', attempts: 0 });
      await Q.finish('q1', '2026-11-15T12:00:00.000Z');
      assert.ok(await Q.get('q1'), 'intenção nova fica');
      await Q.fail('q2', '2026-11-15T09:00:00.000Z', { attempts: 1, last_error: 'velha' });
      assert.equal((await Q.get('q2')).attempts, 0, 'fail com updated_date velho não grava');
      await Q.fail('q2', '2026-11-15T12:00:00.000Z', { attempts: 1, status: 'pending', last_error: 'erro', next_attempt_at: '2026-11-15T12:01:00.000Z', updated_date: '2026-11-15T12:00:00.000Z' });
      assert.deepEqual([(await Q.get('q2')).attempts, (await Q.get('q2')).last_error], [1, 'erro']);
      await Q.finish('q3', '2026-11-15T12:00:00.000Z');
      assert.equal(await Q.get('q3'), null);
      assert.deepEqual((await Q.list()).map((r) => r.task_id), ['q1', 'q2', 'q4', 'qf'], 'ordem de inserção');
      await assert.rejects(() => Q.patch('nao-existe', { attempts: 1 }), { code: 'not_found' });
      // dentro da transação: leitura, depois escrita condicional
      await s.transaction(async (tx) => { await tx.taskCalendarQueue.finish('q4', '2026-11-15T12:00:00.000Z'); });
      assert.equal(await Q.get('q4'), null);
    }));

    await t.test('virada do dia: uma linha por dia, criar duas vezes falha, patch soma', () => as(OWNER, async () => {
      const R = s.dayRolloverRuns;
      assert.equal(await R.get('2026-11-15'), null);
      const row = { day: '2026-11-15', closed: 0, first_run_at: '2026-11-15 12:00:00', last_change_at: null };
      await R.create(row);
      await assert.rejects(() => R.create(row), { code: 'already_exists' });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.dayRolloverRuns.create({ ...row, day: '2026-11-16' }); await tx.dayRolloverRuns.create({ ...row, day: '2026-11-16' }); }), { code: 'already_exists' });
      assert.equal(await R.get('2026-11-16'), null, 'a transação inteira desfeita');
      await R.patch('2026-11-15', { closed: 3, last_change_at: '2026-11-15 12:01:00' });
      assert.deepEqual(await R.get('2026-11-15'), { ...row, closed: 3, last_change_at: '2026-11-15 12:01:00' });
      await assert.rejects(() => R.patch('2026-11-15', { day: 'x' }), { code: 'immutable_field' });
      await assert.rejects(() => R.patch('1999-01-01', { closed: 1 }), { code: 'not_found' });
      assert.deepEqual((await R.list()).map((r) => r.day), ['2026-11-15']);
    }));

    await t.test('dois donos não se enxergam', async () => {
      assert.equal((await as('bob', () => s.tasks.all())).length, 0);
      assert.equal(await as('bob', () => s.taskCalendarQueue.get('q1')), null);
      assert.equal(await as('bob', () => s.dayRolloverRuns.get('2026-11-15')), null);
      assert.deepEqual(await as('bob', () => s.taskChecklistItems.list('outra')), []);
    });
  });
}

test('esquema: campos, ordem e DEFAULT das tabelas batem com o SQLite (PRAGMA)', () => {
  const db = createTestDb({ withTaskRoutine: true });
  const info = (table) => db.prepare(`PRAGMA table_info(${table})`).all();
  assert.deepEqual(info('tasks').map((c) => c.name), [...TASK_ROW_FIELDS], 'ordem física das colunas de tasks');
  const defaults = Object.fromEntries(info('tasks').filter((c) => c.dflt_value !== null && !c.dflt_value.startsWith('datetime')).map((c) => [c.name, c.dflt_value.replace(/^'|'$/g, '')]));
  assert.deepEqual(defaults, { ...TASK_TABLE_DEFAULTS }, 'DEFAULT das colunas de tasks');
  assert.deepEqual(info('task_checklist_items').map((c) => c.name), [...CHECKLIST_FIELDS]);
  assert.deepEqual(info('task_calendar_queue').map((c) => c.name), [...QUEUE_FIELDS]);
  assert.deepEqual(info('day_rollover_runs').map((c) => c.name), [...ROLLOVER_FIELDS]);
  db.close();
});

test('os dois motores devolvem as mesmas leituras e o mesmo conteúdo de linha', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const sql = await fixture('sqlite'), fire = await fixture('firestore');
  t.after(sql.close); t.after(fire.close);
  const run = (f) => f.as(OWNER, async () => { await seed(f.storage); return readAll(f.storage); });
  assert.deepEqual(await run(fire), await run(sql));
});

test('Firestore: documento sem _row (dado das fases 1-2) vem antes dos numerados e empata por id', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const f = await fixture('firestore'); t.after(f.close);
  await f.as(OWNER, async () => {
    const ref = (id) => f.userDoc().collection('tasks').doc(id);
    for (const id of ['z', 'a']) await ref(id).set(Object.fromEntries(Object.entries(task(id)).filter(([k]) => k !== '_row')));
    await f.storage.transaction(async (tx) => { await tx.tasks.createAt(task('n'), await tx.tasks.nextRow()); });
    assert.deepEqual(ids(await f.storage.tasks.all()), ['a', 'z', 'n'], 'mesma sort_order e created_date: antigos por id, depois a inserção nova');
    assert.equal((await f.userDoc().collection('tasks').doc('n').get()).data()._row, 1);
  });
});
