import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createProjectsRouter } from './routes/projects.js';
import { seedProjectsIfEmpty } from './projects.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

const SEED_SLUGS = ['carteirazap', 'catalogozap', 'encartezap', 'praxis'];

async function mountProjects(t, { seed = true } = {}) {
  const db = createTestDb({ withProjects: true });
  if (seed) seedProjectsIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectsRouter({ db }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  return { db, server };
}

test('seed creates exactly the 4 product slugs and second seed does not duplicate', async (t) => {
  const db = createTestDb({ withProjects: true });
  t.after(() => db.close());

  const first = seedProjectsIfEmpty(db);
  assert.equal(first.inserted, 4);
  const second = seedProjectsIfEmpty(db);
  assert.equal(second.inserted, 0);
  assert.equal(second.seeded, false);

  const rows = db.prepare('SELECT slug FROM projects ORDER BY slug').all();
  assert.deepEqual(rows.map((r) => r.slug), SEED_SLUGS);
});

test('GET /api/projects after seed has 4 cards, praxis focused+andando, encartezap parado', async (t) => {
  const { server } = await mountProjects(t);
  const list = await requestJson(server.base, '/api/projects');
  assert.equal(list.length, 4);

  const bySlug = Object.fromEntries(list.map((p) => [p.slug, p]));
  assert.equal(bySlug.praxis.focus, 1);
  assert.equal(bySlug.praxis.column, 'andando');
  assert.equal(bySlug.praxis.current_slice, 'Jota Fit sessão academia');
  assert.equal(bySlug.encartezap.focus, 0);
  assert.equal(bySlug.encartezap.column, 'parado');
  assert.equal(bySlug.encartezap.current_slice, 'pausa consciente');
  assert.equal(bySlug.catalogozap.column, 'radar');
  assert.equal(bySlug.carteirazap.column, 'radar');

  for (const row of list) {
    assert.ok('focus' in row);
    assert.ok('column' in row);
    assert.ok('current_slice' in row);
  }
});

test('PATCH column persists', async (t) => {
  const { server } = await mountProjects(t);
  const patched = await requestJson(server.base, '/api/projects/carteirazap', {
    method: 'PATCH',
    body: { column: 'andando' },
  });
  assert.equal(patched.slug, 'carteirazap');
  assert.equal(patched.column, 'andando');

  const again = await requestJson(server.base, '/api/projects');
  const row = again.find((p) => p.slug === 'carteirazap');
  assert.equal(row.column, 'andando');

  const one = await requestJson(server.base, '/api/projects/carteirazap');
  assert.equal(one.column, 'andando');
});

test('two focus pins ok; third focus returns 409 FOCUS_LIMIT', async (t) => {
  const { server } = await mountProjects(t);

  const second = await requestJson(server.base, '/api/projects/catalogozap', {
    method: 'PATCH',
    body: { focus: 1 },
  });
  assert.equal(second.focus, 1);

  const list = await requestJson(server.base, '/api/projects');
  const focused = list.filter((p) => p.focus === 1);
  assert.equal(focused.length, 2);
  assert.ok(focused.some((p) => p.slug === 'praxis'));
  assert.ok(focused.some((p) => p.slug === 'catalogozap'));

  const res = await fetch(`${server.base}/api/projects/encartezap`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ focus: 1 }),
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, 'FOCUS_LIMIT');

  const after = await requestJson(server.base, '/api/projects');
  const still = after.filter((p) => p.focus === 1);
  assert.equal(still.length, 2);
  assert.equal(after.find((p) => p.slug === 'encartezap').focus, 0);
});
