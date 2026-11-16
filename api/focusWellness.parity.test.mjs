/**
 * Paridade HTTP de foco (/api/focus) e bem-estar (/api/wellness): rotas antigas congeladas × rotas
 * novas sobre a camada assíncrona (SQLite e emulador Firestore). Volume para morder LIMIT 50/30/20.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFocusRouter as createOracleFocus } from './test-support/oracles/focus.bcbadad.js';
import { createWellnessRouter as createOracleWellness } from './test-support/oracles/wellness.bcbadad.js';
import { createFocusRouter } from './routes/focus.js';
import { createWellnessRouter } from './routes/wellness.js';
import { createFocusService, createWellnessService } from './services/routine/focusWellness.js';
import { assertParity, makeParityApp, parityEngines, runParityScript, testClock } from './test-support/httpParity.fase3.mjs';

const harness = { parityEngines, runParityScript };
const DAY = 86400000;
const sqlStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const START = Date.now();
const daysAgo = (k) => new Date(START - k * DAY);

// Banco antigo: 60 sessões, 23 tarefas (com e sem título), carimbos repetidos, NULL e futuro.
const FOCUS_SEED = [
  ...Array.from({ length: 60 }, (_, i) => ({
    id: `s${String((i * 37) % 60).padStart(2, '0')}`,
    task_id: i % 23 === 0 ? null : `t${i % 23}`,
    task_title: i % 4 === 0 ? null : `Tarefa ${i % 23}`,
    date: daysAgo(i % 40).toISOString().slice(0, 10),
    duration_seconds: i % 11 === 0 ? null : (i % 5) * 300,
    created_date: sqlStamp(daysAgo(i % 40)),
  })),
  { id: 'sem-carimbo', task_id: 't1', task_title: 'Tarefa 1', date: null, duration_seconds: 900, created_date: null },
  { id: 'futuro', task_id: null, task_title: 'Futuro', date: '2099-01-01', duration_seconds: 60, created_date: '2099-01-01 00:00:00' },
];
const WELLNESS_SEED = [
  ...Array.from({ length: 34 }, (_, i) => ({
    id: `w${String((i * 7) % 34).padStart(2, '0')}`,
    date: new Date(Date.UTC(2026, 9, 1) + i * DAY).toISOString().slice(0, 10),
    sleep_hours: 5 + (i % 4) * 0.5, sleep_quality: 1 + (i % 5), mood: 1 + (i % 3), productivity: 1 + (i % 4), note: i % 3 ? `nota ${i}` : '',
    created_date: '2026-10-01 08:00:00',
  })),
  { id: 'dup-b', date: '2026-10-05', sleep_hours: 9, sleep_quality: 5, mood: 5, productivity: 5, note: 'segunda do dia', created_date: '2026-10-05 09:00:00' },
  { id: 'estranha', date: '2026-10-07', sleep_hours: null, sleep_quality: 'bom', mood: 4.5, productivity: null, note: null, created_date: null },
];

const focusClock = testClock();
const focusSetup = {
  mount: '/api/focus',
  oracle: (db) => createOracleFocus({ db }),
  build: (storage, clock) => createFocusRouter({ focus: createFocusService({ storage, now: clock.now }) }),
  seed: [{ table: 'focus_sessions', domain: 'focusSessions', rows: FOCUS_SEED }],
  clock: focusClock,
  clockTables: ['focus_sessions'],
};
const wellnessClock = testClock();
const wellnessSetup = {
  mount: '/api/wellness',
  oracle: (db) => createOracleWellness({ db }),
  build: (storage, clock) => createWellnessRouter({ wellness: createWellnessService({ storage, now: clock.now }) }),
  seed: [{ table: 'wellness_checks', domain: 'wellnessChecks', rows: WELLNESS_SEED }],
  clock: wellnessClock,
  clockTables: ['wellness_checks'],
};
const tick = (clock, seconds, step) => () => { clock.advance(seconds); return step; };

const FOCUS_SCRIPT = [
  ['GET', ''], ['GET', `?date=${daysAgo(3).toISOString().slice(0, 10)}`], ['GET', '?date='], ['GET', '?date=nope'],
  ['GET', '?date=a&date=b'], ['GET', '?date[x]=1'], ['GET', `?date[]=${daysAgo(0).toISOString().slice(0, 10)}`],
  ['POST', '', {}],
  ['POST', '', { task_id: 't1', task_title: 'Tarefa 1', date: '2026-11-10', duration_seconds: 1500 }],
  tick(focusClock, 1, ['POST', '', { task_id: 't1', task_title: 'Tarefa 1', duration_seconds: '120' }]),
  ['POST', '', { task_id: 5, task_title: '', duration_seconds: 0 }],
  ['POST', '', { task_id: '', date: 20261110, duration_seconds: [60] }],
  tick(focusClock, 2, ['POST', '', { task_id: ['t9'], task_title: 'Ação 😀', duration_seconds: ' 42 ' }]),
  ['POST', '', []],
  ['POST', '', { task_title: true }], ['POST', '', { duration_seconds: [1, 2] }], ['POST', '', { task_id: {} }],
  ['POST', '', { task_id: [] }], ['POST', '', { date: { a: 1 }, task_id: { b: 2 } }], ['POST', '', '"x"', true],
  tick(focusClock, 1, ['POST', '', { task_id: 't22', duration_seconds: 86400 }]),
  ['GET', ''], ['GET', '?date=2026-11-10'],
  ['GET', '/stats'], ['GET', '/stats?days=7'], ['GET', '/stats?days=0'], ['GET', '/stats?days=-1'], ['GET', '/stats?days=-0.5'],
  ['GET', '/stats?days=1.5'], ['GET', '/stats?days=abc'], ['GET', '/stats?days=1e3'], ['GET', '/stats?days=a&days=b'],
  ['GET', '/stats?days[]=3'], ['GET', '/stats?days[x]=1'], ['GET', '/stats?days=99999999999'], ['GET', '/stats?days=39'],
  ['GET', '/stats?days=40'], ['GET', '/stats?days=1'],
];

const WELLNESS_SCRIPT = [
  ['GET', ''], ['GET', '?date=2026-10-05'], ['GET', '?date='], ['GET', '?date=a&date=b'], ['GET', '?date[x]=1'], ['GET', '?date[]=2026-10-07'],
  ['POST', '', {}], ['POST', '', { date: '' }], ['POST', '', { date: 0 }], ['POST', '', []], ['POST', '', '"x"', true],
  ['POST', '', { date: '2026-11-15' }],
  tick(wellnessClock, 1, ['POST', '', { date: '2026-11-15', sleep_hours: 6.5, sleep_quality: 4, mood: 5, productivity: 2, note: 'bem' }]),
  ['POST', '', { date: '2026-11-15', mood: 1 }],
  ['POST', '', { date: '2026-11-15', sleep_hours: null, note: null }],
  ['POST', '', { date: '2026-10-05', mood: 2, note: 'atualiza o primeiro do dia' }],
  ['POST', '', { date: 5 }], ['POST', '', { date: 5, mood: 4 }], ['POST', '', { date: '5.0', note: 'texto casa com número' }],
  ['POST', '', { date: ['2026-11-20'], sleep_quality: [3], mood: '4', productivity: 'muito', note: 12 }],
  ['POST', '', { date: '2026-11-21', mood: 4.5, sleep_hours: 0, note: '' }],
  ['POST', '', { date: true }], ['POST', '', { date: ['a', 'b'] }], ['POST', '', { date: {} }], ['POST', '', { date: [] }],
  ['POST', '', { date: [null] }], ['POST', '', { date: '2026-11-22', sleep_hours: true }],
  ['POST', '', { date: '2026-11-15', sleep_hours: [1, 2] }], ['POST', '', { date: '2026-11-15', note: {} }],
  ['POST', '', { date: '2026-11-23', mood: {} }], ['POST', '', { date: '2026-11-23', mood: {}, note: {} }],
  ['GET', ''], ['GET', '?date=2026-11-15'], ['GET', '?date=5.0'], ['GET', '?date=2026-10-05'],
];

test('foco: rota nova responde igual à antiga, passo a passo (lista, criação, estatística)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const expected = await assertParity(t, focusSetup, FOCUS_SCRIPT, harness);
  for (const status of [200, 201, 400, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  assert.equal(JSON.parse(expected[0].body).length, 50, 'lista morde o LIMIT 50');
  assert.equal(JSON.parse(expected.find((r) => r.step === 'GET /stats').body).length, 20, 'estatística morde o LIMIT 20');
  t.diagnostic(`passos=${FOCUS_SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('bem-estar: rota nova responde igual à antiga, passo a passo (lista e upsert por data)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const expected = await assertParity(t, wellnessSetup, WELLNESS_SCRIPT, harness);
  for (const status of [200, 201, 400, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  assert.equal(JSON.parse(expected[0].body).length, 30, 'lista morde o LIMIT 30');
  t.diagnostic(`passos=${WELLNESS_SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('foco e bem-estar: diferenças intencionais viram erro explícito, sem gravar', async (t) => {
  t.mock.method(console, 'error', () => {});
  const focusSteps = [
    ['POST', '', { duration_seconds: 12.5 }], ['POST', '', { duration_seconds: 'abc' }],
    ['POST', '', { task_id: [], duration_seconds: [1, 2] }], ['GET', ''],
  ];
  const wellnessSteps = [
    ['POST', '', { date: '2026-11-30', sleep_hours: '7.5' }], ['POST', '', { date: '2026-11-30', sleep_hours: [], note: ['a', 'b'] }],
    ['GET', '?date=2026-11-30'],
  ];
  const plain = (setup) => ({ ...setup, seed: [], clock: null, clockTables: [], build: (storage) => setup.build(storage, { now: () => new Date() }) });
  const oldFocus = await makeParityApp('oracle', plain(focusSetup)); t.after(oldFocus.dispose);
  const oldWellness = await makeParityApp('oracle', plain(wellnessSetup)); t.after(oldWellness.dispose);
  const before = [...await runParityScript(oldFocus, focusSteps), ...await runParityScript(oldWellness, wellnessSteps)];
  assert.deepEqual(before.map((r) => r.status), [201, 201, 201, 200, 201, 200, 200], 'antiga aceitava fração, texto e parâmetros deslocados');
  for (const kind of parityEngines()) {
    const f = await makeParityApp(kind, plain(focusSetup)); t.after(f.dispose);
    const w = await makeParityApp(kind, plain(wellnessSetup)); t.after(w.dispose);
    const now = [...await runParityScript(f, focusSteps), ...await runParityScript(w, wellnessSteps)];
    for (const i of [0, 1, 2, 4, 5]) { assert.equal(now[i].status, 500, `${kind} passo ${i}`); assert.match(now[i].body, /sqlite_coercion_unsupported/, `${kind} passo ${i}`); }
    assert.equal(now[3].body, '[]', `${kind}: nenhuma sessão gravada`);
    assert.equal(now[6].body, '[]', `${kind}: nenhum registro de bem-estar gravado`);
  }
});

test('bem-estar: envios simultâneos do mesmo dia criam um registro só', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, { ...wellnessSetup, seed: [], clock: null, build: (storage) => wellnessSetup.build(storage, { now: () => new Date() }) });
    t.after(app.dispose);
    const statuses = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(app.base, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date: '2026-11-15', mood: 1 + (i % 5) }),
    }).then((res) => res.status)));
    assert.deepEqual(statuses.sort(), [200, 200, 200, 200, 200, 200, 200, 201], kind);
    assert.equal((await (await fetch(`${app.base}?date=2026-11-15`)).json()).length, 1, `${kind}: um registro do dia`);
  }
});

test('bem-estar: upserts do mesmo dia disparados no mesmo tique (sem HTTP no meio) criam um registro só', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, { ...wellnessSetup, seed: [], clock: null, build: (storage) => wellnessSetup.build(storage, { now: () => new Date() }) });
    t.after(app.dispose);
    const service = createWellnessService({ storage: app.storage });
    const results = await app.as(() => Promise.all(Array.from({ length: 8 }, (_, i) => service.upsert({ date: '2026-11-16', mood: 1 + (i % 5) }))));
    assert.deepEqual(results.map((r) => r.created).sort(), [false, false, false, false, false, false, false, true], kind);
    assert.equal((await app.as(() => app.storage.wellnessChecks.list({ date: '2026-11-16' }))).length, 1, `${kind}: um registro do dia`);
  }
});
