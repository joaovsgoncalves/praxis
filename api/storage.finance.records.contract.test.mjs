/**
 * Contrato dos repositórios de finanças, domínio 2 (cadastros: fixas, orçamento, assinaturas,
 * parcelas, metas; lançamentos só para soltar vínculo), nos dois motores.
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
import { FINANCE_GENERIC_TABLES, columnNames } from './storage/sqlite/financeTables.js';

async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client, root;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb({ withFinance: true })); return databases.get(owner); },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    root = client.collection('financeRecordsRuns').doc(randomUUID());
    return createFirestoreDriver({ client, root });
  })();
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore() }),
    as: (owner, fn) => scope.run(owner, fn),
    db: (owner) => databases.get(owner),
    rawRef: (owner, collection, id) => root.collection('users').doc(owner).collection(collection).doc(id),
    rawDoc: async (owner, collection, id) => (await root.collection('users').doc(owner).collection(collection).doc(id).get()).data(),
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}

const STAMP = '2026-11-15T10:00:00.000Z';
const fixed = (id, extra = {}) => ({ id, name: id, amount: 100, due_day: 10, category: 'Outros', lane: 'personal', active: 1, last_paid_month: null, note: '', created_at: STAMP, updated_at: STAMP, ...extra });
const goal = (id, extra = {}) => ({ id, title: id, target_amount: 1000, current_amount: 0, due_date: null, debt_id: null, status: 'active', created_at: STAMP, updated_at: STAMP, ...extra });
const sub = (id, extra = {}) => ({ id, name: id, lane: 'personal', amount: 10, cadence: 'monthly', charge_day: null, account_id: null, status: 'active', next_charge: null, vendor_hint: '', source: 'joao', locked: 0, note: '', created_at: STAMP, updated_at: STAMP, ...extra });
const tx = (id, extra = {}) => ({ id, pierre_tx_id: null, account_id: null, posted_on: '2026-11-01', amount: -10, direction: 'outflow', raw_description: '', merchant: '', category: 'Outros', subscription_id: null, debt_id: null, source: 'joao', created_at: STAMP, external_id: null, matched_tx_id: null, note: '', payment_id: null, intent_key: null, ...extra });

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de finanças (cadastros)`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('sem escopo falha fechado; filtro, campo e chave fora do contrato são recusados', async () => {
      await assert.rejects(() => s.financeGoals.list(), { code: 'tenant_scope_missing' });
      await as('alice', async () => {
        await assert.rejects(() => s.financeGoals.list({ status: 'active' }), { code: 'invalid_finance_query' });
        await assert.rejects(() => s.financeSubscriptions.list({ lane: ['work'] }), { code: 'invalid_finance_query' });
        await assert.rejects(() => s.financeFixedExpenses.create({ ...fixed('x'), user_id: 'bob' }), { code: 'unknown_finance_field' });
        await assert.rejects(() => s.financeBudgets.upsert({ category: 'Moradia', monthly_limit: 1 }), { code: 'incomplete_finance_row' });
        await assert.rejects(() => s.financeFixedExpenses.patch('x', { id: 'y' }), { code: 'immutable_record_id' });
        assert.equal(typeof s.financeGoals.remove, 'undefined', 'metas não têm apagar');
      });
    });

    await t.test('dinheiro em centavos exatos; fração de centavo recusada', async () => as('dinheiro', async () => {
      await s.financeInstallments.create({ id: 'p1', title: 'p1', account_id: null, monthly: 199.9, remaining: 1999, paid_n: 1, total_n: 10, last_due: null, status: 'open', source: 'pierre', locked: 0, note: '', created_at: STAMP, updated_at: STAMP });
      await assert.rejects(() => s.financeInstallments.patch('p1', { monthly: 199.999 }), { code: 'fractional_cent_or_overflow' });
      await assert.rejects(() => s.financeGoals.create(goal('g', { target_amount: 0.1 + 0.2 })), { code: 'fractional_cent_or_overflow' });
      await s.financeBudgets.upsert({ category: 'Moradia', monthly_limit: 1500.25, updated_at: STAMP });
      assert.deepEqual(await s.financeBudgets.list(), [{ category: 'Moradia', monthly_limit: 1500.25, updated_at: STAMP }]);
      if (kind === 'firestore') {
        assert.equal((await f.rawDoc('dinheiro', 'financeInstallments', 'p1')).monthly, 19990);
        assert.equal((await f.rawDoc('dinheiro', 'financeBudgets', 'Moradia')).monthly_limit, 150025);
      }
    }));

    await t.test('ordens do SQLite, inclusive `col IS NULL` e empate pela inserção', async () => as('ordem', async () => {
      for (const row of [fixed('b'), fixed('a'), fixed('sem-dia', { due_day: null }), fixed('inativa', { active: 0, due_day: 1 }), fixed('a', { id: 'a-2' }), fixed('cedo', { due_day: 1 }), fixed('texto', { due_day: 'x' })]) {
        await s.financeFixedExpenses.create(row);
      }
      const all = await s.financeFixedExpenses.list();
      assert.deepEqual(all.map((r) => r.id), ['cedo', 'a', 'a-2', 'b', 'texto', 'sem-dia', 'inativa']);
      assert.deepEqual(Object.keys(all[0]), columnNames(FINANCE_GENERIC_TABLES.financeFixedExpenses));
      for (const row of [goal('z'), goal('sem-data-a'), goal('d2', { due_date: '2026-12-01' }), goal('d1', { due_date: '2026-11-01' }), goal('d1b', { due_date: '2026-11-01', title: 'd1' })]) await s.financeGoals.create(row);
      assert.deepEqual((await s.financeGoals.list()).map((r) => r.id), ['d1', 'd1b', 'd2', 'sem-data-a', 'z']);
      for (const row of [sub('w1', { lane: 'work', amount: 5 }), sub('p1', { amount: 50 }), sub('p2', { amount: 50, status: 'cancel' }), sub('w2', { lane: 'work', amount: 99 }), sub('p3', { amount: 7.5 })]) await s.financeSubscriptions.create(row);
      assert.deepEqual((await s.financeSubscriptions.list()).map((r) => r.id), ['p1', 'p2', 'p3', 'w2', 'w1']);
      assert.deepEqual((await s.financeSubscriptions.list({ lane: 'personal', status: 'active' })).map((r) => r.id), ['p1', 'p3']);
      for (const category of ['Transporte', 'Alimentação', 'Moradia']) await s.financeBudgets.upsert({ category, monthly_limit: 1, updated_at: STAMP });
      await s.financeBudgets.upsert({ category: 'Moradia', monthly_limit: 2, updated_at: '2026-11-16T00:00:00.000Z' });
      await s.financeBudgets.remove('Transporte');
      assert.deepEqual(await s.financeBudgets.list(), [{ category: 'Alimentação', monthly_limit: 1, updated_at: STAMP }, { category: 'Moradia', monthly_limit: 2, updated_at: '2026-11-16T00:00:00.000Z' }]);
    }));

    await t.test('transação: reserva antes das escritas; apagar assinatura solta lançamentos no mesmo commit', async () => as('tx', async () => {
      await assert.rejects(() => s.transaction(async (t2) => { await t2.financeGoals.create(goal('x')); }), { code: 'sequence_not_reserved' });
      await s.financeSubscriptions.create(sub('s1'));
      // Lançamentos ainda sem criação pela camada nova (domínio 3): semeados direto no motor.
      for (const [i, row] of [tx('t1', { subscription_id: 's1' }), tx('t2', { subscription_id: 's1' }), tx('t3', { subscription_id: 'outra' })].entries()) {
        if (kind === 'sqlite') {
          f.db('tx').prepare(`INSERT INTO finance_transactions (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`).run(...Object.values(row));
        } else {
          await f.rawRef('tx', 'financeTransactions', row.id).create({ ...row, amount: Math.round(row.amount * 100), _row: i + 1 });
        }
      }
      await assert.rejects(() => s.transaction(async (t2) => {
        const linked = await t2.financeTransactions.list({ subscription_id: 's1' });
        await t2.financeSubscriptions.remove('s1');
        for (const row of linked) await t2.financeTransactions.patch(row.id, { subscription_id: null });
        await t2.financeSubscriptions.get('s1');
      }), { code: 'transaction_read_after_write' });
      assert.ok(await s.financeSubscriptions.get('s1'), 'recusa não apagou');
      await s.transaction(async (t2) => {
        const linked = await t2.financeTransactions.list({ subscription_id: 's1' });
        for (const row of linked) await t2.financeTransactions.patch(row.id, { subscription_id: null });
        await t2.financeSubscriptions.remove('s1');
      });
      assert.equal(await s.financeSubscriptions.get('s1'), null);
      assert.deepEqual(await s.financeTransactions.list({ subscription_id: 's1' }), []);
      assert.deepEqual((await s.financeTransactions.list({ subscription_id: 'outra' })).map((r) => [r.id, r.amount]), [['t3', -10]], 'outro vínculo fica');
    }));

    await t.test('duas contas não se cruzam', async () => {
      await as('alice', () => s.financeGoals.create(goal('mesma')));
      await as('bob', () => s.financeGoals.create(goal('mesma', { title: 'do bob' })));
      assert.equal((await as('alice', () => s.financeGoals.get('mesma'))).title, 'mesma');
      assert.equal((await as('bob', () => s.financeGoals.get('mesma'))).title, 'do bob');
      await assert.rejects(() => as('bob', () => s.financeGoals.create(goal('mesma'))), { code: 'already_exists' });
    });
  });
}
