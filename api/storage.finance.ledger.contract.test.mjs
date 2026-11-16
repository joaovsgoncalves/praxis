/**
 * Contrato dos repositórios de finanças, domínio 3 (dívidas, baixas e lançamentos), nos dois motores.
 * O SQLite real (banco novo com `initFinanceSchema`) é o oráculo de ordem do extrato e das colunas UNIQUE.
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
    root = client.collection('financeLedgerRuns').doc(randomUUID());
    return createFirestoreDriver({ client, root });
  })();
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore() }),
    as: (owner, fn) => scope.run(owner, fn),
    db: (owner) => databases.get(owner),
    rawDoc: async (owner, collection, id) => (await root.collection('users').doc(owner).collection(collection).doc(id).get()).data(),
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}

const STAMP = '2026-11-15T10:00:00.000Z';
const debt = (id, extra = {}) => ({ id, title: id, account_id: null, kind: 'card', balance: 100, min_payment: null, apr_label: 'none', due_day: null, due_date: null, status: 'open', queue: 50, source: 'joao', locked: 0, note: '', created_at: STAMP, updated_at: STAMP, ...extra });
const payment = (id, extra = {}) => ({ id, debt_id: 'd1', account_id: null, amount: 10, paid_on: '2026-11-15', method: 'pix', confirmed: 1, note: '', created_at: STAMP, intent_key: null, ...extra });
const tx = (id, extra = {}) => ({ id, pierre_tx_id: null, account_id: null, posted_on: '2026-11-01', amount: -10, direction: 'outflow', raw_description: '', merchant: '', category: 'Outros', subscription_id: null, debt_id: null, source: 'joao', created_at: STAMP, external_id: null, matched_tx_id: null, note: '', payment_id: null, intent_key: null, ...extra });
const account = (id, entity) => ({ id, name: id, kind: 'checking', institution: '', mask: '', pierre_account_id: null, is_operational: 0, status: 'active', sort_order: 1, created_at: STAMP, updated_at: STAMP, brand_color: null, card_last4: null, entity });

function insertRaw(db, table, row) {
  const names = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...Object.values(row));
}
/** Consulta do extrato da rota antiga (finance.js, bcbadad) sobre um SQLite real. */
function oracleRange(db, { from, to, accountId = null, category = null, like = null, entity = 'all', limit = 200 }) {
  let sql = 'SELECT * FROM finance_transactions WHERE posted_on >= ? AND posted_on <= ? AND matched_tx_id IS NULL';
  const params = [from, to];
  if (accountId !== null) { sql += ' AND account_id = ?'; params.push(accountId); }
  if (category !== null) { sql += ' AND category = ?'; params.push(category); }
  if (like !== null) { sql += ' AND (merchant LIKE ? OR raw_description LIKE ?)'; params.push(like, like); }
  if (entity !== 'all') {
    sql += entity === 'pj'
      ? " AND account_id IN (SELECT id FROM finance_accounts WHERE entity = 'pj')"
      : " AND (account_id IS NULL OR account_id NOT IN (SELECT id FROM finance_accounts WHERE entity = 'pj'))";
  }
  sql += ' ORDER BY posted_on DESC, created_at DESC LIMIT ?';
  params.push(limit === null ? -1 : limit);
  return db.prepare(sql).all(...params);
}

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de finanças (dívidas, baixas e lançamentos)`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('sem escopo falha fechado; consulta, campo e coluna fora do contrato são recusados', async () => {
      await assert.rejects(() => s.financeDebts.list(), { code: 'tenant_scope_missing' });
      await assert.rejects(() => s.financeTransactions.byPayment('p'), { code: 'tenant_scope_missing' });
      await as('alice', async () => {
        await assert.rejects(() => s.financeDebts.list({ kind: 'card' }), { code: 'invalid_finance_query' });
        await assert.rejects(() => s.financeDebts.list({ status: ['open'] }), { code: 'invalid_finance_query' });
        await assert.rejects(() => s.financeDebts.create({ ...debt('x'), user_id: 'bob' }), { code: 'unknown_finance_field' });
        await assert.rejects(() => s.financePayments.create({ ...payment('p'), debt_id: null }), { code: 'invalid_finance_value' });
        await assert.rejects(() => s.financeTransactions.create({ ...tx('t'), posted_on: null }), { code: 'invalid_finance_value' });
        await assert.rejects(() => s.financeTransactions.range({ from: '2026-01-01' }), { code: 'invalid_transaction_query' });
        await assert.rejects(() => s.financeTransactions.range({ from: 'a', to: 'b', entity: 'x', limit: null }), { code: 'invalid_transaction_query' });
        await assert.rejects(() => s.financeTransactions.range({ from: 'a', to: 'b', entity: 'all', limit: -1 }), { code: 'invalid_transaction_query' });
        await assert.rejects(() => s.financeTransactions.range({ from: 'a', to: 'b', entity: 'all', limit: null, accountId: 5 }), { code: 'invalid_transaction_query' });
        await assert.rejects(() => s.financeTransactions.findUnique('merchant', 'x'), { code: 'invalid_unique_column' });
        await assert.rejects(() => s.financeTransactions.findUnique('intent_key', ''), { code: 'invalid_unique_column' });
        await assert.rejects(() => s.financePayments.findUnique('id', 'x'), { code: 'invalid_unique_column' });
        await assert.rejects(() => s.financeTransactions.patch('t', { intent_key: 'x' }), { code: 'immutable_unique_field' });
        await assert.rejects(() => s.financeTransactions.patch('t', { external_id: 'x' }), { code: 'immutable_unique_field' });
        await assert.rejects(() => s.financeTransactions.patch('t', { id: 'y' }), { code: 'immutable_record_id' });
        await assert.rejects(() => s.financeTransactions.create(tx('t', { external_id: 'e'.repeat(1401) })), { code: 'unique_value_too_long' });
        assert.equal(typeof s.financePayments.patch, 'undefined', 'baixa não se altera');
        assert.equal(typeof s.financeDebts.remove, 'undefined', 'dívida não se apaga');
        assert.equal(typeof s.financeTransactions.remove, 'undefined', 'lançamento não se apaga');
      });
    });

    await t.test('dinheiro em centavos exatos; fração de centavo recusada nos três repositórios', async () => as('dinheiro', async () => {
      await s.financeDebts.create(debt('dm', { balance: 1234.56, min_payment: 19.9 }));
      await s.financePayments.create(payment('pm', { debt_id: 'dm', amount: 0.01 }));
      await s.financeTransactions.create(tx('tm', { amount: -1234.56 }));
      assert.deepEqual(await s.financeDebts.get('dm'), debt('dm', { balance: 1234.56, min_payment: 19.9 }));
      assert.equal((await s.financePayments.get('pm')).amount, 0.01);
      assert.equal((await s.financeTransactions.get('tm')).amount, -1234.56);
      for (const bad of [0.1 + 0.2, 10.005, 1e20, 0.001]) {
        await assert.rejects(() => s.financeDebts.create(debt('x', { balance: bad })), { code: 'fractional_cent_or_overflow' }, `dívida ${bad}`);
        await assert.rejects(() => s.financePayments.create(payment('x', { amount: bad })), { code: 'fractional_cent_or_overflow' });
        await assert.rejects(() => s.financeTransactions.create(tx('x', { amount: bad })), { code: 'fractional_cent_or_overflow' });
      }
      await assert.rejects(() => s.financeDebts.patch('dm', { balance: 2.345 }), { code: 'fractional_cent_or_overflow' });
      await assert.rejects(() => s.financeTransactions.patch('tm', { amount: 1.005 }), { code: 'fractional_cent_or_overflow' });
      assert.equal((await s.financeDebts.get('dm')).balance, 1234.56, 'recusa não gravou');
      assert.equal(await s.financeTransactions.get('x'), null);
      if (kind === 'firestore') {
        assert.equal((await f.rawDoc('dinheiro', 'financeDebts', 'dm')).balance, 123456);
        assert.equal((await f.rawDoc('dinheiro', 'financeDebts', 'dm')).min_payment, 1990);
        assert.equal((await f.rawDoc('dinheiro', 'financePayments', 'pm')).amount, 1);
        assert.equal((await f.rawDoc('dinheiro', 'financeTransactions', 'tm')).amount, -123456);
      }
    }));

    await t.test('dívidas: queue ASC, balance DESC, empate pela inserção, filtro por status', async () => as('dividas', async () => {
      const rows = [debt('a', { queue: 50, balance: 10 }), debt('b', { queue: 10, balance: 5 }), debt('c', { queue: 50, balance: 99.99 }), debt('d', { queue: 50, balance: 10 }),
        debt('e', { queue: null, balance: 1 }), debt('f', { queue: 10, balance: null }), debt('g', { queue: 'x', balance: 3, status: 'clean' }), debt('h', { queue: 2.5, balance: 3, status: 'clean' })];
      for (const row of rows) await s.financeDebts.create(row);
      const oracle = createTestDb({ withFinance: true });
      for (const row of rows) insertRaw(oracle, 'finance_debts', row);
      const ids = (list) => list.map((r) => r.id);
      assert.deepEqual(ids(await s.financeDebts.list()), ids(oracle.prepare('SELECT * FROM finance_debts WHERE 1=1 ORDER BY queue ASC, balance DESC').all()));
      assert.deepEqual(ids(await s.financeDebts.list({ status: 'clean' })), ids(oracle.prepare("SELECT * FROM finance_debts WHERE status = 'clean' ORDER BY queue ASC, balance DESC").all()));
      assert.deepEqual(await s.financeDebts.list({ status: 'nada' }), []);
      assert.deepEqual(Object.keys((await s.financeDebts.list())[0]), columnNames(FINANCE_GENERIC_TABLES.financeDebts));
      oracle.close();
      await s.financeDebts.patch('a', { balance: 0, status: 'clean', updated_at: '2026-11-16T00:00:00.000Z' });
      assert.deepEqual(await s.financeDebts.get('a'), debt('a', { balance: 0, status: 'clean', queue: 50, updated_at: '2026-11-16T00:00:00.000Z' }));
      await assert.rejects(() => s.financeDebts.patch('nao-existe', { balance: 1 }), { code: 'not_found' });
    }));

    await t.test('colunas UNIQUE: mesma precedência do SQLite real, vazio e nulo não contam, sentinelas no Firestore', async () => as('unicas', async () => {
      const base = tx('base', { external_id: 'E1', intent_key: 'I1', pierre_tx_id: 'P1' });
      await s.financeTransactions.create(base);
      const oracle = createTestDb({ withFinance: true });
      insertRaw(oracle, 'finance_transactions', base);
      const cases = [
        ['id', { id: 'base' }], ['external_id', { id: 'n1', external_id: 'E1' }], ['intent_key', { id: 'n2', intent_key: 'I1' }], ['pierre_tx_id', { id: 'n3', pierre_tx_id: 'P1' }],
        ['external_id', { id: 'base', external_id: 'E1', intent_key: 'I1', pierre_tx_id: 'P1' }], ['external_id', { id: 'n4', external_id: 'E1', intent_key: 'I1' }],
        ['intent_key', { id: 'n5', intent_key: 'I1', pierre_tx_id: 'P1' }], ['intent_key', { id: 'base', intent_key: 'I1' }], ['pierre_tx_id', { id: 'base', pierre_tx_id: 'P1' }],
        [null, { id: 'n6' }], [null, { id: 'n7', external_id: '', pierre_tx_id: '' }], [null, { id: 'n8', external_id: 'outro', intent_key: 'outra', pierre_tx_id: 'outro' }],
      ];
      for (const [expected, extra] of cases) {
        const row = tx('x', extra);
        let real = null;
        try { insertRaw(oracle, 'finance_transactions', row); oracle.prepare('DELETE FROM finance_transactions WHERE id = ?').run(row.id); } catch (error) { real = /finance_transactions\.(\w+)/.exec(error.message)[1]; }
        assert.equal(real, expected, `SQLite real ${JSON.stringify(extra)}`);
        assert.equal(await s.financeTransactions.clash(row), expected, `${kind} ${JSON.stringify(extra)}`);
      }
      // vazio repetido vale; intent_key vazio conta como valor (o índice só ignora NULL)
      await s.financeTransactions.create(tx('v1', { external_id: '', pierre_tx_id: '', intent_key: '' }));
      assert.equal(await s.financeTransactions.clash(tx('v2', { external_id: '', pierre_tx_id: '' })), null);
      assert.equal(await s.financeTransactions.clash(tx('v2', { intent_key: '' })), 'intent_key');
      oracle.close();
      assert.equal((await s.financeTransactions.findUnique('external_id', 'E1')).id, 'base');
      assert.equal((await s.financeTransactions.findUnique('intent_key', 'I1')).id, 'base');
      assert.equal((await s.financeTransactions.findUnique('pierre_tx_id', 'P1')).id, 'base');
      assert.equal(await s.financeTransactions.findUnique('intent_key', 'nada'), null);
      for (const row of [tx('d1', { external_id: 'E1' }), tx('d2', { intent_key: 'I1' }), tx('base')]) {
        await assert.rejects(() => s.financeTransactions.create(row), { code: 'already_exists' }, row.id);
      }
      assert.equal(await s.financeTransactions.get('d1'), null);
      await s.financePayments.create(payment('p1', { intent_key: 'K1' }));
      assert.equal((await s.financePayments.findUnique('intent_key', 'K1')).id, 'p1');
      assert.equal(await s.financePayments.clash(payment('p2', { intent_key: 'K1' })), 'intent_key');
      assert.equal(await s.financePayments.clash(payment('p1')), 'id');
      assert.equal(await s.financePayments.clash(payment('p2')), null);
      await assert.rejects(() => s.financePayments.create(payment('p3', { intent_key: 'K1' })), { code: 'already_exists' });
      if (kind === 'firestore') {
        assert.deepEqual(await f.rawDoc('unicas', 'uniqueKeys', 'financeTransactions.external_id:E1'), { domain: 'financeTransactions', field: 'external_id', value: 'E1', record_id: 'base' });
        assert.ok(await f.rawDoc('unicas', 'uniqueKeys', 'financeTransactions.intent_key:I1'));
        assert.ok(await f.rawDoc('unicas', 'uniqueKeys', 'financeTransactions.pierre_tx_id:P1'));
        assert.ok(await f.rawDoc('unicas', 'uniqueKeys', 'financePayments.intent_key:K1'));
        assert.equal(await f.rawDoc('unicas', 'uniqueKeys', 'financeTransactions.external_id:'), undefined, 'vazio não tem sentinela');
        assert.ok(await f.rawDoc('unicas', 'uniqueKeys', 'financeTransactions.intent_key:'), 'intent_key vazio é valor e tem sentinela');
      }
    }));

    await t.test('extrato: período, filtros, busca, PF/PJ, limite e empate idênticos ao SQL da rota antiga', async () => as('extrato', async () => {
      await s.transaction(async (tr) => {
        await tr.financeAccounts.reserve(3);
        for (const [id, entity] of [['pj1', 'pj'], ['pf1', 'pf'], ['pj2', 'pj']]) await tr.financeAccounts.create(account(id, entity));
      });
      const rows = [];
      const merchants = ['Mercado Livre', 'MERCADO', 'Pão de Açúcar', 'PÃO', 'Uber *Trip', 'iFood', '100%', 'a_b', '', 'Café'];
      for (let i = 0; i < 96; i += 1) {
        rows.push(tx(`t${String(i).padStart(2, '0')}`, {
          posted_on: ['2026-11-01', '2026-11-02', '2026-11-02', '2026-11-03'][i % 4],
          // empates totais de (posted_on, created_at): vários lançamentos no mesmo milissegundo
          created_at: `2026-11-0${(i % 3) + 1}T10:00:00.${i < 48 ? '000' : String(i % 5).padStart(3, '0')}Z`,
          amount: -Math.round((i + 1) * 101) / 100, merchant: merchants[i % merchants.length], raw_description: i % 7 === 0 ? 'PIX ENVIADO JOAO' : '',
          account_id: [null, 'pj1', 'pf1', 'pj2', 'conta-fantasma'][i % 5], category: ['Outros', 'Mercado', 'Lazer'][i % 3],
          matched_tx_id: i % 11 === 0 ? 'x' : null,
        }));
      }
      for (const row of rows) await s.financeTransactions.create(row);
      const oracle = createTestDb({ withFinance: true });
      for (const [id, entity] of [['pj1', 'pj'], ['pf1', 'pf'], ['pj2', 'pj']]) insertRaw(oracle, 'finance_accounts', account(id, entity));
      for (const row of rows) insertRaw(oracle, 'finance_transactions', row);
      const queries = [
        { from: '2026-11-01', to: '2026-11-03' }, { from: '2026-11-02', to: '2026-11-02' }, { from: '2026-11-03', to: '2026-11-01' }, { from: '2026-10-01', to: '2026-10-31' },
        { from: '2026-11-01', to: '2026-11-03', limit: 5 }, { from: '2026-11-01', to: '2026-11-03', limit: 0 }, { from: '2026-11-01', to: '2026-11-03', limit: null },
        { from: '2026-11-01', to: '2026-11-03', accountId: 'pj1' }, { from: '2026-11-01', to: '2026-11-03', accountId: 'conta-fantasma' }, { from: '2026-11-01', to: '2026-11-03', accountId: 'nada' },
        { from: '2026-11-01', to: '2026-11-03', category: 'Lazer' }, { from: '2026-11-01', to: '2026-11-03', category: 'lazer' },
        { from: '2026-11-01', to: '2026-11-03', like: '%mercado%' }, { from: '2026-11-01', to: '2026-11-03', like: '%PÃO%' }, { from: '2026-11-01', to: '2026-11-03', like: '%pão%' },
        { from: '2026-11-01', to: '2026-11-03', like: '%100%%' }, { from: '2026-11-01', to: '2026-11-03', like: '%a_b%' }, { from: '2026-11-01', to: '2026-11-03', like: '%pix env%' },
        { from: '2026-11-01', to: '2026-11-03', like: '%' }, { from: '2026-11-01', to: '2026-11-03', like: '%\\%%' }, { from: '2026-11-01', to: '2026-11-03', like: '%café%' },
        { from: '2026-11-01', to: '2026-11-03', entity: 'pj' }, { from: '2026-11-01', to: '2026-11-03', entity: 'pf' }, { from: '2026-11-01', to: '2026-11-03', entity: 'pf', accountId: 'pj1' },
        { from: '2026-11-01', to: '2026-11-03', entity: 'pj', category: 'Mercado', like: '%mercado%', limit: 3 }, { from: '2026-11-01', to: '2026-11-03', entity: 'pf', limit: null },
      ];
      let compared = 0;
      for (const query of queries) {
        const expected = oracleRange(oracle, query);
        const actual = await s.financeTransactions.range({ accountId: null, category: null, like: null, entity: 'all', limit: 200, ...query });
        assert.deepEqual(actual, expected, JSON.stringify(query));
        assert.deepEqual(actual.map((r) => Object.keys(r)), expected.map((r) => Object.keys(r)), `ordem das chaves ${JSON.stringify(query)}`);
        compared += expected.length;
      }
      assert.ok(compared > 400, `volume comparado: ${compared}`);
      // a ordem mordeu: houve empate total de posted_on e created_at no resultado
      const all = oracleRange(oracle, { from: '2026-11-01', to: '2026-11-03' });
      assert.ok(all.some((r, i) => i && r.posted_on === all[i - 1].posted_on && r.created_at === all[i - 1].created_at), 'amostra tem empate total');
      oracle.close();
    }));

    await t.test('baixa, lançamento e dívida na mesma transação; falha no meio não deixa nada; leitura depois de escrita é recusada', async () => as('baixa', async () => {
      await s.financeDebts.create(debt('d1', { balance: 100 }));
      await s.transaction(async (tr) => {
        const first = await tr.financeDebts.get('d1');
        await tr.financePayments.reserve(1); await tr.financeTransactions.reserve(1);
        await tr.financeDebts.patch('d1', { balance: first.balance - 10 });
        await tr.financePayments.create(payment('p1', { intent_key: 'KEY-1' }));
        await tr.financeTransactions.create(tx('t1', { payment_id: 'p1', debt_id: 'd1', amount: -10 }));
      });
      assert.equal((await s.financeDebts.get('d1')).balance, 90);
      assert.equal((await s.financeTransactions.byPayment('p1')).id, 't1');
      assert.equal(await s.financeTransactions.byPayment('nada'), null);
      await assert.rejects(() => s.transaction(async (tr) => {
        await tr.financePayments.reserve(1); await tr.financeTransactions.reserve(1);
        await tr.financeDebts.patch('d1', { balance: 0, status: 'clean' });
        await tr.financePayments.create(payment('p2', { intent_key: 'KEY-2' }));
        await tr.financeTransactions.create(tx('t1', { payment_id: 'p2' }));
      }), { code: 'already_exists' });
      assert.equal((await s.financeDebts.get('d1')).balance, 90, 'dívida intacta');
      assert.equal(await s.financePayments.get('p2'), null, 'baixa não ficou');
      assert.equal(await s.financePayments.findUnique('intent_key', 'KEY-2'), null, 'chave da baixa livre');
      await assert.rejects(() => s.transaction(async (tr) => {
        await tr.financePayments.reserve(1); await tr.financeTransactions.reserve(1);
        await tr.financeDebts.patch('d1', { balance: 1 });
        await tr.financeTransactions.clash(tx('t9'));
      }), { code: 'transaction_read_after_write' });
      await assert.rejects(() => s.transaction(async (tr) => { await tr.financePayments.create(payment('p9')); }), { code: 'sequence_not_reserved' });
      assert.equal((await s.financeDebts.get('d1')).balance, 90);
      // mesmo `payment_id` em dois lançamentos: vale o primeiro inserido
      await s.financeTransactions.create(tx('t2', { payment_id: 'p1' }));
      assert.equal((await s.financeTransactions.byPayment('p1')).id, 't1');
    }));

    await t.test('duas contas não se cruzam (mesma chave única em donos diferentes)', async () => {
      await as('alice', () => s.financeTransactions.create(tx('mesma', { external_id: 'EXT-ALICE-BOB', intent_key: 'K-ALICE-BOB' })));
      await as('bob', () => s.financeTransactions.create(tx('mesma', { external_id: 'EXT-ALICE-BOB', intent_key: 'K-ALICE-BOB', merchant: 'do bob' })));
      assert.equal((await as('alice', () => s.financeTransactions.findUnique('intent_key', 'K-ALICE-BOB'))).merchant, '');
      assert.equal((await as('bob', () => s.financeTransactions.findUnique('intent_key', 'K-ALICE-BOB'))).merchant, 'do bob');
      assert.deepEqual((await as('bob', () => s.financeTransactions.range({ from: '2026-11-01', to: '2026-11-01', entity: 'all', limit: null }))).map((r) => r.merchant), ['do bob']);
      await assert.rejects(() => as('bob', () => s.financeTransactions.create(tx('outra', { external_id: 'EXT-ALICE-BOB' }))), { code: 'already_exists' });
    });
  });
}
