import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { getOverview, initFinanceSchema, listAccounts, seedFinanceIfEmpty, updateSettings } from './finance.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';
import { fortalezaClock, fortalezaStamp, midasLabel } from '../src/lib/financeClock.js';

const TODAY = '2026-10-14';
const INGEST = '/api/finance/ingest/pluggy';

async function mountFinance(t) {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, getLocalDateString: () => TODAY }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  return { db, server };
}

async function postRaw(base, path, raw) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof raw === 'string' ? raw : JSON.stringify(raw),
  });
  return { status: response.status, body: await response.json() };
}

function inter(overrides = {}) {
  return {
    institution: 'inter',
    updated_at: '2026-10-14T18:59:57Z',
    status: 'UPDATED',
    bank: { balance: 0, reserved: [{ name: 'Férias', amount: 0.35 }] },
    card: {
      last4: '0465',
      brand: 'MASTERCARD',
      used: 3679.94,
      limit: 5020,
      available: 1340.06,
      bill: {
        due_date: '2026-10-12',
        closing_date: '2026-10-05',
        total: 3163.96,
        minimum: 861.5,
        paid: 1338.49,
        payments_n: 2,
      },
    },
    ...overrides,
  };
}

function payload(institutions) {
  return { source: 'pluggy', fetched_at: '2026-10-14T21:40:00Z', institutions };
}

function counts(db) {
  const n = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  return {
    balances: n('finance_balances'),
    card_status: n('finance_card_status'),
    debts: n('finance_debts'),
    accounts: n('finance_accounts'),
    sync_log: n('finance_sync_log'),
  };
}

function debt(db, id) {
  return db.prepare('SELECT * FROM finance_debts WHERE id = ?').get(id);
}

test('migração do estado do cartão é aditiva e idempotente', () => {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  initFinanceSchema(db);
  initFinanceSchema(db);
  const cols = db.prepare('PRAGMA table_info(finance_card_status)').all().map((c) => c.name);
  for (const col of ['account_id', 'institution', 'last4', 'bill_remaining', 'bill_due', 'bank_updated_at', 'source']) {
    assert.ok(cols.includes(col), col);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_accounts').get().n, 6);
  db.close();
});

test('ingest aplica saldo, estado do cartão e dívida do cartão', async (t) => {
  const { db, server } = await mountFinance(t);
  const res = await requestJson(server.base, INGEST, { method: 'POST', body: payload([inter()]) });

  assert.equal(res.ok, true);
  assert.deepEqual(res.applied.map((a) => a.institution), ['inter']);
  assert.deepEqual(res.skipped, []);

  const balance = db.prepare(
    "SELECT * FROM finance_balances WHERE account_id = 'acc-inter' AND source = 'pluggy'",
  ).get();
  assert.equal(balance.as_of, '2026-10-14', 'data no fuso de Fortaleza');
  assert.equal(balance.amount, 0.35, 'saldo + reservas');
  assert.equal(balance.amount_kind, 'available');
  const acc = listAccounts(db).find((a) => a.id === 'acc-inter');
  assert.equal(acc.available, 0.35);
  assert.equal(acc.available_source, 'pluggy');

  const card = db.prepare("SELECT * FROM finance_card_status WHERE account_id = 'acc-inter'").get();
  assert.equal(card.institution, 'inter');
  assert.equal(card.last4, '0465');
  assert.equal(card.brand, 'MASTERCARD');
  assert.equal(card.limit_total, 5020);
  assert.equal(card.limit_available, 1340.06);
  assert.equal(card.bill_total, 3163.96);
  assert.equal(card.bill_paid, 1338.49);
  assert.equal(card.bill_remaining, 1825.47);
  assert.equal(card.bill_due, '2026-10-12');
  assert.equal(card.bill_closing, '2026-10-05');
  assert.equal(card.bank_updated_at, '2026-10-14T18:59:57.000Z');
  assert.equal(card.source, 'pluggy');

  const d = debt(db, 'debt-inter');
  assert.equal(d.balance, 1825.47);
  assert.equal(d.min_payment, 0, 'mínimo já coberto pelo pago');
  assert.equal(d.due_date, '2026-10-12');
  assert.equal(d.status, 'open');
  assert.equal(d.source, 'pluggy');
  assert.equal(d.title, 'Inter resto', 'título intocado');
  assert.equal(d.queue, 3, 'fila intocada');
  assert.equal(d.note, 'Mínimo já pago nesta rodada.', 'nota intocada');

  const log = db.prepare("SELECT * FROM finance_sync_log WHERE actor = 'midas'").all();
  assert.equal(log.length, 1);
  assert.equal(log[0].ok, 1);
  assert.equal(log[0].accounts_n, 1);
});

test('ingest é idempotente: mesmo JSON 2x mantém as contagens', async (t) => {
  const { db, server } = await mountFinance(t);
  const body = payload([inter()]);
  await requestJson(server.base, INGEST, { method: 'POST', body });
  const first = counts(db);
  const firstDebt = debt(db, 'debt-inter');
  await requestJson(server.base, INGEST, { method: 'POST', body });
  const second = counts(db);

  assert.deepEqual({ ...second, sync_log: 0 }, { ...first, sync_log: 0 });
  assert.equal(second.sync_log, first.sync_log + 1, 'uma linha de log por ingest');
  const again = debt(db, 'debt-inter');
  assert.equal(again.balance, firstDebt.balance);
  assert.equal(again.status, firstDebt.status);
});

test('cartão de crédito com final casado recebe o estado; fatura paga vira clean mesmo com locked', async (t) => {
  const { db, server } = await mountFinance(t);
  await requestJson(server.base, '/api/finance/accounts', {
    method: 'POST',
    body: { id: 'acc-nubank-card', name: 'Nubank crédito', kind: 'credit', institution: 'nubank', mask: '1111' },
  });
  db.prepare("UPDATE finance_debts SET locked = 1 WHERE id = 'debt-nubank'").run();

  const res = await requestJson(server.base, INGEST, {
    method: 'POST',
    body: payload([
      {
        institution: 'nubank',
        updated_at: '2026-10-14T17:00:00Z',
        status: 'UPDATED',
        bank: null,
        card: {
          last4: '1111',
          brand: 'MASTERCARD',
          used: 200,
          limit: 1000,
          available: 800,
          bill: { due_date: '2026-10-20', closing_date: '2026-10-13', total: 500, minimum: 75, paid: 500, payments_n: 1 },
        },
      },
    ]),
  });
  assert.equal(res.applied[0].card_account_id, 'acc-nubank-card');

  const card = db.prepare("SELECT * FROM finance_card_status WHERE account_id = 'acc-nubank-card'").get();
  assert.equal(card.bill_remaining, 0);
  const d = debt(db, 'debt-nubank');
  assert.equal(d.status, 'clean');
  assert.equal(d.balance, 0);
  assert.equal(d.min_payment, 0);
  assert.equal(d.locked, 1, 'locked continua marcado');
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM finance_balances WHERE account_id = 'acc-nubank'").get().n,
    0,
    'bank null não grava saldo',
  );
});

test('status != UPDATED só registra: sem escrita de valores', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = counts(db);
  const c6Before = debt(db, 'debt-c6');
  const res = await requestJson(server.base, INGEST, {
    method: 'POST',
    body: payload([inter({ institution: 'c6', status: 'LOGIN_ERROR', card: { ...inter().card, last4: '9999' } })]),
  });
  assert.deepEqual(res.applied, []);
  assert.deepEqual(res.skipped.map((s) => [s.institution, s.status]), [['c6', 'LOGIN_ERROR']]);

  const after = counts(db);
  assert.deepEqual({ ...after, sync_log: 0 }, { ...before, sync_log: 0 });
  assert.deepEqual(debt(db, 'debt-c6'), c6Before);
  const log = db.prepare("SELECT * FROM finance_sync_log WHERE actor = 'midas'").get();
  assert.equal(log.accounts_n, 0);
  assert.match(log.error, /c6/);
  assert.match(log.error, /LOGIN_ERROR/);
});

test('corpo inválido = 400 sem escrita parcial', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = counts(db);
  const interDebt = debt(db, 'debt-inter');

  const bad = [
    [1, 2],
    { source: 'pluggy' },
    { ...payload([inter()]), source: 'pierre' },
    payload('inter'),
    payload([inter({ institution: 'xp' })]),
    payload([inter({ updated_at: 'ontem' })]),
    payload([inter({ status: '' })]),
    payload([inter({ bank: { balance: 'abc', reserved: [] } })]),
    payload([inter({ bank: { balance: 10, reserved: [{ name: 'x', amount: null }] } })]),
    payload([inter({ card: { ...inter().card, last4: '12a4' } })]),
    payload([inter({ card: { ...inter().card, bill: { ...inter().card.bill, due_date: '2026-13-01' } } })]),
    payload([inter({ card: { ...inter().card, bill: { ...inter().card.bill, total: '3163' } } })]),
    // o primeiro é válido: nada dele pode ficar gravado
    payload([inter(), inter({ institution: 'c6', card: { ...inter().card, limit: 'muito' } })]),
    payload([inter(), inter()]),
  ];
  for (const body of bad) {
    const res = await postRaw(server.base, INGEST, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 160));
    assert.ok(res.body.error);
  }
  // número não finito só passa pelo JSON cru
  const raw = JSON.stringify(payload([inter()])).replace('"total":3163.96', '"total":1e999');
  assert.equal((await postRaw(server.base, INGEST, raw)).status, 400);

  assert.deepEqual(counts(db), before);
  assert.deepEqual(debt(db, 'debt-inter'), interDebt);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_card_status").get().n, 0);
});

test('dívidas que não são de cartão ficam intocadas', async (t) => {
  const { db, server } = await mountFinance(t);
  const others = () => db.prepare("SELECT * FROM finance_debts WHERE kind != 'card' ORDER BY id").all();
  const before = others();
  assert.ok(before.length >= 3);
  await requestJson(server.base, INGEST, {
    method: 'POST',
    body: payload([inter(), inter({ institution: 'mp', card: { ...inter().card, last4: '2647' } })]),
  });
  assert.deepEqual(others(), before);
});

test('saldo manual mais novo do João vence; atualização posterior do banco volta a valer', async (t) => {
  const { db, server } = await mountFinance(t);
  await requestJson(server.base, INGEST, { method: 'POST', body: payload([inter()]) });

  db.prepare(`
    INSERT INTO finance_balances (id, account_id, as_of, amount, amount_kind, source, locked, note, created_at)
    VALUES ('manual-1', 'acc-inter', '2026-10-14', 900, 'available', 'joao', 1, '', '2026-10-14T20:00:00.000Z')
  `).run();
  assert.equal(listAccounts(db).find((a) => a.id === 'acc-inter').available, 900);

  // mesmo JSON de novo: o banco não mudou, o manual continua valendo
  await requestJson(server.base, INGEST, { method: 'POST', body: payload([inter()]) });
  assert.equal(listAccounts(db).find((a) => a.id === 'acc-inter').available, 900);

  await requestJson(server.base, INGEST, {
    method: 'POST',
    body: payload([inter({ updated_at: '2026-10-14T21:30:00Z', bank: { balance: 50, reserved: [] } })]),
  });
  const acc = listAccounts(db).find((a) => a.id === 'acc-inter');
  assert.equal(acc.available, 50);
  assert.equal(acc.available_source, 'pluggy');
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM finance_balances WHERE account_id = 'acc-inter' AND source = 'pluggy'").get().n,
    1,
    'mesmo dia atualiza em vez de inserir',
  );
});

test('overview: pode gastar, faturas dos próximos 7 dias, limite livre e data do banco', async (t) => {
  const { db, server } = await mountFinance(t);
  updateSettings(db, { reserved_car: 0, reserved_live: 0 });
  const res = await requestJson(server.base, INGEST, {
    method: 'POST',
    body: payload([
      inter({ bank: { balance: 2500, reserved: [{ name: 'Férias', amount: 0.35 }] } }),
      inter({
        institution: 'c6',
        updated_at: '2026-10-14T12:00:00Z',
        bank: null,
        card: {
          last4: '5555',
          brand: 'VISA',
          used: 400,
          limit: 1000,
          available: 600,
          // vence daqui a 20 dias: fora da janela
          bill: { due_date: '2026-11-03', closing_date: '2026-10-27', total: 400, minimum: 60, paid: 0, payments_n: 0 },
        },
      }),
    ]),
  });

  // Inter: 3163,96 - 1338,49 = 1825,47 vencendo 12/10 (hoje-2) entra; C6 (03/11) fica fora
  assert.equal(res.overview_snapshot.caixa, 2500.35);
  assert.equal(res.overview_snapshot.livre, 2500.35);
  assert.equal(res.overview_snapshot.bills_due_7d, 1825.47);
  assert.equal(res.overview_snapshot.safe_to_spend, 674.88);

  const overview = getOverview(db, { today: TODAY });
  assert.equal(overview.safe_to_spend, 674.88);
  assert.equal(overview.bills_due_7d, 1825.47);
  assert.equal(overview.credit_available_total, 1940.06);
  assert.equal(overview.bank_data_as_of, '2026-10-14T12:00:00.000Z', 'o mais antigo entre as instituições');
  assert.equal(overview.cards_status.length, 2);
  assert.equal(overview.cards_status.find((c) => c.account_id === 'acc-inter').account_name, 'Inter');
  assert.equal(overview.last_midas_sync.actor, 'midas');
  // cards_total já vem das dívidas de cartão abertas, agora com o restante da fatura
  const cardDebts = overview.debts.filter((d) => d.kind === 'card' && d.status !== 'clean');
  assert.equal(overview.cards_total, Math.round(cardDebts.reduce((s, d) => s + d.balance, 0) * 100) / 100);
  assert.equal(overview.debts.find((d) => d.id === 'debt-c6').balance, 400);

  // livre menor que as faturas: pode gastar não fica negativo
  const tight = getOverview(db, { today: '2026-10-10' });
  updateSettings(db, { reserved_car: 2000 });
  assert.equal(getOverview(db, { today: TODAY }).safe_to_spend, 0);
  assert.equal(tight.bills_due_7d, 1825.47, '12/10 está dentro de hoje+7 em 10/10');
  assert.equal(getOverview(db, { today: '2026-10-16' }).bills_due_7d, 0, '12/10 já passou de hoje-3 em 16/10');
});

test('relógio de Fortaleza para os chips de banco e Midas', () => {
  assert.equal(fortalezaStamp('2026-10-14T18:59:57Z'), '14/10 15:59');
  assert.equal(fortalezaStamp('2026-10-15T01:30:00Z'), '14/10 22:30', 'virada de dia em UTC');
  assert.equal(fortalezaClock('2026-10-14T18:59:57Z'), '15:59');
  assert.equal(fortalezaStamp(null), null);
  assert.equal(fortalezaStamp('lixo'), null);
  assert.equal(
    midasLabel({ finished_at: '2026-10-14T21:40:00.000Z' }, new Date('2026-10-14T23:00:00Z')),
    'Atualizado pelo Midas às 18:40',
  );
  assert.equal(
    midasLabel({ finished_at: '2026-10-13T21:40:00.000Z' }, new Date('2026-10-14T23:00:00Z')),
    'Atualizado pelo Midas em 13/10 às 18:40',
  );
  assert.equal(midasLabel(null), 'Midas ainda não atualizou');
});
