import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { seedFinanceIfEmpty } from './finance.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

async function mountFinance(t, { seed = true, today = '2026-08-12' } = {}) {
  const db = createTestDb({ withFinance: true });
  if (seed) seedFinanceIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, getLocalDateString: () => today }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  return { db, server };
}

test('overview with seed: Inter 1103.62 and next step is carro', async (t) => {
  const { server } = await mountFinance(t);
  const body = await requestJson(server.base, '/api/finance/overview');
  assert.equal(body.caixa, 1103.62);
  assert.equal(body.snapshot_label, 'foto 12/08');
  assert.equal(body.next_step.kind, 'due');
  assert.equal(body.next_step.debt_id, 'debt-carro');
  assert.ok(body.next_step.label.toLowerCase().includes('carro'));
  assert.equal(body.cards_total, 3782 + 3227 + 2162 + 1371);
  assert.ok(body.work_month >= 220 && body.work_month <= 240);
  assert.ok(body.personal_month >= 180 && body.personal_month <= 200);
});

test('pay debt lowers balance, records payment and outflow', async (t) => {
  const { db, server } = await mountFinance(t);
  const body = await requestJson(server.base, '/api/finance/debts/debt-carro/pay', {
    method: 'POST',
    body: { amount: 1270, paid_on: '2026-08-12', account_id: 'acc-inter', method: 'pix' },
  });
  assert.equal(body.debt.balance, 0);
  assert.equal(body.debt.status, 'clean');
  assert.equal(body.payment.amount, 1270);

  const txs = await requestJson(server.base, '/api/finance/transactions?from=2026-08-01&to=2026-08-31');
  assert.equal(txs.length, 1);
  assert.equal(txs[0].direction, 'outflow');
  assert.equal(txs[0].amount, -1270);
  assert.equal(txs[0].category, 'Dívidas');

  const payments = db.prepare('SELECT * FROM finance_payments WHERE debt_id = ?').all('debt-carro');
  assert.equal(payments.length, 1);

  const goal = db.prepare('SELECT * FROM finance_goals WHERE id = ?').get('goal-carro');
  assert.equal(goal.current_amount, 1270);
  assert.equal(goal.status, 'done');
});

test('subscription lane totals match seed', async (t) => {
  const { server } = await mountFinance(t);
  const work = await requestJson(server.base, '/api/finance/subscriptions?lane=work');
  const personal = await requestJson(server.base, '/api/finance/subscriptions?lane=personal');
  const workSum = work.reduce((s, x) => s + x.amount, 0);
  const personalSum = personal.reduce((s, x) => s + x.amount, 0);
  assert.ok(workSum >= 220 && workSum <= 240);
  assert.ok(personalSum >= 180 && personalSum <= 200);
});

test('insights ignore internal transfers', async (t) => {
  const { server } = await mountFinance(t);
  await requestJson(server.base, '/api/finance/transactions', {
    method: 'POST',
    body: {
      account_id: 'acc-inter',
      posted_on: '2026-08-10',
      amount: -80,
      direction: 'outflow',
      category: 'Alimentação',
      merchant: 'Mercado',
    },
  });
  await requestJson(server.base, '/api/finance/transactions', {
    method: 'POST',
    body: {
      account_id: 'acc-inter',
      posted_on: '2026-08-10',
      amount: -500,
      direction: 'internal',
      category: 'Transferência',
      merchant: 'C6',
    },
  });
  const insights = await requestJson(server.base, '/api/finance/insights?from=2026-08-01&to=2026-08-31');
  assert.equal(insights.outflow, 80);
  assert.equal(insights.categories[0].name, 'Alimentação');
});

test('locked joao balance is not the concern of empty seed rerun', async (t) => {
  const { server } = await mountFinance(t);
  await requestJson(server.base, '/api/finance/balances', {
    method: 'POST',
    body: {
      account_id: 'acc-inter',
      amount: 999.11,
      as_of: '2026-08-12',
      source: 'joao',
      locked: true,
    },
  });
  const again = await requestJson(server.base, '/api/finance/seed', { method: 'POST', body: {} });
  assert.equal(again.seeded, false);
  const overview = await requestJson(server.base, '/api/finance/overview');
  assert.equal(overview.caixa, 999.11);
  assert.equal(overview.snapshot_label, '');
});

test('sync without Pierre key returns 503', async (t) => {
  const { server } = await mountFinance(t);
  const response = await fetch(`${server.base}/api/finance/sync`, { method: 'POST' });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'pierre_not_configured');
});

test('Nubank survives as a debt even without Pierre', async (t) => {
  const { server } = await mountFinance(t);
  const debts = await requestJson(server.base, '/api/finance/debts');
  assert.ok(debts.some((d) => d.id === 'debt-nubank' && d.balance === 3227));
});
