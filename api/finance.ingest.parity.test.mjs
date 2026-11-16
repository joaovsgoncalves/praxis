/**
 * Paridade HTTP de finanças, domínio 5 (POST /ingest/pluggy, usado pelo sync do Argos): rota antiga
 * congelada (bcbadad) × rota nova sobre a camada assíncrona (SQLite e emulador Firestore). Cada roteiro
 * manda corpos reais do Midas e confere a resposta passo a passo e o estado que sobra (extrato, pendentes,
 * saldos, dívidas, cartões, cobertura, log).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinanceRouter as createOracleRouter } from './test-support/oracles/financeRoutes.bcbadad.js';
import { createFinanceRouter } from './routes/finance.js';
import { makeFinanceParityApp, parityEngines, runFinanceScript } from './test-support/httpParity.fase5.mjs';

const TODAY = '2026-11-15';
const setup = {
  oracle: (db) => createOracleRouter({ db, getLocalDateString: () => TODAY }),
  build: ({ storage, db }) => createFinanceRouter({ db, storage, getLocalDateString: () => TODAY }),
};
const INGEST = '/ingest/pluggy';

const bill = (extra = {}) => ({ due_date: '2026-11-20', closing_date: '2026-11-10', total: 3163.96, minimum: 861.5, paid: 1338.49, payments_n: 2, ...extra });
const inter = (extra = {}) => ({
  institution: 'inter', updated_at: '2026-11-15T09:00:00Z', status: 'UPDATED', bank: { balance: 1200.5, reserved: [{ name: 'Férias', amount: 0.35 }, { name: 'Zero', amount: 0 }] },
  card: { last4: '0465', brand: 'MASTERCARD', used: 3679.94, limit: 5020, available: 1340.06, bill: bill() },
  statement: { from: '2026-11-01', to: '2026-11-14' }, ...extra,
});
const c6 = (extra = {}) => ({ institution: 'c6', updated_at: '2026-11-15T09:05:00Z', status: 'UPDATED', bank: { balance: 90.1, reserved: [] }, card: null, statement: { from: '2026-11-05', to: '2026-11-14' }, ...extra });
const nubank = (extra = {}) => ({ institution: 'nubank', updated_at: '2026-11-15T09:10:00Z', status: 'UPDATED', bank: { balance: 15.25, reserved: [] }, card: { last4: '1111', brand: 'MASTERCARD', used: 500, limit: 2000, available: 1500, bill: bill({ total: 500, minimum: 50, paid: 0, due_date: '2026-11-22', closing_date: null }) }, statement: null, ...extra });
const mp = (extra = {}) => ({ institution: 'mp', updated_at: '2026-11-15T09:15:00Z', status: 'UPDATED', bank: { balance: 7, reserved: [] }, card: { last4: '9999', brand: null, used: null, limit: null, available: null, bill: null }, statement: { from: '2026-11-10', to: '2026-11-14' }, ...extra });
const santander = (extra = {}) => ({ institution: 'santander', updated_at: '2026-11-15T09:20:00Z', status: 'UPDATED', bank: { balance: 1, reserved: [] }, card: null, statement: null, ...extra });
const tx = (id, extra = {}) => ({ external_id: id, institution: 'inter', account_type: 'BANK', date: '2026-11-12', amount: -50, description: 'COMPRA CARTAO IFOOD *RESTAURANTE 12/11', category: 'Food', ...extra });

/** Contas, dívidas e lançamentos manuais que o João já tinha antes do sync (mesmo roteiro nos três motores). */
function before() {
  return [
    ['POST', '/accounts', { id: 'a-inter', name: 'Inter', kind: 'checking', institution: 'inter', is_operational: true, sort_order: 1 }],
    ['POST', '/accounts', { id: 'a-inter-card', name: 'Inter Gold', kind: 'credit', institution: 'GOLD', mask: '0465', sort_order: 2 }],
    ['POST', '/accounts', { id: 'a-c6', name: 'C6', kind: 'checking', institution: 'c6', is_operational: true, sort_order: 3 }],
    ['POST', '/accounts', { id: 'a-nu', name: 'Nubank', kind: 'checking', institution: 'nubank', is_operational: true, sort_order: 4 }],
    ['POST', '/accounts', { id: 'a-nu-card', name: 'Nubank Cartão', kind: 'credit', institution: 'nubank', mask: '1111', sort_order: 5 }],
    ['POST', '/accounts', { id: 'a-mp', name: 'Mercado Pago', kind: 'prepaid', institution: 'mp', is_operational: true, sort_order: 6 }],
    ['POST', '/accounts', { id: 'a-pj', name: 'Empresa Inter', kind: 'checking', institution: 'inter', entity: 'pj', is_operational: true, sort_order: 0 }],
    ['POST', '/accounts', { id: 'a-inter-old', name: 'Inter arquivada', kind: 'checking', institution: 'inter', status: 'archived', is_operational: true, sort_order: 0 }],
    ['POST', '/debts', { id: 'd-inter', title: 'Fatura Inter', kind: 'card', balance: 999, account_id: 'a-inter-card', queue: 1, due_date: '2026-11-01' }],
    ['POST', '/debts', { id: 'd-inter-2', title: 'Outra fatura Inter', kind: 'card', balance: 5, account_id: 'a-inter-card', queue: 0 }],
    ['POST', '/debts', { id: 'd-nu', title: 'Fatura Nubank', kind: 'card', balance: 100, account_id: 'a-nu-card', queue: 1 }],
    ['POST', '/debts', { id: 'd-loan', title: 'Empréstimo', kind: 'loan', balance: 1000, account_id: 'a-inter' }],
    // gastos lançados à mão que o banco vai confirmar
    ['POST', '/transactions', { id: 'm-ifood', amount: -50, posted_on: '2026-11-11', account_id: 'a-inter', merchant: 'iFood do João', category: 'Alimentação', note: 'nota manual', source: 'joao' }],
    ['POST', '/transactions', { id: 'm-ifood-2', amount: -50, posted_on: '2026-11-13', account_id: 'a-inter', merchant: 'iFood 2', category: 'Outros', source: 'agent' }],
    ['POST', '/transactions', { id: 'm-semconta', amount: -23.5, posted_on: '2026-11-12', merchant: 'Sem conta', category: 'Lazer', source: 'joao' }],
    ['POST', '/transactions', { id: 'm-cartao-na-corrente', amount: -80, posted_on: '2026-11-12', account_id: 'a-inter', merchant: 'Compra no cartão lançada na corrente', category: 'Compras', source: 'joao' }],
    ['POST', '/transactions', { id: 'm-longe', amount: -61.2, posted_on: '2026-11-01', account_id: 'a-inter', merchant: 'Longe demais', source: 'joao' }],
    ['POST', '/transactions', { id: 'm-outra-conta', amount: -33, posted_on: '2026-11-12', account_id: 'a-c6', merchant: 'Outra conta', source: 'joao' }],
    ['POST', '/transactions', { id: 'm-com-id', amount: -44, posted_on: '2026-11-12', account_id: 'a-inter', merchant: 'Com external_id', source: 'joao', external_id: 'EXT-MANUAL' }],
    ['POST', '/transactions', { id: 'm-divida', amount: -300, posted_on: '2026-11-12', account_id: 'a-inter', merchant: 'Pagamento de dívida', category: 'Dívidas', debt_id: 'd-loan', source: 'joao' }],
    ['POST', '/transactions', { id: 'm-divida-sem-conta', amount: -310, posted_on: '2026-11-12', merchant: 'Pagamento sem conta', category: 'Dívidas', debt_id: 'd-loan', source: 'joao' }],
    ['POST', '/transactions', { id: 'm-pluggy', amount: -50, posted_on: '2026-11-12', account_id: 'a-inter', merchant: 'não é manual', source: 'pluggy' }],
    // pagamento de fatura que o João confirmou e o banco ainda não mostra
    ['POST', '/debts/d-inter/pay', { amount: 200, paid_on: '2026-11-13', account_id: 'a-inter', note: 'pago hoje' }],
    ['POST', '/debts/d-nu/pay', { amount: 40, paid_on: '2026-11-01', account_id: 'a-nu' }],
    // um manual só para dois lançamentos do banco com o mesmo valor: o primeiro casa, o segundo entra solto
    ['POST', '/transactions', { id: 'm-unico', amount: -77, posted_on: '2026-11-12', account_id: 'a-inter', merchant: 'Único', category: 'Saúde', source: 'joao' }],
    // a foto do saldo (rótulo) some quando o banco manda dado vivo
    ['PATCH', '/settings', { snapshot_label: 'foto de 10/11' }],
  ];
}
const AFTER = [
  ['GET', '/overview'], ['GET', '/pending'], ['GET', '/sync/last'], ['GET', '/debts?status=all'], ['GET', '/accounts?status=all'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=1000'], ['GET', '/coverage?from=2026-11-01&to=2026-11-15&entity=all'], ['GET', '/settings'],
  ['GET', '/balances?account_id=a-inter'], ['GET', '/balances?account_id=a-c6'], ['GET', '/balances?account_id=a-mp'], ['GET', '/balances?account_id=a-nu'],
];

const MAIN = [
  [INGEST, { source: 'pluggy', fetched_at: '2026-11-15T09:30:00Z', institutions: [inter(), c6(), nubank({ status: 'LOGIN_ERROR' }), santander(), mp()],
    transactions: [
      tx('T-1'), // casa com o manual m-ifood (mais perto) e herda categoria, nome e nota
      tx('T-2', { date: '2026-11-13', amount: -50 }), // o outro manual do mesmo valor
      tx('T-3', { date: '2026-11-12', amount: -23.5, description: 'PIX ENVIADO JOAO' }), // manual sem conta
      tx('T-4', { account_type: 'CREDIT', amount: -80, description: 'AMAZON MARKETPLACE' }), // cartão: o manual foi lançado na corrente
      tx('T-5', { date: '2026-11-12', amount: -61.2 }), // manual longe demais: não casa
      tx('T-6', { institution: 'c6', amount: -33 }), // manual de outra conta: mesma conta (c6) casa
      tx('T-7', { amount: -44 }), // o manual tem external_id: não casa
      tx('T-8', { amount: -300, description: 'PAGAMENTO' }), // pagamento de dívida com conta e categoria diferente: não casa
      tx('T-9', { amount: -310, description: 'PAGAMENTO' }), // pagamento sem conta: nunca casa
      tx('T-10', { amount: 1500, description: 'SALARIO ACME', category: 'salary' }),
      tx('T-11', { institution: 'santander', amount: -9 }), // sem conta: pulado
      tx('T-12', { institution: 'nubank', account_type: 'CREDIT', amount: -120.9, description: 'UBER *TRIP' }),
      tx('T-13', { institution: 'mp', account_type: 'CREDIT', amount: -15, description: 'MERCADO LIVRE' }),
      tx('T-14', { account_type: 'CREDIT', amount: 3163.96, description: 'PAGAMENTO FATURA', category: 'Credit card payment' }),
      tx('T-15', { description: '', category: null, amount: -0.01 }),
      tx('T-16', { amount: -1234.56, description: 'x'.repeat(300), category: 'Transport' }),
      tx('T-30', { amount: -77, description: 'FARMACIA' }),
      tx('T-31', { amount: -77, description: 'FARMACIA' }),
    ],
    pending_transactions: [
      tx('P-1', { account_type: 'CREDIT', amount: -45.9, date: '2026-11-14', description: 'LOJA X' }),
      tx('P-2', { account_type: 'CREDIT', amount: -80, date: '2026-11-13', description: 'AMAZON MARKETPLACE' }), // gêmea da T-4 (-3 a +10 dias): já lançada
      tx('P-3', { account_type: 'CREDIT', amount: -80, date: '2026-11-13', description: 'AMAZON MARKETPLACE' }), // só uma gêmea cabe
      tx('P-4', { id: 'x', external_id: 'T-1', amount: -50 }), // mesmo id de um lançamento: já lançada
      tx('P-5', { institution: 'c6', amount: -12, date: '2026-11-14' }),
      tx('P-6', { institution: 'mp', account_type: 'CREDIT', amount: -7.5, date: '2026-11-14' }),
    ],
    pending_institutions: ['inter', 'c6', 'nubank', 'santander', 'inter'] }],
  [INGEST, { source: 'pluggy', institutions: [inter(), c6(), mp()], transactions: [tx('T-1'), tx('T-2', { date: '2026-11-13' }), tx('T-4', { account_type: 'CREDIT', amount: -80, description: 'AMAZON MARKETPLACE' })], pending_institutions: ['inter'], pending_transactions: [] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ updated_at: '2026-11-15T08:00:00Z' }), c6({ updated_at: '2026-11-14T08:00:00Z' })], transactions: [tx('T-20', { date: '2026-11-14', amount: -5 })], pending_institutions: ['inter'], pending_transactions: [tx('P-9', { amount: -3 })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ updated_at: '2026-11-15T12:00:00Z', bank: { balance: 1300, reserved: [] }, statement: { from: '2026-11-14', to: '2026-11-15' } }), c6({ updated_at: '2026-11-16T03:30:00Z', statement: { from: '2026-11-20', to: '2026-11-25' } }), nubank()], transactions: [tx('T-21', { date: '2026-11-15', amount: -5.55, institution: 'nubank', account_type: 'CREDIT' })], pending_institutions: ['inter', 'nubank'], pending_transactions: [tx('P-10', { institution: 'nubank', account_type: 'CREDIT', amount: -9, date: '2026-11-15' })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ updated_at: '2026-11-15T13:00:00Z', card: { last4: '0465', brand: null, used: null, limit: null, available: null, bill: bill({ total: 1000, paid: 1000, minimum: 0, closing_date: null }) }, statement: { from: '2026-10-01', to: '2026-10-31' } })], transactions: [] }],
  [INGEST, { source: 'pluggy', institutions: [] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [], pending_transactions: [], pending_institutions: [] }],
];

const INVALID = [
  [INGEST, {}], [INGEST, null], [INGEST, []], [INGEST, 'x'], [INGEST, { source: 'outro', institutions: [] }], [INGEST, { source: 'pluggy' }], [INGEST, { source: 'pluggy', institutions: 'x' }],
  [INGEST, { source: 'pluggy', institutions: Array.from({ length: 21 }, () => inter()) }],
  [INGEST, { source: 'pluggy', institutions: [inter(), inter()] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ institution: 'itau' })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ updated_at: 'ontem' })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ status: '' })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ status: 'x'.repeat(41) })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ bank: { balance: 'x', reserved: [] } })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ bank: { balance: 1, reserved: 'x' } })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ bank: { balance: 1, reserved: [{ name: 'a', amount: null }] } })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ card: { last4: '12', bill: null } })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ card: { last4: '1234', bill: { due_date: '2026-02-30', total: 1 } } })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ card: { last4: '1234', bill: bill({ payments_n: -1 }) } })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ statement: { from: '2026-11-10', to: '2026-11-01' } })] }],
  [INGEST, { source: 'pluggy', institutions: [inter({ statement: 'x' })] }],
  [INGEST, { source: 'pluggy', institutions: [], pending_institutions: 'x' }],
  [INGEST, { source: 'pluggy', institutions: [], pending_institutions: ['itau'] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: 'x' }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('A'), tx('A')] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('A', { amount: 0 })] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('A', { institution: 'itau' })] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('A', { account_type: 'X' })] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('A', { date: '2026-13-01' })] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('A', { amount: '5' })] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('')] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('A', { description: 'x'.repeat(301) })] }],
  [INGEST, { source: 'pluggy', institutions: [], transactions: [tx('A', { category: 'x'.repeat(81) })] }],
  [INGEST, { source: 'pluggy', institutions: [], pending_transactions: [tx('A'), tx('A')] }],
  ['/ingest/pluggy?x=1', { source: 'pluggy', institutions: [] }],
];

const toSteps = (list) => list.map(([path, body]) => ['POST', path, body]);

/** Os mesmos passos num motor; devolve respostas e o estado cru da cobertura (a rota não mostra as janelas). */
async function run(app, steps) {
  const out = await runFinanceScript(app, steps, { pauseMs: 2 });
  return out;
}
async function windowsOf(app) {
  const rows = app.storage
    ? await app.as(() => app.storage.financeStatementCoverage.list({ account_id: null }))
    : app.db.prepare('SELECT * FROM finance_statement_coverage').all();
  return rows.map(({ account_id, source, covered_from, covered_to }) => `${account_id}|${source}|${covered_from}|${covered_to}`).sort();
}

for (const [name, steps, extra] of [
  ['corpo completo com casamento, pendentes, estado do cartão e cobertura', [...before(), ...toSteps(MAIN), ...AFTER]],
  ['corpos inválidos: 400 antes de gravar qualquer coisa', [...before(), ...toSteps(INVALID), ...AFTER]],
]) {
  test(`finanças ingest (${name}): rota nova responde igual à antiga, passo a passo`, { timeout: 300000 }, async (t) => {
    t.mock.method(console, 'error', () => {});
    void extra;
    const oracle = await makeFinanceParityApp('oracle', setup);
    t.after(oracle.dispose);
    const expected = await run(oracle, steps);
    const expectedWindows = await windowsOf(oracle);
    assert.ok(expected.filter((r) => r.step.includes('ingest')).some((r) => r.status === 200) || name.startsWith('corpos inválidos'), 'o roteiro grava de verdade');
    for (const kind of parityEngines()) {
      const app = await makeFinanceParityApp(kind, setup);
      t.after(app.dispose);
      const actual = await run(app, steps);
      for (let i = 0; i < steps.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
      assert.deepEqual(await windowsOf(app), expectedWindows, `${kind}: janelas de cobertura`);
    }
    t.diagnostic(`passos=${steps.length} ingest=${expected.filter((r) => r.step.includes('ingest')).length} status=${[...new Set(expected.map((r) => r.status))].sort().join(',')} motores=oráculo,${parityEngines().join(',')}`);
  });
}

test('finanças ingest: relê o extrato e religa lançamento do banco gravado na conta errada', { timeout: 300000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  const steps = [
    ['POST', '/accounts', { id: 'a-mp', name: 'Mercado Pago', kind: 'prepaid', institution: 'mp', is_operational: true }],
    ['POST', INGEST, { source: 'pluggy', institutions: [mp({ card: null })], transactions: [tx('R-1', { institution: 'mp', account_type: 'CREDIT', amount: -15 }), tx('R-2', { institution: 'mp', amount: -3 })] }],
    ['POST', '/accounts', { id: 'a-mp-card', name: 'MP Cartão', kind: 'credit', institution: 'mp', mask: '9999' }],
    ['POST', INGEST, { source: 'pluggy', institutions: [mp({ card: { last4: '9999', brand: null, used: 1, limit: 2, available: 1, bill: null } })], transactions: [tx('R-1', { institution: 'mp', account_type: 'CREDIT', amount: -15 }), tx('R-2', { institution: 'mp', amount: -3 })] }],
    ...AFTER,
  ];
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await run(oracle, steps);
  assert.equal(JSON.parse(expected[3].body).transactions.relinked, 1, 'a rota antiga religou o cartão');
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await run(app, steps);
    for (let i = 0; i < steps.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
  }
});

test('finanças ingest: pagamento confirmado pelo João e ainda não visto pelo banco (com recibos do Alfred, no SQLite)', { timeout: 300000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  const receiptsTable = (app) => app.db.exec(`CREATE TABLE IF NOT EXISTS alfred_payment_receipts (request_hash TEXT, digest TEXT, payment_id TEXT, transaction_id TEXT, result_json TEXT, expected_paid_floor REAL, cycle_closing TEXT, cycle_due TEXT)`);
  const steps = () => [
    ...before().slice(0, 12),
    ['POST', '/debts/d-inter/pay', { amount: 200, paid_on: '2026-11-13', account_id: 'a-inter' }],
    ['POST', '/debts/d-inter/pay', { amount: 50, paid_on: '2026-11-14' }],
    ['POST', '/debts/d-inter/pay', { amount: 10, paid_on: '2026-11-02' }],
    ['POST', INGEST, { source: 'pluggy', institutions: [inter()], transactions: [] }],
    ['GET', '/overview'],
    ['POST', INGEST, { source: 'pluggy', institutions: [inter({ updated_at: '2026-11-15T10:00:00Z', card: { last4: '0465', brand: 'MASTERCARD', used: 1, limit: 2, available: 1, bill: bill({ paid: 400 }) } })], transactions: [] }],
    ['POST', INGEST, { source: 'pluggy', institutions: [inter({ updated_at: '2026-11-15T11:00:00Z', card: { last4: '0465', brand: 'MASTERCARD', used: 1, limit: 2, available: 1, bill: bill({ paid: 2000 }) } })], transactions: [] }],
    ['GET', '/debts?status=all'],
  ];
  const prep = async (app) => receiptsTable(app);
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  await prep(oracle);
  const first = await run(oracle, steps().slice(0, 15));
  // recibo do Alfred com piso de pago esperado acima do que o banco mostra
  const paymentId = oracle.db.prepare("SELECT id FROM finance_payments WHERE paid_on = '2026-11-13'").get().id;
  oracle.db.prepare('INSERT INTO alfred_payment_receipts (payment_id, expected_paid_floor, cycle_closing, cycle_due) VALUES (?, ?, ?, ?)').run(paymentId, 1600, '2026-11-10', '2026-11-20');
  const rest = await run(oracle, steps().slice(15));
  const expected = [...first, ...rest];
  assert.ok(JSON.parse(expected[15].body).applied[0].manual_paid_pending > 0, 'a rota antiga contou o pagamento pendente');
  for (const kind of parityEngines().filter((k) => k === 'sqlite')) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    await prep(app);
    const part1 = await run(app, steps().slice(0, 15));
    const pid = app.db.prepare("SELECT id FROM finance_payments WHERE paid_on = '2026-11-13'").get().id;
    app.db.prepare('INSERT INTO alfred_payment_receipts (payment_id, expected_paid_floor, cycle_closing, cycle_due) VALUES (?, ?, ?, ?)').run(pid, 1600, '2026-11-10', '2026-11-20');
    const actual = [...part1, ...await run(app, steps().slice(15))];
    for (let i = 0; i < expected.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
  }
  // sem recibos, no Firestore: o mesmo corpo sem a tabela dá a mesma resposta nos três motores
  const plain = steps();
  const o2 = await makeFinanceParityApp('oracle', setup);
  t.after(o2.dispose);
  const exp2 = await run(o2, plain);
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const act2 = await run(app, plain);
    for (let i = 0; i < plain.length; i += 1) assert.deepEqual(act2[i], exp2[i], `${kind} sem recibos, passo ${i}: ${exp2[i].step}`);
  }
});

test('finanças ingest: carga grande (300 lançamentos novos em vários commits) fica igual à antiga e é idempotente', { timeout: 600000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  const bulk = Array.from({ length: 300 }, (_, i) => tx(`B-${String(i).padStart(4, '0')}`, {
    date: `2026-11-${String(1 + (i % 14)).padStart(2, '0')}`, amount: -(1 + (i * 17) % 300) - (i % 4) / 4, description: `LOJA ${i % 23} *COMPRA`, category: ['Food', 'Transport', 'Health', null][i % 4],
    account_type: i % 3 === 0 ? 'CREDIT' : 'BANK',
  }));
  const body = { source: 'pluggy', institutions: [inter()], transactions: bulk };
  const steps = [...before().slice(0, 14), ['POST', INGEST, body], ['POST', INGEST, body], ['POST', INGEST, { ...body, transactions: [...bulk, tx('B-extra', { amount: -1 })] }], ...AFTER];
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await run(oracle, steps);
  assert.equal(JSON.parse(expected[14].body).transactions.inserted > 250, true);
  assert.equal(JSON.parse(expected[15].body).transactions.inserted, 0, 'reenviar não duplica');
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await run(app, steps);
    for (let i = 0; i < steps.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
  }
});

test('finanças ingest: o mesmo corpo em pedidos simultâneos grava cada lançamento uma vez só', { timeout: 300000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  const list = Array.from({ length: 25 }, (_, i) => tx(`C-${i}`, { date: `2026-11-${String(1 + (i % 10)).padStart(2, '0')}`, amount: -(5 + i), description: `LOJA ${i}` }));
  const body = { source: 'pluggy', institutions: [inter()], transactions: list, pending_institutions: ['inter'], pending_transactions: [tx('CP-1', { amount: -3, date: '2026-11-14' })] };
  for (const kind of ['oracle', ...parityEngines()]) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    await runFinanceScript(app, before().slice(0, 12));
    const send = () => fetch(app.base + INGEST, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (res) => ({ status: res.status, body: await res.json() }));
    const results = await Promise.all(Array.from({ length: 4 }, send));
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200], `${kind}: ${JSON.stringify(results.map((r) => r.body))}`);
    assert.equal(results.reduce((s, r) => s + r.body.transactions.inserted, 0), 25, `${kind}: cada lançamento entrou uma vez`);
    assert.equal(results.reduce((s, r) => s + r.body.transactions.duplicates, 0), 75, `${kind}: o resto é repetido`);
    const [rows] = await runFinanceScript(app, [['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=1000']]);
    assert.equal(JSON.parse(rows.body).length, 25, `${kind}: 25 lançamentos`);
    const [logRow] = await runFinanceScript(app, [['GET', '/sync/last']]);
    assert.equal(JSON.parse(logRow.body).actor, 'midas');
  }
});
