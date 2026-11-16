/**
 * Paridade HTTP de finanças, domínio 2 (cadastros: fixas, orçamento, assinaturas, parcelas, metas):
 * rota antiga congelada × rota nova sobre a camada assíncrona (SQLite e emulador Firestore).
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
const LONG = 'x'.repeat(1600);

const FIXED = [
  ['GET', '/fixed'],
  ['POST', '/fixed', {}],
  ['POST', '/fixed', { name: 'x' }],
  ['POST', '/fixed', { name: 'x', amount: '1.234,5' }],
  ['POST', '/fixed', { name: 'Faculdade', amount: '850,50', due_day: '10', category: 'Educação', lane: 'personal', note: 'boleto' }],
  ['POST', '/fixed', { name: 'Carro', amount: 1200.333, due_day: 5, active: false, id: 'ignorado' }],
  ['POST', '/fixed', { name: `${'a'.repeat(119)}😀`, amount: 1 }],
  ['POST', '/fixed', { name: 'X', amount: -1 }],
  ['POST', '/fixed', { name: 'X', amount: 1, due_day: 32 }],
  ['POST', '/fixed', { name: 'X', amount: 1, category: 'Nope' }],
  ['POST', '/fixed', { name: 'X', amount: 1, lane: 'x' }],
  ['POST', '/fixed', { name: 'X', amount: 1, active: 'yes' }],
  ['POST', '/fixed', { name: 'Sem dia', amount: 0, due_day: '', note: null, lane: 'work' }],
  ['POST', '/fixed', { name: 'Nulo', amount: '0', due_day: null, active: 1 }],
  ...Array.from({ length: 12 }, (_, i) => ['POST', '/fixed', { name: ['Água', 'água', 'Luz', 'Água'][i % 4], amount: (i * 13.7) % 300, due_day: [1, 15, null, 15][i % 4], active: i % 5 !== 0 }]),
  ['GET', '/fixed'],
  (seen) => ['PATCH', `/fixed/${seen[0]}`, { amount: 99.99 }],
  (seen) => ['PATCH', `/fixed/${seen[0]}`, { name: '' }],
  (seen) => ['PATCH', `/fixed/${seen[0]}`, { active: 0, due_day: null, note: 7, category: 'Moradia' }],
  (seen) => ['PATCH', `/fixed/${seen[0]}`, {}],
  ['PATCH', '/fixed/nope', { amount: 1 }],
  ['PATCH', `/fixed/${LONG}`, { amount: 1 }],
  (seen) => ['POST', `/fixed/${seen[1]}/paid`, {}],
  (seen) => ['POST', `/fixed/${seen[1]}/paid`, { month: '2026-13' }],
  (seen) => ['POST', `/fixed/${seen[2]}/paid`, { month: '2026-10' }],
  ['POST', '/fixed/nope/paid', { month: 'bad' }],
  (seen) => ['DELETE', `/fixed/${seen[1]}/paid`],
  ['DELETE', '/fixed/nope/paid'],
  ['GET', '/fixed'],
  (seen) => ['DELETE', `/fixed/${seen[3]}`],
  (seen) => ['DELETE', `/fixed/${seen[3]}`],
  ['DELETE', `/fixed/${LONG}`],
  ['GET', '/fixed'],
];

const BUDGETS = [
  ['GET', '/budgets'],
  ['PUT', '/budgets', {}],
  ['PUT', '/budgets', []],
  ['PUT', '/budgets', { budgets: 'x' }],
  ['PUT', '/budgets', [null]],
  ['PUT', '/budgets', { category: 'Receita', monthly_limit: 1 }],
  ['PUT', '/budgets', { category: 'Transferência', monthly_limit: 1 }],
  ['PUT', '/budgets', { category: 'Moradia', monthly_limit: '1500,5' }],
  ['PUT', '/budgets', [{ category: 'Mercado', monthly_limit: 800 }, { category: 'Lazer', monthly_limit: 200.555 }, { category: 'Moradia', monthly_limit: null }, { category: 'Mercado', monthly_limit: 900 }]],
  ['PUT', '/budgets', { budgets: [{ category: 'Lazer', monthly_limit: -1 }] }],
  ['PUT', '/budgets', { category: 'Saúde', monthly_limit: null }],
  ['PUT', '/budgets', { budgets: [{ category: 'Moradia', monthly_limit: 10 }, { category: 'Moradia', monthly_limit: null }, { category: 'Saúde', monthly_limit: 0 }] }],
  ['GET', '/budgets'],
];

const SUBSCRIPTIONS = [
  ['GET', '/subscriptions'],
  ['POST', '/subscriptions', {}],
  ['POST', '/subscriptions', { name: 'Netflix', id: 'sub-1', amount: 55.9, charge_day: '15', account_id: 'acc-1', next_charge: '2026-12-15', vendor_hint: 'NETFLIX', lane: 'personal', cadence: 'monthly' }],
  ['POST', '/subscriptions', { name: 'Figma', lane: 'work', amount: 120, charge_day: null, cadence: 'yearly' }],
  ['POST', '/subscriptions', { name: 'dup', id: 'sub-1' }],
  ['POST', '/subscriptions', { name: 'num', id: 3, amount: '9.999' }],
  ['POST', '/subscriptions', { name: 'lista 2', account_id: ['a', 'b'] }],
  ['POST', '/subscriptions', { name: 'obj', account_id: {} }],
  ['POST', '/subscriptions', { name: 'lista 1', account_id: ['acc-2'], charge_day: 1.5, status: 'cancel', locked: true, source: 'agent', note: 0 }],
  ['POST', '/subscriptions', { name: '😀abc', vendor_hint: '😀ab'.slice(1), cadence: 'nope', status: 'nope', lane: 'nope' }],
  ...Array.from({ length: 10 }, (_, i) => ['POST', '/subscriptions', { name: `Serviço ${i % 3}`, lane: i % 2 ? 'work' : 'personal', amount: [10, 25.5, 10][i % 3], status: ['active', 'keep', 'cancel', 'cancelled', 'installment'][i % 5] }]),
  ['GET', '/subscriptions'],
  ['GET', '/subscriptions?lane=work'],
  ['GET', '/subscriptions?lane=nope'],
  ['GET', '/subscriptions?status=cancel'],
  ['GET', '/subscriptions?status=all&lane=personal'],
  ['GET', '/subscriptions?lane=work&status=active'],
  ['GET', '/subscriptions?status=a&status=b'],
  ['GET', '/subscriptions?status[x]=1&lane=work'],
  ['GET', '/subscriptions?lane[]=work'],
  ['PATCH', '/subscriptions/sub-1', { name: null, amount: '12.5', account_id: null, next_charge: 'bad', charge_day: 'x' }],
  ['PATCH', '/subscriptions/sub-1', { account_id: ['x', 'y'] }],
  ['PATCH', '/subscriptions/sub-1', { account_id: ['acc-9'], vendor_hint: 5, note: null, locked: 0, lane: 'work', cadence: 'service', status: 'keep' }],
  ['PATCH', '/subscriptions/sub-1', {}],
  ['PATCH', '/subscriptions/nope', { name: 'x' }],
  ['PATCH', `/subscriptions/${LONG}`, { name: 'x' }],
  ['DELETE', '/subscriptions/sub-1'],
  ['DELETE', '/subscriptions/sub-1'],
  ['DELETE', '/subscriptions/3.0'],
  ['GET', '/subscriptions?status=all'],
];

const INSTALLMENTS = [
  ['GET', '/installments'],
  ['POST', '/installments', {}],
  ['POST', '/installments', { title: 'Celular', id: 'inst-1', monthly: 199.9, remaining: 1799.1, paid_n: '3', total_n: 12, last_due: '2027-08-10', account_id: 'acc-1' }],
  ['POST', '/installments', { title: 'TV', monthly: '89.9', remaining: 0, status: 'done', source: 'joao', paid_n: 'abc', total_n: null }],
  ['POST', '/installments', { title: 'dup', id: 'inst-1' }],
  ['POST', '/installments', { title: 'arr', account_id: [] }],
  ...Array.from({ length: 10 }, (_, i) => ['POST', '/installments', { title: `Parcela ${i}`, monthly: [100, 50.5][i % 2], remaining: [1000, 1000, 250][i % 3], status: i % 4 ? 'open' : 'done' }]),
  ['GET', '/installments'],
  ['GET', '/installments?status=open'],
  ['GET', '/installments?status=all'],
  ['GET', '/installments?status=a&status=b'],
  ['PATCH', '/installments/inst-1', { paid_n: 'abc', title: '  ', account_id: null, source: 'nope', monthly: '199.95' }],
  ['PATCH', '/installments/inst-1', { paid_n: '4', total_n: 12.5, last_due: 'bad', status: 'done', locked: 'x', note: 'quase' }],
  ['PATCH', '/installments/inst-1', { account_id: ['a', 'b'] }],
  ['PATCH', '/installments/inst-1', {}],
  ['PATCH', '/installments/nope', { title: 'x' }],
  ['DELETE', '/installments/inst-1'],
  ['DELETE', '/installments/inst-1'],
  ['GET', '/installments?status=all'],
];

const GOALS = [
  ['GET', '/goals'],
  ['POST', '/goals', {}],
  ['POST', '/goals', { title: 'Reserva', id: 'goal-1', target_amount: 10000, current_amount: 2500.5, due_date: '2027-06-30' }],
  ['POST', '/goals', { title: 'Viagem', target_amount: 0, current_amount: 10 }],
  ['POST', '/goals', { title: 'Carro', target_amount: '5000', current_amount: 6000, debt_id: 'd1', status: 'paused' }],
  ['POST', '/goals', { title: 'dup', id: 'goal-1' }],
  ['POST', '/goals', { title: 'obj', debt_id: { a: 1 } }],
  ...Array.from({ length: 8 }, (_, i) => ['POST', '/goals', { title: ['Meta', 'meta', 'Meta'][i % 3], target_amount: 300, current_amount: i * 37.5, due_date: [null, '2027-01-01', '2026-12-31', null][i % 4] }]),
  ['GET', '/goals'],
  ['PATCH', '/goals/goal-1', { current_amount: 3000, due_date: 'bad', debt_id: null }],
  ['PATCH', '/goals/goal-1', { debt_id: 'd2', title: null, status: 'done', target_amount: '1e4' }],
  ['PATCH', '/goals/goal-1', { debt_id: ['a', 'b'] }],
  ['PATCH', '/goals/goal-1', {}],
  ['PATCH', '/goals/nope', { title: 'x' }],
  ['GET', '/goals'],
];

// Máscara que corta um par substituto (UTF-16) no meio: o SQLite guarda o caractere de troca.
const SURROGATES = [
  ['POST', '/accounts', { name: 'corte', mask: '😀abc', id: 'conta-s' }],
  ['PATCH', '/accounts/conta-s', { mask: 'x😀ab'.slice(0, 4) }],
  ['GET', '/accounts?status=all'],
];

const SCRIPTS = { fixed: FIXED, budgets: BUDGETS, subscriptions: SUBSCRIPTIONS, installments: INSTALLMENTS, goals: GOALS, surrogates: SURROGATES };

for (const [name, script] of Object.entries(SCRIPTS)) {
  test(`finanças (${name}): rota nova responde igual à antiga, passo a passo`, async (t) => {
    t.mock.method(console, 'error', () => {});
    const oracle = await makeFinanceParityApp('oracle', setup);
    t.after(oracle.dispose);
    const expected = await runFinanceScript(oracle, script);
    for (const kind of parityEngines()) {
      const app = await makeFinanceParityApp(kind, setup);
      t.after(app.dispose);
      const actual = await runFinanceScript(app, script);
      for (let i = 0; i < script.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
    }
    t.diagnostic(`passos=${script.length} status=${[...new Set(expected.map((r) => r.status))].sort().join(',')} motores=oráculo,${parityEngines().join(',')}`);
  });
}

test('finanças: apagar assinatura solta os lançamentos dela (oráculo × SQLite; Firestore no contrato)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const script = [
    ['POST', '/subscriptions', { name: 'Spotify', id: 'sub-x', amount: 21.9 }],
    ['POST', '/subscriptions', { name: 'Outra', id: 'sub-y', amount: 5 }],
    ['POST', '/transactions', { amount: 21.9, direction: 'outflow', posted_on: '2026-11-01', subscription_id: 'sub-x', id: 'tx-1' }],
    ['POST', '/transactions', { amount: 21.9, direction: 'outflow', posted_on: '2026-10-01', subscription_id: 'sub-x', id: 'tx-2' }],
    ['POST', '/transactions', { amount: 5, direction: 'outflow', posted_on: '2026-11-02', subscription_id: 'sub-y', id: 'tx-3' }],
    ['DELETE', '/subscriptions/sub-x'],
    ['GET', '/transactions?from=2026-01-01&to=2026-12-31'],
    ['GET', '/subscriptions'],
  ];
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await runFinanceScript(oracle, script);
  assert.equal(expected[2].status, 201, 'lançamento criado pela rota antiga');
  const app = await makeFinanceParityApp('sqlite', setup);
  t.after(app.dispose);
  const actual = await runFinanceScript(app, script);
  for (let i = 0; i < script.length; i += 1) assert.deepEqual(actual[i], expected[i], `sqlite, passo ${i}: ${expected[i].step}`);
  const rows = JSON.parse(expected[6].body);
  assert.deepEqual(rows.map((r) => [r.id, r.subscription_id]).sort(), [['tx-1', null], ['tx-2', null], ['tx-3', 'sub-y']]);
});
