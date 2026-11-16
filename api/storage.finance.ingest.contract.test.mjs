/**
 * Contrato dos métodos que o ingest do banco acrescentou aos repositórios de finanças (domínio 5), nos dois
 * motores: busca por `external_id`, troca/remoção de pendentes, estado do cartão, janelas de cobertura,
 * saldo alterado e recibos do Alfred (só leitura).
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

async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client, root;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb({ withFinance: true })); return databases.get(owner); },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    root = client.collection('financeIngestRuns').doc(randomUUID());
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
const tx = (id, extra = {}) => ({ id, pierre_tx_id: null, account_id: null, posted_on: '2026-11-01', amount: -10, direction: 'outflow', raw_description: '', merchant: '', category: 'Outros', subscription_id: null, debt_id: null, source: 'pluggy', created_at: STAMP, external_id: null, matched_tx_id: null, note: '', payment_id: null, intent_key: null, ...extra });
const pending = (id, extra = {}) => ({ external_id: id, institution: 'inter', account_id: null, posted_on: '2026-11-10', amount: -10, raw_description: '', merchant: '', category: null, seen_at: STAMP, ...extra });
const card = (id, extra = {}) => ({ account_id: id, institution: 'inter', last4: null, brand: null, used: null, limit_total: null, limit_available: null, bill_total: null, bill_minimum: null, bill_paid: null, bill_remaining: null, bill_due: null, bill_closing: null, bank_updated_at: null, updated_at: null, source: 'pluggy', bill_paid_manual: 0, ...extra });
const balance = (id, extra = {}) => ({ id, account_id: 'a', as_of: '2026-11-01', amount: 1, amount_kind: 'available', source: 'pluggy', locked: 0, note: '', created_at: STAMP, ...extra });

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de finanças (ingest do banco)`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('lançamentos por external_id: só os que existem, em lotes, vazio e excesso recusados', async () => as('ext', async () => {
      for (let i = 0; i < 75; i += 1) await s.financeTransactions.create(tx(`t${i}`, { external_id: `EXT-${i}` }));
      await s.financeTransactions.create(tx('sem', { external_id: null }));
      await s.financeTransactions.create(tx('vazio', { external_id: '' }));
      const ids = Array.from({ length: 90 }, (_, i) => `EXT-${i}`);
      const found = await s.financeTransactions.byExternalIds([...ids, 'EXT-5', 'EXT-5']);
      assert.deepEqual(found.map((r) => r.external_id).sort(), Array.from({ length: 75 }, (_, i) => `EXT-${i}`).sort());
      assert.deepEqual(await s.financeTransactions.byExternalIds([]), []);
      assert.deepEqual(await s.financeTransactions.byExternalIds(['nada']), []);
      await assert.rejects(() => s.financeTransactions.byExternalIds(['']), { code: 'invalid_transaction_query' });
      await assert.rejects(() => s.financeTransactions.byExternalIds([5]), { code: 'invalid_transaction_query' });
      await assert.rejects(() => s.financeTransactions.byExternalIds('x'), { code: 'invalid_transaction_query' });
      await assert.rejects(() => s.financeTransactions.byExternalIds(Array.from({ length: 2001 }, (_, i) => `x${i}`)), { code: 'invalid_transaction_query' });
    }));

    await t.test('marcar manual como casado e religar conta: alterações permitidas; coluna única continua imutável', async () => as('patch', async () => {
      await s.financeTransactions.create(tx('m', { source: 'joao', account_id: 'a1', external_id: 'E-M' }));
      await s.financeTransactions.patch('m', { matched_tx_id: 'b' });
      await s.financeTransactions.patch('m', { account_id: 'a2' });
      assert.deepEqual([(await s.financeTransactions.get('m')).matched_tx_id, (await s.financeTransactions.get('m')).account_id], ['b', 'a2']);
      await assert.rejects(() => s.financeTransactions.patch('m', { external_id: 'outro' }), { code: 'immutable_unique_field' });
    }));

    await t.test('pendentes: trocar a linha inteira e remover; duas escritas do mesmo documento no commit (Firestore recusa)', async () => as('pend', async () => {
      await s.financePendingTransactions.create(pending('p1', { merchant: 'velho', category: 'Lazer', institution: 'inter' }));
      await s.financePendingTransactions.create(pending('p2'));
      await s.financePendingTransactions.upsert(pending('p1', { merchant: 'novo', category: null, institution: 'c6', amount: -22.5 }));
      await s.financePendingTransactions.upsert(pending('p3'));
      assert.deepEqual(await s.financePendingTransactions.get('p1'), pending('p1', { merchant: 'novo', category: null, institution: 'c6', amount: -22.5 }));
      await s.financePendingTransactions.remove('p2');
      await s.financePendingTransactions.remove('nao-existe');
      assert.deepEqual((await s.financePendingTransactions.list()).map((r) => r.external_id), ['p1', 'p3']);
      // o Firestore recusa duas escritas do mesmo documento no mesmo commit; o serviço de ingest junta as mudanças antes
      const twice = () => s.transaction(async (tr) => { await tr.financePendingTransactions.upsert(pending('p4')); await tr.financePendingTransactions.upsert(pending('p4')); });
      if (kind === 'firestore') {
        await assert.rejects(twice, { code: 'duplicate_write_in_transaction' });
        assert.equal(await s.financePendingTransactions.get('p4'), null);
      } else await twice();
      await assert.rejects(() => s.financePendingTransactions.upsert(pending('p5', { amount: 0.1 + 0.2 })), { code: 'fractional_cent_or_overflow' });
    }));

    await t.test('estado do cartão: upsert troca todas as colunas; janelas de cobertura: criar e remover; saldo: alterar', async () => as('estado', async () => {
      await s.financeCardStatus.upsert(card('c1', { used: 10, bill_total: 99.9, bill_due: '2026-11-20' }));
      await s.financeCardStatus.upsert(card('c1', { used: null, bill_total: 5, bill_due: null, institution: 'nubank' }));
      assert.deepEqual(await s.financeCardStatus.get('c1'), card('c1', { used: null, bill_total: 5, institution: 'nubank' }));
      await s.financeStatementCoverage.create({ id: 'w1', account_id: 'a', source: 'pluggy', covered_from: '2026-11-01', covered_to: '2026-11-05', recorded_at: STAMP });
      await s.financeStatementCoverage.remove('w1');
      await s.financeStatementCoverage.remove('w1');
      assert.deepEqual(await s.financeStatementCoverage.list({ account_id: 'a' }), []);
      await s.financeBalances.create(balance('b1'));
      await s.financeBalances.patch('b1', { amount: 12.34, note: 'inclui reservas: x', created_at: '2026-11-16T00:00:00.000Z' });
      assert.deepEqual(await s.financeBalances.get('b1'), balance('b1', { amount: 12.34, note: 'inclui reservas: x', created_at: '2026-11-16T00:00:00.000Z' }));
      await assert.rejects(() => s.financeBalances.patch('b1', { amount: 1.005 }), { code: 'fractional_cent_or_overflow' });
      await assert.rejects(() => s.financeBalances.patch('b1', { id: 'b2' }), { code: 'immutable_record_id' });
      await assert.rejects(() => s.financeBalances.patch('nao-existe', { amount: 1 }), { code: 'not_found' });
      if (kind === 'firestore') assert.equal((await f.rawDoc('estado', 'financeBalances', 'b1')).amount, 1234);
    }));

    await t.test('recibos do Alfred: só leitura; sem a tabela (SQLite) ou sem a fase 6 (Firestore) a lista é vazia', async () => as('recibos', async () => {
      assert.deepEqual(await s.financeReceipts.list(), []);
      assert.equal(typeof s.financeReceipts.create, 'undefined');
      if (kind === 'sqlite') {
        f.db('recibos').exec('CREATE TABLE alfred_payment_receipts (request_hash TEXT, digest TEXT, payment_id TEXT, transaction_id TEXT, result_json TEXT, expected_paid_floor REAL, cycle_closing TEXT, cycle_due TEXT)');
        f.db('recibos').prepare('INSERT INTO alfred_payment_receipts (payment_id, expected_paid_floor, cycle_closing, cycle_due, digest) VALUES (?, ?, ?, ?, ?)').run('p1', 1600.5, '2026-11-10', '2026-11-20', 'x');
        assert.deepEqual(await s.financeReceipts.list(), [{ payment_id: 'p1', expected_paid_floor: 1600.5, cycle_closing: '2026-11-10', cycle_due: '2026-11-20' }]);
      }
    }));

    await t.test('duas contas não se cruzam', async () => {
      await as('alice', () => s.financeCardStatus.upsert(card('mesma', { institution: 'da alice' })));
      await as('bob', () => s.financeCardStatus.upsert(card('mesma', { institution: 'do bob' })));
      assert.equal((await as('alice', () => s.financeCardStatus.get('mesma'))).institution, 'da alice');
      assert.deepEqual(await as('bob', () => s.financeTransactions.byExternalIds(['EXT-1'])), []);
    });
  });
}
