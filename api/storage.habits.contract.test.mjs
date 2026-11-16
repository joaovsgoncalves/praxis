/**
 * Contrato dos repositórios que as rotas de hábitos usam (`habits`, `habitLogs`, `rituals`), nos dois
 * motores: lista ordenada, alterar, apagar, filhos, reordenar, busca de registros, filtros e a chave
 * única (hábito, dia).
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
import { HABIT_FIELDS, HABIT_LOG_FIELDS, habitRow } from './storage/domains/phase3.js';

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

const habit = (id, extra = {}) => habitRow({ id, title: id, created_date: '2026-11-10 10:00:00', ...extra });
const log = (id, habitId, date, extra = {}) => ({ id, habit_id: habitId, date, completed: 1, created_date: '2026-11-10 10:00:00', value: null, outcome: 'done', skip_reason: null, note: '', ...extra });
const ritual = (id, order) => ({ id, name: id, emoji: 'r', time_of_day: 'morning', habits_order: order, status: 'active', created_date: '2026-11-10 10:00:00' });

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de hábitos, registros e rituais`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('entradas inválidas são recusadas', async () => as('alice', async () => {
      await assert.rejects(() => s.habits.list({ status: 5 }), { code: 'invalid_query' });
      await assert.rejects(() => s.habits.list({ lixo: 1 }), { code: 'invalid_query' });
      await assert.rejects(() => s.habits.patch('h', {}), { code: 'empty_patch' });
      await assert.rejects(() => s.habits.patch('h', { id: 'x' }), { code: 'immutable_field' });
      await assert.rejects(() => s.habits.patch('h', { title: null }), { code: 'invalid_value' });
      await assert.rejects(() => s.habits.reorder([['h', 1.5]]), { code: 'invalid_query' });
      await assert.rejects(() => s.habits.reorder([[5, 1]]), { code: 'invalid_record_id' });
      await assert.rejects(() => s.habits.idsByParent(null), { code: 'invalid_query' });
      await assert.rejects(() => s.habitLogs.list({ date: 5 }), { code: 'invalid_query' });
      await assert.rejects(() => s.habitLogs.list({ lixo: 'x' }), { code: 'invalid_query' });
      await assert.rejects(() => s.habitLogs.find('h'), { code: 'invalid_query' });
      await assert.rejects(() => s.habitLogs.patch('l', { habit_id: 'outro' }), { code: 'immutable_field' });
      await assert.rejects(() => s.habitLogs.patch('l', { date: 'x' }), { code: 'immutable_field' });
      await assert.rejects(() => s.rituals.patch('r', { id: 'x' }), { code: 'immutable_field' });
    }));

    await t.test('hábitos: ordem sort_order IS NULL, sort_order, created_date DESC (empate na inserção); filtro por status', async () => as('ordem', async () => {
      assert.deepEqual(await s.habits.list({ status: null }), []);
      for (const row of [
        habit('b', { sort_order: 2 }), habit('a', { sort_order: 2 }), habit('n1', { sort_order: null }), habit('n2', { sort_order: null, created_date: '2026-11-12 08:00:00' }),
        habit('z', { sort_order: 0, status: 'paused' }), habit('t', { sort_order: 'x' }), habit('nul', { sort_order: 1, created_date: null, status: null }), habit('m', { sort_order: 1 }),
      ]) await s.habits.create(row);
      assert.deepEqual((await s.habits.list({ status: null })).map((r) => r.id), ['z', 'm', 'nul', 'b', 'a', 't', 'n2', 'n1']);
      assert.deepEqual((await s.habits.list({ status: 'active' })).map((r) => r.id), ['m', 'b', 'a', 't', 'n2', 'n1'], 'status NULL e outro status ficam de fora');
      assert.deepEqual((await s.habits.list({ status: 'paused' })).map((r) => r.id), ['z']);
      assert.deepEqual(Object.keys((await s.habits.list({ status: null }))[0]), HABIT_FIELDS);
    }));

    await t.test('hábitos: alterar, apagar, filhos, posição e reordenar', async () => as('filhos', async () => {
      await s.habits.create(habit('pai', { kind: 'compound', sort_order: 0 }));
      for (const [id, position] of [['f1', 2], ['f2', null], ['f3', 0]]) await s.habits.create(habit(id, { parent_id: 'pai', position_in_parent: position, sort_order: 10 }));
      await s.habits.create(habit('solto', { sort_order: 11 }));
      assert.deepEqual((await s.habits.idsByParent('pai')).sort(), ['f1', 'f2', 'f3']);
      assert.deepEqual(await s.habits.idsByParent('nada'), []);
      assert.equal(await s.habits.maxPosition('pai'), 2);
      assert.equal(await s.habits.maxPosition('solto'), null);
      await s.habits.patch('f1', { title: 'novo', status: null, parent_id: null, position_in_parent: null, quick_increment: 0.25 });
      assert.deepEqual({ ...(await s.habits.get('f1')) }, { ...habit('f1', { sort_order: 10 }), title: 'novo', status: null, parent_id: null, position_in_parent: null, quick_increment: 0.25 });
      assert.equal(await s.habits.maxPosition('pai'), 0);
      await assert.rejects(() => s.habits.patch('nada', { title: 'x' }), { code: 'not_found' });
      await s.habits.reorder([['solto', 0], ['nada', 1], ['pai', 2]]);
      assert.deepEqual([(await s.habits.get('solto')).sort_order, (await s.habits.get('pai')).sort_order, (await s.habits.get('f2')).sort_order], [0, 2, 10], 'id que não existe só consome a posição');
      await s.habits.reorder([]);
      await s.habits.remove('f2');
      await s.habits.remove('nada');
      assert.equal(await s.habits.get('f2'), null);
      assert.deepEqual(await s.transaction(async (tx) => tx.habits.idsByParent('pai')), ['f3']);
    }));

    await t.test('registros: buscar, listar como a antiga (índice por hábito, senão inserção), recortes e chave única', async () => as('logs', async () => {
      await s.habits.create(habit('h1')); await s.habits.create(habit('h2'));
      for (const row of [
        log('l1', 'h1', '2026-11-12'), log('l2', 'h2', '2026-11-10', { value: 1.5, completed: 0, outcome: null }), log('l3', 'h1', '2026-11-10', { note: 'a' }),
        log('l4', 'h2', '2026-11-12', { outcome: 'skipped', completed: 0, skip_reason: 'time', note: 'n' }), log('l5', 'h1', '2026-11-11'),
      ]) await s.habitLogs.create(row);
      assert.deepEqual(await s.habitLogs.get('l2'), log('l2', 'h2', '2026-11-10', { value: 1.5, completed: 0, outcome: null }));
      assert.equal(await s.habitLogs.get('nada'), null);
      assert.equal((await s.habitLogs.find('h1', '2026-11-11')).id, 'l5');
      assert.equal(await s.habitLogs.find('h1', '2026-11-13'), null);
      assert.deepEqual(Object.keys(await s.habitLogs.find('h1', '2026-11-11')), HABIT_LOG_FIELDS);
      const ids = async (query) => (await s.habitLogs.list(query)).map((r) => r.id);
      assert.deepEqual(await ids({}), ['l1', 'l2', 'l3', 'l4', 'l5'], 'sem hábito: ordem de inserção');
      assert.deepEqual(await ids({ date: '2026-11-12' }), ['l1', 'l4']);
      assert.deepEqual(await ids({ from: '2026-11-11' }), ['l1', 'l4', 'l5']);
      assert.deepEqual(await ids({ to: '2026-11-10' }), ['l2', 'l3']);
      assert.deepEqual(await ids({ habit_id: 'h1' }), ['l3', 'l5', 'l1'], 'com hábito: índice (habit_id, date)');
      assert.deepEqual(await ids({ habit_id: 'h1', from: '2026-11-11', to: '2026-11-12' }), ['l5', 'l1']);
      assert.deepEqual(await ids({ habit_id: 'h2', date: '2026-11-10' }), ['l2']);
      assert.deepEqual(await ids({ habit_id: 'nada' }), []);
      assert.deepEqual((await s.habitLogs.forDate('2026-11-12')).map((r) => r.habit_id), ['h1', 'h2']);
      assert.deepEqual(Object.keys((await s.habitLogs.forDate('2026-11-12'))[0]), ['habit_id', 'completed', 'outcome', 'skip_reason', 'note', 'value']);
      assert.deepEqual((await s.habitLogs.forHabits(['h1'])).map((r) => r.date), ['2026-11-12', '2026-11-11', '2026-11-10']);
      assert.deepEqual(Object.keys((await s.habitLogs.forHabits(['h1']))[0]), ['habit_id', 'date', 'completed', 'outcome']);
      assert.deepEqual(await s.habitLogs.forHabits([]), []);
      assert.deepEqual((await s.habitLogs.forHabits(['h1', 'h2'])).filter((r) => r.date === '2026-11-10').map((r) => r.habit_id).sort(), ['h1', 'h2']);
      await assert.rejects(() => s.habitLogs.create(log('l6', 'h1', '2026-11-12')), { code: 'already_exists' });

      await s.habitLogs.patch('l1', { completed: 0, value: 2, outcome: null, skip_reason: null, note: '' });
      assert.deepEqual(await s.habitLogs.get('l1'), log('l1', 'h1', '2026-11-12', { completed: 0, value: 2, outcome: null }));
      await assert.rejects(() => s.habitLogs.patch('nada', { note: 'x' }), { code: 'not_found' });
      await s.habitLogs.remove('l1');
      await s.habitLogs.remove('nada');
      assert.equal(await s.habitLogs.get('l1'), null);
      await s.habitLogs.create(log('l7', 'h1', '2026-11-12'));
      await assert.rejects(() => s.habitLogs.create(log('l8', 'h1', '2026-11-12')), { code: 'already_exists' });
      await s.habitLogs.removeByHabit('h1');
      assert.deepEqual(await ids({}), ['l2', 'l4']);
      await s.habitLogs.create(log('l9', 'h1', '2026-11-12'));
      await s.habitLogs.removeByHabit('nada');
      assert.deepEqual(await ids({ habit_id: 'h1' }), ['l9'], 'a chave única do hábito apagado foi liberada');
      await s.transaction(async (tx) => { await tx.habitLogs.removeByHabit('h2'); await tx.habits.patch('h1', { title: 'depois' }); });
      assert.deepEqual(await ids({}), ['l9']);
      await assert.rejects(() => s.transaction(async (tx) => { await tx.habits.patch('h1', { title: 'x' }); await tx.habitLogs.removeByHabit('h1'); }), { code: 'transaction_read_after_write' });
    }));

    await t.test('rituais: listar na ordem de inserção e alterar a ordem dos hábitos', async () => as('rituais', async () => {
      assert.deepEqual(await s.rituals.list(), []);
      for (const row of [ritual('r2', '["a"]'), ritual('r1', null), ritual('r3', '[]')]) await s.rituals.create(row);
      assert.deepEqual((await s.rituals.list()).map((r) => r.id), ['r2', 'r1', 'r3']);
      await s.rituals.patch('r2', { habits_order: '[]' });
      assert.equal((await s.rituals.list())[0].habits_order, '[]');
      await assert.rejects(() => s.rituals.patch('nada', { habits_order: '[]' }), { code: 'not_found' });
    }));

    await t.test('duas contas não se cruzam', async () => {
      await as('alice', () => s.habits.create(habit('mesmo', { sort_order: 1 })));
      await as('bob', () => s.habits.create(habit('mesmo', { sort_order: 9 })));
      await as('alice', () => s.habitLogs.create(log('l', 'mesmo', '2026-11-10')));
      assert.deepEqual(await as('bob', () => s.habitLogs.list({})), []);
      assert.equal((await as('bob', () => s.habits.get('mesmo'))).sort_order, 9);
      await as('bob', () => s.habits.remove('mesmo'));
      assert.equal((await as('alice', () => s.habits.get('mesmo'))).sort_order, 1);
    });
  });
}

test('hábitos: mesmos dados, mesma ordem, byte a byte, nos dois motores', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const sql = await fixture('sqlite'), fire = await fixture('firestore');
  t.after(sql.close); t.after(fire.close);
  const replay = (f) => f.as('paridade', async () => {
    const s = f.storage;
    for (const row of [habit('b', { sort_order: 2 }), habit('a', { sort_order: 2 }), habit('n', { sort_order: null }), habit('p', { parent_id: 'b', position_in_parent: 3 })]) await s.habits.create(row);
    for (const row of [log('l1', 'a', '2026-11-12'), log('l2', 'b', '2026-11-10'), log('l3', 'a', '2026-11-10'), log('l4', 'b', '2026-11-12')]) await s.habitLogs.create(row);
    await s.habits.reorder([['n', 0], ['a', 1]]);
    return JSON.stringify([await s.habits.list({ status: null }), await s.habits.idsByParent('b'), await s.habits.maxPosition('b'), await s.habitLogs.list({}), await s.habitLogs.list({ habit_id: 'a' }),
      await s.habitLogs.forDate('2026-11-12'), await s.habitLogs.forHabits(['a']), await s.habitLogs.forHabits(['b'])]);
  });
  assert.equal(await replay(fire), await replay(sql));
});
