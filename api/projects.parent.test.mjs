import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createProjectsRouter } from './routes/projects.js';
import { seedProjectsIfEmpty } from './projects.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

async function mountProjects(t) {
  const db = createTestDb({ withProjects: true });
  seedProjectsIfEmpty(db);
  // Num banco novo a migração da Animália roda antes do seed; em produção ela já está na GoFluxo.
  db.exec("UPDATE projects SET parent_slug = 'gofluxo' WHERE slug = 'animalia'");
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

async function send(base, path, method, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('POST cria frente-mãe e filha com parent_slug', async (t) => {
  const { server } = await mountProjects(t);
  const mae = await requestJson(server.base, '/api/projects', {
    method: 'POST',
    body: { slug: 'varejo-ia', name: 'Varejo farmacêutico com IA', kind: 'produto', column: 'andando' },
  });
  assert.equal(mae.parent_slug, '');

  const filha = await requestJson(server.base, '/api/projects', {
    method: 'POST',
    body: { slug: 'farmagente', name: 'FarmAgente', kind: 'produto', parent_slug: ' Varejo-IA ' },
  });
  assert.equal(filha.parent_slug, 'varejo-ia');
});

test('PATCH define, troca e limpa a frente-mãe', async (t) => {
  const { server } = await mountProjects(t);
  await requestJson(server.base, '/api/projects', {
    method: 'POST',
    body: { slug: 'varejo-ia', name: 'Varejo farmacêutico com IA' },
  });

  const moved = await requestJson(server.base, '/api/projects/catalogozap', {
    method: 'PATCH',
    body: { parent_slug: 'varejo-ia' },
  });
  assert.equal(moved.parent_slug, 'varejo-ia');

  const cleared = await requestJson(server.base, '/api/projects/catalogozap', {
    method: 'PATCH',
    body: { parent_slug: '' },
  });
  assert.equal(cleared.parent_slug, '');

  // Editar outro campo não mexe na mãe.
  const untouched = await requestJson(server.base, '/api/projects/animalia', {
    method: 'PATCH',
    body: { next_step: 'Revisar fluxo com a clínica' },
  });
  assert.equal(untouched.parent_slug, 'gofluxo');
});

test('kind pessoal é aceito em POST e PATCH', async (t) => {
  const { server } = await mountProjects(t);
  const created = await requestJson(server.base, '/api/projects', {
    method: 'POST',
    body: { slug: 'jota-fit', name: 'Jota Fit', kind: 'pessoal' },
  });
  assert.equal(created.kind, 'pessoal');

  const patched = await requestJson(server.base, '/api/projects/site-pessoal', {
    method: 'PATCH',
    body: { kind: 'pessoal' },
  });
  assert.equal(patched.kind, 'pessoal');
});

test('mãe inexistente responde 400', async (t) => {
  const { server } = await mountProjects(t);
  const patch = await send(server.base, '/api/projects/catalogozap', 'PATCH', { parent_slug: 'nao-existe' });
  assert.equal(patch.status, 400);
  assert.match(patch.body.error, /não encontrada/);

  const post = await send(server.base, '/api/projects', 'POST', {
    slug: 'nova', name: 'Nova', parent_slug: 'nao-existe',
  });
  assert.equal(post.status, 400);
});

test('frente não pode ser mãe dela mesma', async (t) => {
  const { server } = await mountProjects(t);
  const res = await send(server.base, '/api/projects/praxis', 'PATCH', { parent_slug: 'praxis' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /mesma/);
});

test('filha não pode ser mãe (profundidade máxima 1)', async (t) => {
  const { server } = await mountProjects(t);
  // Animália já é filha da GoFluxo.
  const res = await send(server.base, '/api/projects/catalogozap', 'PATCH', { parent_slug: 'animalia' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /não pode ter filhas/);

  const post = await send(server.base, '/api/projects', 'POST', {
    slug: 'neta', name: 'Neta', parent_slug: 'animalia',
  });
  assert.equal(post.status, 400);
});

test('mãe com filhas não pode virar filha', async (t) => {
  const { server } = await mountProjects(t);
  const res = await send(server.base, '/api/projects/gofluxo', 'PATCH', { parent_slug: 'praxis' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /tem filhas/);
});

test('ciclo entre duas frentes é recusado', async (t) => {
  const { server } = await mountProjects(t);
  await requestJson(server.base, '/api/projects/encartezap', {
    method: 'PATCH',
    body: { parent_slug: 'catalogozap' },
  });
  const res = await send(server.base, '/api/projects/catalogozap', 'PATCH', { parent_slug: 'encartezap' });
  assert.equal(res.status, 400);

  const after = await requestJson(server.base, '/api/projects/catalogozap');
  assert.equal(after.parent_slug, '');
});

test('PATCH com mãe inválida não aplica a troca de coluna junto', async (t) => {
  const { server } = await mountProjects(t);
  const res = await send(server.base, '/api/projects/catalogozap', 'PATCH', {
    column: 'pausado',
    parent_slug: 'nao-existe',
  });
  assert.equal(res.status, 400);

  const after = await requestJson(server.base, '/api/projects/catalogozap');
  assert.equal(after.column, 'radar');
  const updates = await requestJson(server.base, '/api/projects/catalogozap/updates');
  assert.equal(updates.length, 0);
});
