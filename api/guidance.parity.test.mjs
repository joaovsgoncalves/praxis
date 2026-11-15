/**
 * Paridade HTTP da orientação do dia (GET /api/projects/guidance/today, PUT /guidance/:date):
 * rota antiga congelada × rota nova (SQLite e emulador Firestore), com as 9 frentes da semente.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parityEngines, runParityScript } from './test-support/httpParity.mjs';
import { makeClockedParityApp } from './test-support/httpParity.fase4.mjs';
import { projectsSetup } from './test-support/projectsFixture.fase4.mjs';
import { seedProjectsIfEmpty } from './projects.js';

const TODAY = '2026-11-15';
const AT = '2026-11-15T07:50:00-03:00';
const setup = () => projectsSetup(1, { getLocalDateString: () => TODAY });
const PUT = (date, body, raw) => ['PUT', `/guidance/${date}`, body, raw];
const TODAY_GET = ['GET', '/guidance/today'];
const p = (rank, extra = {}) => ({ rank, action: `ação ${rank}`, reason_code: 'manual', reason: `porque ${rank}`, ...extra });
const g = (extra = {}) => ({ source: 'alfred', generated_at: AT, summary: 'dia', priorities: [p(1)], ...extra });

const SCRIPT = [
  TODAY_GET,
  // Recusas antes da transação, na ordem da rota antiga.
  PUT(TODAY, []), PUT(TODAY, { zeta: 1, alfa: 2, ...g({ expected_generated_at: null }) }), PUT(TODAY, { source: 'a', expected_generated_at: null }),
  PUT(TODAY, g({ expected_generated_at: null, priorities: 'x' })), PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1, { foco: 1, extra: 2 })] })),
  PUT(TODAY, g({ expected_generated_at: null, priorities: [[1, 2]] })), PUT(TODAY, g({ expected_generated_at: null, date: '2026-11-16' })),
  PUT(TODAY, g({ expected_generated_at: null, source: '' })), PUT(TODAY, g({ expected_generated_at: null, source: 5 })), PUT(TODAY, g()),
  PUT(TODAY, '"x"', true),
  // Validação dentro da transação.
  PUT('2026-02-30', g({ expected_generated_at: null })), PUT('lixo', g({ expected_generated_at: null })),
  PUT(TODAY, g({ expected_generated_at: null, generated_at: '2026-11-15T07:50:00' })), PUT(TODAY, g({ expected_generated_at: null, generated_at: '2026-11-15T24:00:00Z' })),
  PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1), p(2), p(3), p(3)] })), PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1), p(1)] })),
  PUT(TODAY, g({ expected_generated_at: null, priorities: [p(0)] })), PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1.5)] })),
  PUT(TODAY, g({ expected_generated_at: null, priorities: [null] })), PUT(TODAY, g({ expected_generated_at: null, priorities: ['x'] })),
  PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1, { action: '  ' })] })), PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1, { reason_code: 'inventado' })] })),
  PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1, { reason: 5 })] })), PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1, { project_slug: ' Nope ' })] })),
  PUT(TODAY, g({ expected_generated_at: null, priorities: [p(1, { project_slug: 5 })] })),
  TODAY_GET,
  // Grava: ordena por rank, apara, normaliza slug e tarefa, hidrata a frente.
  PUT(TODAY, g({ expected_generated_at: null, summary: '  Dia de prova  ', source: '  sêneca ', generated_at: `  ${AT}  `,
    priorities: [p(3, { project_slug: ' RCA ', task_id: 5 }), p(1, { action: '  revisar  ', reason: ' prova ', reason_code: 'academic', project_slug: 'faculdade' }), p(2, { project_slug: '', task_id: '' })] })),
  TODAY_GET,
  PUT(TODAY, g({ expected_generated_at: null, summary: 'cego' })), PUT(TODAY, g({ expected_generated_at: '2026-11-15T07:49:00-03:00' })),
  PUT(TODAY, g({ expected_generated_at: 5 })), PUT(TODAY, g({ expected_generated_at: `  ${AT}` })),
  // Troca do conjunto inteiro: 3 ações viram 0.
  PUT(TODAY, g({ expected_generated_at: AT, generated_at: '2026-11-15T13:50:00-03:00', summary: 7, priorities: [] })),
  TODAY_GET,
  PUT(TODAY, g({ expected_generated_at: '2026-11-15T13:50:00-03:00', generated_at: '2026-11-15T16:50:00.123Z', date: TODAY, priorities: [p(1, { project_slug: 'animalia' })] })),
  // Hidratação ao vivo: a frente mudou de coluna, a orientação mostra a coluna nova.
  ['PATCH', '/animalia', { column: 'pausado' }], TODAY_GET,
  // Data da URL com espaço: a trava procura " 2026-11-15" (vazia), mas grava em 2026-11-15.
  PUT('%202026-11-15', g({ expected_generated_at: null, summary: 'por cima', priorities: [p(2, { project_slug: 'praxis' })] })), TODAY_GET,
  PUT('2026-11-14', g({ expected_generated_at: null, generated_at: '2026-11-14T08:00:00+05:30' })), TODAY_GET,
  ['GET', '/guidance/2026-11-14'], PUT(`${'9'.repeat(1600)}`, g({ expected_generated_at: null })),
];

test('orientação do dia: rota nova responde igual à rota antiga, passo a passo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeClockedParityApp('oracle', setup());
  t.after(oracle.dispose);
  const expected = await runParityScript(oracle, SCRIPT);
  for (const status of [200, 400, 404, 409]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  for (const kind of parityEngines()) {
    const app = await makeClockedParityApp(kind, setup());
    t.after(app.dispose);
    const actual = await runParityScript(app, SCRIPT);
    for (let i = 0; i < SCRIPT.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step} ${JSON.stringify(SCRIPT[i][2] ?? '').slice(0, 160)}`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('orientação do dia: linha antiga estranha no banco (JSON quebrado, não-lista, slug não-texto) sai igual', async (t) => {
  t.mock.method(console, 'error', () => {});
  const rows = [
    ['2026-11-10', '{bad-json'], ['2026-11-11', '{"a":1}'], ['2026-11-12', JSON.stringify([{ rank: 2, action: 'a', project_slug: 'PRAXIS' }, { rank: 1, project_slug: 'rca', task_id: 0 }])],
    ['2026-11-13', JSON.stringify([{ rank: 1, project_slug: 5 }])], ['2026-11-14', JSON.stringify([{ rank: 1, project_slug: true }])],
    ['2026-11-15', JSON.stringify([{ rank: 1, project_slug: ['rca'] }])], ['2026-11-16', JSON.stringify([{ rank: 1, project_slug: {} }])],
    ['2026-11-17', JSON.stringify([{ rank: 1, project_slug: [] }])], ['2026-11-18', JSON.stringify([7, null])],
  ];
  const seed = (db) => {
    seedProjectsIfEmpty(db);
    for (const [date, json] of rows) db.prepare("INSERT INTO continuity_guidance (date, summary, priorities_json, source, generated_at) VALUES (?, '', ?, 'seneca', ?)").run(date, json, `${date}T07:00:00Z`);
  };
  const results = [];
  for (const kind of ['oracle', ...parityEngines()]) {
    const out = [];
    for (const [date] of rows) {
      const app = await makeClockedParityApp(kind, projectsSetup(1, { seed, getLocalDateString: () => date }));
      out.push(...await runParityScript(app, [TODAY_GET]));
      await app.dispose();
    }
    results.push([kind, out]);
  }
  const [, expected] = results[0];
  assert.ok(expected.some((r) => r.status === 500), 'roteiro cobre o 500 de ligação');
  for (const [kind, out] of results.slice(1)) for (let i = 0; i < rows.length; i += 1) assert.deepEqual(out[i], expected[i], `${kind}, linha ${rows[i][0]}`);
});

test('orientação do dia: gravações simultâneas, um vencedor e um 409', async (t) => {
  const send = (base, path, body) => fetch(base + path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (res) => ({ status: res.status, body: await res.json() }));
  for (const kind of parityEngines()) {
    const app = await makeClockedParityApp(kind, setup());
    t.after(app.dispose);
    const results = await Promise.all([0, 1, 2, 3].map((i) => send(app.base, `/guidance/${TODAY}`, g({ expected_generated_at: null, summary: `S${i}`, generated_at: `2026-11-15T08:00:0${i}-03:00` }))));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409, 409], kind);
    const winner = results.find((r) => r.status === 200).body;
    for (const loser of results.filter((r) => r.status === 409)) assert.equal(loser.body.current_generated_at, winner.generated_at, kind);
    const saved = await (await fetch(`${app.base}/guidance/today`)).json();
    assert.deepEqual(saved, winner, `${kind}: o que ficou é o do vencedor`);
  }
});
