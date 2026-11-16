import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedProjectsIfEmpty } from './projects.js';
import { requestJson } from './test-support/helpers.mjs';
import { parityEngines } from './test-support/httpParity.mjs';
import { mountProjectsEngine } from './test-support/projectsFixture.fase4.mjs';

// Arnês: rota nova sobre a camada assíncrona em cada motor; semente = preparo do banco legado.
async function mountProjects(t, kind) {
  return mountProjectsEngine(t, kind, {
    seed: (db) => {
      seedProjectsIfEmpty(db);
      // Num banco novo a migração da Animália roda antes do seed; em produção ela já está na GoFluxo.
      db.exec("UPDATE projects SET parent_slug = 'gofluxo' WHERE slug = 'animalia'");
    },
  });
}

async function send(base, path, method, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

for (const kind of parityEngines()) {
  test(`${kind}: POST cria frente-mãe e filha com parent_slug`, async (t) => {
    const { server } = await mountProjects(t, kind);
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

  test(`${kind}: PATCH define, troca e limpa a frente-mãe`, async (t) => {
    const { server } = await mountProjects(t, kind);
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

  test(`${kind}: kind pessoal é aceito em POST e PATCH`, async (t) => {
    const { server } = await mountProjects(t, kind);
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

  test(`${kind}: mãe inexistente responde 400`, async (t) => {
    const { server } = await mountProjects(t, kind);
    const patch = await send(server.base, '/api/projects/catalogozap', 'PATCH', { parent_slug: 'nao-existe' });
    assert.equal(patch.status, 400);
    assert.match(patch.body.error, /não encontrada/);

    const post = await send(server.base, '/api/projects', 'POST', {
      slug: 'nova', name: 'Nova', parent_slug: 'nao-existe',
    });
    assert.equal(post.status, 400);
  });

  test(`${kind}: frente não pode ser mãe dela mesma`, async (t) => {
    const { server } = await mountProjects(t, kind);
    const res = await send(server.base, '/api/projects/praxis', 'PATCH', { parent_slug: 'praxis' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /mesma/);
  });

  test(`${kind}: filha não pode ser mãe (profundidade máxima 1)`, async (t) => {
    const { server } = await mountProjects(t, kind);
    // Animália já é filha da GoFluxo.
    const res = await send(server.base, '/api/projects/catalogozap', 'PATCH', { parent_slug: 'animalia' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /não pode ter filhas/);

    const post = await send(server.base, '/api/projects', 'POST', {
      slug: 'neta', name: 'Neta', parent_slug: 'animalia',
    });
    assert.equal(post.status, 400);
  });

  test(`${kind}: mãe com filhas não pode virar filha`, async (t) => {
    const { server } = await mountProjects(t, kind);
    const res = await send(server.base, '/api/projects/gofluxo', 'PATCH', { parent_slug: 'praxis' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /tem filhas/);
  });

  test(`${kind}: ciclo entre duas frentes é recusado`, async (t) => {
    const { server } = await mountProjects(t, kind);
    await requestJson(server.base, '/api/projects/encartezap', {
      method: 'PATCH',
      body: { parent_slug: 'catalogozap' },
    });
    const res = await send(server.base, '/api/projects/catalogozap', 'PATCH', { parent_slug: 'encartezap' });
    assert.equal(res.status, 400);

    const after = await requestJson(server.base, '/api/projects/catalogozap');
    assert.equal(after.parent_slug, '');
  });

  test(`${kind}: PATCH com mãe inválida não aplica a troca de coluna junto`, async (t) => {
    const { server } = await mountProjects(t, kind);
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
}
