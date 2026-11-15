/**
 * Contrato do domínio de metas (`goals`) e das partes de tarefas e hábitos que as metas usam
 * (posição MAX, vínculo inicial, soltar vínculos), nos dois motores.
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
import { GOAL_FIELDS, HABIT_FIELDS, habitRow } from './storage/domains/phase3.js';
import { TASK_FIELDS } from './storage/contract.js';

async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb()); return databases.get(owner); },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    return createFirestoreDriver({ client, root: client.collection('storageContractRuns').doc(randomUUID()) });
  })();
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore() }),
    as: (owner, fn) => scope.run(owner, fn),
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}

const goal = (id, extra = {}) => ({ id, title: id, description: '', deadline: null, timeframe: 'short', category: 'personal', status: 'active', manual_progress: 0, created_date: '2026-11-10 10:00:00', ...extra });
const task = (id, extra = {}) => ({ id, title: id, date: '2026-11-10', category: 'pessoal', ...extra });

async function legacyGoals(s) {
  for (const row of [goal('b'), goal('a'), goal('novo', { created_date: '2026-11-12 08:00:00' }), goal('nulo', { created_date: null, description: null, manual_progress: 'x' }), goal('c')]) await s.goals.create(row);
}

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de metas, hábitos e tarefas ligadas`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('sem escopo falha fechado; linha incompleta, campo estranho ou tipo errado é recusado', async () => {
      await assert.rejects(() => s.goals.list(), { code: 'tenant_scope_missing' });
      await assert.rejects(() => s.habits.maxSort(), { code: 'tenant_scope_missing' });
      await as('alice', async () => {
        await assert.rejects(() => s.goals.create({ id: 'x', title: 'x' }), { code: 'incomplete_row' });
        await assert.rejects(() => s.goals.create({ ...goal('x'), user_id: 'bob' }), { code: 'unknown_field' });
        await assert.rejects(() => s.goals.create(goal('x', { title: null })), { code: 'invalid_value' });
        await assert.rejects(() => s.habits.create(habitRow({ id: 'h', title: 'h', quick_increment: {} })), { code: 'invalid_value' });
        await assert.rejects(() => s.habits.createAt(habitRow({ id: 'h', title: 'h' }), 0), { code: 'invalid_row_token' });
        await assert.rejects(() => s.tasks.clearGoal(['ok', 5]), { code: 'invalid_record_id' });
        await assert.rejects(() => s.tasks.idsByGoal(null), { code: 'invalid_query' });
      });
    });

    await t.test('metas: ordem do SQLite (criação decrescente, NULL por último, empate na inserção); alterar e apagar', async () => as('ordem', async () => {
      await legacyGoals(s);
      const all = await s.goals.list();
      assert.deepEqual(all.map((r) => r.id), ['novo', 'b', 'a', 'c', 'nulo']);
      assert.deepEqual(Object.keys(all[0]), GOAL_FIELDS);
      assert.deepEqual(await s.goals.get('nulo'), goal('nulo', { created_date: null, description: null, manual_progress: 'x' }));
      for (const bad of [{ id: 'z' }, { created_date: '2026-01-01 00:00:00' }]) await assert.rejects(() => s.goals.patch('a', bad), { code: 'immutable_field' });
      await assert.rejects(() => s.goals.patch('nope', { title: 'x' }), { code: 'not_found' });
      await s.goals.patch('a', { title: 'mudou', deadline: '2026-12-31', manual_progress: 5 });
      assert.deepEqual(await s.goals.get('a'), goal('a', { title: 'mudou', deadline: '2026-12-31', manual_progress: 5 }));
      await s.goals.remove('b');
      assert.equal(await s.goals.get('b'), null);
      assert.deepEqual((await s.goals.list()).map((r) => r.id), ['novo', 'a', 'c', 'nulo']);
    }));

    await t.test('reserva de ordem: meta e hábito criados na mesma transação, depois das leituras', async () => as('ordem', async () => {
      await s.transaction(async (tx) => {
        const g = await tx.goals.nextRow(), h = await tx.habits.nextRow();
        await tx.goals.createAt(goal('reservada'), g);
        await tx.habits.createAt(habitRow({ id: 'h-res', title: 'Hábito', goal_id: 'reservada', sort_order: 0 }), h);
      });
      assert.deepEqual((await s.goals.list()).map((r) => r.id), ['novo', 'a', 'c', 'reservada', 'nulo'], 'empate com a, c: entra depois');
      const habit = await s.habits.get('h-res');
      assert.deepEqual(Object.keys(habit), HABIT_FIELDS);
      assert.equal(habit.goal_id, 'reservada');
      assert.equal(habit.streak_target, 30, 'padrões da tabela');
      await assert.rejects(() => s.transaction(async (tx) => {
        await tx.goals.createAt(goal('depois'), await tx.goals.nextRow());
        await tx.habits.nextRow();
      }), { code: 'transaction_read_after_write' });
      assert.equal(await s.goals.get('depois'), null);
    }));

    await t.test('tarefas e hábitos: MAX(sort_order) do SQLite, achar e soltar os itens de uma meta', async () => as('itens', async () => {
      assert.equal(await s.tasks.maxSort(), null);
      assert.equal(await s.habits.maxSort(), null);
      await s.tasks.create(task('t1', { goal_id: 'm1', sort_order: 3 }));
      await s.tasks.create(task('t2', { goal_id: 'm1', sort_order: null }));
      await s.tasks.create(task('t3', { goal_id: 'm2', sort_order: 41 }));
      await s.habits.create(habitRow({ id: 'h1', title: 'Correr', goal_id: 'm1', sort_order: 7 }));
      await s.habits.create(habitRow({ id: 'h2', title: 'Ler', goal_id: 'M1', sort_order: 2 }));
      assert.equal(await s.tasks.maxSort(), 41);
      assert.equal(await s.habits.maxSort(), 7);
      assert.deepEqual((await s.tasks.idsByGoal('m1')).sort(), ['t1', 't2']);
      assert.deepEqual(await s.habits.idsByGoal('m1'), ['h1'], 'igualdade exata (maiúscula conta)');
      await s.transaction(async (tx) => {
        const tasks = await tx.tasks.idsByGoal('m1'), habits = await tx.habits.idsByGoal('m1');
        await tx.tasks.clearGoal(tasks); await tx.habits.clearGoal(habits);
      });
      assert.deepEqual(await s.tasks.idsByGoal('m1'), []);
      assert.equal((await s.tasks.get('t1')).goal_id, null);
      assert.equal((await s.tasks.get('t3')).goal_id, 'm2', 'outra meta intacta');
      assert.equal((await s.habits.get('h2')).goal_id, 'M1');
      await s.tasks.clearGoal([]);
    }));

    await t.test('duas contas não se cruzam; id repetido é already_exists', async () => {
      await as('alice', () => s.goals.create(goal('mesma')));
      await as('bob', () => s.goals.create(goal('mesma', { title: 'da bob' })));
      assert.equal((await as('alice', () => s.goals.get('mesma'))).title, 'mesma');
      assert.equal((await as('bob', () => s.goals.get('mesma'))).title, 'da bob');
      assert.equal(await as('bob', () => s.tasks.maxSort()), null);
      await as('alice', () => assert.rejects(() => s.goals.create(goal('mesma')), { code: 'already_exists' }));
      await as('alice', () => assert.rejects(() => s.transaction(async (tx) => tx.goals.createAt(goal('mesma'), await tx.goals.nextRow())), { code: 'already_exists' }));
    });
  });
}

test('sqlite: colunas do repositório = colunas reais das tabelas', () => {
  const db = createTestDb();
  t_columns(db, 'goals', GOAL_FIELDS);
  t_columns(db, 'habits', HABIT_FIELDS);
  assert.deepEqual(db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name).sort(), [...TASK_FIELDS].sort(), 'tasks');
  db.close();
});
function t_columns(db, table, fields) {
  assert.deepEqual(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name), fields, table);
}

test('sqlite: padrões de habitRow = DEFAULT da tabela habits', () => {
  const db = createTestDb();
  db.prepare("INSERT INTO habits (id, title) VALUES ('d', 'Padrão')").run();
  const stored = db.prepare("SELECT * FROM habits WHERE id = 'd'").get();
  assert.deepEqual({ ...habitRow({ id: 'd', title: 'Padrão' }), created_date: 'X' }, { ...stored, created_date: 'X' });
  db.close();
});

test('metas: mesmos dados, mesma ordem, byte a byte, nos dois motores', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const sql = await fixture('sqlite'), fire = await fixture('firestore');
  t.after(sql.close); t.after(fire.close);
  const replay = (f) => f.as('paridade', async () => {
    const s = f.storage;
    await legacyGoals(s);
    await s.tasks.create(task('t1', { goal_id: 'a', sort_order: 41 }));
    await s.habits.create(habitRow({ id: 'h1', title: 'h', goal_id: 'a', sort_order: 'z', quick_increment: 0.5, created_date: '2026-11-10 10:00:00' }));
    await s.habits.create(habitRow({ id: 'h2', title: 'h', sort_order: 99, created_date: '2026-11-10 10:00:00' }));
    return JSON.stringify([await s.goals.list(), await s.goals.get('nulo'), await s.tasks.maxSort(), await s.tasks.idsByGoal('a'),
      await s.habits.maxSort(), await s.habits.idsByGoal('a'), await s.habits.get('h1')]);
  });
  assert.equal(await replay(fire), await replay(sql));
});
