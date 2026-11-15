import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';
import { PURCHASE_FIELDS } from './storage/contract.js';

async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb({ withPurchases: true })); return databases.get(owner); },
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
const STAMP_A = '2026-11-15 10:00:00', STAMP_B = '2026-11-15 11:00:00';
const item = (id, extra = {}) => ({ id, title: id, notes: '', horizon: 'medium', status: 'want', price_estimate: '', url: '', sort_order: 1, created_date: STAMP_A, updated_date: STAMP_A, ...extra });

async function legacyLikeData(s) {
  // Combinações que a API não produz, mas um banco antigo pode ter: empate, NULL e texto em sort_order.
  for (const row of [item('b'), item('a'), item('c'), item('nulo', { sort_order: null }), item('texto', { sort_order: 'z' }),
    item('novo', { created_date: STAMP_B }), item('sem-estado', { status: null, sort_order: 0 }), item('pausado', { status: 'paused', sort_order: 0 })]) {
    await s.purchases.create(row);
  }
}

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de compras`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;
    await t.test('sem escopo falha fechado; linha incompleta ou campo estranho é recusado', async () => {
      await assert.rejects(() => s.purchases.list(), { code: 'tenant_scope_missing' });
      await assert.rejects(() => as('alice', () => s.purchases.create({ id: 'x', title: 'x' })), { code: 'incomplete_purchase' });
      await assert.rejects(() => as('alice', () => s.purchases.create({ ...item('x'), owner: 'bob' })), { code: 'unknown_purchase_field' });
    });
    await t.test('ordem do SQLite: posição (NULL, número, texto), data decrescente e ordem de inserção', async () => as('ordem', async () => {
      await legacyLikeData(s);
      const all = await s.purchases.list();
      assert.deepEqual(all.map((r) => r.id), ['nulo', 'sem-estado', 'pausado', 'novo', 'b', 'a', 'c', 'texto']);
      assert.deepEqual(Object.keys(all[0]), PURCHASE_FIELDS);
      assert.deepEqual((await s.purchases.list({ excludePaused: true })).map((r) => r.id), ['nulo', 'novo', 'b', 'a', 'c', 'texto'], 'NULL e pausado saem');
      assert.deepEqual((await s.purchases.list({ status: 'paused' })).map((r) => r.id), ['pausado']);
      assert.equal(await s.purchases.maxSort(), 'z', 'MAX do SQLite: texto acima de número');
    }));
    await t.test('duas contas não se cruzam; apagar diz se existia', async () => {
      await as('alice', () => s.purchases.create(item('mesmo')));
      await as('bob', () => s.purchases.create(item('mesmo', { title: 'do bob' })));
      assert.equal(await as('alice', () => s.purchases.remove('mesmo')), true);
      assert.equal(await as('alice', () => s.purchases.remove('mesmo')), false);
      assert.equal((await as('bob', () => s.purchases.get('mesmo'))).title, 'do bob');
      assert.equal(await as('vazio', () => s.purchases.maxSort()), null);
    });
    await t.test('alteração: id, posição e criação imutáveis; inexistente = not_found', async () => as('alice', async () => {
      await s.purchases.create(item('p1'));
      for (const bad of [{ id: 'z' }, { sort_order: 9 }, { created_date: STAMP_B }]) await assert.rejects(() => s.purchases.patch('p1', bad), { code: 'immutable_purchase_field' });
      await assert.rejects(() => s.purchases.patch('nope', { title: 'x' }), { code: 'not_found' });
      await s.purchases.patch('p1', { title: 'mudou', updated_date: STAMP_B });
      assert.equal((await s.purchases.get('p1')).title, 'mudou');
    }));
    await t.test('transação: criar lê a sequência, então só uma criação por transação; id repetido é already_exists', async () => as('alice', async () => {
      await assert.rejects(() => s.transaction(async (tx) => { await tx.purchases.create(item('d1')); await tx.purchases.create(item('d0')); }), { code: 'transaction_read_after_write' });
      assert.equal(await s.purchases.get('d1'), null, 'nada da transação abortada ficou');
      await assert.rejects(() => s.purchases.create(item('p1')), { code: 'already_exists' });
      await assert.rejects(() => s.transaction((tx) => tx.purchases.create(item('p1'))), { code: 'already_exists' });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.purchases.patch('p1', { title: 'x' }); await tx.purchases.create(item('d2')); }), { code: 'transaction_read_after_write' });
      assert.equal((await s.purchases.get('p1')).title, 'mudou');
    }));
  });
}

test('compras: mesma ordem e mesmos dados, byte a byte, nos dois motores', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const sql = await fixture('sqlite'), fire = await fixture('firestore');
  t.after(sql.close); t.after(fire.close);
  const replay = (f) => f.as('paridade', async () => {
    await legacyLikeData(f.storage);
    return JSON.stringify([await f.storage.purchases.list(), await f.storage.purchases.list({ excludePaused: true, horizon: 'medium' }), await f.storage.purchases.maxSort()]);
  });
  assert.equal(await replay(fire), await replay(sql));
});
