/**
 * Paridade HTTP de frentes: rota antiga congelada × rota nova (SQLite e emulador Firestore), com o
 * relógio de teste compartilhado (created_at entra na ordem da timeline) e a semente das 9 frentes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parityEngines, runParityScript } from './test-support/httpParity.mjs';
import { makeClockedParityApp } from './test-support/httpParity.fase4.mjs';
import { projectsSetup } from './test-support/projectsFixture.fase4.mjs';

const GET = (path) => ['GET', path];
const POST = (path, body, raw) => ['POST', path, body, raw];
const PATCH = (path, body, raw) => ['PATCH', path, body, raw];

const SCRIPT = [
  GET(''), GET('/praxis'), GET('/nope'), GET('/PRAXIS'),
  // Criar: validação, slug normalizado, foco limitado, posição, ligação do id.
  POST('', { slug: ' Nova-1 ', name: ' Nova ' }),
  POST('', { name: 'Sem slug' }), POST('', { slug: 'sem-nome' }), POST('', { slug: '-x', name: 'x' }), POST('', { slug: 'a'.repeat(64), name: 'x' }),
  POST('', { slug: 'a'.repeat(63), name: 'Longo' }), POST('', { slug: 'praxis', name: 'Dup' }), POST('', { slug: 'foco-3', name: 'F', focus: 1 }),
  POST('', { slug: 'tie-b', name: 'Mesmo', sort_order: 5 }), POST('', { slug: 'tie-a', name: 'Mesmo', sort_order: 5 }), POST('', { slug: 'tie-c', name: 'Mesmo', sort_order: '5' }),
  POST('', { slug: 'sort-txt', name: 'S', sort_order: 'abc' }), POST('', { slug: 'sort-real', name: 'S', sort_order: 1.5 }), POST('', { slug: 'sort-bool', name: 'S', sort_order: true }),
  POST('', { slug: 'sort-arr', name: 'S', sort_order: [] }), POST('', { slug: 'sort-null', name: 'S', sort_order: null }), POST('', { slug: 'sort-neg', name: 'S', sort_order: -2 }),
  POST('', { slug: 'custom', name: 'C', id: 'custom-id' }), POST('', { slug: 'custom2', name: 'C', id: 'custom-id' }),
  POST('', { slug: 'num-id', name: 'N', id: 5 }), POST('', { slug: 'bool-id', name: 'B', id: true }), POST('', { slug: 'arr-id', name: 'A', id: ['lista'] }),
  POST('', { slug: 'obj-id', name: 'O', id: {} }), POST('', { slug: 'arr2-id', name: 'A', id: ['a', 'b'] }), POST('', { slug: 'empty-id', name: 'E', id: '' }),
  POST('', { slug: 'false-id', name: 'E', id: false }), POST('', { slug: 'zero-id', name: 'E', id: 0 }),
  // Id igual ao slug de outra: na leitura por chave o id vence.
  POST('', { slug: 'outra', name: 'Id de semente', id: 'praxis' }),
  POST('', { slug: 'chave-a', name: 'Dona do id', id: 'chave-b' }), POST('', { slug: 'chave-b', name: 'Dona do slug', id: 'chave-c' }),
  GET('/chave-b'), GET('/chave-c'), GET('/chave-a'), PATCH('/chave-b', { notes: 'quem recebe?' }), POST('/chave-b/updates', { summary: 'de quem?' }),
  GET('/chave-b/updates'), GET('/chave-c/updates'),
  POST('', { slug: 'campos', name: 'Campos', tagline: 5, kind: 'cliente', column: 'andando', live: 'sim', objective: null, notes: { a: 1 }, prod_url: ['u'], last_move_at: 0 }),
  POST('', { slug: 'kind-bad', name: 'K', kind: 'nope', column: 'nope', live: 0 }),
  // Hierarquia de um nível.
  POST('', { slug: 'filha', name: 'Filha', parent_slug: ' GoFluxo ' }), POST('', { slug: 'neta', name: 'Neta', parent_slug: 'filha' }),
  POST('', { slug: 'self', name: 'S', parent_slug: 'self' }), POST('', { slug: 'orfa', name: 'O', parent_slug: 'nope' }), POST('', { slug: 'p-null', name: 'P', parent_slug: null }),
  POST('', []), POST('', '"x"', true),
  GET(''),
  // Alterar: coluna com timeline, foco, revisão, campos e rollback do pedido inteiro.
  PATCH('/nope', { name: 'x' }),
  PATCH('/carteirazap', { column: 'aguardando' }), PATCH('/carteirazap', { column: 'aguardando' }), PATCH('/carteirazap', { column: 'bad' }),
  PATCH('/carteirazap', { column: 'radar', last_move_note: '  nota com espaço  ' }), PATCH('/carteirazap', { column: 'andando', last_move_note: '   ' }),
  PATCH('/carteirazap', { column: 'pausado', name: '' }), GET('/carteirazap'), GET('/carteirazap/updates'),
  PATCH('/catalogozap', { focus: 1 }), PATCH('/rca', { focus: 0 }), PATCH('/catalogozap', { focus: 'sim' }), PATCH('/catalogozap', { focus: 1 }),
  PATCH('/catalogozap', { focus: 0, expected_revision: 0 }), PATCH('/catalogozap', { focus: 0, expected_revision: 2 }),
  PATCH('/catalogozap', { expected_revision: 'abc' }), PATCH('/catalogozap', { expected_revision: -1 }), PATCH('/catalogozap', { expected_revision: 1.5 }),
  PATCH('/catalogozap', { expected_revision: '3', next_step: 'Com revisão em texto' }), PATCH('/catalogozap', { expected_revision: null, notes: 'sem trava' }),
  PATCH('/catalogozap', { expected_revision: true }), PATCH('/catalogozap', { expected_revision: [] }),
  PATCH('/praxis', { name: '  Novo nome  ', tagline: null, kind: 'bad', live: 0, sort_order: 'abc' }),
  PATCH('/chave-a', { name: 'Pelo slug', sort_order: 3 }), PATCH('/custom-id', { sort_order: '9', live: [] }),
  PATCH('/gofluxo', { parent_slug: 'praxis' }), PATCH('/filha', { parent_slug: '' }), PATCH('/filha', { parent_slug: 'rca' }), PATCH('/rca', { parent_slug: 'filha' }),
  PATCH('/faculdade', { parent_slug: 'faculdade' }), PATCH('/faculdade', { parent_slug: 'RCA' }),
  PATCH('/encartezap', { foo: 1 }), PATCH('/encartezap', {}), PATCH('/encartezap', []), PATCH('/encartezap', [1]),
  PATCH('/encartezap', { slug: 'trocado', id: 'x', revision: 99 }),
  PATCH('/site-pessoal', { column: 'andando', focus: 1, next_step: 'Três passos num pedido' }),
  PATCH('/site-pessoal', { column: 'radar', focus: 0, expected_revision: 3, name: 'Revisão 3' }),
  PATCH('/site-pessoal', '{"name":', true),
  GET(''),
  // Timeline: validação, ligação do id, data cortada.
  POST('/praxis/updates', { summary: '  ' }), POST('/nope/updates', { summary: 'x' }), GET('/nope/updates'),
  POST('/chave-a/updates', { summary: ' Avanço ', date: '2026-01-05T10:00:00', source: '  ', created_by: '' }),
  POST('/chave-a/updates', { summary: 'Com id', id: 'upd-1' }), POST('/chave-a/updates', { summary: 'Id repetido', id: 'upd-1' }),
  POST('/chave-a/updates', { summary: 'Id bool', id: true }), POST('/chave-a/updates', { summary: 'Id num', id: 7 }), POST('/chave-a/updates', { summary: 'Id lista', id: ['l1'] }),
  POST('/chave-a/updates', { summary: 'Id obj', id: {} }), POST('/chave-a/updates', { summary: { s: 1 }, date: 20260101 }),
  ...Array.from({ length: 112 }, (_, i) => POST('/animalia/updates', { summary: `passo ${i}`, date: `2026-0${1 + (i % 3)}-1${i % 4}`, source: i % 5 ? 'manual' : 'alfred' })),
  GET('/animalia/updates'), GET('/animalia/updates?limit=100'), GET('/animalia/updates?limit=500'), GET('/animalia/updates?limit=0'),
  GET('/animalia/updates?limit=-3'), GET('/animalia/updates?limit=2.5'), GET('/animalia/updates?limit=abc'), GET('/animalia/updates?limit[]=5'),
  GET('/animalia/updates?limit=5&limit=6'), GET('/animalia/updates?limit=1e1'), GET('/animalia/updates?limit=Infinity'), GET('/animalia/updates?limit=%207%20'),
  // Concluir o próximo passo.
  POST('/nope/complete-next-step', {}),
  POST('/praxis/complete-next-step', { expected_step: 'outro passo' }),
  POST('/praxis/complete-next-step', { summary: '  concluído: já dizia  ', source: '  ', created_by: 'alfred' }),
  POST('/praxis/complete-next-step', {}),
  POST('/chave-a/complete-next-step', {}),
  POST('/gofluxo/complete-next-step', { expected_step: '  Consolidar o que a GoFluxo vende, como entrega e qual é o próximo projeto realmente iniciado.  ', summary: { a: 1 } }),
  POST('/faculdade/complete-next-step', { summary: 'Aula preparada', source: 'sêneca' }),
  POST('/catalogozap/complete-next-step', []),
  GET('/praxis/updates'), GET('/chave-a/updates'), GET('/gofluxo/updates'), GET('/faculdade/updates'),
  GET(''),
];

test('frentes: rota nova responde igual à rota antiga, passo a passo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const setup = projectsSetup();
  const oracle = await makeClockedParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await runParityScript(oracle, SCRIPT);
  for (const status of [200, 201, 400, 404, 409, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  for (const kind of parityEngines()) {
    const app = await makeClockedParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await runParityScript(app, SCRIPT);
    for (let i = 0; i < SCRIPT.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step} ${JSON.stringify(SCRIPT[i][2] ?? '').slice(0, 120)}`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('frentes: diferenças intencionais viram erro explícito, sem gravar', async (t) => {
  t.mock.method(console, 'error', () => {});
  const script = [
    POST('', { slug: 'id-longo', name: 'L', id: 'x'.repeat(1600) }),
    POST('', { slug: 'sort-grande', name: 'G', sort_order: 1e20 }),
    PATCH('/praxis', { sort_order: 'Infinity' }),
    GET(''),
  ];
  const oracle = await makeClockedParityApp('oracle', projectsSetup());
  t.after(oracle.dispose);
  const old = await runParityScript(oracle, script);
  assert.deepEqual(old.slice(0, 3).map((r) => r.status), [201, 201, 200], 'antiga gravava');
  for (const kind of parityEngines()) {
    const app = await makeClockedParityApp(kind, projectsSetup());
    t.after(app.dispose);
    const now = await runParityScript(app, script);
    assert.deepEqual(now.slice(0, 3).map((r) => r.status), [500, 500, 500], kind);
    assert.match(now[0].body, /invalid_record_id/); assert.match(now[1].body, /sqlite_coercion_unsupported/); assert.match(now[2].body, /sqlite_coercion_unsupported/);
    const rows = JSON.parse(now[3].body);
    assert.equal(rows.length, 9, `${kind}: nada criado`);
    assert.equal(rows.find((r) => r.slug === 'praxis').revision, 0, `${kind}: nada alterado`);
  }
});

test('frentes: corridas não duplicam slug, foco, conclusão nem revisão', async (t) => {
  const send = (base, path, method, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (res) => ({ status: res.status, body: await res.json() }));
  for (const kind of parityEngines()) {
    const app = await makeClockedParityApp(kind, projectsSetup());
    t.after(app.dispose);
    const slugRace = await Promise.all(Array.from({ length: 6 }, (_, i) => send(app.base, '', 'POST', { slug: 'corrida', name: `C${i}` })));
    assert.deepEqual(slugRace.map((r) => r.status).sort(), [201, 400, 400, 400, 400, 400], `${kind}: um slug só`);
    assert.ok(slugRace.filter((r) => r.status === 400).every((r) => r.body.error === 'slug already exists'), kind);
    await send(app.base, '/rca', 'PATCH', { focus: 0 });
    const focusRace = await Promise.all(['catalogozap', 'carteirazap', 'gofluxo'].map((slug) => send(app.base, `/${slug}`, 'PATCH', { focus: 1 })));
    assert.deepEqual(focusRace.map((r) => r.status).sort(), [200, 409, 409], `${kind}: limite de dois focos`);
    const done = await Promise.all([0, 1, 2].map(() => send(app.base, '/praxis/complete-next-step', 'POST', {})));
    assert.deepEqual(done.map((r) => r.status).sort(), [200, 400, 400], `${kind}: uma conclusão só`);
    const timeline = await send(app.base, '/praxis/updates', 'GET');
    assert.equal(timeline.body.length, 1, `${kind}: uma linha na timeline`);
    const before = (await send(app.base, '/encartezap', 'GET')).body.revision;
    const writes = await Promise.all(Array.from({ length: 5 }, (_, i) => send(app.base, '/encartezap', 'PATCH', { notes: `n${i}` })));
    assert.ok(writes.every((r) => r.status === 200), kind);
    assert.deepEqual(writes.map((r) => r.body.revision).sort(), [1, 2, 3, 4, 5].map((n) => before + n), `${kind}: cada escrita a sua revisão`);
  }
});
