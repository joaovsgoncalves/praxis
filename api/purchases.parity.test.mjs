/**
 * Paridade HTTP de compras/desejos: rota antiga congelada × rota nova (SQLite e emulador Firestore).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurchasesRouter as createOracleRouter } from './test-support/oracles/purchases.bcbadad.js';
import { createPurchasesRouter } from './routes/purchases.js';
import { createPurchasesService } from './services/purchases.js';
import { makeParityApp, parityEngines, runParityScript } from './test-support/httpParity.mjs';

const setup = {
  mount: '/api/purchases',
  dbOptions: { withPurchases: true },
  oracle: (db) => createOracleRouter({ db }),
  build: (storage) => createPurchasesRouter({ purchases: createPurchasesService({ storage }) }),
};

const SCRIPT = [
  ['GET', ''],
  ['POST', '', { title: '  Fone  ', horizon: 'short', price_estimate: 200 }],
  ['POST', '', { title: 'x', id: 'custom-1', status: 'paused', url: null, notes: { a: 1 } }],
  ['POST', '', { title: 'y', id: 'custom-1' }],
  ['POST', '', { title: 'z', id: 5 }],
  ['POST', '', { title: 'z2', id: 1.5 }],
  ['POST', '', { title: 'w', id: true }],
  ['POST', '', { title: 'v', id: [1] }],
  ['POST', '', { title: 'u', id: {} }],
  ['POST', '', { title: 't', id: ['a', 'b'] }],
  ['POST', '', { title: 's', id: '' }],
  ['POST', '', { title: 'r', id: 'a/b' }],
  ['POST', '', { title: 'q', id: '~bYS9i', horizon: 'long', status: 'bought' }],
  ['POST', '', { title: 'Ação 😀', id: '  ', horizon: 'nope', status: 'nope', notes: 0, url: false }],
  ['POST', '', { title: '   ' }],
  ['POST', '', []],
  ['POST', '', { title: 12 }],
  ['POST', '', '"x"', true],
  ...Array.from({ length: 6 }, (_, i) => ['POST', '', { title: `item ${i}`, horizon: ['short', 'medium', 'long'][i % 3], status: ['want', 'bought', 'paused'][i % 3] }]),
  ['GET', ''], ['GET', '?status=all'], ['GET', '?status=paused'], ['GET', '?status=bought'], ['GET', '?status=xyz'], ['GET', '?status='],
  ['GET', '?horizon=short'], ['GET', '?horizon=long&status=all'], ['GET', '?horizon=medium&status=want'], ['GET', '?horizon='],
  ['GET', '?status=a&status=b'], ['GET', '?status[x]=1'], ['GET', '?horizon=a&horizon=b'], ['GET', '?status=all&status=all'], ['GET', '?status[]=bought'],
  ['PATCH', '/custom-1', { title: null, notes: {}, horizon: 'bad', status: 'want', url: [1, 2] }],
  ['PATCH', '/custom-1', { title: '  Novo título ', horizon: 'long', status: 'paused', price_estimate: 99.9 }],
  ['PATCH', '/custom-1', []],
  ['PATCH', '/custom-1', {}],
  ['PATCH', '/5.0', { status: 'bought' }],
  ['PATCH', '/nope', { title: 'a' }],
  ['PATCH', `/${'x'.repeat(1600)}`, { title: 'a' }],
  ['GET', '?status=all'],
  // Apagar o de maior posição e criar outro: o SQLite reaproveita o número (MAX + 1).
  (seen) => ['DELETE', `/${seen[seen.length - 1]}`],
  ['POST', '', { title: 'depois de apagar o último' }],
  ['DELETE', '/custom-1'], ['DELETE', '/custom-1'], ['DELETE', '/nope'], ['DELETE', `/${'x'.repeat(1600)}`],
  ['DELETE', '/a%2Fb'],
  ['GET', '?status=all'],
];

test('compras: rota nova responde igual à rota antiga, passo a passo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await runParityScript(oracle, SCRIPT);
  for (const status of [200, 201, 204, 400, 404, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await runParityScript(app, SCRIPT);
    for (let i = 0; i < SCRIPT.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('compras: diferenças intencionais viram erro explícito, sem gravar', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeParityApp('oracle', setup);
  t.after(oracle.dispose);
  const old = await runParityScript(oracle, [
    ['POST', '', { title: 'base', status: 'bought' }],
    ['GET', '?status[x]=1&horizon=bought&horizon=medium'],
    ['POST', '', { title: 'id longo', id: 'x'.repeat(1600) }],
  ]);
  assert.equal(old[1].status, 200, 'antiga: filtro deslocado respondia como se status=bought, horizon=medium');
  assert.equal(old[2].status, 201, 'antiga: aceitava id de 1600 bytes');
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    const now = await runParityScript(app, [
      ['POST', '', { title: 'base', status: 'bought' }],
      ['GET', '?status[x]=1&horizon=bought&horizon=medium'],
      ['POST', '', { title: 'id longo', id: 'x'.repeat(1600) }],
      ['GET', '?status=all'],
    ]);
    assert.equal(now[1].status, 500, kind); assert.match(now[1].body, /sqlite_coercion_unsupported/);
    assert.equal(now[2].status, 500, kind); assert.match(now[2].body, /invalid_record_id/);
    assert.equal(JSON.parse(now[3].body).length, 1, `${kind}: só a linha base`);
  }
});

test('compras: criações simultâneas não repetem posição', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    const created = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(app.base, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `corrida ${i}` }),
    }).then(async (res) => { assert.equal(res.status, 201, kind); return res.json(); })));
    assert.deepEqual(created.map((row) => row.sort_order).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8], kind);
    const listed = await (await fetch(`${app.base}?status=all`)).json();
    assert.deepEqual(listed.map((row) => row.sort_order), [1, 2, 3, 4, 5, 6, 7, 8], `${kind}: lista na ordem de posição`);
  }
});
