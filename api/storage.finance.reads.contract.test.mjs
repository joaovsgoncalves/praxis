/**
 * Contrato dos repositórios de finanças, domínio 4 (pendentes, estado do cartão, cobertura, log de
 * sincronização, lançamentos por período, saldos de banco), nos dois motores. O SQLite real é o oráculo
 * de ordem e de empate.
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
    root = client.collection('financeReadsRuns').doc(randomUUID());
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
const pending = (id, extra = {}) => ({ external_id: id, institution: 'Inter', account_id: null, posted_on: '2026-11-10', amount: -10, raw_description: '', merchant: '', category: null, seen_at: STAMP, ...extra });
const card = (id, extra = {}) => ({ account_id: id, institution: id, last4: null, brand: null, used: null, limit_total: null, limit_available: null, bill_total: null, bill_minimum: null, bill_paid: null, bill_remaining: null, bill_due: null, bill_closing: null, bank_updated_at: null, updated_at: null, source: 'pluggy', bill_paid_manual: 0, ...extra });
const window = (id, extra = {}) => ({ id, account_id: 'a', source: 'pluggy', covered_from: '2026-11-01', covered_to: '2026-11-05', recorded_at: STAMP, ...extra });
const log = (id, extra = {}) => ({ id, started_at: STAMP, finished_at: STAMP, ok: 1, accounts_n: 0, tx_n: 0, error: '', actor: 'midas', ...extra });
const tx = (id, extra = {}) => ({ id, pierre_tx_id: null, account_id: null, posted_on: '2026-11-01', amount: -10, direction: 'outflow', raw_description: '', merchant: '', category: 'Outros', subscription_id: null, debt_id: null, source: 'joao', created_at: STAMP, external_id: null, matched_tx_id: null, note: '', payment_id: null, intent_key: null, ...extra });
const balance = (id, extra = {}) => ({ id, account_id: 'a', as_of: '2026-11-01', amount: 1, amount_kind: 'available', source: 'pluggy', locked: 0, note: '', created_at: STAMP, ...extra });

function insertRaw(db, table, row) {
  const names = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...Object.values(row));
}

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de finanças (leituras compostas)`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('sem escopo falha fechado; consulta, campo e chave fora do contrato são recusados', async () => {
      await assert.rejects(() => s.financeSyncLog.latest({ actor: null, ok: null }), { code: 'tenant_scope_missing' });
      await as('alice', async () => {
        await assert.rejects(() => s.financePendingTransactions.list({ a: 1 }), { code: 'invalid_finance_query' });
        await assert.rejects(() => s.financeStatementCoverage.list({ source: 'pluggy' }), { code: 'invalid_finance_query' });
        await assert.rejects(() => s.financeSyncLog.latest({ ok: 2 }), { code: 'invalid_sync_log_query' });
        await assert.rejects(() => s.financeSyncLog.latest({ actor: 5 }), { code: 'invalid_sync_log_query' });
        await assert.rejects(() => s.financeSyncLog.latest({ nome: 'x' }), { code: 'invalid_sync_log_query' });
        await assert.rejects(() => s.financeTransactions.between({ from: 5 }), { code: 'invalid_transaction_query' });
        await assert.rejects(() => s.financeTransactions.between({ de: 'a' }), { code: 'invalid_transaction_query' });
        await assert.rejects(() => s.financePendingTransactions.create({ ...pending('x'), user_id: 'bob' }), { code: 'unknown_finance_field' });
        await assert.rejects(() => s.financeCardStatus.create(card('c', { institution: null })), { code: 'invalid_finance_value' });
        await assert.rejects(() => s.financePendingTransactions.create(pending('')), { code: 'invalid_record_id' });
        assert.equal(typeof s.financeSyncLog.list, 'undefined', 'o log não se lista inteiro');
      });
    });

    await t.test('dinheiro em centavos exatos nas tabelas novas; chave própria vira o id do documento', async () => as('dinheiro', async () => {
      await s.financePendingTransactions.create(pending('p/1', { amount: -45.9 }));
      await s.financeCardStatus.create(card('c1', { used: 1200.5, limit_available: 3800, bill_total: 842.3, bill_paid_manual: 12.5 }));
      assert.equal((await s.financePendingTransactions.get('p/1')).amount, -45.9);
      assert.deepEqual(Object.keys(await s.financeCardStatus.get('c1')), columnNames(FINANCE_GENERIC_TABLES.financeCardStatus));
      await assert.rejects(() => s.financePendingTransactions.create(pending('p2', { amount: 0.1 + 0.2 })), { code: 'fractional_cent_or_overflow' });
      await assert.rejects(() => s.financeCardStatus.create(card('c2', { bill_total: 10.005 })), { code: 'fractional_cent_or_overflow' });
      await assert.rejects(() => s.financePendingTransactions.create(pending('p/1')), { code: 'already_exists' });
      assert.equal(await s.financePendingTransactions.get('nada'), null);
      if (kind === 'firestore') {
        assert.equal((await f.rawDoc('dinheiro', 'financeCardStatus', 'c1')).used, 120050);
        assert.equal((await f.rawDoc('dinheiro', 'financePendingTransactions', '~b' + Buffer.from('p/1').toString('base64url'))).amount, -4590);
      }
    }));

    await t.test('ordens idênticas ao SQL antigo: pendentes, estado do cartão (nulos por último) e janelas da conta', async () => as('ordens', async () => {
      const oracle = createTestDb({ withFinance: true });
      const pend = [pending('b', { posted_on: '2026-11-10' }), pending('a', { posted_on: '2026-11-10' }), pending('c', { posted_on: '2026-11-12' }), pending('A', { posted_on: '2026-11-10' }), pending('z', { posted_on: '2026-01-01' })];
      const cards = [card('k1', { bill_due: '2026-11-20', institution: 'Zeta' }), card('k2', { bill_due: null, institution: 'Alfa' }), card('k3', { bill_due: '2026-11-20', institution: 'Alfa' }), card('k4', { bill_due: '2026-11-01' }), card('k5', { bill_due: null, institution: 'Alfa' }), card('k6', { bill_due: '' })];
      const wins = [window('w1', { covered_from: '2026-11-10', account_id: 'a' }), window('w2', { covered_from: '2026-11-01', account_id: 'a' }), window('w3', { covered_from: '2026-11-01', account_id: 'b' }), window('w4', { covered_from: '2026-11-01', account_id: 'a', source: 'pierre' })];
      for (const row of pend) { await s.financePendingTransactions.create(row); insertRaw(oracle, 'finance_pending_transactions', row); }
      for (const row of cards) { await s.financeCardStatus.create(row); insertRaw(oracle, 'finance_card_status', row); }
      for (const row of wins) { await s.financeStatementCoverage.create(row); insertRaw(oracle, 'finance_statement_coverage', row); }
      assert.deepEqual(await s.financePendingTransactions.list(), oracle.prepare('SELECT * FROM finance_pending_transactions ORDER BY posted_on DESC, external_id ASC').all());
      assert.deepEqual(await s.financeCardStatus.list(), oracle.prepare('SELECT * FROM finance_card_status ORDER BY bill_due IS NULL, bill_due ASC, institution ASC').all());
      assert.deepEqual((await s.financeCardStatus.list()).map((r) => r.account_id), oracle.prepare('SELECT account_id FROM finance_card_status ORDER BY bill_due IS NULL, bill_due ASC, institution ASC').all().map((r) => r.account_id));
      assert.deepEqual(await s.financeStatementCoverage.list({ account_id: 'a' }), oracle.prepare('SELECT * FROM finance_statement_coverage WHERE account_id = ? ORDER BY covered_from ASC').all('a'));
      assert.deepEqual(await s.financeStatementCoverage.list({ account_id: null }), oracle.prepare('SELECT * FROM finance_statement_coverage WHERE 1=1 ORDER BY covered_from ASC').all());
      oracle.close();
    }));

    await t.test('log de sincronização: a última, por ator e por sucesso, empate pela primeira inserida, mais de uma página', async () => as('log', async () => {
      assert.equal(await s.financeSyncLog.latest({ actor: null, ok: null }), null);
      const oracle = createTestDb({ withFinance: true });
      // as três linhas empatadas entram em ordem crescente de id; o Firestore desempata por id decrescente, o SQLite pela inserção
      const rows = [log('l1', { started_at: '2026-11-13T10:00:00.000Z' }), log('tie-a', { started_at: '2026-11-15T10:00:00.000Z', ok: 0 }), log('tie-b', { started_at: '2026-11-15T10:00:00.000Z', actor: 'argos' }),
        log('tie-c', { started_at: '2026-11-15T10:00:00.000Z' }), log('l5', { started_at: '2026-11-14T10:00:00.000Z', actor: 'argos', ok: 0 }), log('l6', { started_at: null })];
      // mais de uma página (100) de linhas antigas do argos: o filtro raro precisa paginar
      for (let i = 0; i < 230; i += 1) rows.push(log(`o${i}`, { started_at: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00.${String(i).padStart(3, '0')}Z`, actor: 'argos', ok: i % 2 }));
      rows.push(log('raro', { started_at: '2026-09-01T00:00:00.000Z', actor: 'sêneca' }));
      for (const row of rows) { await s.financeSyncLog.create(row); insertRaw(oracle, 'finance_sync_log', row); }
      const ask = (actor, ok) => {
        let sql = 'SELECT * FROM finance_sync_log WHERE 1=1'; const params = [];
        if (actor !== null) { sql += ' AND actor = ?'; params.push(actor); }
        if (ok !== null) { sql += ' AND ok = ?'; params.push(ok); }
        return oracle.prepare(`${sql} ORDER BY started_at DESC LIMIT 1`).get(...params) ?? null;
      };
      for (const [actor, ok] of [[null, null], ['midas', 1], ['midas', 0], ['argos', null], ['argos', 0], ['argos', 1], [null, 0], ['sêneca', null], ['sêneca', 1], ['ninguém', null]]) {
        assert.deepEqual(await s.financeSyncLog.latest({ actor, ok }), ask(actor, ok), `${actor}/${ok}`);
      }
      assert.equal((await s.financeSyncLog.latest({ actor: null, ok: null })).id, 'tie-a', 'empate: a primeira inserida');
      oracle.close();
    }));

    await t.test('lançamentos por período: ordem de varredura do índice, pontas abertas, casadas incluídas', async () => as('periodo', async () => {
      const oracle = createTestDb({ withFinance: true });
      const rows = [tx('y7', { posted_on: '2026-11-02' }), tx('y6', { posted_on: '2026-11-01' }), tx('y5', { posted_on: '2026-11-02', matched_tx_id: 'zz' }), tx('y4', { posted_on: '2026-11-01' }), tx('y3', { posted_on: '2026-11-03' }), tx('y2', { posted_on: '2026-10-31' }), tx('y1', { posted_on: '2026-12-01' })];
      for (const row of rows) { await s.financeTransactions.create(row); insertRaw(oracle, 'finance_transactions', row); }
      const scan = (from, to) => {
        let sql = 'SELECT * FROM finance_transactions WHERE 1=1'; const params = [];
        if (from !== null) { sql += ' AND posted_on >= ?'; params.push(from); }
        if (to !== null) { sql += ' AND posted_on <= ?'; params.push(to); }
        return oracle.prepare(sql).all(...params);
      };
      for (const [from, to] of [['2026-11-01', '2026-11-30'], ['2026-11-02', '2026-11-02'], ['2026-11-03', '2026-11-01'], ['2026-11-01', null], [null, '2026-11-01']]) {
        assert.deepEqual((await s.financeTransactions.between({ from, to })).map((r) => r.id), scan(from, to).map((r) => r.id), `${from}..${to}`);
      }
      assert.deepEqual((await s.financeTransactions.between({ from: null, to: null })).map((r) => r.id), ['y2', 'y6', 'y4', 'y7', 'y5', 'y3', 'y1']);
      assert.deepEqual(await s.financeTransactions.between({ from: '2026-11-01', to: '2026-11-30' }), scan('2026-11-01', '2026-11-30'));
      oracle.close();
    }));

    await t.test('saldos de banco: só Pierre e Pluggy, em ordem de inserção', async () => as('saldos', async () => {
      for (const row of [balance('b1', { source: 'joao' }), balance('b2', { source: 'pluggy' }), balance('b3', { source: 'agent' }), balance('b4', { source: 'pierre', as_of: '2026-10-01' }), balance('b5', { source: 'seed' }), balance('b6', { source: null })]) await s.financeBalances.create(row);
      assert.deepEqual((await s.financeBalances.bank()).map((r) => r.id), ['b2', 'b4']);
    }));

    await t.test('duas contas não se cruzam', async () => {
      await as('alice', () => s.financePendingTransactions.create(pending('mesma', { merchant: 'da alice' })));
      await as('bob', () => s.financePendingTransactions.create(pending('mesma', { merchant: 'do bob' })));
      await as('alice', () => s.financeSyncLog.create(log('s1', { actor: 'alice-only' })));
      assert.equal((await as('bob', () => s.financePendingTransactions.list())).length, 1);
      assert.equal((await as('bob', () => s.financePendingTransactions.get('mesma'))).merchant, 'do bob');
      assert.equal(await as('bob', () => s.financeSyncLog.latest({ actor: 'alice-only', ok: null })), null);
    });
  });
}
