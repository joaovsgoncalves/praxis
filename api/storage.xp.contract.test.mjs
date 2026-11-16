/**
 * Contrato dos repositórios de XP e conquistas (`xpEvents`, `gamification`, `achievements`,
 * `achievementFacts`) e dos registros de hábito e rituais que as conquistas leem (`habitLogs`,
 * `rituals`), nos dois motores.
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
import {
  XP_EVENT_FIELDS, GAMIFICATION_FIELDS, ACHIEVEMENT_FIELDS, HABIT_LOG_FIELDS, RITUAL_FIELDS, habitRow,
} from './storage/domains/phase3.js';
import { TASK_DEFAULTS } from './storage/contract.js';

async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) {
      if (!databases.has(owner)) {
        const db = createTestDb();
        // O esquema SQLite já nasce com a linha 'main' e as conquistas; o contrato parte do vazio nos dois motores.
        db.exec('DELETE FROM achievements; DELETE FROM gamification');
        databases.set(owner, db);
      }
      return databases.get(owner);
    },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    return createFirestoreDriver({ client, root: client.collection('storageContractRuns').doc(randomUUID()) });
  })();
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore() }),
    as: (owner, fn) => scope.run(owner, fn),
    databases,
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}

const xp = (id, type, source, amount, extra = {}) => ({ id, source_type: type, source_id: source, amount, reason: null, created_date: '2026-11-10 10:00:00', reversed_date: null, ...extra });
const ach = (id, extra = {}) => ({ id, name: id, description: 'd', emoji: 'x', xp_reward: 10, unlocked_date: null, ...extra });
const log = (id, habit, date, extra = {}) => ({ id, habit_id: habit, date, completed: 1, created_date: '2026-11-10 10:00:00', value: null, outcome: 'done', skip_reason: null, note: '', ...extra });
const ritual = (id, extra = {}) => ({ id, name: id, emoji: 'r', time_of_day: 'morning', habits_order: '[]', status: 'active', created_date: '2026-11-10 10:00:00', ...extra });
const taskRow = (id, extra = {}) => ({ ...TASK_DEFAULTS, id, title: id, category: 'pessoal', created_date: '2026-11-10 10:00:00', updated_date: '2026-11-10 10:00:00', ...extra });
const habit = (id, extra = {}) => habitRow({ id, title: id, created_date: '2026-11-10 10:00:00', ...extra });

/** Banco de conquistas pequeno e cheio de armadilhas; o resultado esperado está em FACTS. */
async function seedFacts(s) {
  for (const row of [
    taskRow('t1', { status: 'completed' }), taskRow('t2', { status: 'done' }), taskRow('t3'), taskRow('t4', { status: 'completed', category: 'jotav_fit' }),
    taskRow('t5', { category: 'jotav_fit' }), taskRow('t6', { status: 'Completed' }),
  ]) await s.tasks.create(row);
  for (const row of [
    habit('h1'), habit('h2', { sort_order: 3 }), habit('h3', { status: 'paused' }),
    habit('hc', { kind: 'compound', source: 'ritual_migration:r1' }), habit('hd', { kind: 'compound', source: 'ritual_migration:r2' }),
    habit('he', { kind: 'compound', source: 'ritual_migration:r3', status: 'paused' }), habit('hf', { kind: 'compound', source: 'ritual_migration:r5' }),
    habit('c1', { parent_id: 'hc', position_in_parent: 2 }), habit('c2', { parent_id: 'hc', position_in_parent: 1 }),
    habit('c3', { parent_id: 'hc', sort_order: 5 }), habit('c4', { parent_id: 'hc', sort_order: 0 }),
    habit('c5', { parent_id: 'hc', kind: 'compound' }), habit('c6', { parent_id: 'hd', position_in_parent: 1 }),
  ]) await s.habits.create(row);
  for (const row of [
    ritual('r1'), ritual('r2', { time_of_day: 'evening' }), ritual('r3', { status: 'paused', habits_order: '["x"]' }),
    ritual('r4', { habits_order: '["h1","h2"]' }), ritual('r5', { time_of_day: null, habits_order: null }),
    ritual('r6', { habits_order: 'não é json' }),
  ]) await s.rituals.create(row);
  for (const row of [
    log('l1', 'h1', '2026-11-10'), log('l2', 'h1', '2026-11-12', { completed: 0, outcome: 'skipped' }), log('l3', 'h1', '2026-11-11', { completed: 0, outcome: null }),
    log('l4', 'h2', '2026-11-10', { completed: null, outcome: 'done' }), log('l5', 'c1', '2026-11-12'), log('l6', 'c2', '2026-11-12'),
  ]) await s.habitLogs.create(row);
  for (const [id, date, seconds] of [['f1', '2026-11-10', 600], ['f2', '2026-11-11', null], ['f3', '2026-11-12', 1200]]) {
    await s.focusSessions.create({ id, task_id: null, task_title: null, date, duration_seconds: seconds, created_date: '2026-11-10 10:00:00' });
  }
  for (const [id, date] of [['w1', '2026-11-10'], ['w2', '2026-11-12'], ['w3', '2026-11-12'], ['w4', '2026-11-11']]) {
    await s.wellnessChecks.create({ id, date, sleep_hours: 7, sleep_quality: 3, mood: 3, productivity: 3, note: '', created_date: '2026-11-10 10:00:00' });
  }
}
const FACTS = {
  completedTasks: 3,
  jotavTasks: 2,
  activeSimpleHabits: [
    { id: 'h1', logs: [{ date: '2026-11-12', completed: 0, outcome: 'skipped' }, { date: '2026-11-11', completed: 0, outcome: null }, { date: '2026-11-10', completed: 1, outcome: 'done' }] },
    { id: 'h2', logs: [{ date: '2026-11-10', completed: null, outcome: 'done' }] },
    { id: 'c1', logs: [{ date: '2026-11-12', completed: 1, outcome: 'done' }] },
    { id: 'c2', logs: [{ date: '2026-11-12', completed: 1, outcome: 'done' }] },
    { id: 'c3', logs: [] }, { id: 'c4', logs: [] }, { id: 'c6', logs: [] },
  ],
  focusTotal: 1800,
  morningCompounds: [{ id: 'hc', childIds: ['c2', 'c1', 'c4', 'c3'] }],
  legacyMorningOrders: ['[]', '["h1","h2"]', 'não é json'],
  completedLogs: [{ habit_id: 'h1', date: '2026-11-10' }, { habit_id: 'c1', date: '2026-11-12' }, { habit_id: 'c2', date: '2026-11-12' }],
  wellnessDates: ['2026-11-12', '2026-11-11', '2026-11-10'],
};

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de XP, conquistas, registros de hábito e rituais`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('sem escopo falha fechado; linha incompleta, campo estranho ou tipo errado é recusado', async () => {
      await assert.rejects(() => s.xpEvents.activeTotal(), { code: 'tenant_scope_missing' });
      await assert.rejects(() => s.achievementFacts.load(), { code: 'tenant_scope_missing' });
      await as('alice', async () => {
        await assert.rejects(() => s.xpEvents.create({ id: 'x' }), { code: 'incomplete_row' });
        await assert.rejects(() => s.xpEvents.create({ ...xp('x', 'a', 'b', 1), user_id: 'bob' }), { code: 'unknown_field' });
        await assert.rejects(() => s.xpEvents.create(xp('x', 'a', 'b', null)), { code: 'invalid_value' });
        await assert.rejects(() => s.xpEvents.findActive('a', 5), { code: 'invalid_query' });
        await assert.rejects(() => s.xpEvents.weekTotal(5), { code: 'invalid_query' });
        await assert.rejects(() => s.xpEvents.reverse('x', 5), { code: 'invalid_query' });
        await assert.rejects(() => s.gamification.patch('main', { id: 'outro' }), { code: 'immutable_field' });
        await assert.rejects(() => s.gamification.patch('main', {}), { code: 'empty_patch' });
        await assert.rejects(() => s.achievements.patch('x', { name: 'novo' }), { code: 'immutable_field' });
        await assert.rejects(() => s.habitLogs.create(log('x', 'h', '2026-01-01', { habit_id: null })), { code: 'invalid_value' });
        await assert.rejects(() => s.rituals.create(ritual('r', { name: null })), { code: 'invalid_value' });
      });
    });

    await t.test('eventos: somas do SQLite, origem ativa única, estorno libera a origem', async () => as('xp', async () => {
      assert.equal(await s.xpEvents.activeTotal(), 0, 'COALESCE(SUM, 0)');
      assert.equal(await s.xpEvents.weekTotal('2026-01-01 00:00:00'), 0);
      for (const row of [
        xp('e1', 'baseline', 'main', 500, { created_date: '2026-11-10 10:00:00' }),
        xp('e2', 'manual', 'm1', 20, { created_date: '2026-11-09 03:00:00' }), xp('e3', 'manual', 'm2', 5, { created_date: '2026-11-09 02:59:59' }),
        xp('e4', 'task', 'k1', 10, { created_date: null }), xp('e5', 'task', 'k2', 7, { reversed_date: '2026-11-11 00:00:00' }),
        xp('e6', 'task', 'k3', -4, { created_date: '2026-11-12 08:00:00' }), xp('e7', 'task', 'k2', 3, { created_date: '2026-11-12 09:00:00' }),
      ]) await s.xpEvents.create(row);
      assert.equal(await s.xpEvents.activeTotal(), 500 + 20 + 5 + 10 - 4 + 3, 'estornado fora; negativo e NULL de data dentro');
      assert.equal(await s.xpEvents.weekTotal('2026-11-09 03:00:00'), 20 - 4 + 3, 'sem baseline, sem NULL, sem estornado; >= no limite');
      assert.equal(await s.xpEvents.weekTotal('2026-11-09 03:00:01'), -4 + 3);
      assert.equal(await s.xpEvents.weekTotal('2099-01-01 00:00:00'), 0);
      assert.deepEqual((await s.xpEvents.findActive('task', 'k2')).id, 'e7', 'o estornado não conta como ativo');
      assert.equal(await s.xpEvents.findActive('task', 'nada'), null);
      assert.equal(await s.xpEvents.findActive('Task', 'k2'), null, 'igualdade exata');
      assert.deepEqual(Object.keys(await s.xpEvents.findActive('manual', 'm1')), XP_EVENT_FIELDS);
      assert.deepEqual((await s.xpEvents.list()).map((r) => r.id), ['e4', 'e3', 'e2', 'e1', 'e5', 'e6', 'e7'], 'ordem created_date, id; NULL primeiro');

      await assert.rejects(() => s.xpEvents.create(xp('e8', 'manual', 'm1', 1)), { code: 'already_exists' });
      await assert.rejects(() => s.xpEvents.create(xp('e1', 'manual', 'novo', 1)), { code: 'already_exists' });
      await s.xpEvents.create(xp('e9', 'manual', 'm1', 1, { reversed_date: '2026-11-11 00:00:00' }));
      assert.equal((await s.xpEvents.findActive('manual', 'm1')).id, 'e2', 'estornado com a mesma origem convive');

      await s.xpEvents.reverse('e2', '2026-11-13 00:00:00');
      assert.equal(await s.xpEvents.findActive('manual', 'm1'), null);
      await s.xpEvents.create(xp('e10', 'manual', 'm1', 8, { created_date: '2026-11-13 01:00:00' }));
      assert.equal((await s.xpEvents.findActive('manual', 'm1')).id, 'e10', 'origem liberada pelo estorno');
      await assert.rejects(() => s.xpEvents.reverse('nada', '2026-11-13 00:00:00'), { code: 'not_found' });
      await s.xpEvents.reverse('e5', '2026-11-14 00:00:00');
      assert.equal((await s.xpEvents.list()).find((r) => r.id === 'e5').reversed_date, '2026-11-14 00:00:00', 'estornar de novo troca a data, como o UPDATE');
      await assert.rejects(() => s.xpEvents.create(xp('e12', 'task', 'k2', 1)), { code: 'already_exists' }, 'e7 segue ativo; o estorno de e5 (já estornado) não soltou a origem');
    }));

    await t.test('estornar e premiar a mesma origem na mesma transação; transação abortada não deixa nada', async () => as('troca', async () => {
      await s.xpEvents.create(xp('a1', 'task', 'k', 5));
      await s.transaction(async (tx) => {
        const active = await tx.xpEvents.findActive('task', 'k');
        await tx.xpEvents.reverse(active.id, '2026-11-12 00:00:00');
        await tx.xpEvents.create(xp('a2', 'task', 'k', 6));
      });
      assert.equal((await s.xpEvents.findActive('task', 'k')).id, 'a2');
      assert.equal(await s.xpEvents.activeTotal(), 6);
      await assert.rejects(() => s.transaction(async (tx) => {
        await tx.xpEvents.create(xp('a3', 'task', 'z', 1));
        await tx.xpEvents.create(xp('a4', 'task', 'z', 1));
      }), { code: 'already_exists' });
      assert.equal(await s.xpEvents.findActive('task', 'z'), null, 'nenhuma das duas ficou');
      await assert.rejects(() => s.transaction(async (tx) => {
        await tx.xpEvents.create(xp('a5', 'task', 'y', 1));
        await tx.xpEvents.activeTotal();
      }), { code: 'transaction_read_after_write' });
      await assert.rejects(() => s.transaction(async (tx) => {
        await tx.xpEvents.create(xp('a6', 'task', 'k', 1));
      }), { code: 'already_exists' }, 'a sentinela de k continua valendo depois da troca');
    }));

    await t.test('gamification: linha única "main" (criar, ler, alterar)', async () => as('main', async () => {
      assert.equal(await s.gamification.get('main'), null);
      const row = { id: 'main', xp_total: 0, level: 1, updated_date: '2026-11-10 10:00:00' };
      await s.gamification.create(row);
      assert.deepEqual(await s.gamification.get('main'), row);
      assert.deepEqual(Object.keys(await s.gamification.get('main')), GAMIFICATION_FIELDS);
      await assert.rejects(() => s.gamification.create(row), { code: 'already_exists' });
      await s.gamification.patch('main', { xp_total: 150, level: 2, updated_date: '2026-11-11 10:00:00' });
      assert.deepEqual(await s.gamification.get('main'), { id: 'main', xp_total: 150, level: 2, updated_date: '2026-11-11 10:00:00' });
      await assert.rejects(() => s.gamification.patch('outra', { xp_total: 1 }), { code: 'not_found' });
      await s.transaction(async (tx) => { const g = await tx.gamification.get('main'); await tx.gamification.patch('main', { xp_total: g.xp_total + 1 }); });
      assert.equal((await s.gamification.get('main')).xp_total, 151);
    }));

    await t.test('conquistas: ordem unlocked_date DESC, NULL por último, id; desbloquear', async () => as('conquistas', async () => {
      assert.deepEqual(await s.achievements.list(), []);
      for (const row of [ach('b'), ach('a'), ach('d', { unlocked_date: '2026-11-10' }), ach('c', { unlocked_date: '2026-11-12' }), ach('e', { unlocked_date: '2026-11-12' }), ach('z', { description: null, emoji: null, xp_reward: null })]) await s.achievements.create(row);
      assert.deepEqual((await s.achievements.list()).map((r) => r.id), ['c', 'e', 'd', 'a', 'b', 'z']);
      assert.deepEqual(Object.keys((await s.achievements.list())[0]), ACHIEVEMENT_FIELDS);
      await assert.rejects(() => s.achievements.create(ach('a')), { code: 'already_exists' });
      await s.achievements.patch('a', { unlocked_date: '2026-11-13' });
      assert.deepEqual((await s.achievements.list()).map((r) => r.id), ['a', 'c', 'e', 'd', 'b', 'z']);
      await assert.rejects(() => s.achievements.patch('nada', { unlocked_date: 'x' }), { code: 'not_found' });
    }));

    await t.test('registros de hábito: UNIQUE(habit_id, date); rituais', async () => as('registros', async () => {
      await s.habits.create(habit('h1')); await s.habits.create(habit('h2'));
      await s.habitLogs.create(log('l1', 'h1', '2026-11-10'));
      await s.habitLogs.create(log('l2', 'h1', '2026-11-11')); await s.habitLogs.create(log('l3', 'h2', '2026-11-10'));
      await assert.rejects(() => s.habitLogs.create(log('l4', 'h1', '2026-11-10')), { code: 'already_exists' });
      await assert.rejects(() => s.habitLogs.create(log('l1', 'h1', '2026-11-20')), { code: 'already_exists' });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.habitLogs.create(log('l5', 'h1', '2026-11-15')); await tx.habitLogs.create(log('l6', 'h1', '2026-11-15')); }), { code: 'transaction_read_after_write' }, 'criar lê a sequência: uma criação por transação');
      await s.habitLogs.create(log('l7', 'h1', '2026-11-15'));
      assert.deepEqual(Object.keys(log('l', 'h', 'd')), HABIT_LOG_FIELDS);
      await s.rituals.create(ritual('r1'));
      await assert.rejects(() => s.rituals.create(ritual('r1')), { code: 'already_exists' });
      assert.deepEqual(Object.keys(ritual('r')), RITUAL_FIELDS);
    }));

    await t.test('fatos das conquistas: as consultas de checkAchievements, cruas e em ordem canônica', async () => as('fatos', async () => {
      assert.deepEqual(await s.achievementFacts.load(), {
        completedTasks: 0, jotavTasks: 0, activeSimpleHabits: [], focusTotal: 0, morningCompounds: [], legacyMorningOrders: [], completedLogs: [], wellnessDates: [],
      });
      await seedFacts(s);
      assert.deepEqual(await s.achievementFacts.load(), FACTS);
    }));

    await t.test('duas contas não se cruzam', async () => {
      await as('alice', () => s.xpEvents.create(xp('i1', 'manual', 'm', 10)));
      await as('bob', () => s.xpEvents.create(xp('i1', 'manual', 'm', 99)));
      assert.equal(await as('alice', () => s.xpEvents.activeTotal()), 10);
      assert.equal(await as('bob', () => s.xpEvents.activeTotal()), 99);
      assert.equal((await as('bob', () => s.achievementFacts.load())).completedTasks, 0);
      await as('alice', () => s.gamification.create({ id: 'main', xp_total: 1, level: 1, updated_date: null }));
      assert.equal(await as('bob', () => s.gamification.get('main')), null);
    });
  });
}

test('sqlite: colunas dos repositórios = colunas reais das tabelas', () => {
  const db = createTestDb();
  for (const [table, fields] of [['xp_events', XP_EVENT_FIELDS], ['gamification', GAMIFICATION_FIELDS], ['achievements', ACHIEVEMENT_FIELDS], ['habit_logs', HABIT_LOG_FIELDS], ['rituals', RITUAL_FIELDS]]) {
    assert.deepEqual(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name), fields, table);
  }
  db.close();
});

test('sqlite: índice único parcial de xp_events e UNIQUE de habit_logs existem como o repositório do Firestore supõe', () => {
  const db = createTestDb();
  const sql = (name) => db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name).sql.replace(/\s+/g, ' ');
  assert.match(sql('idx_xp_events_active_source'), /UNIQUE INDEX idx_xp_events_active_source ON xp_events\(source_type, source_id\) WHERE reversed_date IS NULL/);
  assert.match(sql('idx_habit_logs_habit_date'), /UNIQUE INDEX idx_habit_logs_habit_date ON habit_logs\(habit_id, date\)/);
  db.close();
});

test('XP e conquistas: mesmos dados, mesma ordem, byte a byte, nos dois motores', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const sql = await fixture('sqlite'), fire = await fixture('firestore');
  t.after(sql.close); t.after(fire.close);
  const replay = (f) => f.as('paridade', async () => {
    const s = f.storage;
    for (const row of [xp('e1', 'baseline', 'main', 40), xp('e2', 'manual', 'm', 5, { created_date: null }), xp('e3', 'task', 'k', 2, { reversed_date: '2026-11-11 00:00:00' }), xp('e4', 'task', 'k', 3)]) await s.xpEvents.create(row);
    await s.xpEvents.reverse('e4', '2026-11-15 00:00:00');
    for (const row of [ach('b'), ach('a', { unlocked_date: '2026-11-10' }), ach('c', { xp_reward: null })]) await s.achievements.create(row);
    await seedFacts(s);
    return JSON.stringify([await s.xpEvents.list(), await s.xpEvents.activeTotal(), await s.xpEvents.weekTotal('2026-11-01 00:00:00'), await s.achievements.list(), await s.achievementFacts.load()]);
  });
  assert.equal(await replay(fire), await replay(sql));
});

test('firestore: soma de XP fora do subconjunto provado é recusada (o SQLite somaria fração)', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const f = await fixture('firestore'); t.after(f.close);
  await f.as('fracao', async () => {
    await f.storage.xpEvents.create(xp('f1', 'manual', 'm', 2.5));
    await assert.rejects(() => f.storage.xpEvents.activeTotal(), { code: 'sqlite_coercion_unsupported' });
  });
});
