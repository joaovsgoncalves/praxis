import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestJson } from './test-support/helpers.mjs';
import { parityEngines } from './test-support/httpParity.mjs';
import { mountProjectsEngine } from './test-support/projectsFixture.fase4.mjs';

// Dois escritores na mesma frente (Alfred pela API, Sêneca direto no banco): quem leu uma revisão
// velha não pode apagar a escrita do outro sem saber.
// Arnês: rota nova sobre a camada assíncrona em cada motor. `directWrite` é o escritor de fora da API.
async function mount(t, kind) {
  const { server, directWrite } = await mountProjectsEngine(t, kind, { getLocalDateString: () => '2026-11-15' });
  const rows = await requestJson(server.base, '/api/projects');
  const slug = [...rows].sort((a, b) => a.sort_order - b.sort_order)[0].slug;
  return { server, slug, directWrite };
}

async function send(base, path, method, body) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const guidance = (extra = {}) => ({
  source: 'alfred',
  generated_at: '2026-11-15T07:50:00-03:00',
  summary: 'dia de prova',
  priorities: [{ rank: 1, action: 'revisar farmacologia', reason_code: 'academic', reason: 'prova amanhã' }],
  ...extra,
});

for (const kind of parityEngines()) {
  test(`${kind}: cada escrita sobe a revisão, inclusive escrita direta no banco`, async (t) => {
    const { server, slug, directWrite } = await mount(t, kind);
    const r0 = (await requestJson(server.base, `/api/projects/${slug}`)).revision;
    const after = await requestJson(server.base, `/api/projects/${slug}`, { method: 'PATCH', body: { next_step: 'passo A' } });
    assert.equal(after.revision, r0 + 1);
    await directWrite(slug, { next_step: 'passo do Sêneca' });
    assert.equal((await requestJson(server.base, `/api/projects/${slug}`)).revision, r0 + 2);
  });

  test(`${kind}: expected_revision certo grava; revisão velha é recusada com 409 e nada muda`, async (t) => {
    const { server, slug, directWrite } = await mount(t, kind);
    const read = await requestJson(server.base, `/api/projects/${slug}`);
    const ok = await send(server.base, `/api/projects/${slug}`, 'PATCH', { next_step: 'passo do Alfred', expected_revision: read.revision });
    assert.equal(ok.status, 200);
    // Sêneca escreve depois da leitura do Alfred
    await directWrite(slug, { next_step: 'passo do Sêneca' });
    const stale = await send(server.base, `/api/projects/${slug}`, 'PATCH', { next_step: 'sobrescrita', expected_revision: ok.body.revision });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'REVISION_CHANGED');
    assert.equal(stale.body.current_revision, ok.body.revision + 1);
    assert.equal((await requestJson(server.base, `/api/projects/${slug}`)).next_step, 'passo do Sêneca');
  });

  test(`${kind}: sem expected_revision continua funcionando como antes; revision não é editável`, async (t) => {
    const { server, slug } = await mount(t, kind);
    const r0 = (await requestJson(server.base, `/api/projects/${slug}`)).revision;
    const res = await send(server.base, `/api/projects/${slug}`, 'PATCH', { status_summary: 'ok', revision: 999 });
    assert.equal(res.status, 200);
    assert.equal(res.body.revision, r0 + 1);
    const bad = await send(server.base, `/api/projects/${slug}`, 'PATCH', { status_summary: 'x', expected_revision: 'abc' });
    assert.equal(bad.status, 400);
  });

}

// Orientação do dia ainda no banco legado nesta etapa (o domínio 3 da fase 4 leva para os dois motores).
for (const kind of ['sqlite']) {
  test(`${kind}: orientação do dia: grava com expected null, depois exige o generated_at lido`, async (t) => {
    const { server } = await mount(t, kind);
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

  test(`${kind}: orientação do dia: mesmas recusas do script do Sêneca`, async (t) => {
    const { server } = await mount(t, kind);
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
}
