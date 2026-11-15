import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createProjectsRouter } from './routes/projects.js';
import { seedProjectsIfEmpty } from './projects.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

// Dois escritores na mesma frente (Alfred pela API, Sêneca direto no banco): quem leu uma revisão
// velha não pode apagar a escrita do outro sem saber.
async function mount(t) {
  const db = createTestDb({ withProjects: true });
  seedProjectsIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectsRouter({ db, getLocalDateString: () => '2026-11-15' }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  const slug = db.prepare('SELECT slug FROM projects ORDER BY sort_order LIMIT 1').get().slug;
  return { db, server, slug };
}

async function send(base, path, method, body) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test('cada escrita sobe a revisão, inclusive escrita direta no banco', async (t) => {
  const { db, server, slug } = await mount(t);
  const r0 = (await requestJson(server.base, `/api/projects/${slug}`)).revision;
  const after = await requestJson(server.base, `/api/projects/${slug}`, { method: 'PATCH', body: { next_step: 'passo A' } });
  assert.equal(after.revision, r0 + 1);
  db.prepare("UPDATE projects SET next_step = 'passo do Sêneca' WHERE slug = ?").run(slug);
  assert.equal((await requestJson(server.base, `/api/projects/${slug}`)).revision, r0 + 2);
});

test('expected_revision certo grava; revisão velha é recusada com 409 e nada muda', async (t) => {
  const { db, server, slug } = await mount(t);
  const read = await requestJson(server.base, `/api/projects/${slug}`);
  const ok = await send(server.base, `/api/projects/${slug}`, 'PATCH', { next_step: 'passo do Alfred', expected_revision: read.revision });
  assert.equal(ok.status, 200);
  // Sêneca escreve depois da leitura do Alfred
  db.prepare("UPDATE projects SET next_step = 'passo do Sêneca' WHERE slug = ?").run(slug);
  const stale = await send(server.base, `/api/projects/${slug}`, 'PATCH', { next_step: 'sobrescrita', expected_revision: ok.body.revision });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'REVISION_CHANGED');
  assert.equal(stale.body.current_revision, ok.body.revision + 1);
  assert.equal((await requestJson(server.base, `/api/projects/${slug}`)).next_step, 'passo do Sêneca');
});

test('sem expected_revision continua funcionando como antes; revision não é editável', async (t) => {
  const { server, slug } = await mount(t);
  const r0 = (await requestJson(server.base, `/api/projects/${slug}`)).revision;
  const res = await send(server.base, `/api/projects/${slug}`, 'PATCH', { status_summary: 'ok', revision: 999 });
  assert.equal(res.status, 200);
  assert.equal(res.body.revision, r0 + 1);
  const bad = await send(server.base, `/api/projects/${slug}`, 'PATCH', { status_summary: 'x', expected_revision: 'abc' });
  assert.equal(bad.status, 400);
});

const guidance = (extra = {}) => ({
  source: 'alfred',
  generated_at: '2026-11-15T07:50:00-03:00',
  summary: 'dia de prova',
  priorities: [{ rank: 1, action: 'revisar farmacologia', reason_code: 'academic', reason: 'prova amanhã' }],
  ...extra,
});

test('orientação do dia: grava com expected null, depois exige o generated_at lido', async (t) => {
  const { server } = await mount(t);
  const first = await send(server.base, '/api/projects/guidance/2026-11-15', 'PUT', guidance({ expected_generated_at: null }));
  assert.equal(first.status, 200);
  assert.equal(first.body.priorities.length, 1);

  const blind = await send(server.base, '/api/projects/guidance/2026-11-15', 'PUT', guidance({ expected_generated_at: null, summary: 'outra' }));
  assert.equal(blind.status, 409);
  assert.equal(blind.body.error, 'GUIDANCE_CHANGED');
  assert.equal(blind.body.current_generated_at, '2026-11-15T07:50:00-03:00');

  const update = await send(server.base, '/api/projects/guidance/2026-11-15', 'PUT',
    guidance({ expected_generated_at: '2026-11-15T07:50:00-03:00', generated_at: '2026-11-15T13:50:00-03:00', summary: 'tarde' }));
  assert.equal(update.status, 200);
  assert.equal(update.body.summary, 'tarde');
});

test('orientação do dia: mesmas recusas do script do Sêneca', async (t) => {
  const { server } = await mount(t);
  const url = '/api/projects/guidance/2026-11-15';
  const cases = [
    [{ ...guidance({ expected_generated_at: null }), extra: 1 }, /campos não permitidos/],
    [guidance(), /expected_generated_at obrigatório/],
    [guidance({ expected_generated_at: null, source: '' }), /source obrigatório/],
    [guidance({ expected_generated_at: null, date: '2026-11-16' }), /difere da URL/],
    [guidance({ expected_generated_at: null, generated_at: '2026-11-15T07:50:00' }), /generated_at/],
    [guidance({ expected_generated_at: null, priorities: [{ rank: 1, action: 'a', reason_code: 'inventado', reason: 'b' }] }), /reason_code/],
    [guidance({ expected_generated_at: null, priorities: [1, 2, 3, 4].map((rank) => ({ rank, action: 'a', reason_code: 'manual', reason: 'b' })) }), /maximum length/],
    [guidance({ expected_generated_at: null, priorities: [{ rank: 1, action: 'a', reason_code: 'manual', reason: 'b', foco: true }] }), /prioridade/],
  ];
  for (const [body, pattern] of cases) {
    const res = await send(server.base, url, 'PUT', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.error, pattern);
  }
  const g = await requestJson(server.base, '/api/projects/guidance/today');
  assert.equal(g.priorities.length, 0, 'nada gravado');
});
