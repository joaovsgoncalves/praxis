/**
 * Fase 3 do PRD — cobertura do extrato separada da data do saldo.
 * Saldo em dia não prova extrato; R$ 0 só é zero de verdade com extrato do período inteiro.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { createAccount, createBalance, createTransaction, getInsights, getMonthSummary, seedFinanceIfEmpty } from './finance.js';
import { daysBetween, getStatementCoverage, recordStatementCoverage } from './lib/financeCoverage.js';
import { syncPierre } from './pierreSync.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

const TODAY = '2026-11-14';

/** Banco sem seed: duas contas ligadas a banco e uma só manual. */
function bareDb(t) {
  const db = createTestDb({ withFinance: true });
  t.after(() => db.close());
  createAccount(db, { id: 'acc-a', name: 'Banco A', institution: 'inter', kind: 'checking', is_operational: true });
  createAccount(db, { id: 'acc-b', name: 'Banco B', institution: 'nubank', kind: 'checking' });
  createAccount(db, { id: 'acc-m', name: 'Carteira', institution: 'carteira', kind: 'cash' });
  // saldo do banco chegando hoje nas duas contas ligadas
  for (const id of ['acc-a', 'acc-b']) {
    createBalance(db, { account_id: id, amount: 100, amount_kind: 'available', source: 'pluggy', as_of: TODAY });
  }
  createBalance(db, { account_id: 'acc-m', amount: 50, amount_kind: 'available', source: 'joao', as_of: TODAY });
  return db;
}

const windows = (db) => db.prepare(
  'SELECT account_id, source, covered_from, covered_to FROM finance_statement_coverage ORDER BY account_id, source, covered_from',
).all();

test('saldo atualizado hoje não vira extrato: período sem cobertura fica indisponível', (t) => {
  const db = bareDb(t);
  const cov = getStatementCoverage(db, { from: '2026-10-15', to: TODAY, today: TODAY });
  assert.equal(cov.status, 'unavailable');
  assert.equal(cov.zero_is_real, false);
  assert.ok(cov.balance_at, 'a data do saldo aparece');
  assert.equal(cov.statement_at, null);
  assert.equal(cov.statement_through, null);
  assert.equal(cov.linked_accounts_n, 2);
  assert.deepEqual(cov.accounts.map((a) => [a.account_id, a.status]), [
    ['acc-a', 'none'], ['acc-b', 'none'], ['acc-m', 'manual'],
  ]);

  const insights = getInsights(db, { from: '2026-10-15', to: TODAY, today: TODAY });
  assert.equal(insights.outflow, 0);
  assert.equal(insights.coverage.zero_is_real, false);
});

test('só lançamento manual: status manual_only e subtotal manual identificado', (t) => {
  const db = bareDb(t);
  createTransaction(db, { amount: -30, posted_on: '2026-11-10', category: 'Alimentação', source: 'joao' });
  createTransaction(db, { amount: -12.34, posted_on: '2026-11-11', category: 'Transporte', source: 'agent', account_id: 'acc-a' });
  createTransaction(db, { amount: 500, posted_on: '2026-11-05', category: 'Receita', source: 'joao' });

  const insights = getInsights(db, { from: '2026-10-15', to: TODAY, today: TODAY });
  assert.equal(insights.coverage.status, 'manual_only');
  assert.equal(insights.coverage.zero_is_real, false);
  assert.equal(insights.coverage.manual_tx_count, 3);
  assert.equal(insights.outflow, 42.34);
  assert.equal(insights.manual_outflow, 42.34);
  assert.equal(insights.manual_inflow, 500);
  assert.equal(insights.manual_tx_count, 3);

  const month = getMonthSummary(db, { month: '2026-11', today: TODAY });
  assert.equal(month.total_out, 42.34);
  assert.equal(month.manual_out, 42.34);
  assert.equal(month.manual_in, 500);
  assert.equal(month.coverage.status, 'manual_only');
});

test('extrato do período inteiro em todas as contas ligadas: zero é zero', (t) => {
  const db = bareDb(t);
  recordStatementCoverage(db, { accountId: 'acc-a', source: 'pierre', from: '2026-10-01', to: '2026-10-31' });
  recordStatementCoverage(db, { accountId: 'acc-b', source: 'pluggy', from: '2026-09-20', to: '2026-11-02' });

  const month = getMonthSummary(db, { month: '2026-10', today: TODAY });
  assert.equal(month.total_out, 0);
  assert.equal(month.coverage.status, 'complete');
  assert.equal(month.coverage.zero_is_real, true);
  assert.equal(month.coverage.days_total, 31);
  assert.deepEqual(month.coverage.accounts.filter((a) => a.status !== 'manual').map((a) => a.days_covered), [31, 31]);
});

test('uma conta coberta e outra não, ou só parte dos dias: parcial', (t) => {
  const db = bareDb(t);
  recordStatementCoverage(db, { accountId: 'acc-a', source: 'pierre', from: '2026-10-01', to: '2026-10-31' });
  let cov = getStatementCoverage(db, { from: '2026-10-01', to: '2026-10-31', today: TODAY });
  assert.equal(cov.status, 'partial');
  assert.equal(cov.zero_is_real, false);
  assert.equal(cov.complete_accounts_n, 1);

  recordStatementCoverage(db, { accountId: 'acc-b', source: 'pluggy', from: '2026-10-01', to: '2026-10-10' });
  cov = getStatementCoverage(db, { from: '2026-10-01', to: '2026-10-31', today: TODAY });
  assert.equal(cov.status, 'partial');
  const b = cov.accounts.find((a) => a.account_id === 'acc-b');
  assert.equal(b.status, 'partial');
  assert.equal(b.days_covered, 10);
  assert.equal(b.covered_to, '2026-10-10');
});

test('lançamento do banco sem janela registrada conta como parcial, nunca como completo', (t) => {
  const db = bareDb(t);
  createTransaction(db, { amount: -20, posted_on: '2026-10-20', source: 'pierre', account_id: 'acc-a', pierre_tx_id: 'p-1' });
  const cov = getStatementCoverage(db, { from: '2026-10-01', to: '2026-10-31', today: TODAY });
  assert.equal(cov.status, 'partial');
  assert.equal(cov.accounts.find((a) => a.account_id === 'acc-a').status, 'partial');
});

test('janelas que se tocam ou se sobrepõem viram uma só; origens diferentes somam cobertura', (t) => {
  const db = bareDb(t);
  recordStatementCoverage(db, { accountId: 'acc-a', source: 'pierre', from: '2026-10-01', to: '2026-10-10' });
  recordStatementCoverage(db, { accountId: 'acc-a', source: 'pierre', from: '2026-10-11', to: '2026-10-20' });
  recordStatementCoverage(db, { accountId: 'acc-a', source: 'pierre', from: '2026-10-05', to: '2026-10-15' });
  recordStatementCoverage(db, { accountId: 'acc-a', source: 'pierre', from: '2026-10-05', to: '2026-10-15' });
  recordStatementCoverage(db, { accountId: 'acc-a', source: 'pierre', from: '2026-10-25', to: '2026-10-26' });
  assert.deepEqual(windows(db), [
    { account_id: 'acc-a', source: 'pierre', covered_from: '2026-10-01', covered_to: '2026-10-20' },
    { account_id: 'acc-a', source: 'pierre', covered_from: '2026-10-25', covered_to: '2026-10-26' },
  ]);
  // outra origem cobre o buraco de 21 a 24 e ainda sobrepõe: nenhum dia contado duas vezes
  recordStatementCoverage(db, { accountId: 'acc-a', source: 'pluggy', from: '2026-10-18', to: '2026-10-31' });
  const cov = getStatementCoverage(db, { from: '2026-10-01', to: '2026-10-31', today: TODAY });
  const a = cov.accounts.find((x) => x.account_id === 'acc-a');
  assert.equal(a.days_covered, 31);
  assert.equal(a.status, 'complete');
  assert.deepEqual(a.sources, ['pierre', 'pluggy']);

  assert.equal(recordStatementCoverage(db, { accountId: 'acc-a', source: 'banco-x', from: '2026-10-01', to: '2026-10-02' }), null);
  assert.equal(recordStatementCoverage(db, { accountId: 'acc-a', source: 'pierre', from: '2026-10-09', to: '2026-10-02' }), null);
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 31);
});

test('dias no futuro não contam; hoje em aberto não derruba o período, mas hoje sozinho exige extrato de hoje', (t) => {
  const db = bareDb(t);
  for (const id of ['acc-a', 'acc-b']) {
    recordStatementCoverage(db, { accountId: id, source: 'pierre', from: '2026-11-01', to: '2026-11-13' });
  }
  // mês corrente: vai até o dia 30, mas só se mede até hoje; extrato até ontem basta
  const month = getStatementCoverage(db, { from: '2026-11-01', to: '2026-11-30', today: TODAY });
  assert.equal(month.measured_to, TODAY);
  assert.equal(month.days_total, 14);
  assert.equal(month.status, 'complete');
  assert.equal(month.statement_through, '2026-11-13');

  const onlyToday = getStatementCoverage(db, { from: TODAY, to: TODAY, today: TODAY });
  assert.equal(onlyToday.status, 'unavailable');
  assert.equal(onlyToday.zero_is_real, false);

  const future = getStatementCoverage(db, { from: '2026-12-01', to: '2026-12-31', today: TODAY });
  assert.equal(future.days_total, 0);
  assert.equal(future.status, 'unavailable');
  assert.equal(future.zero_is_real, false);

  // dois dias sem extrato já é parcial
  const stale = getStatementCoverage(db, { from: '2026-11-01', to: '2026-11-30', today: '2026-11-16' });
  assert.equal(stale.status, 'partial');
});

function mockPierre(t, { statementFails = false } = {}) {
  const original = globalThis.fetch;
  const previousKey = process.env.PIERRE_API_KEY;
  process.env.PIERRE_API_KEY = 'chave-de-teste';
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (!u.includes('pierre.finance')) return original(url, options);
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.includes('get-accounts')) {
      return json({ accounts: [{ id: 'p-a', name: 'Banco A', institution: 'inter', type: 'BANK', mask: '1111' }] });
    }
    if (u.includes('get-balance')) return json({ balances: [{ accountId: 'p-a', amount: 10, date: TODAY }] });
    if (u.includes('get-bank-statement')) {
      return statementFails ? json({ error: 'fora do ar' }, 500) : json({ transactions: [] });
    }
    return json({});
  };
  t.after(() => {
    globalThis.fetch = original;
    if (previousKey === undefined) delete process.env.PIERRE_API_KEY;
    else process.env.PIERRE_API_KEY = previousKey;
  });
}

test('Pierre: extrato que falha não registra cobertura, mesmo com saldo e contas entrando', async (t) => {
  const db = createTestDb({ withFinance: true });
  t.after(() => db.close());
  createAccount(db, { id: 'acc-a', name: 'Banco A', institution: 'inter', kind: 'checking', pierre_account_id: 'p-a', mask: '1111' });

  mockPierre(t, { statementFails: true });
  const failed = await syncPierre(db, { actor: 'joao', getLocalDateString: () => TODAY });
  assert.equal(failed.ok, true, 'saldo e contas ainda entram');
  assert.deepEqual(windows(db), []);
  assert.equal(getStatementCoverage(db, { from: '2026-10-15', to: TODAY, today: TODAY }).zero_is_real, false);
});

test('Pierre: extrato vazio com resposta boa sustenta o zero do período', async (t) => {
  const db = createTestDb({ withFinance: true });
  t.after(() => db.close());
  createAccount(db, { id: 'acc-a', name: 'Banco A', institution: 'inter', kind: 'checking', pierre_account_id: 'p-a', mask: '1111' });

  mockPierre(t);
  const ok = await syncPierre(db, { actor: 'joao', getLocalDateString: () => TODAY });
  assert.equal(ok.ok, true);
  assert.deepEqual(windows(db), [
    { account_id: 'acc-a', source: 'pierre', covered_from: '2026-10-15', covered_to: TODAY },
  ]);
  await syncPierre(db, { actor: 'joao', getLocalDateString: () => TODAY });
  assert.equal(windows(db).length, 1, 'repetir a sincronização não empilha janelas');

  const insights = getInsights(db, { from: '2026-10-15', to: TODAY, today: TODAY });
  assert.equal(insights.outflow, 0);
  assert.equal(insights.coverage.status, 'complete');
  assert.equal(insights.coverage.zero_is_real, true);
});

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

function pluggyBody(extra = {}) {
  return {
    source: 'pluggy',
    fetched_at: '2026-11-14T18:00:00Z',
    institutions: [{
      institution: 'inter',
      updated_at: '2026-11-14T17:59:00Z',
      status: 'UPDATED',
      bank: { balance: 10, reserved: [] },
      card: null,
      ...extra,
    }],
  };
}

test('Pluggy: carga só de saldo (como o Midas manda hoje) não registra extrato', async (t) => {
  const { db, server } = await mountFinance(t);
  const result = await requestJson(server.base, '/api/finance/ingest/pluggy', { method: 'POST', body: pluggyBody() });
  assert.equal(result.ok, true);
  assert.deepEqual(result.applied[0].statement_accounts, []);
  assert.deepEqual(windows(db), []);
  const cov = await requestJson(server.base, `/api/finance/coverage?from=2026-10-15&to=${TODAY}`);
  assert.equal(cov.zero_is_real, false);
  assert.ok(cov.balance_at);
  assert.equal(cov.accounts.find((a) => a.account_id === 'acc-inter').status, 'none');
});

test('Pluggy: carga com statement registra a janela da conta; repetir não duplica', async (t) => {
  const { db, server } = await mountFinance(t);
  const body = pluggyBody({ statement: { from: '2026-10-15', to: TODAY } });
  const first = await requestJson(server.base, '/api/finance/ingest/pluggy', { method: 'POST', body });
  assert.ok(first.applied[0].statement_accounts.includes('acc-inter'));
  await requestJson(server.base, '/api/finance/ingest/pluggy', { method: 'POST', body });
  const rows = windows(db).filter((w) => w.account_id === 'acc-inter');
  assert.deepEqual(rows, [{ account_id: 'acc-inter', source: 'pluggy', covered_from: '2026-10-15', covered_to: TODAY }]);
  const cov = await requestJson(server.base, `/api/finance/coverage?from=2026-10-15&to=${TODAY}`);
  assert.equal(cov.accounts.find((a) => a.account_id === 'acc-inter').status, 'complete');
});

test('Pluggy: statement inválido recusa a carga inteira', async (t) => {
  const { db, server } = await mountFinance(t);
  const balances = () => db.prepare('SELECT COUNT(*) n FROM finance_balances').get().n;
  const before = balances();
  for (const statement of [{ from: '2026-11-10', to: '2026-11-01' }, { from: '14/11/2026', to: TODAY }, 'ontem']) {
    const response = await fetch(`${server.base}/api/finance/ingest/pluggy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pluggyBody({ statement })),
    });
    assert.equal(response.status, 400);
  }
  assert.equal(balances(), before);
  assert.deepEqual(windows(db), []);
});

test('Pluggy: o extrato cobre também o cartão achado pelo final, mesmo com outro nome de instituição', async (t) => {
  const { db, server } = await mountFinance(t);
  // cartão criado por outra origem: a instituição gravada é o nome do produto, não o banco
  createAccount(db, { id: 'acc-gold', name: 'GOLD', institution: 'gold', kind: 'credit', mask: '7788' });
  const body = pluggyBody({
    statement: { from: '2026-10-15', to: TODAY },
    card: { last4: '7788', brand: 'MASTERCARD', used: 100, limit: 1000, available: 900, bill: null },
  });
  const result = await requestJson(server.base, '/api/finance/ingest/pluggy', { method: 'POST', body });
  assert.ok(result.applied[0].statement_accounts.includes('acc-inter'));
  assert.ok(result.applied[0].statement_accounts.includes('acc-gold'));
  const cov = await requestJson(server.base, `/api/finance/coverage?from=2026-10-15&to=${TODAY}`);
  assert.equal(cov.accounts.find((a) => a.account_id === 'acc-gold').status, 'complete');
});

test('PF e PJ: conta da empresa sem extrato não rebaixa a cobertura pessoal nem aparece em "O banco mostrou"', async (t) => {
  const db = bareDb(t);
  for (const id of ['acc-a', 'acc-b']) {
    recordStatementCoverage(db, { accountId: id, source: 'pluggy', from: '2026-10-01', to: TODAY });
  }
  createAccount(db, { id: 'acc-pj', name: 'Asaas Empresa', institution: 'asaas', kind: 'checking', entity: 'pj' });
  createBalance(db, { account_id: 'acc-pj', amount: 900, amount_kind: 'available', source: 'pluggy', as_of: TODAY });
  createTransaction(db, { account_id: 'acc-pj', posted_on: '2026-11-10', amount: -300, category: 'Assinaturas', source: 'pluggy', external_id: 'pj-1' });

  const pf = getInsights(db, { from: '2026-11-01', to: TODAY, today: TODAY });
  assert.equal(pf.coverage.status, 'complete', 'a conta da empresa não entra na conta pessoal');
  assert.equal(pf.coverage.zero_is_real, true);
  assert.ok(!pf.coverage.accounts.some((a) => a.account_id === 'acc-pj'));
  assert.equal(pf.coverage.bank_tx_count, 0, 'lançamento da empresa não conta como extrato pessoal');

  const pj = getInsights(db, { from: '2026-11-01', to: TODAY, today: TODAY, entity: 'pj' });
  assert.deepEqual(pj.coverage.accounts.map((a) => a.account_id), ['acc-pj']);
  assert.equal(pj.coverage.zero_is_real, false, 'empresa com saldo e sem extrato: total não é confirmado');

  const month = getMonthSummary(db, { month: '2026-11', today: TODAY });
  assert.equal(month.coverage.status, 'complete');

  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, getLocalDateString: () => TODAY }));
  const server = await startTestServer(app);
  t.after(() => server.close());
  const overview = await requestJson(server.base, '/api/finance/overview');
  assert.ok(!overview.bank_shown.some((row) => row.account_id === 'acc-pj'), 'visão geral é PF');
  const cov = await requestJson(server.base, '/api/finance/coverage?from=2026-11-01&to=2026-11-14');
  assert.equal(cov.status, 'complete');
  const covPj = await requestJson(server.base, '/api/finance/coverage?from=2026-11-01&to=2026-11-14&entity=pj');
  assert.deepEqual(covPj.accounts.map((a) => a.account_id), ['acc-pj']);
});
