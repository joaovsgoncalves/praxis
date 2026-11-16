/**
 * Paridade HTTP dos insights de leitura (GET /api/insights/{best-hours,correlation,weekly,avoidance} e
 * POST /api/praxia/confront sem chave): rota antiga congelada × rota nova (SQLite e emulador Firestore),
 * com volume que passa dos tetos (50/80/10/24/5), empates, NULL e dezenas de dias de foco e bem-estar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parityEngines, runParityScript } from './test-support/httpParity.mjs';
import { makeClockedParityApp } from './test-support/httpParity.fase4.mjs';
import { insightsSetup, seedRecent } from './test-support/insightsParity.fase4.mjs';
import { seedInsights, TODAY } from './test-support/insightsFixture.fase4.mjs';

const NOW = new Date();
const GET = (path) => ['GET', `/api/insights/${path}`];
const CONFRONT = (body, raw) => ['POST', '/api/praxia/confront', body, raw];
const full = (db) => { seedInsights(db); seedRecent(db, NOW); };
const minimal = (db) => {
  // Exatamente 3 sessões (limite da sugestão), 5 dias de bem-estar e nenhum hábito ativo.
  const at = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
  [1, 2, 3].forEach((d, i) => db.prepare('INSERT INTO focus_sessions (id, date, duration_seconds, created_date) VALUES (?, ?, ?, ?)').run(`m${i}`, at(d).slice(0, 10), 600, at(d)));
  [1, 2, 3, 4, 5].forEach((d, i) => db.prepare('INSERT INTO wellness_checks (id, date, mood) VALUES (?, ?, ?)').run(`mw${i}`, at(d).slice(0, 10), 3 + (i % 2)));
};
const normalize = (rows) => rows.map((r) => ({ ...r, body: r.body.replace(/"generated_at":"[^"]*"/g, '"generated_at":"NOW"') }));

const SCRIPT = [
  GET('best-hours'),
  GET('correlation'), GET('correlation?days=10'), GET('correlation?days=30'), GET('correlation?days=500'), GET('correlation?days=abc'), GET('correlation?days=0'),
  GET('correlation?days=-3'), GET('correlation?days=1.5'), GET('correlation?days=60&days=10'), GET('correlation?days=1e1'), GET('correlation?days=179'), GET('correlation?days=2'),
  GET('weekly?week_start=2026-10-12'), GET('weekly?date=2026-10-15'), GET('weekly?week_start=2026-10-14'), GET('weekly?week_start=2026-10-05'), GET('weekly?week_start=2026-10-19'),
  GET('weekly?week_start=2026-09-28'), GET('weekly?week_start=2026-08-03'), GET('weekly?week_start=2026-10-18'), GET('weekly?week_start=2026-10-11'), GET('weekly'), GET('weekly?week_start='),
  GET('weekly?week_start=lixo'), GET('weekly?week_start=2026-10-12T00:00:00'), GET('weekly?week_start=2026-10-15&week_start=2026-10-12'), GET('weekly?week_start=2026-13-45'),
  GET('avoidance'), GET('avoidance?date=2026-10-15'), GET('avoidance?date=2026-10-16'), GET('avoidance?date=2026-10-14'), GET('avoidance?date=2026-10-20'),
  GET('avoidance?date=2026-11-01'), GET('avoidance?date=2026-09-01'), GET('avoidance?date=2026-10-08'), GET('avoidance?date=2026-10-06'), GET('avoidance?date=1999-01-01'),
  GET('avoidance?date=lixo'), GET('avoidance?date=2026-10-15T10'), GET('avoidance?date=2026-13-45'), GET('avoidance?date=2026-10-15&date=2026-10-14'), GET('avoidance?date='),
  CONFRONT({}), CONFRONT({ date: '2026-10-15', note: '  difícil  ' }), CONFRONT({ date: '2026-10-20', note: 'x'.repeat(900) }), CONFRONT({ date: '2026-09-01' }), CONFRONT({ date: 'lixo' }),
  CONFRONT('[]', true), CONFRONT('{"date": 5}', true), CONFRONT('lixo', true),
];

async function run(setup, script, t) {
  const oracle = await makeClockedParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = normalize(await runParityScript(oracle, script));
  for (const kind of parityEngines()) {
    const app = await makeClockedParityApp(kind, setup);
    t.after(app.dispose);
    const actual = normalize(await runParityScript(app, script));
    for (let i = 0; i < script.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step} ${JSON.stringify(script[i][2] ?? '').slice(0, 120)}`);
  }
  return expected;
}

test('insights: rotas novas respondem igual às antigas, passo a passo (massa grande)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const expected = await run(insightsSetup({ seed: full }), SCRIPT, t);
  for (const status of [200, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  const bodies = expected.map((r) => r.body).join('\n');
  // O roteiro morde os ramos que importam, não só devolve vazio.
  for (const part of ['"enough_data":true', '"insight":{', 'melhores horários', '8 mais urgentes', '"completed_by_area":[{', 'não rolou', 'Fechar pendência atrasada', 'Reforçar hábito em aberto', 'Espelho:']) {
    assert.ok(bodies.includes(part), `roteiro cobre ${part}`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

const few = (db) => {
  for (const [id, title, date] of [['a', 'Pagar luz', '2026-10-10'], ['b', 'Pagar luz', '2026-10-13'], ['c', 'Ligar', '2026-10-14']]) {
    db.prepare("INSERT INTO tasks (id, title, date, status, category) VALUES (?, ?, ?, 'pending', 'pessoal')").run(id, title, date);
  }
  db.prepare("INSERT INTO capture_queue (id, status) VALUES ('q', 'failed')").run();
};
const one = (db) => db.prepare("INSERT INTO capture_queue (id, status) VALUES ('q', 'failed')").run();

// Um de cada tipo de item do cockpit (cabem nos 8 exibidos): atrasada, sem data, ideias paradas, captura com falha,
// padrão de "não rolou", dia cheio com pouco foco e bem-estar sem registro.
const mixed = (db) => {
  const task = db.prepare("INSERT INTO tasks (id, title, date, status, category, priority, created_date, updated_date, idea_status) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)");
  task.run('o', 'Declarar imposto', '2026-10-10', 'pessoal', 'high', '2026-10-01 09:00:00', '2026-10-01 09:00:00', null);
  task.run('f1', 'Sem data um', null, 'pessoal', 'high', '2026-10-01 09:00:00', '2026-10-01 09:00:00', null);
  task.run('i1', 'Ideia parada', null, 'ideias', 'medium', '2026-10-01 09:00:00', '2026-10-01 09:00:00', 'promissora');
  for (const id of ['t1', 't2', 't3']) task.run(id, `Hoje ${id}`, TODAY, 'pessoal', 'low', '2026-10-15 09:00:00', '2026-10-15 09:00:00', null);
  db.prepare("INSERT INTO capture_queue (id, status) VALUES ('q', 'failed')").run();
  db.prepare("INSERT INTO habits (id, title, frequency, status) VALUES ('hx', 'Alongar', 'daily', 'active')").run();
  const log = db.prepare('INSERT INTO habit_logs (id, habit_id, date, completed, outcome) VALUES (?, ?, ?, ?, ?)');
  ['2026-10-09', '2026-10-10', '2026-10-11'].forEach((d) => log.run(`s${d}`, 'hx', d, 0, 'skipped'));
  log.run('d14', 'hx', '2026-10-14', 1, 'done'); log.run('d15', 'hx', TODAY, 1, 'done');
  db.prepare("INSERT INTO habits (id, title, frequency, status) VALUES ('hy', 'Meditar', 'daily', 'active')").run();
  log.run('y14', 'hy', '2026-10-14', 0, 'skipped');
};

test('insights: cockpit com poucos itens e um de cada tipo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const script = [GET('avoidance'), GET('avoidance?date=2026-10-16'), GET('weekly?week_start=2026-10-12'), CONFRONT({})];
  assert.match((await run(insightsSetup({ seed: one }), script, t)).map((r) => r.body).join('\n'), /1 coisa pedindo atenção/);
  assert.match((await run(insightsSetup({ seed: few }), script, t)).map((r) => r.body).join('\n'), /4 coisas que você pode estar empurrando/);
  const text = (await run(insightsSetup({ seed: mixed }), script, t)).map((r) => r.body).join('\n');
  for (const part of ['"task-overdue-o"', '"task-floating-f1"', '"idea-stale-i1"', '"capture-failed"', '"habit-pattern-skip-hx"', '"habit-skip-open-hy"', '"focus-gap"', '"wellness-missing"', 'Ontem não rolou', 'Promissora parada', 'Sem data']) {
    assert.ok(text.includes(part), `cockpit cobre ${part}`);
  }
});

test('insights: banco vazio e massa mínima (bordas de 3 sessões, 5 dias, sem hábito ativo)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const script = [GET('best-hours'), GET('correlation'), GET('weekly?week_start=2026-10-12'), GET('avoidance'), CONFRONT({})];
  const empty = await run(insightsSetup({ seed: () => {} }), script, t);
  assert.match(empty.map((r) => r.body).join('\n'), /Nada gritando no radar/);
  const small = await run(insightsSetup({ seed: minimal }), script, t);
  const text = small.map((r) => r.body).join('\n');
  assert.match(text, /Nenhum hábito ativo para correlacionar/);
  assert.match(text, /"total_sessions":3/);
});
