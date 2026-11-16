/**
 * Contrato dos repositórios de finanças, domínio 1 (configuração, contas, saldos), nos dois motores.
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
import { FINANCE_TABLES, columnNames } from './storage/sqlite/financeTables.js';

async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client, root;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb({ withFinance: true })); return databases.get(owner); },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    root = client.collection('financeContractRuns').doc(randomUUID());
    return createFirestoreDriver({ client, root });
  })();
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore() }),
    as: (owner, fn) => scope.run(owner, fn),
    rawDoc: async (owner, collection, id) => (await root.collection('users').doc(owner).collection(collection).doc(id).get()).data(),
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}

const STAMP = '2026-11-15T10:00:00.000Z';
const account = (id, extra = {}) => ({ id, name: id, kind: 'checking', institution: '', mask: '', pierre_account_id: null, is_operational: 0, status: 'active', sort_order: 1, created_at: STAMP, updated_at: STAMP, brand_color: null, card_last4: null, entity: 'pf', ...extra });
const balance = (id, extra = {}) => ({ id, account_id: 'a1', as_of: '2026-11-01', amount: 10, amount_kind: 'available', source: 'joao', locked: 0, note: '', created_at: STAMP, ...extra });
const settings = (extra = {}) => ({ id: 'default', reserved_car: 0, reserved_live: 0, snapshot_label: '', updated_at: STAMP, hide_values: 0, salary_day: 12, ...extra });

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de finanças (configuração, contas, saldos)`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('sem escopo falha fechado; linha incompleta, campo estranho e tipo errado são recusados', async () => {
      await assert.rejects(() => s.financeAccounts.list(), { code: 'tenant_scope_missing' });
      await as('alice', async () => {
        await assert.rejects(() => s.financeAccounts.create({ id: 'x', name: 'x' }), { code: 'incomplete_finance_row' });
        await assert.rejects(() => s.financeAccounts.create({ ...account('x'), user_id: 'bob' }), { code: 'unknown_finance_field' });
        await assert.rejects(() => s.financeAccounts.create(account('x', { name: null })), { code: 'invalid_finance_value' });
        await assert.rejects(() => s.financeAccounts.create(account('x', { sort_order: [1] })), { code: 'invalid_finance_value' });
        await assert.rejects(() => s.financeAccounts.patch('x', { id: 'y' }), { code: 'immutable_record_id' });
        await assert.rejects(() => s.financeAccounts.list({ status: 1 }), { code: 'invalid_account_query' });
        await assert.rejects(() => s.financeSettings.create(settings({ id: 'outro' })), { code: 'invalid_record_id' });
        assert.deepEqual(await s.financeAccounts.list(), [], 'nada gravado');
      });
    });

    await t.test('dinheiro: centavos exatos voltam iguais; fração de centavo, texto e estouro são recusados', async () => as('dinheiro', async () => {
      await s.financeAccounts.create(account('a1'));
      for (const [id, amount] of [['c1', 10.05], ['c2', -0.01], ['c3', 1234567.89], ['c4', 0], ['c5', 90071992547.99]]) {
        await s.financeBalances.create(balance(id, { amount }));
        assert.equal((await s.financeBalances.get(id)).amount, amount, `${id} volta igual`);
      }
      for (const amount of [10.005, 0.1 + 0.2, 1 / 3, 1e300]) {
        await assert.rejects(() => s.financeBalances.create(balance(`bad-${amount}`, { amount })), { code: 'fractional_cent_or_overflow' }, String(amount));
      }
      await assert.rejects(() => s.financeBalances.create(balance('texto', { amount: '10' })), { code: 'invalid_money' });
      await assert.rejects(() => s.financeBalances.create(balance('nulo', { amount: null })), { code: 'invalid_finance_value' });
      await s.financeSettings.create(settings({ reserved_car: 1500.5, reserved_live: null }));
      await assert.rejects(() => s.financeSettings.patch({ reserved_live: 0.001 }), { code: 'fractional_cent_or_overflow' });
      await s.financeSettings.patch({ reserved_live: 99.99 });
      assert.deepEqual(await s.financeSettings.get(), settings({ reserved_car: 1500.5, reserved_live: 99.99 }));
      if (kind === 'firestore') {
        assert.equal((await f.rawDoc('dinheiro', 'financeBalances', 'c1')).amount, 1005, 'guardado em centavos');
        assert.equal((await f.rawDoc('dinheiro', 'financeSettings', 'default')).reserved_live, 9999);
      }
      assert.equal((await s.financeBalances.list({ accountId: 'a1' })).length, 5, 'recusas não gravaram');
    }));

    await t.test('ordem do SQLite: posição (NULL, número, texto), nome e ordem de inserção; filtros exatos', async () => as('ordem', async () => {
      for (const row of [account('b'), account('a'), account('a', { id: 'a-2' }), account('nulo', { sort_order: null }), account('texto', { sort_order: 'z' }),
        account('arquivada', { status: 'archived', sort_order: 0 }), account('pj', { entity: 'pj', sort_order: 0 }), account('B', { sort_order: 1 })]) {
        await s.financeAccounts.create(row);
      }
      const all = await s.financeAccounts.list();
      assert.deepEqual(all.map((r) => r.id), ['nulo', 'arquivada', 'pj', 'B', 'a', 'a-2', 'b', 'texto']);
      assert.deepEqual(Object.keys(all[0]), columnNames(FINANCE_TABLES.financeAccounts));
      assert.deepEqual((await s.financeAccounts.list({ status: 'active', entity: 'pf' })).map((r) => r.id), ['nulo', 'B', 'a', 'a-2', 'b', 'texto']);
      assert.deepEqual((await s.financeAccounts.list({ entity: 'pj' })).map((r) => r.id), ['pj']);
      assert.equal(await s.financeAccounts.maxSort(), 'z', 'MAX do SQLite: texto acima de número');
      await assert.rejects(() => s.financeAccounts.create(account('b')), { code: 'already_exists' });
      await s.financeAccounts.patch('b', { name: 'Banco', is_operational: 1 });
      assert.equal((await s.financeAccounts.get('b')).name, 'Banco');
      await assert.rejects(() => s.financeAccounts.patch('nao-existe', { name: 'x' }), { code: 'not_found' });

      await s.financeAccounts.create(account('a1'));
      for (const row of [balance('z'), balance('m', { as_of: '2026-11-02' }), balance('b1'), balance('velho', { created_at: '2026-11-15T09:00:00.000Z' }),
        balance('x', { account_id: 'outra' }), balance('inv', { amount_kind: 'invested', as_of: '2026-11-02' })]) {
        await s.financeBalances.create(row);
      }
      assert.deepEqual((await s.financeBalances.list({ accountId: 'a1' })).map((r) => r.id), ['m', 'inv', 'z', 'b1', 'velho'], 'empate fica na ordem de inserção');
      assert.deepEqual((await s.financeBalances.list({ limit: 3 })).map((r) => r.id), ['m', 'inv', 'z']);
      assert.deepEqual((await s.financeBalances.list({ limit: 0 })), []);
      assert.deepEqual(Object.keys((await s.financeBalances.list())[0]), columnNames(FINANCE_TABLES.financeBalances));
    }));

    await t.test('transação: criar exige reserva antes das escritas; recusa desfaz tudo', async () => as('tx', async () => {
      await assert.rejects(() => s.transaction(async (tx) => { await tx.financeAccounts.create(account('sem-reserva')); }), { code: 'sequence_not_reserved' });
      await assert.rejects(() => s.transaction(async (tx) => {
        await tx.financeAccounts.reserve(1);
        await tx.financeAccounts.create(account('um'));
        await tx.financeAccounts.create(account('dois'));
      }), { code: 'sequence_not_reserved' });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.financeAccounts.reserve(1); await tx.financeAccounts.reserve(1); }), { code: 'sequence_already_reserved' });
      await assert.rejects(() => s.transaction(async (tx) => {
        await tx.financeAccounts.reserve(1); await tx.financeBalances.reserve(1);
        await tx.financeAccounts.create(account('a1'));
        await tx.financeBalances.create(balance('b1'));
        await tx.financeAccounts.list();
      }), { code: 'transaction_read_after_write' });
      assert.deepEqual(await s.financeAccounts.list(), [], 'nada ficou');
      await s.transaction(async (tx) => {
        await tx.financeAccounts.reserve(2); await tx.financeBalances.reserve(1); await tx.financeSettings.get();
        await tx.financeAccounts.create(account('a1', { sort_order: 5 }));
        await tx.financeAccounts.create(account('a2', { sort_order: 5, name: 'a1' }));
        await tx.financeBalances.create(balance('b1'));
        await tx.financeSettings.create(settings());
      });
      await s.financeAccounts.create(account('a3', { sort_order: 5, name: 'a1' }));
      assert.deepEqual((await s.financeAccounts.list()).map((r) => r.id), ['a1', 'a2', 'a3'], 'inserção em transação e fora dela segue a ordem');
      assert.deepEqual(await s.financeSettings.get(), settings());
      await assert.rejects(() => s.transaction(async (tx) => { await tx.financeSettings.create(settings()); }), { code: 'already_exists' });
    }));

    await t.test('duas contas não se cruzam', async () => {
      await as('alice', () => s.financeAccounts.create(account('mesmo')));
      await as('bob', () => s.financeAccounts.create(account('mesmo', { name: 'do bob' })));
      assert.equal((await as('alice', () => s.financeAccounts.get('mesmo'))).name, 'mesmo');
      assert.equal((await as('bob', () => s.financeAccounts.get('mesmo'))).name, 'do bob');
      assert.equal(await as('carol', () => s.financeSettings.get()), null);
    });
  });
}
