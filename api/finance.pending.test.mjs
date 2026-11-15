import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { seedFinanceIfEmpty } from './finance.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

// Compras do ciclo aberto do cartão chegam como PENDING no Pluggy e eram descartadas.
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

function payload({ transactions = [], pending = [], pendingInstitutions = ['inter'], status = 'UPDATED' } = {}) {
  return {
    source: 'pluggy',
    fetched_at: '2026-11-14T12:00:00Z',
    institutions: [{
      institution: 'inter',
      updated_at: '2026-11-14T12:00:00Z',
      status,
      bank: { balance: 50, reserved: [] },
      card: { last4: '0465', brand: 'MASTERCARD', used: 100, limit: 5020, available: 4920,
        bill: { due_date: '2026-12-12', closing_date: '2026-12-05', total: 100, minimum: 15, paid: 0, payments_n: 0 } },
    }],
    transactions,
    pending_transactions: pending,
    pending_institutions: pendingInstitutions,
  };
}

const pend = (id, amount, date = '2026-11-12', description = 'PADARIA Y') => ({
  external_id: id, institution: 'inter', account_type: 'CREDIT', date, amount, description, category: 'Food and drinks',
});

async function month(server) {
  return requestJson(server.base, '/api/finance/month?month=2026-11');
}

test('pendente entra na conta do cartão e fica fora do total do mês', async (t) => {
  const { server } = await mount(t);
  const before = await month(server);
  const res = await requestJson(server.base, INGEST, { method: 'POST', body: payload({ pending: [pend('p1', -30), pend('p2', -12.5)] }) });
  assert.deepEqual(res.pending, { stored: 2, already_posted: 0, institutions: ['inter'] });
  const after = await month(server);
  assert.equal(after.total_out, before.total_out, 'pendente não soma no mês');
  assert.equal(after.pending_card.count, 2);
  assert.equal(after.pending_card.total, 42.5);
  const list = await requestJson(server.base, '/api/finance/pending');
  assert.equal(list.pending.length, 2);
  assert.ok(list.pending.every((p) => p.account_id === 'acc-gold'));
});

test('banco confirma com outro id: a pendente sai e nada conta duas vezes', async (t) => {
  const { db, server } = await mount(t);
  await requestJson(server.base, INGEST, { method: 'POST', body: payload({ pending: [pend('p1', -30)] }) });
  const confirmada = { ...pend('posted-9', -30, '2026-11-13'), account_type: 'CREDIT' };
  // na mesma leitura o banco ainda manda a pendente antiga junto com a confirmada
  const res = await requestJson(server.base, INGEST, { method: 'POST', body: payload({ transactions: [confirmada], pending: [pend('p1', -30)] }) });
  assert.equal(res.transactions.inserted, 1);
  assert.deepEqual(res.pending, { stored: 0, already_posted: 1, institutions: ['inter'] });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_pending_transactions').get().n, 0);
  const m = await month(server);
  assert.equal(m.pending_card.count, 0);
});

test('duas compras iguais: só uma confirmada, a outra continua pendente', async (t) => {
  const { server } = await mount(t);
  const confirmada = { ...pend('posted-1', -9.9, '2026-11-12'), account_type: 'CREDIT' };
  const res = await requestJson(server.base, INGEST, { method: 'POST', body: payload({ transactions: [confirmada], pending: [pend('p1', -9.9), pend('p2', -9.9)] }) });
  assert.deepEqual(res.pending, { stored: 1, already_posted: 1, institutions: ['inter'] });
});

test('leitura incompleta ou banco desatualizado mantém a lista anterior; leitura completa troca inteira', async (t) => {
  const { db, server } = await mount(t);
  await requestJson(server.base, INGEST, { method: 'POST', body: payload({ pending: [pend('p1', -30), pend('p2', -5)] }) });
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM finance_pending_transactions').get().n;

  let res = await requestJson(server.base, INGEST, { method: 'POST', body: payload({ pending: [], pendingInstitutions: [] }) });
  assert.equal(res.pending.institutions.length, 0);
  assert.equal(count(), 2, 'sem leitura completa: não apaga');

  res = await requestJson(server.base, INGEST, { method: 'POST', body: payload({ pending: [], status: 'OUTDATED' }) });
  assert.equal(count(), 2, 'banco desatualizado: não apaga');

  res = await requestJson(server.base, INGEST, { method: 'POST', body: payload({ pending: [pend('p3', -7)] }) });
  assert.deepEqual(res.pending, { stored: 1, already_posted: 0, institutions: ['inter'] });
  assert.deepEqual(db.prepare('SELECT external_id FROM finance_pending_transactions').all().map((r) => r.external_id), ['p3']);
});

test('pending_institutions inválido é recusado antes de gravar', async (t) => {
  const { server } = await mount(t);
  await assert.rejects(
    requestJson(server.base, INGEST, { method: 'POST', body: payload({ pendingInstitutions: ['banco-x'] }) }),
    /-> 400: .*pending_institutions/,
  );
});
