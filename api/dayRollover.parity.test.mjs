/**
 * Paridade da virada do dia (`day_rollover_runs`): rotina antiga congelada × serviço novo sobre a camada
 * assíncrona (SQLite e emulador Firestore). A virada não tem rota própria: o teste a dispara por uma rota de
 * apoio (`POST /rollover`) e confere, pelo HTTP de tarefas, o que ela fez, mais o que ficou gravado
 * (tarefas e uma linha por dia). Volume para morder a posição `MAX + 1` e a ordem de inserção dos filhos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTasksRouter as createOracleTasks } from './test-support/oracles/tasks.bcbadad.js';
import { createDayRollover as createOracleRollover } from './test-support/oracles/dayRollover.bcbadad.js';
import { createTaskCalendarQueue as createOracleQueue } from './test-support/oracles/taskCalendarQueue.bcbadad.js';
import { createTasksRouter } from './routes/tasks.js';
import { createDayRollover } from './services/routine/dayRollover.js';
import { asyncRoute } from './lib/asyncRoute.js';
import { buildRouteCtx } from './test-support/helpers.mjs';
import { taskRow } from './storage/contract.js';
import { makeParityApp, parityEngines, runParityScript, tasksServiceFor, testClock } from './test-support/httpParity.fase3.mjs';

const T0 = '2026-10-01 09:00:00';
const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
const quiet = { log() {}, error() {} };
const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
const task = (id, extra = {}) => taskRow({ id, title: id, date: '2026-11-14', created_date: T0, updated_date: T0, ...extra });
const daily = (id, extra = {}) => task(id, { recurrence: 'daily', time: '07:00', ...extra });

const TASKS = [
  // série parada vários dias: só a mais recente gera filho, em hoje (sem filhos no passado)
  daily('dly-a', { date: '2026-11-10', sort_order: 1 }), daily('dly-a2', { date: '2026-11-11', recurrence_parent_id: 'dly-a', sort_order: 2 }), daily('dly-a3', { date: '2026-11-12', recurrence_parent_id: 'dly-a', sort_order: 3 }),
  task('wk-a', { recurrence: 'weekly', recurrence_days: '[1,3]', date: '2026-11-02', sort_order: 4 }), task('mo-a', { recurrence: 'monthly', date: '2026-09-30', sort_order: 5 }),
  task('wk-lixo', { recurrence: 'weekly', recurrence_days: 'lixo', date: '2026-11-08', sort_order: 6 }),
  // já tem ocorrência aberta daqui para a frente: não cria outra
  daily('up-a', { date: '2026-11-10', sort_order: 7 }), daily('up-b', { date: '2026-11-16', recurrence_parent_id: 'up-a', sort_order: 8 }),
  // a ocorrência de hoje já existe (concluída): não cria outra
  daily('ex-a', { date: '2026-11-13', sort_order: 9 }), daily('ex-b', { date: '2026-11-15', recurrence_parent_id: 'ex-a', status: 'completed', sort_order: 10 }),
  // bloco do Sêneca: avulso fecha sem filho; recorrente gera filho; sem hora ou hora vazia fica de fora
  task('sn-a', { source: 'seneca', time: '08:00', sort_order: 11 }), task('sn-b', { source: 'seneca', time: '09:00', recurrence: 'daily', sort_order: 12 }),
  task('sn-c', { source: 'seneca', time: null }), task('sn-d', { source: 'seneca', time: '' }),
  daily('em-curso', { status: 'in_progress', sort_order: 13 }),
  // fora da virada
  daily('ideia-r', { category: 'ideias', idea_status: 'capturada' }), daily('feita-r', { status: 'completed' }), daily('cancelada-r', { status: 'cancelled' }),
  daily('sem-data', { date: null }), daily('data-vazia', { date: '' }), daily('de-hoje', { date: '2026-11-15' }), daily('futura', { date: '2026-11-20' }), task('avulsa', { time: '10:00' }), daily('sem-categoria', { category: null }),
  task('topo', { sort_order: 800 }),
  // volume: 60 séries com data atrasada, para posição e ordem de inserção dos filhos
  ...range(60, (i) => daily(`vol-${String(i).padStart(2, '0')}`, { date: `2026-11-${String(14 - (i % 5)).padStart(2, '0')}`, sort_order: i % 9 === 0 ? null : 20 + (i % 13), recurrence: i % 3 === 0 ? 'weekly' : 'daily', recurrence_days: i % 3 === 0 ? '[2,4,6]' : '[]' })),
];
const SEED = [{ table: 'tasks', domain: 'tasks', rows: TASKS }];

const clock = testClock();
const setup = {
  mount: '/api',
  dbOptions: { withTaskRoutine: true },
  oracle: (db) => {
    db.function('datetime', { deterministic: false }, (arg) => { if (arg !== 'now') throw new Error(`datetime(${arg}) fora do roteiro`); return clock.stamp(); });
    const ctx = buildRouteCtx(db, { getLocalDateString: () => '2026-11-15', calendarQueue: createOracleQueue({ db, syncTaskToCalendar: () => {}, now: clock.now }) });
    const app = express.Router();
    app.use('/tasks', createOracleTasks(ctx));
    app.post('/rollover', (req, res) => {
      res.json(createOracleRollover({ db, getLocalDateString: () => req.body.today, nextSortOrder: ctx.nextSortOrder, log: quiet }).run(req.body.reason));
    });
    return app;
  },
  build: (storage, c) => {
    const ctx = buildRouteCtx(null, { getLocalDateString: () => '2026-11-15' });
    const app = express.Router();
    app.use('/tasks', createTasksRouter({ tasks: tasksServiceFor(storage, ctx, { now: c.now }) }));
    app.post('/rollover', asyncRoute(async (req, res) => {
      res.json(await createDayRollover({ storage, getLocalDateString: () => req.body.today, now: c.now, log: quiet }).run(req.body.reason));
    }));
    return app;
  },
  seed: SEED,
  clock,
};

const ROLL = (today, reason = 'teste') => ['POST', '/rollover', { today, reason }];
const LIST = (today) => ['GET', `/tasks?include_overdue=1&limit=1000&today=${today}`];
const ALL = ['GET', '/tasks?limit=1000'];
const SCRIPT = [
  LIST('2026-11-15'), ROLL('2026-11-15', 'subida'), ROLL('2026-11-15', 'tick'), ROLL('2026-11-15', 'tick'), LIST('2026-11-15'), ALL,
  // o dia já tem linha e aparece mais uma vencida (tarefa recorrente criada com data passada): a mesma linha soma
  ['POST', '/tasks', { title: 'Atrasada nova', date: '2026-11-12', time: '06:00', recurrence: 'daily' }], ROLL('2026-11-15', 'tick'), ROLL('2026-11-15', 'tick'), ALL,
  ROLL('2026-11-16'), ROLL('2026-11-16'), LIST('2026-11-16'),
  ROLL('2026-11-25', 'subida depois de dias parada'), ROLL('2026-11-25'), LIST('2026-11-25'), ALL,
  ROLL('2026-11-10'), ROLL('2026-12-31'), ALL, ['GET', '/tasks?limit=1000&category=ideias'],
];

function foldUuids(results) {
  const seen = new Map();
  return results.map((result) => ({ ...result, body: result.body.replace(UUID_G, (id) => { if (!seen.has(id)) seen.set(id, `#u${seen.size + 1}`); return seen.get(id); }) }));
}
const norm = (value) => (typeof value === 'string' ? value.replace(UUID_G, 'UUID') : value);
const sortedJson = (rows) => rows.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, norm(v)])))).sort();
async function savedState(app, kind) {
  if (kind === 'oracle' || kind === 'sqlite') return { tasks: sortedJson(app.db.prepare('SELECT * FROM tasks').all()), runs: app.db.prepare('SELECT * FROM day_rollover_runs ORDER BY day').all() };
  return app.as(async () => ({ tasks: sortedJson(await app.storage.tasks.all()), runs: await app.storage.dayRolloverRuns.list() }));
}

test('virada do dia: serviço novo faz o mesmo que a rotina antiga, dia a dia, e grava o mesmo', async (t) => {
  const oracle = await makeParityApp('oracle', setup);
  t.after(oracle.dispose);
  clock.reset();
  const expected = foldUuids(await runParityScript(oracle, SCRIPT));
  const expectedState = await savedState(oracle, 'oracle');
  const closed = expected.filter((r) => r.step === 'POST /rollover').map((r) => JSON.parse(r.body));
  assert.ok(closed[0].closed >= 70 && closed[0].firstRunOfDay === true, 'a primeira passada fecha dezenas de vencidas');
  assert.equal(closed[1].closed, 0, 'passada repetida não muda nada');
  assert.ok(expectedState.runs.length >= 5, 'uma linha por dia');
  assert.ok(expectedState.tasks.length > TASKS.length + 50, 'filhos criados em volume');
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    clock.reset();
    const actual = foldUuids(await runParityScript(app, SCRIPT));
    const diffs = [];
    for (let i = 0; i < SCRIPT.length; i += 1) if (JSON.stringify(actual[i]) !== JSON.stringify(expected[i])) diffs.push(i);
    for (const i of diffs.slice(0, 1)) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step} (${diffs.length} diferentes: ${diffs.slice(0, 12)})`);
    assert.deepEqual(await savedState(app, kind), expectedState, `${kind}: o que foi gravado`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('virada do dia: passadas simultâneas fecham cada tarefa uma vez só', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, { ...setup, clock: null, build: () => express.Router() });
    t.after(app.dispose);
    const rollover = createDayRollover({ storage: app.storage, getLocalDateString: () => '2026-11-15', log: quiet });
    await app.as(async () => {
      const runs = await Promise.all(Array.from({ length: 5 }, () => rollover.run('tick')));
      assert.ok(runs.every((r) => r.ok), `${kind}: ${JSON.stringify(runs)}`);
      const total = runs.reduce((sum, r) => sum + r.closed, 0);
      assert.equal(total, runs.find((r) => r.closed > 0).closed, `${kind}: só uma passada fechou`);
      assert.equal(runs.filter((r) => r.firstRunOfDay).length, 1, kind);
      const all = await app.storage.tasks.all();
      assert.equal(all.filter((r) => r.day_outcome === 'missed').length, total);
      const opens = all.filter((r) => ['pending', 'in_progress'].includes(r.status) && r.recurrence_parent_id === 'dly-a' && r.date >= '2026-11-15');
      assert.equal(opens.length, 1, `${kind}: uma só ocorrência de hoje para a série parada`);
      assert.equal((await app.storage.dayRolloverRuns.list()).length, 1);
    });
  }
});
