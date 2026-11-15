/**
 * Paridade HTTP de metas (/api/goals, 5 rotas): rota antiga congelada × rota nova sobre a camada
 * assíncrona (SQLite e emulador Firestore). Além do corpo HTTP, confere as tarefas e os hábitos que a
 * rota cria (vínculo inicial) e solta (exclusão), meta por meta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoalsRouter as createOracleGoals } from './test-support/oracles/goals.bcbadad.js';
import { createGoalsRouter } from './routes/goals.js';
import { createGoalsService } from './services/routine/goals.js';
import { buildRouteCtx } from './test-support/helpers.mjs';
import { habitRow } from './storage/domains/phase3.js';
import { TASK_DEFAULTS } from './storage/contract.js';
import { assertParity, makeParityApp, parityEngines, runParityScript, testClock } from './test-support/httpParity.fase3.mjs';

const harness = { parityEngines, runParityScript };
const TODAY = '2026-11-15';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const GOAL_SEED = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `g-${String(i).padStart(2, '0')}`, title: `Meta ${i}`, description: i % 3 ? `desc ${i}` : '', deadline: i % 2 ? `2026-12-${10 + i}` : null,
    timeframe: ['short', 'medium', 'long'][i % 3], category: 'personal', status: i % 4 ? 'active' : 'done', manual_progress: i * 5,
    created_date: `2026-10-${String(1 + (i % 5)).padStart(2, '0')} 09:00:00`,
  })),
  { id: 'g-nulo', title: 'Meta com nulos', description: null, deadline: null, timeframe: null, category: null, status: null, manual_progress: null, created_date: null },
];
const taskSeed = (id, extra) => ({ ...TASK_DEFAULTS, id, title: id, category: 'pessoal', created_date: '2026-10-01 09:00:00', updated_date: '2026-10-01 09:00:00', ...extra });
const TASK_SEED = [
  taskSeed('t-a', { goal_id: 'g-02', sort_order: 5 }), taskSeed('t-b', { goal_id: 'g-02', sort_order: 41 }), taskSeed('t-c', { goal_id: 'g-02', sort_order: null }),
  taskSeed('t-d', { goal_id: 'g-05', sort_order: 7 }), taskSeed('t-e', { goal_id: null, sort_order: 2 }),
];
const HABIT_SEED = [
  habitRow({ id: 'h-a', title: 'Correr', goal_id: 'g-02', sort_order: 9, created_date: '2026-10-01 09:00:00' }),
  habitRow({ id: 'h-b', title: 'Ler', goal_id: 'g-02', sort_order: 1, created_date: '2026-10-01 09:00:00' }),
  habitRow({ id: 'h-c', title: 'Meditar', goal_id: 'g-07', sort_order: 3, created_date: '2026-10-01 09:00:00' }),
];

const clock = testClock();
const setup = {
  mount: '/api/goals',
  oracle: (db) => createOracleGoals(buildRouteCtx(db, { getLocalDateString: () => TODAY })),
  build: (storage, c) => createGoalsRouter({ goals: createGoalsService({ storage, getLocalDateString: () => TODAY, now: c.now }) }),
  seed: [
    { table: 'goals', domain: 'goals', rows: GOAL_SEED },
    { table: 'tasks', domain: 'tasks', rows: TASK_SEED },
    { table: 'habits', domain: 'habits', rows: HABIT_SEED },
  ],
  clock,
  clockTables: ['goals'],
};
const tick = (seconds, step) => () => { clock.advance(seconds); return step; };
const lastGoal = (seen) => seen[seen.length - 1];

const SCRIPT = [
  ['GET', ''], ['GET', '/g-03'], ['GET', '/g-nulo'], ['GET', '/nope'], ['GET', `/${'x'.repeat(1600)}`],
  ['POST', '', {}], ['POST', '', { title: '   ' }], ['POST', '', { title: 5 }], ['POST', '', []], ['POST', '', '"x"', true],
  ['POST', '', { title: ' Correr 10 km ', description: 'd', deadline: '2026-12-31', timeframe: 'long', category: 'saude', status: 'paused', manual_progress: 40 }],
  ['POST', '', { title: 'Sem prazo', deadline: '' }],
  tick(1, ['POST', '', { title: 'Nulos', description: null, timeframe: null, manual_progress: '7' }]),
  ['POST', '', { title: 'Números', description: 5, deadline: 20261231, category: ['x'], manual_progress: 'muito' }],
  ['POST', '', { title: 'Link texto', initial_link: 'x' }], ['POST', '', { title: 'Link vazio', initial_link: {} }],
  ['POST', '', { title: 'Link tipo', initial_link: { type: 'project' } }], ['POST', '', { title: 'Link falso', initial_link: false }],
  ['POST', '', { title: 'Link brancos', initial_link: { type: 'task', title: '   ' } }],
  ['POST', '', { title: 'Link número', initial_link: { type: 'task', title: 5 } }],
  ['POST', '', { title: 'Link nulo', initial_link: null }],
  tick(1, ['POST', '', { title: 'Com tarefa', description: 'passo a passo', initial_link: { type: 'task', title: ' Primeira tarefa ', date: '2026-11-20' } }]),
  ['POST', '', { title: 'Tarefa com prazo', deadline: '2026-12-01', initial_link: { type: 'task' } }],
  ['POST', '', { title: 'Tarefa hoje', initial_link: { type: 'task', title: 'Hoje' } }],
  tick(2, ['POST', '', { title: 'Com hábito', initial_link: { type: 'habit', title: 'Ler 20 páginas', frequency: 'weekly' } }]),
  ['POST', '', { title: 'Hábito padrão', description: 'Desc', initial_link: { type: 'habit' } }],
  ['POST', '', { title: 'Desc objeto', description: {} }], ['POST', '', { title: 'Estado bool', status: true }],
  ['POST', '', { title: 'Lista longa', timeframe: ['a', 'b'] }],
  ['GET', ''],
  ['PUT', '/nope', { title: 'x' }], ['PUT', '/g-01', { title: '' }], ['PUT', '/g-01', { title: 5 }], ['PUT', '/g-01', {}],
  ['PUT', '/g-01', { description: 'nova', deadline: null }], ['PUT', '/g-01', { deadline: '' }],
  ['PUT', '/g-01', { manual_progress: '12', status: 'done', deadline: '2027-01-01' }], ['PUT', '/g-01', { title: '  Renomeada  ', timeframe: 5 }],
  ['PUT', '/g-01', { description: null, timeframe: null, category: 'saude' }], ['PUT', '/g-01', []],
  ['PUT', '/g-01', { category: true }], ['PUT', '/g-01', { description: {} }], ['PUT', '/g-01', { deadline: [1, 2] }], ['PUT', '/g-01', { status: ['ok'] }],
  ['PUT', '/g-nulo', {}], ['PUT', '/g-nulo', { manual_progress: 3 }], ['PUT', `/${'x'.repeat(1600)}`, { title: 'a' }],
  ['GET', '/g-01'],
  ['DELETE', '/nope'], ['DELETE', '/g-02'], ['DELETE', '/g-02'], ['DELETE', '/g-07'], ['DELETE', `/${'x'.repeat(1600)}`],
  (seen) => ['DELETE', `/${lastGoal(seen)}`],
  ['GET', ''],
];

// Chaves em ordem alfabética: o Firestore devolve os campos da tarefa em outra ordem (a rota de
// tarefas, que devolve a linha, é o domínio 5; aqui só os valores importam).
const normalize = (rows) => rows.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, value]) => [key,
  typeof value === 'string' && UUID.test(value) ? 'UUID' : (key === 'created_date' || key === 'updated_date') && value !== null ? 'STAMP' : value])))).sort();

/** Tarefas e hábitos de cada meta (na ordem da lista) e dos itens semeados, normalizados. */
async function linkedState(app, kind) {
  const goals = await (await fetch(app.base)).json();
  const seededTasks = TASK_SEED.map((r) => r.id), seededHabits = HABIT_SEED.map((r) => r.id);
  if (kind === 'oracle') {
    const of = (table, goalId) => app.db.prepare(`SELECT * FROM ${table} WHERE goal_id = ?`).all(goalId);
    const byIds = (table, ids) => ids.map((id) => app.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
    return { perGoal: goals.map((g) => [normalize(of('tasks', g.id)), normalize(of('habits', g.id))]), seeded: [normalize(byIds('tasks', seededTasks)), normalize(byIds('habits', seededHabits))] };
  }
  return app.as(async () => {
    const s = app.storage;
    const get = async (domain, ids) => Promise.all(ids.map((id) => s[domain].get(id)));
    const perGoal = [];
    for (const g of goals) perGoal.push([normalize(await get('tasks', await s.tasks.idsByGoal(g.id))), normalize(await get('habits', await s.habits.idsByGoal(g.id)))]);
    return { perGoal, seeded: [normalize(await get('tasks', seededTasks)), normalize(await get('habits', seededHabits))] };
  });
}

test('metas: rota nova responde igual à antiga, passo a passo, e grava as mesmas tarefas e hábitos', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeParityApp('oracle', setup);
  t.after(oracle.dispose);
  clock.reset();
  const expected = await runParityScript(oracle, SCRIPT);
  const expectedState = await linkedState(oracle, 'oracle');
  for (const status of [200, 201, 400, 404, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  assert.ok(expectedState.perGoal.some(([tasks]) => tasks.length === 1), 'alguma meta tem tarefa criada pelo vínculo');
  assert.ok(expectedState.perGoal.some(([, habits]) => habits.length === 1), 'alguma meta tem hábito criado pelo vínculo');
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    clock.reset();
    const actual = await runParityScript(app, SCRIPT);
    for (let i = 0; i < SCRIPT.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
    assert.deepEqual(await linkedState(app, kind), expectedState, `${kind}: tarefas e hábitos`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('metas: diferenças intencionais viram erro explícito, sem gravar nada', async (t) => {
  t.mock.method(console, 'error', () => {});
  const steps = [
    ['POST', '', { title: 'Data objeto no vínculo', initial_link: { type: 'task', date: { a: 1 } } }],
    ['POST', '', { title: 'Deslocada', description: [], timeframe: ['a', 'b'] }],
    ['GET', ''],
  ];
  const plain = { ...setup, seed: [], clock: null, clockTables: [], build: (storage) => setup.build(storage, { now: () => new Date() }) };
  const old = await makeParityApp('oracle', plain); t.after(old.dispose);
  const before = await runParityScript(old, steps);
  assert.equal(before[0].status, 500, 'antiga: falhava na tarefa...');
  assert.equal(JSON.parse(before[2].body).length, 2, '...depois de já ter gravado a meta; e aceitava parâmetros deslocados');
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, plain); t.after(app.dispose);
    const now = await runParityScript(app, steps);
    assert.equal(now[0].status, 500, kind); assert.match(now[0].body, /You cannot specify named parameters|Too few parameter/, kind);
    assert.equal(now[1].status, 500, kind); assert.match(now[1].body, /sqlite_coercion_unsupported/, kind);
    assert.equal(now[2].body, '[]', `${kind}: nada gravado (meta e tarefa na mesma transação)`);
  }
});

test('metas: criações simultâneas com vínculo não repetem posição de tarefa nem de hábito', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, { ...setup, seed: [], clock: null, build: (storage) => setup.build(storage, { now: () => new Date() }) });
    t.after(app.dispose);
    const post = (i, type) => fetch(app.base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `corrida ${i}`, initial_link: { type } }) })
      .then(async (res) => { assert.equal(res.status, 201, kind); return (await res.json()).linked.id; });
    const results = await app.as(async () => {
      const service = createGoalsService({ storage: app.storage, getLocalDateString: () => TODAY });
      return Promise.all(Array.from({ length: 6 }, (_, i) => service.create({ title: `tique ${i}`, initial_link: { type: i % 2 ? 'habit' : 'task' } })));
    });
    const viaHttp = await Promise.all([post(0, 'task'), post(1, 'habit')]);
    const orders = await app.as(async () => {
      const tasks = [], habits = [];
      for (const r of results) (r.body.linked.type === 'task' ? tasks : habits).push((await app.storage[r.body.linked.type === 'task' ? 'tasks' : 'habits'].get(r.body.linked.id)).sort_order);
      tasks.push((await app.storage.tasks.get(viaHttp[0])).sort_order); habits.push((await app.storage.habits.get(viaHttp[1])).sort_order);
      return { tasks: tasks.sort(), habits: habits.sort() };
    });
    assert.deepEqual(orders, { tasks: [0, 1, 2, 3], habits: [0, 1, 2, 3] }, kind);
  }
});
