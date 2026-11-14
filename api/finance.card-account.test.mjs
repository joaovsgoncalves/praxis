import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { seedFinanceIfEmpty } from './finance.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

// Caso real: as contas de cartão têm nome do produto (GOLD, platinum, BANDEIRADO) e as compras
// de cartão caíam na conta corrente do banco.
const INGEST = '/api/finance/ingest/pluggy';

async function mount(t) {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  db.prepare(`INSERT INTO finance_accounts (id, name, kind, institution, card_last4, status, is_operational, sort_order, created_at, updated_at)
              VALUES ('acc-gold', 'GOLD', 'credit', 'gold', '0465', 'active', 0, 9, '2026-08-01', '2026-08-01')`).run();
  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, getLocalDateString: () => '2026-11-14' }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  return { db, server };
}

function payload(transactions) {
  return {
    source: 'pluggy',
    fetched_at: '2026-11-14T12:00:00Z',
    institutions: [{
      institution: 'inter',
      updated_at: '2026-11-14T12:00:00Z',
      status: 'UPDATED',
      bank: { balance: 50, reserved: [] },
      card: { last4: '0465', brand: 'MASTERCARD', used: 100, limit: 5020, available: 4920,
        bill: { due_date: '2026-12-12', closing_date: '2026-12-05', total: 100, minimum: 15, paid: 0, payments_n: 0 } },
    }],
    transactions,
  };
}

const compra = { external_id: 'tx-card-1', institution: 'inter', account_type: 'CREDIT', date: '2026-11-10', amount: -42.5, description: 'MERCADO X', category: 'Groceries' };
const pix = { external_id: 'tx-bank-1', institution: 'inter', account_type: 'BANK', date: '2026-11-10', amount: -10, description: 'PIX ENVIADO', category: 'Transfer' };

function acct(db, ext) {
  return db.prepare('SELECT account_id FROM finance_transactions WHERE external_id = ?').get(ext).account_id;
}

test('compra de cartão vai para a conta do cartão, mesmo com nome de produto', async (t) => {
  const { db, server } = await mount(t);
  const res = await requestJson(server.base, INGEST, { method: 'POST', body: payload([compra, pix]) });
  assert.equal(res.transactions.inserted, 2);
  assert.equal(acct(db, 'tx-card-1'), 'acc-gold');
  assert.equal(acct(db, 'tx-bank-1'), 'acc-inter');
});

test('gasto lançado à mão na corrente casa com a compra do cartão do mesmo banco (sem contar duas vezes)', async (t) => {
  const { db, server } = await mount(t);
  db.prepare(`INSERT INTO finance_transactions (id, account_id, posted_on, amount, direction, raw_description, merchant, category, source, note, created_at)
              VALUES ('man-1', 'acc-inter', '2026-11-09', -42.5, 'outflow', 'mercado', 'Mercado do bairro', 'Mercado', 'joao', '', '2026-11-09')`).run();
  const res = await requestJson(server.base, INGEST, { method: 'POST', body: payload([compra]) });
  assert.equal(res.transactions.matched, 1);
  const bank = db.prepare("SELECT id, account_id, category FROM finance_transactions WHERE external_id = 'tx-card-1'").get();
  assert.equal(bank.account_id, 'acc-gold');
  assert.equal(bank.category, 'Mercado');
  assert.equal(db.prepare("SELECT matched_tx_id FROM finance_transactions WHERE id = 'man-1'").get().matched_tx_id, bank.id);
});

test('lançamento antigo na conta errada é reapontado sem duplicar e sem perder a categoria do João', async (t) => {
  const { db, server } = await mount(t);
  await requestJson(server.base, INGEST, { method: 'POST', body: payload([compra, pix]) });
  // simula o estado antigo: compra gravada na corrente e categoria corrigida pelo João
  db.prepare("UPDATE finance_transactions SET account_id = 'acc-inter', category = 'Mercado', note = 'do João' WHERE external_id = 'tx-card-1'").run();
  const res = await requestJson(server.base, INGEST, { method: 'POST', body: payload([compra, pix]) });
  assert.equal(res.transactions.inserted, 0);
  assert.equal(res.transactions.relinked, 1);
  const row = db.prepare("SELECT account_id, category, note FROM finance_transactions WHERE external_id = 'tx-card-1'").get();
  assert.deepEqual({ ...row }, { account_id: 'acc-gold', category: 'Mercado', note: 'do João' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_transactions').get().n, 2);
  const again = await requestJson(server.base, INGEST, { method: 'POST', body: payload([compra, pix]) });
  assert.equal(again.transactions.relinked, 0, 'idempotente');
});
