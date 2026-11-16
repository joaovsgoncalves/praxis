/**
 * Paridade HTTP de finanças, domínio 3 (dívidas, baixas, lançamentos, Idempotency-Key): rota antiga
 * congelada (bcbadad) × rota nova sobre a camada assíncrona (SQLite e emulador Firestore), passo a passo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinanceRouter as createOracleRouter } from './test-support/oracles/financeRoutes.bcbadad.js';
import { createFinanceRouter } from './routes/finance.js';
import { todayFortaleza } from './finance.js';
import { makeFinanceParityApp, parityEngines, runFinanceScript } from './test-support/httpParity.fase5.mjs';

const TODAY = '2026-11-15';
const setup = {
  oracle: (db) => createOracleRouter({ db, getLocalDateString: () => TODAY }),
  build: ({ storage, db }) => createFinanceRouter({ db, storage, getLocalDateString: () => TODAY }),
};
const LONG = 'x'.repeat(1600);
const key = (value) => ({ headers: { 'Idempotency-Key': value } });
const realToday = todayFortaleza();
const daysAgo = (n) => { const [y, m, d] = realToday.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - n, 12)).toISOString().slice(0, 10); };

const DEBTS = [
  ['GET', '/debts'],
  ['POST', '/debts', {}],
  ['POST', '/debts', { title: '   ' }],
  ['POST', '/debts', { title: 'Cartão Inter', id: 'debt-1', balance: 1500.55, min_payment: 150, kind: 'card', apr_label: 'high', due_day: '10', due_date: '2026-12-10', queue: 5, account_id: 'acc-1', note: 'x' }],
  ['POST', '/debts', { title: 'Carro', id: 'debt-carro', balance: '2500.25', kind: 'loan', min_payment: null, queue: '20' }],
  ['POST', '/debts', { title: 'dup', id: 'debt-1' }],
  ['POST', '/debts', { title: 'Número', id: 7, balance: '1.234,5' }],
  ['POST', '/debts', { title: 'Lista 1', account_id: ['acc-2'], kind: 'nope', apr_label: 'nope', status: 'nope', source: 'nope', due_day: 'x', due_date: 'bad', queue: 'abc' }],
  ['POST', '/debts', { title: 'Lista 2', account_id: ['a', 'b'] }],
  ['POST', '/debts', { title: 'Objeto', account_id: { a: 1 } }],
  ['POST', '/debts', { title: 'Zeros', due_day: null, queue: null, min_payment: 0, locked: true, note: 5, balance: -3 }],
  ['POST', '/debts', { title: '😀 emoji', note: '😀ab'.slice(1), balance: 0.1 + 0.2 }],
  ...Array.from({ length: 14 }, (_, i) => ['POST', '/debts', { title: `Dívida ${i}`, balance: [100, 100, 250.5, 0, 99.99][i % 5], queue: [5, 10, 5, null, 'x', 50][i % 6], status: ['open', 'min_paid', 'clean', 'waiting', 'blocked'][i % 5], min_payment: i % 3 ? null : 10.5 }]),
  ['GET', '/debts'],
  ['GET', '/debts?status=open'],
  ['GET', '/debts?status=clean'],
  ['GET', '/debts?status=all'],
  ['GET', '/debts?status=nada'],
  ['GET', '/debts?status=a&status=b'],
  ['GET', '/debts?status[x]=1'],
  ['GET', '/debts?status[]=open'],
  ['PATCH', '/debts/debt-1', { balance: '100.10', title: ' Novo ', min_payment: null, status: 'min_paid', queue: '3', locked: 1, due_day: 'x', note: null, account_id: null, kind: 'loan', apr_label: 'low', source: 'agent', due_date: 'bad' }],
  ['PATCH', '/debts/debt-1', { title: null, min_payment: '55,5', due_day: '', queue: 'abc', status: 'nope', kind: 'nope' }],
  ['PATCH', '/debts/debt-1', {}],
  ['PATCH', '/debts/debt-1', { account_id: ['x', 'y'] }],
  ['PATCH', '/debts/debt-1', { account_id: ['acc-9'], note: 5, locked: 0, due_date: '2027-01-31' }],
  ['PATCH', '/debts/nope', { balance: 1 }],
  ['PATCH', `/debts/${LONG}`, { balance: 1 }],
  ['PATCH', '/debts/7.0', { title: 'achada por 7.0' }],
  ['GET', '/debts?status=all'],
];

const PAY = [
  ['POST', '/accounts', { name: 'Conta', id: 'acc-1', amount: 5000 }],
  ['POST', '/debts', { title: 'Carro', id: 'debt-carro', balance: 2000, kind: 'loan', queue: 1 }],
  ['POST', '/debts', { title: 'Cartão Inter', id: 'card-1', balance: 500, kind: 'card', queue: 2 }],
  ['POST', '/debts', { title: 'Empréstimo', id: 'loan-1', balance: 90, kind: 'loan', queue: 3 }],
  ['POST', '/goals', { title: 'Quitar carro', id: 'g-carro', target_amount: 2000, current_amount: 0, debt_id: 'debt-carro' }],
  ['POST', '/goals', { title: 'Quitar cartão', id: 'g-card', target_amount: 300, current_amount: 100, debt_id: 'card-1' }],
  ['POST', '/goals', { title: 'Pausada', id: 'g-pausa', target_amount: 300, current_amount: 0, debt_id: 'card-1', status: 'paused' }],
  ['POST', '/goals', { title: 'Outra', id: 'g-outra', target_amount: 300, current_amount: 10, debt_id: 'loan-1' }],
  ['PATCH', '/settings', { reserved_car: 2000, reserved_live: 100.5 }],
  ['POST', '/debts/nope/pay', { amount: 10 }],
  ['POST', `/debts/${LONG}/pay`, { amount: 10 }],
  ['POST', '/debts/card-1/pay', { amount: 'abc' }],
  ['POST', '/debts/card-1/pay', { amount: -5 }],
  ['POST', '/debts/card-1/pay', { amount: 0 }],
  ['POST', '/debts/card-1/pay', { amount: 50, paid_on: '2026-11-10', account_id: 'acc-1', method: 'ted', note: 'primeira' }],
  ['POST', '/debts/card-1/pay', { amount: 25.5, paid_on: 'x' }],
  ['POST', '/debts/card-1/pay', { amount: '30,25', paid_on: '2026-02-30', method: 5, note: null }],
  ['POST', '/debts/card-1/pay', { amount: 10, account_id: 'nao-existe' }],
  ['POST', '/debts/card-1/pay', { amount: 10, account_id: ['a', 'b'] }],
  ['POST', '/debts/card-1/pay', { amount: 10, account_id: { a: 1 } }],
  ['POST', '/debts/card-1/pay', { amount: 10, account_id: ['acc-1'] }],
  ['GET', '/debts?status=all'],
  ['GET', '/goals'],
  ['GET', '/settings'],
  ['POST', '/debts/card-1/pay', { amount: 1000 }],
  ['GET', '/goals'],
  ['POST', '/debts/loan-1/pay', {}],
  ['GET', '/goals'],
  ['POST', '/debts/debt-carro/pay', { amount: 500 }],
  ['GET', '/settings'],
  ['POST', '/debts/debt-carro/pay', {}],
  ['GET', '/settings'],
  ['GET', '/goals'],
  ['POST', '/debts/debt-carro/pay', { amount: 1 }],
  ['GET', `/transactions?from=2020-01-01&to=2030-01-01&limit=1000`],
  ['GET', '/debts?status=all'],
];

const INTENT = [
  ['POST', '/debts', { title: 'Cartão', id: 'card-k', balance: 1000, kind: 'card' }],
  ['POST', '/debts', { title: 'Outra', id: 'card-j', balance: 400, kind: 'loan' }],
  ['POST', '/debts/card-k/pay', { amount: 100, intent_key: 'curta' }],
  ['POST', '/debts/card-k/pay', { amount: 100, intent_key: 'tem espaço!!' }],
  ['POST', '/debts/card-k/pay', { amount: 100 }, key('x'.repeat(81))],
  ['POST', '/debts/card-k/pay', { amount: 100 }, key('chave-0001')],
  ['POST', '/debts/card-k/pay', { amount: 100 }, key('chave-0001')],
  ['POST', '/debts/card-k/pay', { amount: '100,00' }, key('chave-0001')],
  ['POST', '/debts/card-k/pay', {}, key('chave-0001')],
  ['POST', '/debts/card-k/pay', { amount: null }, key('chave-0001')],
  ['POST', '/debts/card-k/pay', { amount: 100.004 }, key('chave-0001')],
  ['POST', '/debts/card-k/pay', { amount: 101 }, key('chave-0001')],
  ['POST', '/debts/card-j/pay', { amount: 100 }, key('chave-0001')],
  ['POST', '/debts/nope/pay', { amount: 100 }, key('chave-0001')],
  ['POST', '/debts/card-k/pay', { amount: 100, intent_key: 'chave-0002' }, key('chave-0001')],
  ['POST', '/debts/card-k/pay', { amount: 50, intent_key: 'chave-0002' }],
  ['POST', '/debts/card-k/pay', { amount: 50, intent_key: 'chave-0002' }],
  ['POST', '/debts/card-k/pay', { amount: 70, intent_key: '' }],
  ['POST', '/debts/card-k/pay', { amount: 70, intent_key: null }],
  ['POST', '/debts/card-k/pay', { amount: 0 }, key('chave-0003')],
  ['POST', '/debts/card-k/pay', { amount: 0 }, key('chave-0003')],
  ['POST', '/debts/card-k/pay', { amount: 5, account_id: 'nada' }, key('chave-0004')],
  ['POST', '/debts/card-k/pay', { amount: 5 }, key('chave-0004')],
  ['POST', '/debts/card-k/pay', {}, key('chave-0005')],
  ['POST', '/debts/card-k/pay', {}, key('chave-0005')],
  ['GET', '/debts?status=all'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01'],
  ['POST', '/transactions', { amount: -10, posted_on: '2026-11-01' }, key('tx-chave-01')],
  ['POST', '/transactions', { amount: -10, posted_on: '2026-11-01' }, key('tx-chave-01')],
  ['POST', '/transactions', { amount: '10,00', direction: 'inflow' }, key('tx-chave-01')],
  ['POST', '/transactions', { amount: 10.004 }, key('tx-chave-01')],
  ['POST', '/transactions', { amount: 11 }, key('tx-chave-01')],
  ['POST', '/transactions', { amount: 'abc' }, key('tx-chave-01')],
  ['POST', '/transactions', {}, key('tx-chave-01')],
  ['POST', '/transactions', { amount: 'abc' }, key('tx-chave-02')],
  ['POST', '/transactions', { amount: 5, intent_key: 'tx-chave-03' }],
  ['POST', '/transactions', { amount: 5, intent_key: 'tx-chave-03' }],
  ['POST', '/transactions', { amount: 5, intent_key: 'tx-chave-03' }, key('tx-chave-04')],
  ['POST', '/transactions', { amount: 5, intent_key: 'tx-chave-03' }, key('tx-chave-04')],
  ['POST', '/transactions', { amount: 5 }, key('curta')],
  ['POST', '/transactions', { amount: 5, intent_key: '' }],
  ['POST', '/transactions', { amount: 5, intent_key: '' }],
  ['POST', '/transactions', { amount: 5, account_id: 'nada' }, key('tx-chave-05')],
  ['POST', '/transactions', { amount: 5 }, key('tx-chave-05')],
  ['POST', '/transactions', { amount: 5, id: 'dup-id' }, key('tx-chave-06')],
  ['POST', '/transactions', { amount: 5, id: 'dup-id' }, key('tx-chave-07')],
  ['POST', '/transactions', { amount: 5, id: 'dup-id2' }, key('tx-chave-06')],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01'],
];

const TX = [
  ['GET', '/transactions'],
  ['POST', '/accounts', { name: 'Conta PF', id: 'acc-1' }],
  ['POST', '/accounts', { name: 'Empresa', id: 'acc-pj', entity: 'pj' }],
  ['POST', '/transactions', {}],
  ['POST', '/transactions', { amount: 'abc' }],
  ['POST', '/transactions', { amount: '' }],
  ['POST', '/transactions', { amount: null }],
  ['POST', '/transactions', { amount: true }],
  ['POST', '/transactions', { amount: [5] }],
  ['POST', '/transactions', { amount: {} }],
  ['POST', '/transactions', { amount: '-12,50', merchant: '  Padaria  ', category: 'Alimentação' }],
  ['POST', '/transactions', { amount: '12,5', category: 'Nope', posted_on: '2026-11-03' }],
  ['POST', '/transactions', { amount: -40, direction: 'inflow', posted_on: '2026-11-04', merchant: 'Estorno' }],
  ['POST', '/transactions', { amount: 40, direction: 'outflow', posted_on: '2026-11-05', note: 'n'.repeat(600), raw_description: 'r'.repeat(400), merchant: 'm'.repeat(200) }],
  ['POST', '/transactions', { amount: -7.77, direction: 'internal', posted_on: '2026-11-06' }],
  ['POST', '/transactions', { amount: 7.77, direction: 'nope', posted_on: '2026-11-06' }],
  ['POST', '/transactions', { amount: 1, posted_on: 'x' }],
  ['POST', '/transactions', { amount: 1, posted_on: null }],
  ['POST', '/transactions', { amount: 1, posted_on: '2026-02-30' }],
  ['POST', '/transactions', { amount: 1.005, id: 'tx-cent' }],
  ['POST', '/transactions', { amount: 1234.56, id: 'tx-1', external_id: 'EXT-1', pierre_tx_id: 'P-1', account_id: 'acc-1', subscription_id: 'sub-1', debt_id: 'debt-1', source: 'agent', merchant: 'Mercado Livre', raw_description: 'COMPRA ML' }],
  ['POST', '/transactions', { amount: 1, id: 'tx-1' }],
  ['POST', '/transactions', { amount: 1, id: 'tx-2', external_id: 'EXT-1' }],
  ['POST', '/transactions', { amount: 1, id: 'tx-2', pierre_tx_id: 'P-1' }],
  ['POST', '/transactions', { amount: 1, id: 'tx-1', external_id: 'EXT-1', pierre_tx_id: 'P-1' }],
  ['POST', '/transactions', { amount: 1, id: 'tx-3', external_id: '', pierre_tx_id: '' }],
  ['POST', '/transactions', { amount: 1, id: 'tx-4', external_id: '', pierre_tx_id: '' }],
  ['POST', '/transactions', { amount: 1, id: 7 }],
  ['POST', '/transactions', { amount: 1, id: 7 }],
  ['POST', '/transactions', { amount: 1, id: true }],
  ['POST', '/transactions', { amount: 1, external_id: 99 }],
  ['POST', '/transactions', { amount: 1, external_id: 99 }],
  ['POST', '/transactions', { amount: 1, account_id: 'nao-existe' }],
  ['POST', '/transactions', { amount: 1, account_id: 5 }],
  ['POST', '/transactions', { amount: 1, account_id: ['a', 'b'] }],
  ['POST', '/transactions', { amount: 1, account_id: ['acc-1'], merchant: 'por lista' }],
  ['POST', '/transactions', { amount: 2, account_id: 'acc-pj', merchant: 'Empresa Ltda', posted_on: '2026-11-07' }],
  ['POST', '/transactions', { amount: -3, account_id: 'acc-pj', merchant: 'Empresa Ltda', raw_description: 'PIX ENVIADO', posted_on: '2026-11-07' }],
  ['POST', '/transactions', { amount: 1, subscription_id: ['a', 'b'] }],
  ['POST', '/transactions', { amount: 1, merchant: '😀ab'.slice(1), raw_description: 'a😀'.slice(0, 2) }],
  ['POST', '/transactions', { amount: 99, matched_tx_id: 'ignorado', payment_id: 'p-x', created_at: 'x', merchant: 'campos extras' }],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01'],
  ['PATCH', '/transactions/tx-1', { merchant: '  Novo  ', category: 'Lazer', subscription_id: 'sub-2', debt_id: 'debt-2', raw_description: 'novo texto', note: 'x'.repeat(600) }],
  ['PATCH', '/transactions/tx-1', { category: 'Nope', merchant: null, note: null, raw_description: null, subscription_id: null }],
  ['PATCH', '/transactions/tx-1', { debt_id: ['a', 'b'] }],
  ['PATCH', '/transactions/tx-1', { debt_id: ['d-1'], subscription_id: 5, merchant: 7 }],
  ['PATCH', '/transactions/tx-1', {}],
  ['PATCH', '/transactions/tx-1', { amount: 999, posted_on: '2020-01-01', external_id: 'novo', intent_key: 'novo-novo-1', account_id: 'x' }],
  ['PATCH', '/transactions/nope', { merchant: 'x' }],
  ['PATCH', `/transactions/${LONG}`, { merchant: 'x' }],
  ['PATCH', '/transactions/7.0', { note: 'achado' }],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01'],
  ['GET', '/transactions?from=2026-11-05&to=2026-11-06'],
  ['GET', '/transactions?from=2026-11-06&to=2026-11-05'],
  ['GET', '/transactions?from=bad&to=bad'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&account_id=acc-1'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&account_id=acc-1&account_id=acc-2'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&account_id[x]=1'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&category=Lazer'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&category=Lazer&category=Outros'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&q=mercado'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&q=EMPRESA'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&q=%25'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&q=_'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&q=pix%20env'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&q=a&q=b'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&q[x]=1'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&entity=pj'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&entity=PF'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&entity=all'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&entity=bad'],
  ['GET', '/transactions?from=2026-11-01&to=2026-11-30&entity=pj&q=empresa&category=Outros&account_id=acc-pj&limit=1'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=3'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=0'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=abc'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=-5'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=0.5'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=7.9'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=1e1'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=5&limit=6'],
  ['GET', '/transactions?from=2020-01-01&to=2030-01-01&limit=%20'],
];

for (const [name, script] of Object.entries({ debts: DEBTS, pay: PAY, intent: INTENT, transactions: TX })) {
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

test('finanças (extrato com volume): limite padrão 200, teto 1000, período padrão de 30 dias', { timeout: 300000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  const script = [];
  for (let i = 0; i < 1010; i += 1) {
    script.push(['POST', '/transactions', { amount: -((i % 97) + 1) - (i % 4) / 4, posted_on: daysAgo(i % 9), merchant: `Loja ${i % 13}`, id: `v-${String(i).padStart(4, '0')}`, account_id: i % 5 === 0 ? 'acc-pj' : null, category: ['Outros', 'Mercado', 'Lazer'][i % 3] }]);
  }
  script.unshift(['POST', '/accounts', { name: 'Empresa', id: 'acc-pj', entity: 'pj' }]);
  script.push(
    ['GET', '/transactions'],
    ['GET', `/transactions?from=${daysAgo(40)}&to=${daysAgo(0)}&limit=5000`],
    ['GET', `/transactions?from=${daysAgo(40)}&to=${daysAgo(0)}&limit=1000`],
    ['GET', `/transactions?from=${daysAgo(40)}&to=${daysAgo(0)}&limit=-1`],
    ['GET', `/transactions?from=${daysAgo(40)}&to=${daysAgo(0)}&entity=pj`],
    ['GET', `/transactions?from=${daysAgo(40)}&to=${daysAgo(0)}&entity=pf&category=Lazer&q=loja%201&limit=250`],
    ['GET', `/transactions?from=${daysAgo(3)}&to=${daysAgo(1)}&limit=999`],
  );
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await runFinanceScript(oracle, script, { pauseMs: 1 });
  const tail = expected.slice(-7);
  assert.equal(JSON.parse(tail[0].body).length, 200, 'padrão 200');
  assert.equal(JSON.parse(tail[1].body).length, 1000, 'teto 1000');
  assert.equal(JSON.parse(tail[3].body).length, 1010, 'limite negativo = sem limite');
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await runFinanceScript(app, script, { pauseMs: 1 });
    for (let i = 0; i < script.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
  }
  t.diagnostic(`passos=${script.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('finanças: a mesma chave em pedidos simultâneos grava uma baixa e um lançamento só', { timeout: 120000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const kind of ['oracle', ...parityEngines()]) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    await runFinanceScript(app, [['POST', '/debts', { title: 'Cartão', id: 'cc', balance: 1000, kind: 'card' }]]);
    const post = (path, body) => fetch(app.base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'corrida-0001' }, body: JSON.stringify(body) }).then(async (res) => ({ status: res.status, body: await res.json() }));
    const pays = await Promise.all(Array.from({ length: 6 }, () => post('/debts/cc/pay', { amount: 100 })));
    assert.deepEqual(pays.map((r) => r.status), Array(6).fill(200), `${kind}: baixas`);
    assert.equal(pays.filter((r) => !r.body.replayed).length, 1, `${kind}: uma só baixa nova`);
    assert.equal(new Set(pays.map((r) => r.body.payment.id)).size, 1, `${kind}: mesma baixa devolvida`);
    const txs = await Promise.all(Array.from({ length: 6 }, () => post('/transactions', { amount: 7 })));
    assert.equal(txs.filter((r) => r.status === 201).length, 1, `${kind}: um só lançamento criado`);
    assert.equal(txs.filter((r) => r.status === 200 && r.body.replayed === true).length, 5, `${kind}: o resto é reenvio`);
    const [debts] = await runFinanceScript(app, [['GET', '/debts']]);
    assert.equal(JSON.parse(debts.body)[0].balance, 900, `${kind}: saldo baixou uma vez só`);
  }
});

test('finanças: diferença intencional da meta ligada à dívida (centavos exatos, sem ruído de ponto flutuante)', { timeout: 120000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  // 3.44 + 0.01 + 2.41 chega exatamente a 5.86 em centavos, mas em ponto flutuante dá 5.859999999999999.
  const script = [
    ['POST', '/debts', { title: 'Cartão', id: 'cc', balance: 5.86, kind: 'card' }],
    ['POST', '/goals', { title: 'Meta', id: 'g', target_amount: 5.86, current_amount: 3.44, debt_id: 'cc' }],
    ['POST', '/debts/cc/pay', { amount: 0.01 }],
    ['POST', '/debts/cc/pay', { amount: 2.41 }],
    ['GET', '/goals'],
    ['GET', '/debts'],
  ];
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await runFinanceScript(oracle, script);
  const goalOf = (step) => JSON.parse(step.body)[0];
  assert.equal(oracle.db.prepare('SELECT current_amount FROM finance_goals').get().current_amount, 5.859999999999999, 'antiga gravou o ruído');
  assert.equal(goalOf(expected[4]).status, 'active', 'antiga deixou a meta aberta');
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await runFinanceScript(app, script);
    for (const i of [0, 1, 2, 3, 5]) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
    assert.deepEqual({ ...goalOf(actual[4]), status: 'x' }, { ...goalOf(expected[4]), status: 'x' }, `${kind}: meta igual, fora o status`);
    assert.equal(goalOf(actual[4]).status, 'done', `${kind}: a meta fecha quando a soma em centavos alcança o alvo`);
    assert.equal((await app.as(() => app.storage.financeGoals.get('g'))).current_amount, 5.86, `${kind}: valor gravado em centavos exatos`);
  }
});

test('finanças: valor acima do que cabe em centavos inteiros é recusado nos dois motores novos (a antiga gravava)', { timeout: 120000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  const huge = [['POST', '/debts', { title: 'Absurda', id: 'x', balance: 1e20 }], ['POST', '/transactions', { amount: 1e20 }], ['GET', '/debts']];
  const oracle = await makeFinanceParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await runFinanceScript(oracle, huge);
  assert.deepEqual(expected.map((r) => r.status), [201, 201, 200]);
  for (const kind of parityEngines()) {
    const app = await makeFinanceParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await runFinanceScript(app, huge);
    assert.equal(actual[0].status, 500, `${kind}: dívida`);
    assert.equal(actual[1].status, 500, `${kind}: lançamento`);
    assert.match(actual[0].body + actual[1].body, /sqlite_coercion_unsupported|fractional_cent_or_overflow|invalid_money/);
    assert.equal(JSON.parse(actual[2].body).length, 0, `${kind}: nada gravado`);
  }
});
