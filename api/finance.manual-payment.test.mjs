import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { sqliteTestStorage } from './test-support/httpParity.fase5.mjs';
import { billCycleStale, getOverview, seedFinanceIfEmpty } from './finance.js';
import { businessDaysBetween } from './pluggyIngest.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

// Caso real de 11/11/2026: o João pagou a fatura do Inter, o banco demorou a mostrar e o alerta disparou.
const INGEST = '/api/finance/ingest/pluggy';

async function mount(t, clock) {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, storage: sqliteTestStorage(db), getLocalDateString: () => clock.today }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  return { db, server };
}

function interPayload(paid, updatedAt = '2026-11-12T12:00:00Z') {
  return {
    source: 'pluggy',
    fetched_at: updatedAt,
    institutions: [{
      institution: 'inter',
      updated_at: updatedAt,
      status: 'UPDATED',
      bank: { balance: 100, reserved: [] },
      card: {
        last4: '0465',
        brand: 'MASTERCARD',
        used: 1970.49,
        limit: 5020,
        available: 3049.51,
        bill: { due_date: '2026-11-12', closing_date: '2026-11-05', total: 3575.01, minimum: 2454.82, paid, payments_n: paid ? 1 : 0 },
      },
    }],
  };
}

function card(db) {
  return db.prepare("SELECT * FROM finance_card_status WHERE account_id = 'acc-inter'").get();
}

test('pagamento confirmado pelo João vale enquanto o banco não mostra', async (t) => {
  const clock = { today: '2026-11-11' };
  const { db, server } = await mount(t, clock);
  await requestJson(server.base, INGEST, { method: 'POST', body: interPayload(0, '2026-11-11T12:00:00Z') });
  assert.equal(card(db).bill_paid, 0);

  await requestJson(server.base, '/api/finance/debts/debt-inter/pay', { method: 'POST', body: { amount: 3575.01, paid_on: '2026-11-11' } });

  clock.today = '2026-11-12';
  const res = await requestJson(server.base, INGEST, { method: 'POST', body: interPayload(0) });
  assert.equal(res.applied[0].manual_paid_pending, 3575.01);
  const c = card(db);
  assert.equal(c.bill_paid, 3575.01, 'pago efetivo inclui a confirmação');
  assert.equal(c.bill_paid_manual, 3575.01);
  assert.equal(c.bill_remaining, 0);
  const d = db.prepare("SELECT * FROM finance_debts WHERE id = 'debt-inter'").get();
  assert.equal(d.status, 'clean', 'o banco atrasado não reabre a dívida');
  assert.equal(d.min_payment, 0);
  const ov = getOverview(db, { today: '2026-11-12' });
  const inter = ov.cards_status.find((x) => x.institution === 'inter');
  assert.equal(inter.card_situation, 'paid', 'sem alerta de mínimo em aberto');
});

test('quando o banco mostra o pagamento, o ajuste manual some', async (t) => {
  const clock = { today: '2026-11-11' };
  const { db, server } = await mount(t, clock);
  await requestJson(server.base, '/api/finance/debts/debt-inter/pay', { method: 'POST', body: { amount: 3575.01, paid_on: '2026-11-11' } });
  clock.today = '2026-11-12';
  await requestJson(server.base, INGEST, { method: 'POST', body: interPayload(3575.01) });
  const c = card(db);
  assert.equal(c.bill_paid, 3575.01, 'não soma duas vezes');
  assert.equal(c.bill_paid_manual, 0);
});

test('depois de 3 dias úteis sem o banco mostrar, vale o banco', async (t) => {
  const clock = { today: '2026-11-11' };
  const { db, server } = await mount(t, clock);
  await requestJson(server.base, '/api/finance/debts/debt-inter/pay', { method: 'POST', body: { amount: 3575.01, paid_on: '2026-11-11' } });
  clock.today = '2026-11-16'; // qui, sex, seg = 3 dias úteis: ainda vale
  await requestJson(server.base, INGEST, { method: 'POST', body: interPayload(0, '2026-11-16T12:00:00Z') });
  assert.equal(card(db).bill_paid_manual, 3575.01);
  clock.today = '2026-11-17'; // 4º dia útil: expirou
  await requestJson(server.base, INGEST, { method: 'POST', body: interPayload(0, '2026-11-17T12:00:00Z') });
  const c = card(db);
  assert.equal(c.bill_paid_manual, 0);
  assert.equal(c.bill_paid, 0);
  const ov = getOverview(db, { today: '2026-11-17' });
  assert.equal(ov.cards_status.find((x) => x.institution === 'inter').card_situation, 'min_open');
});

test('pagamento anterior ao fechamento é de outro ciclo e não conta', async (t) => {
  const clock = { today: '2026-11-04' };
  const { db, server } = await mount(t, clock);
  await requestJson(server.base, '/api/finance/debts/debt-inter/pay', { method: 'POST', body: { amount: 500, paid_on: '2026-11-04' } });
  clock.today = '2026-11-06';
  await requestJson(server.base, INGEST, { method: 'POST', body: interPayload(0, '2026-11-06T12:00:00Z') });
  assert.equal(card(db).bill_paid_manual, 0);
});

test('dias úteis e ciclo de fatura desatualizado', () => {
  assert.equal(businessDaysBetween('2026-11-13', '2026-11-16'), 1, 'sex para seg');
  assert.equal(businessDaysBetween('2026-11-11', '2026-11-16'), 3);
  assert.equal(businessDaysBetween('2026-11-11', '2026-11-11'), 0);
  const mp = { bill_due: '2026-10-14', bill_closing: '2026-10-09' };
  assert.equal(billCycleStale(mp, '2026-11-14'), true, 'Mercado Pago preso em outubro');
  assert.equal(billCycleStale(mp, '2026-10-20'), false, 'venceu, mas o ciclo novo ainda nem fechou');
  assert.equal(billCycleStale({ bill_due: '2026-11-16', bill_closing: '2026-11-07' }, '2026-11-14'), false);
  assert.equal(billCycleStale({ bill_due: null, bill_closing: null }, '2026-11-14'), false);
});

test('a migração cria bill_paid_manual sem mexer no resto', () => {
  const db = createTestDb({ withFinance: true });
  const cols = db.prepare('PRAGMA table_info(finance_card_status)').all().map((c) => c.name);
  assert.ok(cols.includes('bill_paid_manual'));
  db.close();
});
