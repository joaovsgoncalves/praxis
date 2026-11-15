/**
 * Paridade HTTP das revisões semanais: rota antiga congelada (oráculo, SQLite síncrono) contra a rota
 * nova sobre a camada assíncrona, em SQLite e no emulador Firestore. Mesma sequência, mesmo status,
 * mesmo tipo e mesmo corpo; só id aleatório e carimbo de hora são normalizados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createWeeklyReviewsRouter as createOracleRouter } from './test-support/oracles/weeklyReviews.bcbadad.js';
import { createWeeklyReviewsRouter } from './routes/weeklyReviews.js';
import { createWeeklyReviewsService } from './services/weeklyReviews.js';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';

const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

async function listen(router, scopeMiddleware) {
  const app = express();
  app.use(express.json());
  if (scopeMiddleware) app.use(scopeMiddleware);
  app.use('/api/weekly-reviews', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}/api/weekly-reviews`, close: () => new Promise((r) => server.close(r)) };
}

async function makeApp(kind) {
  const cleanup = [];
  if (kind === 'oracle') {
    const db = createTestDb();
    cleanup.push(() => db.close());
    return { ...(await listen(createOracleRouter({ db }))), cleanup };
  }
  const scope = new AsyncLocalStorage();
  let driver;
  if (kind === 'sqlite') {
    const db = createTestDb();
    cleanup.push(() => db.close());
    driver = createSqliteDriver({ open: () => db });
  } else {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    const client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    cleanup.push(() => client.terminate());
    driver = createFirestoreDriver({ client, root: client.collection('parityRuns').doc(randomUUID()) });
  }
  const storage = createStorage({ driver, currentOwner: () => scope.getStore() });
  const router = createWeeklyReviewsRouter({ weeklyReviews: createWeeklyReviewsService({ storage }) });
  return { ...(await listen(router, (req, res, next) => scope.run('alice', next))), cleanup };
}

function normalizer() {
  const ids = new Map();
  const label = (id) => { if (!ids.has(id)) ids.set(id, `#${ids.size + 1}`); return ids.get(id); };
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (key === 'id' && typeof item === 'string') return [key, label(item)];
        if ((key === 'created_date' || key === 'updated_date') && typeof item === 'string') {
          assert.match(item, STAMP);
          return [key, 'STAMP'];
        }
        return [key, walk(item)];
      }));
    }
    return value;
  };
  return { walk, ids };
}

async function run(app, steps) {
  const norm = normalizer(), seen = [], out = [];
  for (const step of steps) {
    const [method, path, body, raw] = typeof step === 'function' ? step(seen) : step;
    const res = await fetch(app.base + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const type = (res.headers.get('content-type') || '').split(';')[0];
    const text = await res.text();
    let shown;
    if (type === 'application/json') {
      const parsed = JSON.parse(text);
      for (const row of [parsed, parsed?.review, ...(Array.isArray(parsed) ? parsed : [])]) if (row?.id && !seen.includes(row.id)) seen.push(row.id);
      // Chaves na mesma ordem: o corpo sai igual byte a byte, não só equivalente.
      shown = JSON.stringify(norm.walk(parsed));
    } else {
      shown = (text.match(/<pre>([^<]*)/) || [null, text])[1];
    }
    out.push({ step: typeof step === 'function' ? `${method} <id de uma linha anterior>` : `${method} ${path.slice(0, 80)}`, status: res.status, type, body: shown });
  }
  return out;
}

const SCRIPT = [
  ['GET', ''],
  ['GET', '/current?date=2026-11-13'],
  ['POST', '', { week_start: '2026-11-11', highlights: 'Primeira', overall_score: 4 }],
  ['POST', '', { week_start: '2026-11-04', overall_score: '4', highlights: 5, blockers: 1.5, learnings: null }],
  ['POST', '', { week_start: '2026-10-28', overall_score: 4.5, next_week_focus: 'Ação 😀' }],
  ['POST', '', { week_start: '2026-10-21', overall_score: 'abc', highlights: [1] }],
  ['POST', '', { week_start: '2026-10-14', overall_score: ' 3 ' }],
  ['POST', '', { week_start: '2026-10-14', overall_score: true }],
  ['POST', '', { week_start: '2026-10-07', highlights: { a: 1 } }],
  ['POST', '', { week_start: '2026-09-30', highlights: {}, blockers: {} }],
  ['POST', '', { week_start: '2026-09-23', highlights: [true] }],
  ['POST', '', { week_start: '2026-09-16', highlights: [[1]] }],
  ['POST', '', { week_start: 'lixo' }],
  ['POST', '', { week_start: '2026-11-12', overall_score: null, learnings: 'troca' }],
  ['POST', '', { week_start: '2026-11-09', highlights: 'Substitui tudo' }],
  ['POST', '', '"x"', true],
  ['POST', '', '{"week_start":', true],
  ['GET', '/current?date=2026-11-13'],
  ['GET', '/current?date=2026-11-01'],
  ['GET', '/current?date=lixo'],
  ['GET', '/current?date=2026-11-13&date=x'],
  // Mais de 52 semanas, para o teto do limite aparecer de verdade.
  ...Array.from({ length: 55 }, (_, i) => ['POST', '', { week_start: new Date(Date.UTC(2025, 0, 6 + 7 * i)).toISOString().slice(0, 10), learnings: `semana ${i}` }]),
  ...['-1', '0', '2', '1.5', 'abc', '100', '1e0', '%202', '2&limit=3', '-0', '52', '53'].map((limit) => ['GET', `?limit=${limit}`]),
  (seen) => ['DELETE', `/${seen[1]}`],
  ['DELETE', '/nao-existe'],
  ['DELETE', `/${'x'.repeat(1600)}`],
  ['GET', '?limit=-1'],
  ['GET', '/current?date=2026-11-06'],
];

const kinds = ['sqlite', ...(process.env.FIRESTORE_EMULATOR_HOST ? ['firestore'] : [])];

test('rota nova responde igual à rota antiga, passo a passo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeApp('oracle');
  t.after(async () => { await oracle.close(); for (const fn of oracle.cleanup) await fn(); });
  const expected = await run(oracle, SCRIPT);
  assert.ok(expected.some((r) => r.status === 500) && expected.some((r) => r.status === 201) && expected.some((r) => r.status === 400));
  for (const kind of kinds) {
    const app = await makeApp(kind);
    t.after(async () => { await app.close(); for (const fn of app.cleanup) await fn(); });
    const actual = await run(app, SCRIPT);
    for (let i = 0; i < SCRIPT.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=${['oráculo', ...kinds].join(',')}`);
});

test('diferença intencional: parâmetros deslocados por lista viram erro explícito', async (t) => {
  t.mock.method(console, 'error', () => {});
  const shifted = { week_start: '2026-11-09', highlights: [1, 2], blockers: [] };
  const oracle = await makeApp('oracle');
  t.after(async () => { await oracle.close(); for (const fn of oracle.cleanup) await fn(); });
  const [old] = await run(oracle, [['POST', '', shifted]]);
  assert.equal(old.status, 201, 'a rota antiga gravava em silêncio');
  assert.match(old.body, /"highlights":"1.0","blockers":"2.0"/, 'com os valores fora de lugar');
  for (const kind of kinds) {
    const app = await makeApp(kind);
    t.after(async () => { await app.close(); for (const fn of app.cleanup) await fn(); });
    const [now, after] = await run(app, [['POST', '', shifted], ['GET', '?limit=-1']]);
    assert.equal(now.status, 500, kind);
    assert.match(now.body, /sqlite_coercion_unsupported/);
    assert.equal(after.body, '[]', `${kind}: nada gravado`);
  }
});

test('salvar a mesma semana ao mesmo tempo: um cria, os outros atualizam, uma linha só', async (t) => {
  for (const kind of kinds) {
    const app = await makeApp(kind);
    t.after(async () => { await app.close(); for (const fn of app.cleanup) await fn(); });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => fetch(app.base, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ week_start: '2026-11-11', highlights: `versão ${i}` }),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 201], kind);
    assert.equal(new Set(results.map((r) => r.body.id)).size, 1, `${kind}: todas na mesma revisão`);
    const rows = await (await fetch(`${app.base}?limit=-1`)).json();
    assert.equal(rows.length, 1, kind);
    assert.ok(results.some((r) => r.body.highlights === rows[0].highlights), `${kind}: a gravada é uma das enviadas`);
  }
});
