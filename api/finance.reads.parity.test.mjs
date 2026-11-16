/**
 * Paridade HTTP de finanças, domínio 4 (leituras compostas: overview, month, insights, coverage, pending,
 * sync/last): rota antiga congelada (bcbadad) × rota nova sobre a camada assíncrona (SQLite e emulador
 * Firestore), com massa criada pelas rotas de escrita e o que só o ingest grava semeado por tabela.
 * Prova adicional: `financeTotals` do motor novo com o mesmo hash do SQLite da rota antiga.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinanceRouter as createOracleRouter } from './test-support/oracles/financeRoutes.bcbadad.js';
import { financeTotals as oracleTotals } from './test-support/oracles/financeReconcile.bcbadad.js';
import { createFinanceRouter } from './routes/finance.js';
import { createFinanceReconcileService } from './services/finance/reconcile.js';
import { makeFinanceParityApp, parityEngines, runFinanceScript } from './test-support/httpParity.fase5.mjs';

const TODAY = '2026-11-15';
const setup = {
  oracle: (db) => createOracleRouter({ db, getLocalDateString: () => TODAY }),
  build: ({ storage, db }) => createFinanceRouter({ db, storage, getLocalDateString: () => TODAY }),
};

const STAMP = (day, time = '12:00:00') => `${day}T${time}.000Z`;
const tx = (id, extra = {}) => ({ id, pierre_tx_id: null, account_id: null, posted_on: '2026-11-01', amount: -10, direction: 'outflow', raw_description: '', merchant: '', category: 'Outros', subscription_id: null, debt_id: null, source: 'pluggy', created_at: STAMP('2026-11-01'), external_id: null, matched_tx_id: null, note: '', payment_id: null, intent_key: null, ...extra });

/** Escritas pelas rotas (o mesmo roteiro nos três motores). */
function setupSteps() {
  const steps = [
    ['PATCH', '/settings', { salary_day: 5, reserved_car: 800, reserved_live: 250.5 }],
    ['POST', '/accounts', { id: 'a-main', name: 'Inter Conta', kind: 'checking', institution: 'Inter', is_operational: true, amount: 1500.5, source: 'pluggy', as_of: '2026-11-14', sort_order: 1 }],
    ['POST', '/accounts', { id: 'a-card', name: 'Inter Cartão', kind: 'credit', institution: 'Inter', pierre_account_id: 'p-1', sort_order: 2 }],
    ['POST', '/accounts', { id: 'a-nu', name: 'Nubank', kind: 'checking', institution: 'Nubank', is_operational: true, amount: 300, source: 'joao', as_of: '2026-11-15', sort_order: 3 }],
    ['POST', '/accounts', { id: 'a-card2', name: 'Nubank Cartão', kind: 'credit', institution: 'Nubank', sort_order: 4 }],
    ['POST', '/accounts', { id: 'a-pj', name: 'Empresa', kind: 'checking', institution: 'Inter PJ', entity: 'pj', is_operational: true, amount: 9000, source: 'pierre', as_of: '2026-11-13', sort_order: 5 }],
    ['POST', '/accounts', { id: 'a-inv', name: 'Investimentos', kind: 'other', institution: 'Inter', sort_order: 9 }],
    ['POST', '/accounts', { id: 'a-old', name: 'Arquivada', kind: 'checking', institution: 'Velho', status: 'archived', amount: 77, source: 'pluggy', as_of: '2026-10-01' }],
    ['POST', '/accounts', { id: 'a-solo', name: 'Só manual', kind: 'cash', institution: '', is_operational: true, amount: 40, source: 'agent', as_of: '2026-11-15', sort_order: 7 }],
    ['POST', '/balances', { account_id: 'a-main', amount: 1100.25, as_of: '2026-11-10', source: 'pluggy' }],
    ['POST', '/balances', { account_id: 'a-main', amount: 1500.5, as_of: '2026-11-14', source: 'pierre', note: 'mesmo dia, depois' }],
    ['POST', '/balances', { account_id: 'a-main', amount: 5000, as_of: '2026-11-14', source: 'joao' }],
    ['POST', '/balances', { account_id: 'a-inv', amount: 20000.1, amount_kind: 'invested', as_of: '2026-11-12', source: 'pluggy' }],
    ['POST', '/balances', { account_id: 'a-nu', amount: 0, amount_kind: 'invested', as_of: '2026-11-12', source: 'pluggy' }],
    ['POST', '/balances', { account_id: 'a-card', amount: 842.3, amount_kind: 'official_bill', as_of: '2026-11-14', source: 'pluggy' }],
    ['POST', '/balances', { account_id: 'a-card', amount: 910, amount_kind: 'projected_bill', as_of: '2026-11-14', source: 'pluggy' }],
    ['POST', '/balances', { account_id: 'a-card2', amount: 120, amount_kind: 'available', as_of: '2026-11-09', source: 'pluggy' }],
    ['POST', '/debts', { id: 'd-card', title: 'Fatura Inter', kind: 'card', balance: 842.3, min_payment: 120, due_date: '2026-11-12', account_id: 'a-card', queue: 1 }],
    ['POST', '/debts', { id: 'd-card2', title: 'Fatura Nubank', kind: 'card', balance: 300, due_date: '2026-11-20', account_id: 'a-card2', queue: 2 }],
    ['POST', '/debts', { id: 'd-carro', title: 'Carro', kind: 'loan', balance: 15000.99, due_date: '2026-12-30', queue: 3 }],
    ['POST', '/debts', { id: 'd-pj', title: 'Dívida da empresa', kind: 'loan', balance: 5000, account_id: 'a-pj', due_date: '2026-11-18', queue: 4 }],
    ['POST', '/debts', { id: 'd-limpa', title: 'Quitada', kind: 'card', balance: 0, status: 'clean', due_date: '2026-11-16', account_id: 'a-card' }],
    ['POST', '/subscriptions', { id: 's1', name: 'Netflix', amount: 55.9, charge_day: 18, lane: 'personal', account_id: 'a-card' }],
    ['POST', '/subscriptions', { id: 's2', name: 'Figma', amount: 120, charge_day: 31, lane: 'work', status: 'keep' }],
    ['POST', '/subscriptions', { id: 's3', name: 'Domínio', amount: 90, cadence: 'yearly', next_charge: '2026-11-25', lane: 'work' }],
    ['POST', '/subscriptions', { id: 's4', name: 'Cancelada', amount: 30, charge_day: 17, status: 'cancel' }],
    ['POST', '/subscriptions', { id: 's5', name: 'Sem dia', amount: 15, charge_day: null }],
    ['POST', '/subscriptions', { id: 's6', name: 'PJ', amount: 200, charge_day: 20, account_id: 'a-pj', lane: 'work' }],
    ['POST', '/installments', { id: 'i1', title: 'Celular', monthly: 199.9, remaining: 1799.1, paid_n: 3, total_n: 12, last_due: '2027-08-10', account_id: 'a-card' }],
    ['POST', '/installments', { id: 'i2', title: 'TV', monthly: 89.9, remaining: 359.6, last_due: '2027-02-10' }],
    ['POST', '/installments', { id: 'i3', title: 'Paga', monthly: 50, remaining: 0, status: 'done' }],
    ['POST', '/installments', { id: 'i4', title: 'PJ', monthly: 70, remaining: 700, account_id: 'a-pj', last_due: '2028-01-01' }],
    ['POST', '/fixed', { id: 'f1', name: 'Faculdade', amount: 850.5, due_day: 20, category: 'Educação' }],
    ['POST', '/fixed', { id: 'f2', name: 'Carro', amount: 1200, due_day: 17, category: 'Transporte' }],
    ['POST', '/fixed', { id: 'f3', name: 'Contador', amount: 300, due_day: null, lane: 'work' }],
    ['POST', '/fixed', { id: 'f4', name: 'Inativa', amount: 99, due_day: 18, active: false }],
    ['POST', '/fixed/f2/paid', { month: '2026-11' }],
    ['PUT', '/budgets', [{ category: 'Mercado', monthly_limit: 800 }, { category: 'Lazer', monthly_limit: 0 }, { category: 'Transporte', monthly_limit: 300.5 }, { category: 'Saúde', monthly_limit: 100 }]],
  ];
  const categories = ['Alimentação', 'Mercado', 'Transporte', 'Lazer', 'Saúde', 'Outros', 'Compras', 'Pagamento de fatura', 'Transferência', 'Receita', 'Assinaturas', 'Moradia'];
  const sources = ['joao', 'agent', 'pluggy', 'pierre', 'seed'];
  const accounts = [null, 'a-main', 'a-card', 'a-nu', 'a-pj', 'a-card2', 'a-solo', 'a-old'];
  for (let i = 0; i < 130; i += 1) {
    const day = 1 + (i * 7) % 28;
    const month = i % 3 === 0 ? '10' : '11';
    const incoming = i % 9 === 0;
    steps.push(['POST', '/transactions', {
      id: `t-${String(i).padStart(3, '0')}`,
      amount: incoming ? 100 + (i % 17) * 13.37 : -(5 + (i * 37) % 400) - (i % 4) * 0.25,
      direction: i % 23 === 0 ? 'internal' : incoming ? 'inflow' : 'outflow',
      posted_on: `2026-${month}-${String(Math.min(day, month === '11' ? 15 : 28)).padStart(2, '0')}`,
      category: categories[i % categories.length],
      source: sources[i % sources.length],
      account_id: accounts[i % accounts.length],
      merchant: `Loja ${i % 11}`,
    }]);
  }
  return steps;
}

/** O que só o ingest e o Pierre gravam: linhas fixas, na ordem de inserção. */
const SEED = {
  financeTransactions: [
    // lançamento manual já confirmado pelo banco: fora de insights, mês, extrato e contagem manual
    tx('m-1', { account_id: 'a-main', posted_on: '2026-11-10', amount: -50, source: 'joao', matched_tx_id: 'b-1', created_at: STAMP('2026-11-10') }),
    tx('b-1', { account_id: 'a-main', posted_on: '2026-11-10', amount: -50, source: 'pluggy', created_at: STAMP('2026-11-11') }),
    tx('m-2', { account_id: null, posted_on: '2026-11-15', amount: -33.3, source: 'agent', created_at: STAMP('2026-11-15', '13:00:00'), category: 'Mercado' }),
    tx('m-3', { account_id: 'a-main', posted_on: '2026-11-14', amount: -20, source: 'joao', created_at: STAMP('2026-11-14', '09:00:00'), category: 'Lazer' }),
    tx('m-4', { account_id: 'a-main', posted_on: '2026-11-14', amount: -21, source: 'joao', created_at: STAMP('2026-11-14', '23:59:00'), category: 'Lazer' }),
    tx('m-5', { account_id: 'a-nu', posted_on: '2026-11-15', amount: -12.5, source: 'joao', created_at: STAMP('2026-11-15', '08:00:00') }),
    tx('m-6', { account_id: 'a-card', posted_on: '2026-11-15', amount: -99, source: 'joao', created_at: STAMP('2026-11-15', '08:00:00') }),
    tx('m-7', { account_id: 'a-old', posted_on: '2026-11-15', amount: -9, source: 'joao', created_at: STAMP('2026-11-15', '08:00:00') }),
    tx('m-8', { account_id: 'a-pj', posted_on: '2026-11-15', amount: -700, source: 'agent', created_at: STAMP('2026-11-15', '08:00:00') }),
    tx('m-9', { account_id: 'conta-inexistente', posted_on: '2026-11-15', amount: -3, source: 'joao', created_at: STAMP('2026-11-15', '08:00:00') }),
    tx('futuro', { account_id: 'a-main', posted_on: '2026-11-20', amount: -80, source: 'pluggy', created_at: STAMP('2026-11-15') }),
    tx('sem-categoria', { account_id: 'a-main', posted_on: '2026-11-02', amount: -4.4, category: null, direction: 'outflow', source: null, created_at: STAMP('2026-11-02') }),
    tx('sem-direcao', { account_id: 'a-main', posted_on: '2026-11-02', amount: -4.45, direction: null, created_at: STAMP('2026-11-02') }),
    // mesmas categorias com o mesmo total: o empate vem da ordem das linhas (inserção), que é o contrário da ordem dos ids
    tx('e-3', { account_id: 'a-main', posted_on: '2026-09-01', amount: -10, category: 'Beta', created_at: STAMP('2026-09-01') }),
    tx('e-2', { account_id: 'a-main', posted_on: '2026-09-01', amount: -10, category: 'Alfa', created_at: STAMP('2026-09-01') }),
    tx('e-1', { account_id: 'a-main', posted_on: '2026-09-01', amount: -10, category: 'Gama', created_at: STAMP('2026-09-01') }),
  ],
  financePendingTransactions: [
    { external_id: 'pend-3', institution: 'Inter', account_id: 'a-card', posted_on: '2026-11-14', amount: -45.9, raw_description: 'COMPRA X', merchant: 'Loja X', category: 'Compras', seen_at: '2026-11-15T10:00:00.000Z' },
    { external_id: 'pend-1', institution: 'Inter', account_id: 'a-card', posted_on: '2026-11-14', amount: -10, raw_description: '', merchant: 'Padaria', category: 'Alimentação', seen_at: '2026-11-15T11:30:00.000Z' },
    { external_id: 'pend-2', institution: 'Nubank', account_id: 'a-card2', posted_on: '2026-11-13', amount: -100.01, raw_description: 'y', merchant: 'Y', category: null, seen_at: null },
    { external_id: 'pend-4', institution: 'Inter', account_id: 'a-card', posted_on: '2026-11-12', amount: 20, raw_description: 'estorno', merchant: 'Estorno', category: 'Outros', seen_at: '2026-11-15T09:00:00.000Z' },
    { external_id: 'pend-5', institution: 'PJ', account_id: 'a-pj', posted_on: '2026-11-12', amount: -300, raw_description: '', merchant: 'Empresa', category: 'Outros', seen_at: '2026-11-15T12:00:00.000Z' },
    { external_id: 'pend-6', institution: 'Velho', account_id: null, posted_on: '2026-10-30', amount: -1, raw_description: '', merchant: '', category: null, seen_at: '2026-10-30T00:00:00.000Z' },
    { external_id: 'pend-7', institution: 'Inter', account_id: 'conta-inexistente', posted_on: '2026-11-14', amount: -2, raw_description: '', merchant: '', category: null, seen_at: '2026-11-15T10:00:00.000Z' },
  ],
  financeCardStatus: [
    { account_id: 'a-card', institution: 'Inter', last4: '1234', brand: 'MASTERCARD', used: 1200, limit_total: 5000, limit_available: 3800, bill_total: 842.3, bill_minimum: 120, bill_paid: 0, bill_remaining: 842.3, bill_due: '2026-11-17', bill_closing: '2026-11-10', bank_updated_at: '2026-11-15T09:00:00.000Z', updated_at: '2026-11-15T09:00:00.000Z', source: 'pluggy', bill_paid_manual: 0 },
    { account_id: 'a-card2', institution: 'Nubank', last4: null, brand: null, used: null, limit_total: 2000, limit_available: 1500.5, bill_total: 300, bill_minimum: 60, bill_paid: 60, bill_remaining: 240, bill_due: '2026-11-13', bill_closing: '2026-09-01', bank_updated_at: '2026-11-12T09:00:00.000Z', updated_at: '2026-11-12T09:00:00.000Z', source: 'pluggy', bill_paid_manual: 0 },
    { account_id: 'a-pj', institution: 'Inter PJ', last4: '9999', brand: 'VISA', used: 10, limit_total: 100, limit_available: 90, bill_total: 10, bill_minimum: 1, bill_paid: 0, bill_remaining: 10, bill_due: '2026-11-16', bill_closing: '2026-11-10', bank_updated_at: '2026-11-15T09:00:00.000Z', updated_at: '2026-11-15T09:00:00.000Z', source: 'pluggy', bill_paid_manual: 0 },
    { account_id: 'a-old', institution: 'Velho', last4: null, brand: null, used: null, limit_total: null, limit_available: 500, bill_total: null, bill_minimum: null, bill_paid: null, bill_remaining: null, bill_due: null, bill_closing: null, bank_updated_at: null, updated_at: null, source: 'pluggy', bill_paid_manual: 0 },
    { account_id: 'a-solo', institution: 'Zeta', last4: null, brand: null, used: null, limit_total: null, limit_available: 1, bill_total: 50, bill_minimum: 5, bill_paid: 50, bill_remaining: 0, bill_due: null, bill_closing: null, bank_updated_at: '2026-11-14T00:00:00.000Z', updated_at: null, source: 'pluggy', bill_paid_manual: 12.5 },
  ],
  financeStatementCoverage: [
    { id: 'c-1', account_id: 'a-main', source: 'pluggy', covered_from: '2026-10-01', covered_to: '2026-10-20', recorded_at: '2026-10-21T00:00:00.000Z' },
    { id: 'c-2', account_id: 'a-main', source: 'pluggy', covered_from: '2026-10-21', covered_to: '2026-11-14', recorded_at: '2026-11-15T06:00:00.000Z' },
    { id: 'c-3', account_id: 'a-main', source: 'pierre', covered_from: '2026-11-05', covered_to: '2026-11-08', recorded_at: '2026-11-08T06:00:00.000Z' },
    { id: 'c-4', account_id: 'a-card', source: 'pluggy', covered_from: '2026-11-01', covered_to: '2026-11-10', recorded_at: '2026-11-11T06:00:00.000Z' },
    { id: 'c-5', account_id: 'a-pj', source: 'pierre', covered_from: '2026-11-01', covered_to: '2026-11-14', recorded_at: '2026-11-15T06:00:00.000Z' },
    { id: 'c-6', account_id: 'a-nu', source: 'pluggy', covered_from: '2026-11-15', covered_to: '2026-11-15', recorded_at: '2026-11-15T06:00:00.000Z' },
    { id: 'c-7', account_id: 'conta-inexistente', source: 'pluggy', covered_from: '2026-11-01', covered_to: '2026-11-14', recorded_at: '2026-11-15T06:00:00.000Z' },
  ],
  financeSyncLog: [
    { id: 'l-1', started_at: '2026-11-14T10:00:00.000Z', finished_at: '2026-11-14T10:00:05.000Z', ok: 1, accounts_n: 3, tx_n: 10, error: '', actor: 'midas' },
    { id: 'l-2', started_at: '2026-11-15T10:00:00.000Z', finished_at: '2026-11-15T10:00:05.000Z', ok: 0, accounts_n: 0, tx_n: 0, error: 'timeout', actor: 'midas' },
    { id: 'l-3', started_at: '2026-11-15T11:00:00.000Z', finished_at: '2026-11-15T11:00:05.000Z', ok: 1, accounts_n: 5, tx_n: 20, error: '', actor: 'argos' },
    { id: 'l-4', started_at: '2026-11-13T10:00:00.000Z', finished_at: '2026-11-13T10:00:05.000Z', ok: 1, accounts_n: 2, tx_n: 5, error: '', actor: 'midas' },
  ],
};
const TABLE_OF = { financeTransactions: 'finance_transactions', financePendingTransactions: 'finance_pending_transactions', financeCardStatus: 'finance_card_status', financeStatementCoverage: 'finance_statement_coverage', financeSyncLog: 'finance_sync_log' };

async function seed(app, tables = Object.keys(SEED)) {
  for (const name of tables) {
    for (const row of SEED[name]) {
      if (app.storage) await app.as(() => app.storage[name].create(row));
      else {
        const names = Object.keys(row);
        app.db.prepare(`INSERT INTO ${TABLE_OF[name]} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...Object.values(row));
      }
    }
  }
}
/** SQLite compartilha a conexão entre o roteador legado e a camada nova: semear direto no banco vale para os dois. */
async function seedFor(kind, app) {
  if (kind === 'sqlite') {
    const names = Object.keys(SEED);
    for (const name of names) for (const row of SEED[name]) {
      const cols = Object.keys(row);
      app.db.prepare(`INSERT INTO ${TABLE_OF[name]} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(row));
    }
  } else if (kind === 'oracle') {
    await seed({ db: app.db, storage: null });
  } else await seed(app);
}

const READS = [
  ['GET', '/overview'], ['GET', '/month'], ['GET', '/month?month=2026-10'], ['GET', '/month?month=2026-09'], ['GET', '/month?month=2026-13'], ['GET', '/month?month=x'],
  ['GET', '/month?month='], ['GET', '/month?entity=pj'], ['GET', '/month?entity=all'], ['GET', '/month?entity=bad'], ['GET', '/month?entity=PF&month=2026-11'],
  ['GET', '/insights'], ['GET', '/insights?from=2026-10-01&to=2026-10-31'], ['GET', '/insights?from=2026-09-01&to=2026-09-30'], ['GET', '/insights?from=2026-11-10&to=2026-11-01'],
  ['GET', '/insights?from=bad&to=bad'], ['GET', '/insights?entity=pj'], ['GET', '/insights?entity=all&from=2026-10-01&to=2026-11-30'], ['GET', '/insights?entity=bad'],
  ['GET', '/insights?from=2026-01-01&to=2026-12-31&entity=pf'], ['GET', '/insights?from=2026-11-15&to=2026-11-15'], ['GET', '/insights?from=2026-12-01&to=2026-12-31'],
  ['GET', '/coverage'], ['GET', '/coverage?from=2026-10-01&to=2026-10-20'], ['GET', '/coverage?from=2026-10-05&to=2026-11-14'], ['GET', '/coverage?from=2026-11-15&to=2026-11-15'],
  ['GET', '/coverage?from=2026-11-01&to=2026-12-31'], ['GET', '/coverage?from=2026-12-01&to=2026-12-31'], ['GET', '/coverage?from=2026-11-10&to=2026-11-01'],
  ['GET', '/coverage?entity=pj'], ['GET', '/coverage?entity=all&from=2026-10-01&to=2026-11-15'], ['GET', '/coverage?entity=bad'], ['GET', '/coverage?from=2026-09-01&to=2026-09-30'],
  ['GET', '/pending'], ['GET', '/sync/last'],
];

test('finanças (leituras compostas): rota nova responde igual à antiga, com massa e sem massa', { timeout: 300000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  const empty = [['GET', '/overview'], ['GET', '/month'], ['GET', '/insights'], ['GET', '/coverage'], ['GET', '/pending'], ['GET', '/sync/last'], ['GET', '/settings']];
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expectedEmpty = await runFinanceScript(oracle, empty);
  const expectedSetup = await runFinanceScript(oracle, setupSteps());
  await seedFor('oracle', oracle);
  const expectedReads = await runFinanceScript(oracle, READS);
  assert.deepEqual(new Set(expectedReads.map((r) => r.status)), new Set([200, 400]), 'só 200 e 400 nas leituras');
  const overview = JSON.parse(expectedReads[0].body);
  assert.ok(overview.commitments_until_salary.length > 0 && overview.bank_shown.length >= 3 && overview.cards_status.length > 1 && overview.manual_pending_out > 0, 'a massa exercita compromissos, banco, cartões e gasto manual pendente');
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const emptyNow = await runFinanceScript(app, empty);
    for (let i = 0; i < empty.length; i += 1) assert.deepEqual(emptyNow[i], expectedEmpty[i], `${kind}, vazio, passo ${i}: ${expectedEmpty[i].step}`);
    const setupNow = await runFinanceScript(app, setupSteps());
    for (let i = 0; i < setupNow.length; i += 1) assert.equal(setupNow[i].status, expectedSetup[i].status, `${kind}, massa, passo ${i}: ${expectedSetup[i].step}`);
    await seedFor(kind, app);
    const reads = await runFinanceScript(app, READS);
    for (let i = 0; i < READS.length; i += 1) assert.deepEqual(reads[i], expectedReads[i], `${kind}, passo ${i}: ${expectedReads[i].step}`);
  }
  t.diagnostic(`leituras=${READS.length} massa=${setupSteps().length} passos de escrita motores=oráculo,${parityEngines().join(',')}`);
});

test('finanças (conferência de totais): financeTotals do motor novo tem o mesmo hash do SQLite da rota antiga', { timeout: 300000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const payments = [
    ['POST', '/debts/d-card/pay', { amount: 100.1, paid_on: '2026-11-10', account_id: 'a-main' }],
    ['POST', '/debts/d-carro/pay', { amount: 2500 }],
    ['POST', '/debts/d-card2/pay', {}],
  ];
  await runFinanceScript(oracle, [...setupSteps(), ...payments]);
  await seedFor('oracle', oracle);
  const expected = oracleTotals(oracle.db);
  assert.ok(expected.transactions.length > 20 && expected.payments.length === 3 && expected.balances.length > 5 && expected.matched.n === 1, 'a massa cobre lançamentos, baixas, saldos e casados');
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    await runFinanceScript(app, [...setupSteps(), ...payments]);
    await seedFor(kind, app);
    const totals = await app.as(() => createFinanceReconcileService({ storage: app.storage }).financeTotals());
    assert.deepEqual(totals, expected, `${kind}: mesmas somas por conta, mês, categoria e direção`);
    assert.equal(totals.hash, expected.hash, `${kind}: mesmo hash`);
  }
});
