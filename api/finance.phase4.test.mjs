import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { sqliteTestStorage } from './test-support/httpParity.fase5.mjs';
import {
  getOverview,
  initFinanceSchema,
  mapBankCategory,
  cleanMerchant,
  nextSalaryDate,
  seedFinanceIfEmpty,
  todayFortaleza,
} from './finance.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

const TODAY = '2026-10-14';
const INGEST = '/api/finance/ingest/pluggy';

async function mount(t, { seed = false, today = TODAY } = {}) {
  const db = createTestDb({ withFinance: true });
  if (seed) seedFinanceIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, storage: sqliteTestStorage(db), getLocalDateString: () => today }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  return { db, server, api: (path, opts) => requestJson(server.base, path, opts) };
}

async function status(base, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

/** Conta do dia (Inter) com saldo manual de hoje; sem reserva. */
async function baseWallet(api, { caixa = 3000 } = {}) {
  await api('/api/finance/accounts', {
    method: 'POST',
    body: { id: 'acc-op', name: 'Inter', kind: 'checking', institution: 'inter', is_operational: true },
  });
  await api('/api/finance/balances', {
    method: 'POST',
    body: { account_id: 'acc-op', amount: caixa, as_of: '2026-10-13', source: 'joao' },
  });
}

function insertCard(db, { id, name, minimum, paid, total, due }) {
  db.prepare(`
    INSERT INTO finance_accounts (id, name, kind, institution, status, sort_order, created_at, updated_at)
    VALUES (?, ?, 'credit', ?, 'active', 9, ?, ?)
  `).run(id, name, id, TODAY, TODAY);
  db.prepare(`
    INSERT INTO finance_card_status
      (account_id, institution, bill_total, bill_minimum, bill_paid, bill_remaining, bill_due, bank_updated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, id, total, minimum, paid, Math.max(0, total - paid), due, `${TODAY}T10:00:00.000Z`, TODAY);
}

/** Cenário do João: fixas, assinaturas e três cartões em situações diferentes. */
async function joaoScenario(t, opts = {}) {
  const ctx = await mount(t);
  const { db, api } = ctx;
  await baseWallet(api, opts);
  const fixed = {};
  for (const body of [
    { name: 'Faculdade', amount: 505, due_day: 19, category: 'Educação' },
    { name: 'Parcela do carro', amount: 1270, due_day: 23, category: 'Transporte' },
    { name: 'Contador', amount: 250, due_day: 5, lane: 'work' },
    { name: 'Impostos', amount: 500, due_day: null, lane: 'work', category: 'Impostos' },
    { name: 'Academia antiga', amount: 99, due_day: 20, active: false },
  ]) {
    const row = await api('/api/finance/fixed', { method: 'POST', body });
    fixed[body.name] = row;
  }
  await api(`/api/finance/fixed/${fixed['Parcela do carro'].id}/paid`, { method: 'POST', body: {} });
  for (const body of [
    { name: 'Spotify', amount: 20, charge_day: 20, status: 'active' },
    { name: 'iCloud', amount: 30, charge_day: null, status: 'keep' },
    { name: 'Velho', amount: 99, charge_day: 15, status: 'cancelled' },
  ]) {
    await api('/api/finance/subscriptions', { method: 'POST', body });
  }
  // dívida adiada com o pai: não entra no pode gastar
  await api('/api/finance/debts', {
    method: 'POST',
    body: { title: 'Pai', kind: 'family', balance: 1000, min_payment: 1000, due_date: '2026-10-20', status: 'waiting' },
  });
  insertCard(db, { id: 'card-a', name: 'Banco A', minimum: 300, paid: 100, total: 900, due: '2026-10-16' });
  insertCard(db, { id: 'card-b', name: 'Banco B', minimum: 200, paid: 250, total: 1000, due: '2026-10-15' });
  insertCard(db, { id: 'card-c', name: 'Banco C', minimum: 100, paid: 498, total: 500, due: '2026-10-18' });
  insertCard(db, { id: 'card-d', name: 'Banco D', minimum: 80, paid: 0, total: 400, due: '2026-11-20' });
  return { ...ctx, fixed };
}

test('migração da fase 4 é aditiva e idempotente', () => {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  initFinanceSchema(db);
  initFinanceSchema(db);
  const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const col of ['id', 'name', 'amount', 'due_day', 'category', 'lane', 'active', 'last_paid_month', 'note']) {
    assert.ok(cols('finance_fixed_expenses').includes(col), col);
  }
  assert.deepEqual(cols('finance_budgets'), ['category', 'monthly_limit', 'updated_at']);
  assert.ok(cols('finance_settings').includes('salary_day'));
  for (const col of ['external_id', 'matched_tx_id', 'note']) assert.ok(cols('finance_transactions').includes(col), col);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_accounts').get().n, 6, 'seed intocada');
  db.close();
});

test('salary_day: padrão 12, PATCH valida 1..31', async (t) => {
  const { server, api } = await mount(t);
  assert.equal((await api('/api/finance/settings')).salary_day, 12);
  const saved = await api('/api/finance/settings', { method: 'PATCH', body: { salary_day: 10 } });
  assert.equal(saved.salary_day, 10);
  for (const bad of [0, 32, 1.5, 'x', null]) {
    assert.equal(await status(server.base, '/api/finance/settings', { method: 'PATCH', body: { salary_day: bad } }), 400, String(bad));
  }
  assert.equal((await api('/api/finance/settings')).salary_day, 10);
  assert.equal((await api('/api/finance/overview')).salary_day, 10);
});

test('próximo salário respeita virada de mês e mês curto', () => {
  assert.equal(nextSalaryDate('2026-10-14', 12), '2026-11-12');
  assert.equal(nextSalaryDate('2026-10-11', 12), '2026-10-12');
  assert.equal(nextSalaryDate('2026-10-12', 12), '2026-11-12', 'no dia do salário já conta o próximo');
  assert.equal(nextSalaryDate('2026-12-20', 12), '2027-01-12');
  assert.equal(nextSalaryDate('2026-01-31', 31), '2026-02-28');
  assert.equal(nextSalaryDate('2026-02-10', 31), '2026-02-28');
});

test('despesas fixas: CRUD, validação e pago no mês', async (t) => {
  const { server, api } = await mount(t);
  const created = await api('/api/finance/fixed', {
    method: 'POST',
    body: { name: 'Faculdade', amount: 505, due_day: 19, category: 'Educação' },
  });
  assert.equal(created.name, 'Faculdade');
  assert.equal(created.amount, 505);
  assert.equal(created.due_day, 19);
  assert.equal(created.lane, 'personal');
  assert.equal(created.active, true);
  assert.equal(created.last_paid_month, null);
  assert.equal(created.paid_this_month, false);

  for (const body of [
    { name: '', amount: 10 },
    { name: 'x', amount: -1 },
    { name: 'x', amount: 'abc' },
    { name: 'x' },
    { name: 'x', amount: 10, due_day: 0 },
    { name: 'x', amount: 10, due_day: 32 },
    { name: 'x', amount: 10, due_day: 1.5 },
    { name: 'x', amount: 10, lane: 'casa' },
  ]) {
    assert.equal(await status(server.base, '/api/finance/fixed', { method: 'POST', body }), 400, JSON.stringify(body));
  }
  assert.equal((await api('/api/finance/fixed')).length, 1, 'inválido não grava');

  const patched = await api(`/api/finance/fixed/${created.id}`, { method: 'PATCH', body: { amount: 520, due_day: null } });
  assert.equal(patched.amount, 520);
  assert.equal(patched.due_day, null);
  assert.equal(await status(server.base, `/api/finance/fixed/${created.id}`, { method: 'PATCH', body: { amount: Infinity } }), 400);
  assert.equal(await status(server.base, `/api/finance/fixed/${created.id}`, { method: 'PATCH', body: { due_day: 40 } }), 400);
  assert.equal(await status(server.base, '/api/finance/fixed/nao-existe', { method: 'PATCH', body: { amount: 1 } }), 404);

  const paid = await api(`/api/finance/fixed/${created.id}/paid`, { method: 'POST' });
  assert.equal(paid.last_paid_month, '2026-10', 'padrão é o mês de Fortaleza');
  assert.equal(paid.paid_this_month, true);
  const nov = await api(`/api/finance/fixed/${created.id}/paid`, { method: 'POST', body: { month: '2026-11' } });
  assert.equal(nov.last_paid_month, '2026-11');
  assert.equal(await status(server.base, `/api/finance/fixed/${created.id}/paid`, { method: 'POST', body: { month: '2026-13' } }), 400);
  const undone = await api(`/api/finance/fixed/${created.id}/paid`, { method: 'DELETE' });
  assert.equal(undone.last_paid_month, null);

  const removed = await api(`/api/finance/fixed/${created.id}`, { method: 'DELETE' });
  assert.equal(removed.ok, true);
  assert.equal(await status(server.base, `/api/finance/fixed/${created.id}`, { method: 'DELETE' }), 404);
  assert.deepEqual(await api('/api/finance/fixed'), []);
});

test('pode gastar até o salário: fixas, assinaturas e mínimo dos cartões', async (t) => {
  const { api } = await joaoScenario(t);
  const o = await api('/api/finance/overview');

  assert.equal(o.salary_day, 12);
  assert.equal(o.next_salary_date, '2026-11-12');
  // faculdade 505 (19/10) + contador 250 (05/11, virada) + Spotify 20 + mínimo em aberto do Banco A 200
  // fora: carro pago no mês, impostos sem dia, academia inativa, iCloud sem dia, cancelada, pai adiado,
  // Banco B com mínimo pago, Banco C pago, Banco D vence depois do salário
  assert.equal(o.committed_until_salary, 975);
  assert.equal(o.livre, 3000);
  assert.equal(o.safe_to_spend, 2025);
  assert.deepEqual(
    o.commitments_until_salary.map((c) => [c.kind, c.name, c.amount, c.due_date]),
    [
      ['card_minimum', 'Banco A', 200, '2026-10-16'],
      ['fixed', 'Faculdade', 505, '2026-10-19'],
      ['subscription', 'Spotify', 20, '2026-10-20'],
      ['fixed', 'Contador', 250, '2026-11-05'],
    ],
  );
  assert.deepEqual(o.commitments_unknown_day.map((c) => c.name).sort(), ['Impostos', 'iCloud']);
  assert.ok('bills_due_7d' in o, 'compatibilidade');

  const situation = Object.fromEntries(o.cards_status.map((c) => [c.account_id, c.card_situation]));
  assert.deepEqual(situation, {
    'card-a': 'min_open',
    'card-b': 'min_paid_rolled',
    'card-c': 'paid',
    'card-d': 'min_open',
  });
});

test('fixa paga no mês sai; desfazer volta a contar', async (t) => {
  const { api, fixed } = await joaoScenario(t);
  const id = fixed.Faculdade.id;
  await api(`/api/finance/fixed/${id}/paid`, { method: 'POST' });
  assert.equal((await api('/api/finance/overview')).safe_to_spend, 2530);
  await api(`/api/finance/fixed/${id}/paid`, { method: 'DELETE' });
  assert.equal((await api('/api/finance/overview')).safe_to_spend, 2025);
  // contador vence em novembro: pagar outubro não tira da conta
  await api(`/api/finance/fixed/${fixed.Contador.id}/paid`, { method: 'POST' });
  assert.equal((await api('/api/finance/overview')).committed_until_salary, 975);
  await api(`/api/finance/fixed/${fixed.Contador.id}/paid`, { method: 'POST', body: { month: '2026-11' } });
  assert.equal((await api('/api/finance/overview')).committed_until_salary, 725);
});

test('próximo passo: mínimo em aberto, depois compromisso descoberto, depois livre', async (t) => {
  const { db, api } = await joaoScenario(t);
  let step = (await api('/api/finance/overview')).next_step;
  assert.equal(step.kind, 'card_min');
  assert.equal(step.label, 'Falta R$ 200,00 pro mínimo do Banco A até 16/10');

  // mínimo do A pago: nada aperta
  db.prepare("UPDATE finance_card_status SET bill_paid = 300 WHERE account_id = 'card-a'").run();
  const o = await api('/api/finance/overview');
  assert.equal(o.cards_status.find((c) => c.account_id === 'card-a').card_situation, 'min_paid_rolled');
  assert.equal(o.next_step.kind, 'clear');
  assert.equal(o.next_step.label, 'Sem compromisso descoberto até o salário (12/11). Pode gastar R$ 2.225,00.');

  // caixa curto: o contador (05/11) é o primeiro que não fecha
  await api('/api/finance/balances', { method: 'POST', body: { account_id: 'acc-op', amount: 600, as_of: TODAY, source: 'joao' } });
  step = (await api('/api/finance/overview')).next_step;
  assert.equal(step.kind, 'cover');
  assert.equal(step.label, 'Separa R$ 175,00 pra Contador (05/11)');
  assert.equal(step.ref.kind, 'fixed');

  for (const label of [step.label, o.next_step.label]) {
    assert.doesNotMatch(label, /Mercado Pago/);
    assert.doesNotMatch(label, /Banco B/, 'nunca manda pagar fatura com mínimo pago');
  }
});

test('próximo passo nunca manda pagar cartão com mínimo pago, mesmo sem caixa', async (t) => {
  const { db, api } = await joaoScenario(t, { caixa: 0 });
  db.prepare("DELETE FROM finance_card_status WHERE account_id IN ('card-a', 'card-d')").run();
  const o = await api('/api/finance/overview');
  assert.equal(o.safe_to_spend, 0);
  assert.equal(o.next_step.kind, 'cover');
  assert.equal(o.next_step.label, 'Separa R$ 505,00 pra Faculdade (19/10)');
  assert.doesNotMatch(o.next_step.label, /Banco B|Banco C|fatura/i);
});

test('seed: próximo passo sem o texto fixo do Mercado Pago', async (t) => {
  const { api } = await mount(t, { seed: true });
  const o = await api('/api/finance/overview');
  assert.doesNotMatch(o.next_step.label, /Mercado Pago/);
  assert.notEqual(o.next_step.kind, 'avalanche');
});

test('categoria do banco vira categoria da Praxis', () => {
  assert.equal(mapBankCategory('Eating out', 'IFOOD', -10, 'BANK'), 'Alimentação');
  assert.equal(mapBankCategory('Groceries', 'ATACADAO', -10, 'BANK'), 'Alimentação');
  assert.equal(mapBankCategory('Taxi and ride-hailing', 'UBER', -10, 'CREDIT'), 'Transporte');
  assert.equal(mapBankCategory('Credit card payment', 'PAGAMENTO FATURA', -10, 'BANK'), 'Pagamento de fatura');
  assert.equal(mapBankCategory(null, 'PAGAMENTO RECEBIDO', 300, 'CREDIT'), 'Pagamento de fatura');
  assert.equal(mapBankCategory('Same person transfer', 'PIX ENVIADO', -10, 'BANK'), 'Transferência');
  assert.equal(mapBankCategory('Salary', 'SALARIO', 5000, 'BANK'), 'Receita');
  assert.equal(mapBankCategory('Streaming', 'NETFLIX', -40, 'CREDIT'), 'Assinaturas');
  assert.equal(mapBankCategory('Online shopping', 'SHOPEE', -40, 'CREDIT'), 'Compras');
  assert.equal(mapBankCategory('Pharmacy', 'DROGASIL', -40, 'BANK'), 'Saúde');
  assert.equal(mapBankCategory('Educação', 'X', -40, 'BANK'), 'Educação', 'já vem no nome da Praxis');
  assert.equal(mapBankCategory('Transfer - PIX', 'PIX ENVIADO MARIA', -40, 'BANK'), 'Outros');
  assert.equal(mapBankCategory(null, 'COISA', -40, 'BANK'), 'Outros');
  assert.equal(cleanMerchant('COMPRA CARTAO IFOOD *RESTAURANTE  12/10'), 'Ifood Restaurante');
  assert.equal(cleanMerchant('PIX ENVIADO - Maria Souza'), 'Maria Souza');
  assert.equal(cleanMerchant('   '), '');
});

function bankTx(overrides = {}) {
  return {
    external_id: 'tx-1',
    institution: 'inter',
    account_type: 'BANK',
    date: '2026-10-13',
    amount: -45.9,
    description: 'COMPRA CARTAO IFOOD *RESTAURANTE',
    category: 'Eating out',
    ...overrides,
  };
}

function ingestBody(transactions, institutions = []) {
  return { source: 'pluggy', fetched_at: '2026-10-14T21:40:00Z', institutions, transactions };
}

const BANK_TXS = [
  bankTx(),
  bankTx({ external_id: 'tx-2', amount: -1200, description: 'PAGAMENTO FATURA CARTAO INTER', category: 'Credit card payment' }),
  bankTx({ external_id: 'tx-3', amount: -300, description: 'PIX ENVIADO JOAO VICTOR', category: 'Same person transfer' }),
  bankTx({ external_id: 'tx-4', account_type: 'CREDIT', amount: -89.9, description: 'UBER *TRIP', category: 'Taxi and ride-hailing' }),
  bankTx({ external_id: 'tx-5', amount: 5000, description: 'SALARIO', category: 'Salary' }),
];

test('ingest de transações: grava, deduplica e tira fatura/transferência do mês', async (t) => {
  const { db, api } = await mount(t, { seed: true });
  const first = await api(INGEST, { method: 'POST', body: ingestBody(BANK_TXS) });
  assert.deepEqual(first.transactions, { received: 5, inserted: 5, duplicates: 0, matched: 0, relinked: 0, skipped: [] });
  const second = await api(INGEST, { method: 'POST', body: ingestBody(BANK_TXS) });
  assert.deepEqual(second.transactions, { received: 5, inserted: 0, duplicates: 5, matched: 0, relinked: 0, skipped: [] });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_transactions WHERE source = 'pluggy'").get().n, 5);
  const log = db.prepare("SELECT tx_n FROM finance_sync_log WHERE actor = 'midas' ORDER BY rowid").all();
  assert.deepEqual(log.map((l) => l.tx_n), [5, 0]);

  const rows = Object.fromEntries(
    db.prepare("SELECT * FROM finance_transactions WHERE source = 'pluggy'").all().map((r) => [r.external_id, r]),
  );
  assert.equal(rows['tx-1'].direction, 'outflow');
  assert.equal(rows['tx-1'].amount, -45.9);
  assert.equal(rows['tx-1'].posted_on, '2026-10-13');
  assert.equal(rows['tx-1'].merchant, 'Ifood Restaurante');
  assert.equal(rows['tx-1'].raw_description, 'COMPRA CARTAO IFOOD *RESTAURANTE');
  assert.equal(rows['tx-1'].category, 'Alimentação');
  assert.equal(rows['tx-1'].account_id, 'acc-inter');
  assert.equal(rows['tx-2'].category, 'Pagamento de fatura');
  assert.equal(rows['tx-3'].category, 'Transferência');
  assert.equal(rows['tx-4'].category, 'Transporte');
  assert.equal(rows['tx-5'].direction, 'inflow');
  assert.equal(rows['tx-5'].category, 'Receita');

  const month = await api('/api/finance/month?month=2026-10');
  assert.equal(month.month, '2026-10');
  assert.equal(month.total_out, 135.8);
  assert.equal(month.off_budget_out, 1500);
  assert.deepEqual(
    month.categories.map((c) => [c.category, c.spent]),
    [['Transporte', 89.9], ['Alimentação', 45.9]],
  );
  const insights = await api('/api/finance/insights?from=2026-10-01&to=2026-10-31');
  assert.equal(insights.outflow, 135.8, 'gráfico também ignora fatura e transferência');
  assert.equal(insights.inflow, 5000);

  // recategorizar pelo extrato não é sobrescrito pelo próximo ingest
  await api(`/api/finance/transactions/${rows['tx-1'].id}`, { method: 'PATCH', body: { category: 'Lazer' } });
  await api(INGEST, { method: 'POST', body: ingestBody(BANK_TXS) });
  assert.equal(db.prepare('SELECT category FROM finance_transactions WHERE id = ?').get(rows['tx-1'].id).category, 'Lazer');
});

test('ingest de transações inválidas = 400 sem escrita', async (t) => {
  const { db, server } = await mount(t, { seed: true });
  const before = db.prepare('SELECT COUNT(*) AS n FROM finance_transactions').get().n;
  const bad = [
    ingestBody('tx'),
    ingestBody([bankTx({ external_id: '' })]),
    ingestBody([bankTx({ amount: '45' })]),
    ingestBody([bankTx({ date: '2026-02-30' })]),
    ingestBody([bankTx({ account_type: 'SAVINGS' })]),
    ingestBody([bankTx({ institution: 'xp' })]),
    ingestBody([bankTx(), bankTx({ external_id: 'tx-9', description: 'x'.repeat(400) })]),
    ingestBody([bankTx(), bankTx()]),
  ];
  for (const body of bad) {
    assert.equal(await status(server.base, INGEST, { method: 'POST', body }), 400, JSON.stringify(body).slice(0, 140));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_transactions').get().n, before);
  // sem o campo continua valendo (Midas antigo)
  assert.equal(await status(server.base, INGEST, { method: 'POST', body: { source: 'pluggy', institutions: [] } }), 200);
});

test('gasto lançado reduz o pode gastar até o banco atualizar', async (t) => {
  const { db, api } = await mount(t);
  await api('/api/finance/accounts', {
    method: 'POST',
    body: { id: 'acc-op', name: 'Inter', kind: 'checking', institution: 'inter', is_operational: true },
  });
  await api('/api/finance/accounts', {
    method: 'POST',
    body: { id: 'acc-c6', name: 'C6', kind: 'checking', institution: 'c6', is_operational: false },
  });
  const bankAt = new Date(Date.now() - 60 * 60 * 1000);
  const day = todayFortaleza(bankAt);
  const inst = (balance, at) => ({
    institution: 'inter',
    updated_at: at.toISOString(),
    status: 'UPDATED',
    bank: { balance, reserved: [] },
    card: null,
  });
  await api(INGEST, { method: 'POST', body: { source: 'pluggy', institutions: [inst(1000, bankAt)] } });
  assert.equal(getOverview(db, { today: day }).safe_to_spend, 1000);

  const spend = await api('/api/finance/transactions', {
    method: 'POST',
    body: { amount: 50, direction: 'outflow', merchant: 'Padaria', category: 'Alimentação', posted_on: day, account_id: 'acc-op', note: 'pão' },
  });
  assert.equal(spend.source, 'joao');
  assert.equal(spend.amount, -50, 'saída fica negativa');
  assert.equal(spend.note, 'pão');
  // sem conta também desconta; conta que não é do dia e gasto antigo, não
  await api('/api/finance/transactions', { method: 'POST', body: { amount: -20, merchant: 'Café', category: 'Alimentação', posted_on: day } });
  await api('/api/finance/transactions', { method: 'POST', body: { amount: -70, merchant: 'Feira', posted_on: day, account_id: 'acc-c6' } });
  await api('/api/finance/transactions', { method: 'POST', body: { amount: -90, merchant: 'Ontem', posted_on: '2026-01-01', account_id: 'acc-op' } });

  let o = getOverview(db, { today: day });
  assert.equal(o.manual_pending_out, 70);
  assert.equal(o.caixa, 930);
  assert.equal(o.livre, 930);
  assert.equal(o.safe_to_spend, 930);

  // banco atualiza no mesmo dia já com o gasto: só o novo saldo vale, e a linha do banco absorve o lançamento
  await api(INGEST, {
    method: 'POST',
    body: {
      source: 'pluggy',
      institutions: [inst(950, new Date(Date.now() + 60 * 1000))],
      transactions: [bankTx({ external_id: 'bank-padaria', date: day, amount: -50, description: 'PAG*JOSE DA SILVA', category: null })],
    },
  });
  o = getOverview(db, { today: day });
  assert.equal(o.manual_pending_out, 0);
  assert.equal(o.caixa, 950);

  const manual = db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(spend.id);
  assert.ok(manual.matched_tx_id, 'lançamento casado com a linha do banco');
  const list = await api(`/api/finance/transactions?from=${day}&to=${day}`);
  assert.ok(!list.some((tx) => tx.id === spend.id), 'extrato não mostra duplicado');
  const bankRow = list.find((tx) => tx.external_id === 'bank-padaria');
  assert.equal(bankRow.category, 'Alimentação', 'categoria do João vence');
  assert.equal(bankRow.merchant, 'Padaria');
  const month = await api(`/api/finance/month?month=${day.slice(0, 7)}`);
  assert.equal(month.categories.find((c) => c.category === 'Alimentação').spent, 70, '50 uma vez só + 20');
});

test('orçamento por categoria e /month com limite e %', async (t) => {
  const { server, api } = await mount(t, { seed: true });
  await api(INGEST, { method: 'POST', body: ingestBody(BANK_TXS) });
  const saved = await api('/api/finance/budgets', { method: 'PUT', body: { category: 'Alimentação', monthly_limit: 50 } });
  assert.deepEqual(saved.map((b) => [b.category, b.monthly_limit]), [['Alimentação', 50]]);
  await api('/api/finance/budgets', {
    method: 'PUT',
    body: { budgets: [{ category: 'Lazer', monthly_limit: 200 }, { category: 'Transporte', monthly_limit: 100 }] },
  });
  const list = await api('/api/finance/budgets');
  assert.deepEqual(list.map((b) => b.category), ['Alimentação', 'Lazer', 'Transporte']);

  for (const body of [
    { category: 'Xyz', monthly_limit: 10 },
    { category: 'Pagamento de fatura', monthly_limit: 10 },
    { category: 'Lazer', monthly_limit: -1 },
    { category: 'Lazer', monthly_limit: 'muito' },
    { budgets: 'x' },
  ]) {
    assert.equal(await status(server.base, '/api/finance/budgets', { method: 'PUT', body }), 400, JSON.stringify(body));
  }

  const month = await api('/api/finance/month?month=2026-10');
  const byCat = Object.fromEntries(month.categories.map((c) => [c.category, c]));
  assert.equal(byCat['Alimentação'].limit, 50);
  assert.equal(byCat['Alimentação'].pct, 92);
  assert.equal(byCat.Transporte.pct, 90);
  assert.equal(byCat.Lazer.spent, 0, 'limite sem gasto aparece zerado');
  assert.equal(byCat.Lazer.pct, 0);
  assert.equal(month.budget_total, 350);

  await api('/api/finance/budgets', { method: 'PUT', body: { category: 'Lazer', monthly_limit: null } });
  assert.deepEqual((await api('/api/finance/budgets')).map((b) => b.category), ['Alimentação', 'Transporte']);

  assert.equal(await status(server.base, '/api/finance/month?month=2026-13'), 400);
  const current = await api('/api/finance/month');
  assert.equal(current.month, '2026-10', 'padrão é o mês de hoje');
  const overview = await api('/api/finance/overview');
  assert.equal(overview.month.total_out, current.total_out);
});
