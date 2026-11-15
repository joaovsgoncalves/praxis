/**
 * Paridade HTTP de finanças, domínio 1 (configuração, contas, saldos): rota antiga congelada ×
 * rota nova sobre a camada assíncrona (SQLite e emulador Firestore), passo a passo.
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

const KINDS = ['available', 'invested', 'official_bill', 'projected_bill', 'used_limit'];
const SCRIPT = [
  ['GET', '/settings'],
  ['PATCH', '/settings', { reserved_car: 1500.555, reserved_live: '300.1', snapshot_label: 12, hide_values: true, salary_day: '5' }],
  ['PATCH', '/settings', { hide_values: 'yes' }],
  ['PATCH', '/settings', { salary_day: 0 }],
  ['PATCH', '/settings', { salary_day: 31.5, reserved_car: 1 }],
  ['PATCH', '/settings', { hide_values: 0, salary_day: 31, reserved_car: null, reserved_live: -0.004 }],
  ['PATCH', '/settings', []],
  ['PATCH', '/settings', '"x"', { raw: true }],
  ['GET', '/settings'],
  ['GET', '/accounts'],
  ['POST', '/accounts', {}],
  ['POST', '/accounts', { name: '   ' }],
  ['POST', '/accounts', { name: ' Inter ', kind: 'checking', institution: 'Inter', mask: '123456', is_operational: true, amount: 1000.5 }],
  ['POST', '/accounts', { name: 'C6', kind: 'credit', amount: '200.005', source: 'pierre', as_of: '2026-11-01' }],
  ['GET', '/settings'],
  ['POST', '/accounts', { name: 'Carteira', kind: 'cash', sort_order: 1, entity: 'PJ' }],
  ['POST', '/accounts', { name: 'x', entity: 'all' }],
  ['POST', '/accounts', { name: 'x', entity: 'zz' }],
  ['POST', '/accounts', { name: 'dup', id: 'fixa-1', kind: 'nope', status: 'archived' }],
  ['POST', '/accounts', { name: 'dup2', id: 'fixa-1', amount: 3 }],
  ['POST', '/accounts', { name: 'num', id: 5 }],
  ['POST', '/accounts', { name: 'num-saldo', id: 7, amount: 10 }],
  ['POST', '/accounts', { name: 'lista', id: ['arr-1'] }],
  ['POST', '/accounts', { name: 'obj', id: {} }],
  ['POST', '/accounts', { name: 'desloca', id: ['s1', 's2'], pierre_account_id: [] }],
  ['POST', '/accounts', { name: 'longa', id: 'a'.repeat(40), pierre_account_id: { a: 1 } }],
  ['POST', '/accounts', { name: 'Bool', sort_order: true, institution: 0, mask: null }],
  ['POST', '/accounts', { name: 'ZZ', sort_order: null }],
  ['POST', '/accounts', { name: 'float', sort_order: 2.5 }],
  ['POST', '/accounts', { name: 'texto', sort_order: ' 7 ' }],
  ['POST', '/accounts', { name: 'pierre', pierre_account_id: 42 }],
  ['POST', '/accounts', { name: 'travado', amount: 5, locked: true, source: 'agent', as_of: '2026-02-30' }],
  ['POST', '/accounts', { name: 'emoji 😀', mask: 'ab😀😀' }],
  ...Array.from({ length: 12 }, (_, i) => ['POST', '/accounts', { name: ['Mesmo', 'mesmo', 'Mesmo ', 'Ágil'][i % 4], sort_order: [3, 3, 1, 0][i % 3], entity: i % 5 === 0 ? 'pj' : 'pf', status: i % 4 === 3 ? 'archived' : 'active' }]),
  ['GET', '/accounts'],
  ['GET', '/accounts?status=all'],
  ['GET', '/accounts?status=archived'],
  ['GET', '/accounts?entity=pj'],
  ['GET', '/accounts?entity=PF&status=all'],
  ['GET', '/accounts?entity=bad'],
  ['GET', '/accounts?status=a&status=b'],
  ['GET', '/accounts?status[x]=1'],
  ['GET', '/accounts?status[]=active&entity=pf'],
  ['GET', '/accounts?status=&entity='],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, { brand_color: '#ABCDEF', card_last4: '1234', name: '  Inter PF  ', is_operational: 0 }],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, { brand_color: 'bad' }],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, { card_last4: '12' }],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, { entity: 'all' }],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, { entity: 'nope' }],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, { entity: 'PJ', brand_color: 'nubank', card_last4: ' 9876 ' }],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, { name: null, kind: 'nope', status: 'whatever', mask: 12345, institution: false }],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, { brand_color: '', card_last4: null, kind: 'credit', is_operational: 'x' }],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, {}],
  (seen) => ['PATCH', `/accounts/${seen[1]}`, []],
  ['PATCH', '/accounts/fixa-1', { status: 'active', name: 'Fixa' }],
  ['PATCH', '/accounts/nope', { name: 'x' }],
  ['PATCH', '/accounts/5.0', { name: 'achou pelo texto' }],
  ['PATCH', '/accounts/5', { name: 'não acha' }],
  ['PATCH', `/accounts/${'x'.repeat(1600)}`, { name: 'x' }],
  ['GET', '/balances'],
  ['POST', '/balances', {}],
  ['POST', '/balances', { account_id: 'nope', amount: 1 }],
  ['POST', '/balances', { account_id: 'x'.repeat(1600), amount: 1 }],
  ['POST', '/balances', { account_id: 'fixa-1', amount: 12.345, as_of: '2026-02-30' }],
  ['POST', '/balances', { account_id: 'fixa-1', amount: 1, id: 'saldo-1', source: 'pierre' }],
  ['POST', '/balances', { account_id: 'fixa-1', amount: 2, id: 'saldo-1' }],
  ['POST', '/balances', { account_id: 'fixa-1', id: 9, amount: '1e3', amount_kind: 'invested', as_of: '2026-11-10' }],
  ['POST', '/balances', { account_id: 'fixa-1', amount: 'abc', amount_kind: 'official_bill', as_of: '2026-11-10', note: 7 }],
  ['POST', '/balances', { account_id: 'fixa-1', id: {}, amount: 1 }],
  ['POST', '/balances', { account_id: ['fixa-1'], amount: 4.2, amount_kind: 'projected_bill', locked: 1, source: 'nope' }],
  ['POST', '/balances', { account_id: '7.0', amount: -99.99, source: 'joao' }],
  ['PATCH', '/settings', { snapshot_label: 'antes da conta travada' }],
  ['POST', '/balances', { account_id: 'arr-1', amount: 0.1, locked: true, source: 'seed' }],
  ['GET', '/settings'],
  // Volume para morder o LIMIT 200 e a ordem `as_of DESC, created_at DESC`.
  ...Array.from({ length: 205 }, (_, i) => ['POST', '/balances', {
    account_id: ['fixa-1', 'arr-1', '7.0', 's1'][i % 4], amount: Math.round((i * 37.13) % 5000 * 100) / 100,
    amount_kind: KINDS[i % 5], source: ['pierre', 'pluggy', 'agent'][i % 3], as_of: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
  }]),
  ['GET', '/balances'],
  ['GET', '/balances?account_id=fixa-1'],
  ['GET', '/balances?account_id=a&account_id=b'],
  ['GET', '/balances?account_id[x]=1'],
  ['GET', '/balances?account_id[]=arr-1'],
  ['GET', '/balances?account_id='],
  ['GET', '/accounts?status=all'],
  ['GET', '/accounts?status=all&entity=pj'],
  ['GET', '/settings'],
];

test('finanças (configuração, contas, saldos): rota nova responde igual à antiga, passo a passo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await runFinanceScript(oracle, SCRIPT);
  for (const status of [200, 201, 400, 404, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  assert.equal(JSON.parse(expected.at(-9).body).length, 200, 'LIMIT 200 mordido');
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await runFinanceScript(app, SCRIPT);
    for (let i = 0; i < SCRIPT.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('finanças: diferença intencional — id escolhido acima de 1500 bytes é recusado sem gravar', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const steps = [
    ['POST', '/accounts', { name: 'base', id: 'base' }],
    ['POST', '/accounts', { name: 'id longo', id: 'x'.repeat(1600) }],
    ['POST', '/balances', { account_id: 'base', id: 'y'.repeat(1600), amount: 1 }],
    ['GET', '/accounts?status=all'],
    ['GET', '/balances'],
  ];
  const old = await runFinanceScript(oracle, steps);
  assert.equal(old[1].status, 201, 'antiga aceitava conta com id de 1600 bytes');
  assert.equal(old[2].status, 201, 'antiga aceitava saldo com id de 1600 bytes');
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const now = await runFinanceScript(app, steps);
    assert.equal(now[1].status, 500, kind); assert.match(now[1].body, /invalid_record_id/);
    assert.equal(now[2].status, 500, kind); assert.match(now[2].body, /invalid_record_id/);
    assert.deepEqual(JSON.parse(now[3].body).map((a) => a.id), ['base'], `${kind}: só a conta base`);
    assert.deepEqual(JSON.parse(now[4].body), [], `${kind}: nenhum saldo`);
  }
});

test('finanças: contas criadas ao mesmo tempo não repetem posição', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const created = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(`${app.base}/accounts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `corrida ${i}`, amount: i + 0.01 }),
    }).then(async (res) => { assert.equal(res.status, 201, kind); return res.json(); })));
    assert.deepEqual(created.map((row) => row.sort_order).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8], kind);
    const balances = await (await fetch(`${app.base}/balances`)).json();
    assert.equal(balances.length, 8, `${kind}: um saldo por conta`);
  }
});
