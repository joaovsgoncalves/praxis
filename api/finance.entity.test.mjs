import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { seedFinanceIfEmpty } from './finance.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

// Separação leve PF x PJ: a empresa (Jota Victor) mora na mesma Praxis, mas nunca entra no caixa,
// no mês nem nos compromissos pessoais.
async function mount(t) {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
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

async function send(base, path, method, body) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const PF_KEYS = ['caixa', 'caixa_banco', 'invested', 'livre', 'safe_to_spend', 'committed_until_salary', 'debts_total', 'cards_total', 'subscriptions_month'];

test('conta PJ com saldo, gasto, assinatura e dívida não muda nada da visão PF', async (t) => {
  const { server } = await mount(t);
  const before = await requestJson(server.base, '/api/finance/overview');
  const pj = await requestJson(server.base, '/api/finance/accounts', {
    method: 'POST',
    body: { id: 'acc-asaas', name: 'Asaas Jota Victor', kind: 'checking', institution: 'asaas', entity: 'pj', is_operational: true, amount: 5000 },
  });
  assert.equal(pj.entity, 'pj');
  await requestJson(server.base, '/api/finance/transactions', { method: 'POST', body: { account_id: 'acc-asaas', posted_on: '2026-11-10', amount: -300, category: 'Assinaturas', merchant: 'Servidor' } });
  await requestJson(server.base, '/api/finance/transactions', { method: 'POST', body: { account_id: 'acc-asaas', posted_on: '2026-11-11', amount: 2000, category: 'Receita', merchant: 'Cliente' } });
  await requestJson(server.base, '/api/finance/subscriptions', { method: 'POST', body: { name: 'Ferramenta PJ', amount: 99, cadence: 'monthly', charge_day: 20, account_id: 'acc-asaas', status: 'active' } });
  await requestJson(server.base, '/api/finance/debts', { method: 'POST', body: { title: 'Imposto PJ', kind: 'other', balance: 700, account_id: 'acc-asaas', due_date: '2026-11-20' } });

  const after = await requestJson(server.base, '/api/finance/overview');
  for (const k of PF_KEYS) assert.equal(after[k], before[k], `PF mudou em ${k}`);
  assert.equal(after.month.total_out, before.month.total_out);
  assert.equal(after.month.total_in, before.month.total_in);
  assert.equal(after.entity, 'pf');
  assert.equal(after.pj_accounts_n, 1);

  const pjMonth = await requestJson(server.base, '/api/finance/month?month=2026-11&entity=pj');
  assert.equal(pjMonth.entity, 'pj');
  assert.equal(pjMonth.total_in, 2000);
  assert.equal(pjMonth.total_out, 300);

  const pjAccounts = await requestJson(server.base, '/api/finance/accounts?entity=pj');
  assert.deepEqual(pjAccounts.map((a) => a.id), ['acc-asaas']);
  const pfTx = await requestJson(server.base, '/api/finance/transactions?from=2026-11-01&to=2026-11-30&entity=pf');
  assert.ok(pfTx.every((tx) => tx.account_id !== 'acc-asaas'));
  const pjTx = await requestJson(server.base, '/api/finance/transactions?from=2026-11-01&to=2026-11-30&entity=pj');
  assert.equal(pjTx.length, 2);
  const allTx = await requestJson(server.base, '/api/finance/transactions?from=2026-11-01&to=2026-11-30');
  assert.ok(allTx.length >= 2, 'sem filtro a lista mostra tudo (a tela da Praxis)');
});

test('entity inválido é recusado; conta existente pode virar PJ', async (t) => {
  const { server } = await mount(t);
  assert.equal((await send(server.base, '/api/finance/accounts', 'POST', { name: 'X', entity: 'empresa' })).status, 400);
  assert.equal((await send(server.base, '/api/finance/accounts', 'POST', { name: 'X', entity: 'all' })).status, 400);
  assert.equal((await send(server.base, '/api/finance/month?entity=xpto', 'GET')).status, 400);
  const res = await send(server.base, '/api/finance/accounts/acc-c6', 'PATCH', { entity: 'pj' });
  assert.equal(res.status, 200);
  assert.equal(res.body.entity, 'pj');
  const ov = await requestJson(server.base, '/api/finance/overview');
  assert.equal(ov.pj_accounts_n, 1);
});

test('sync pessoal do Pluggy nunca grava em conta PJ do mesmo banco', async (t) => {
  const { db, server } = await mount(t);
  await requestJson(server.base, '/api/finance/accounts', {
    method: 'POST', body: { id: 'acc-inter-pj', name: 'Inter PJ', kind: 'checking', institution: 'inter', entity: 'pj', is_operational: true, sort_order: 0 },
  });
  await requestJson(server.base, '/api/finance/ingest/pluggy', {
    method: 'POST',
    body: {
      source: 'pluggy',
      fetched_at: '2026-11-14T12:00:00Z',
      institutions: [{ institution: 'inter', updated_at: '2026-11-14T12:00:00Z', status: 'UPDATED', bank: { balance: 50, reserved: [] }, card: null }],
      transactions: [{ external_id: 'tx-1', institution: 'inter', account_type: 'BANK', date: '2026-11-10', amount: -10, description: 'PIX', category: 'Transfer' }],
    },
  });
  assert.equal(db.prepare("SELECT account_id FROM finance_transactions WHERE external_id = 'tx-1'").get().account_id, 'acc-inter');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_balances WHERE account_id = 'acc-inter-pj' AND source = 'pluggy'").get().n, 0);
});
