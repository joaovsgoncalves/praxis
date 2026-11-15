/**
 * Paridade HTTP de configurações: rota antiga congelada × rota nova (SQLite e emulador Firestore).
 * No oráculo e no SQLite a linha `default` já vem do preparo do banco; no Firestore a conta começa
 * sem documento, então o primeiro PUT/GET também prova a criação com os padrões do SQLite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsRouter as createOracleRouter } from './test-support/oracles/settings.bcbadad.js';
import { createSettingsRouter } from './routes/settings.js';
import { createSettingsService } from './services/personal/settings.js';
import { makeParityApp, parityEngines, runParityScript } from './test-support/httpParity.mjs';

const setup = {
  mount: '/api/user',
  oracle: (db) => createOracleRouter({ db }),
  build: (storage) => createSettingsRouter({ settings: createSettingsService({ storage }) }),
};
const PUT = (body, raw) => ['PUT', '/settings', body, raw];
const GET = ['GET', '/settings'];

const SCRIPT = [
  PUT({ pomodoro_break: 10 }),
  GET,
  PUT({}),
  PUT({ full_name: 'Ana', avatar_url: 'https://exemplo.invalid/a.png', pomodoro_focus: 30, notif_habits: 0, notif_goals: 0 }),
  // COALESCE: null explícito e ausente preservam; null explícito só desliga a meta de foco.
  PUT({ full_name: null, avatar_url: null, pomodoro_focus: null, list_density: null }),
  PUT({ full_name: '' }),
  // Afinidade TEXT com número ligado pelo driver (sempre REAL): 5 vira "5.0".
  PUT({ full_name: 5 }), PUT({ full_name: 1.5 }), PUT({ avatar_url: 0 }), PUT({ full_name: -0 }),
  // Afinidade INTEGER: texto numérico vira número, texto livre fica texto, fração fica REAL.
  PUT({ pomodoro_focus: '45' }), PUT({ pomodoro_focus: ' 7 ' }), PUT({ pomodoro_focus: '1e3' }), PUT({ pomodoro_focus: '45.5' }),
  PUT({ pomodoro_focus: 'abc' }), PUT({ pomodoro_break: 12.75 }), PUT({ pomodoro_break: -0 }), PUT({ notif_habits: '' }),
  PUT({ notif_goals: '0x10' }), PUT({ notif_goals: '+3' }), PUT({ pomodoro_break: '.5' }),
  // Ligação do better-sqlite3: booleano/objeto aninhado = TypeError; lista achata; objeto = saco nomeado.
  PUT({ full_name: true }), PUT({ notif_habits: false }), PUT({ full_name: [[1]] }), PUT({ full_name: ['Lista'] }),
  PUT({ full_name: [null] }), PUT({ full_name: [] }), PUT({ full_name: ['a', 'b'] }), PUT({ full_name: {} }),
  PUT({ full_name: {}, avatar_url: ['a', 'b'] }),
  PUT({ full_name: ['x', 'y', 'z'], pomodoro_focus: {}, pomodoro_break: {} }),
  PUT({ avatar_url: ['p', 'q'], notif_goals: {}, list_density: 'compact' }),
  PUT({ full_name: {}, avatar_url: {} }),
  PUT({ full_name: [true] }),
  GET,
  // Densidade: só compact/comfortable, por String(...); null/ausente mantém.
  PUT({ list_density: 'compact' }), PUT({ list_density: 'bad' }), PUT({ list_density: 5 }), PUT({ list_density: ['comfortable'] }),
  PUT({ list_density: {} }), PUT({ list_density: false }), PUT({ list_density: '' }), PUT({ list_density: 'COMPACT' }),
  // Meta de foco: inteiro 30..3000 ou null; a validação dela vem antes de tudo.
  PUT({ focus_weekly_goal_minutes: 300 }), PUT({ focus_weekly_goal_minutes: 29 }), PUT({ focus_weekly_goal_minutes: 3001 }),
  PUT({ focus_weekly_goal_minutes: '300' }), PUT({ focus_weekly_goal_minutes: 120.5 }), PUT({ focus_weekly_goal_minutes: true }),
  PUT({ focus_weekly_goal_minutes: 30 }), PUT({ focus_weekly_goal_minutes: 3000 }), PUT({ pomodoro_focus: 50 }),
  PUT({ focus_weekly_goal_minutes: 29, list_density: 'bad' }), PUT({ list_density: 'bad', full_name: true }),
  // Erro de ligação no primeiro UPDATE: a meta de foco do mesmo pedido não muda.
  PUT({ focus_weekly_goal_minutes: 600, full_name: true }), GET,
  PUT({ focus_weekly_goal_minutes: null }), PUT({ focus_weekly_goal_minutes: 900, list_density: 'comfortable', full_name: 'Bia' }),
  // Corpo que não é objeto e campos que a rota ignora.
  PUT([]), PUT([1, 2]), PUT('"x"', true), PUT('{"full_name":', true), PUT({ id: 'outra', email: 'x@y', nutrition_enabled: 0, user_id: 'bob' }),
  GET,
];

test('configurações: rota nova responde igual à rota antiga, passo a passo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeParityApp('oracle', setup);
  t.after(oracle.dispose);
  const expected = await runParityScript(oracle, SCRIPT);
  for (const status of [200, 400, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    const actual = await runParityScript(app, SCRIPT);
    for (let i = 0; i < SCRIPT.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step} ${JSON.stringify(SCRIPT[i][2])}`);
  }
  t.diagnostic(`passos=${SCRIPT.length} motores=oráculo,${parityEngines().join(',')}`);
});

test('configurações: GET de conta nova cria a linha com os padrões', async (t) => {
  const oracle = await makeParityApp('oracle', setup);
  t.after(oracle.dispose);
  const script = [GET, GET, PUT({ list_density: 'compact' }), GET];
  const expected = await runParityScript(oracle, script);
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    assert.deepEqual(await runParityScript(app, script), expected, kind);
  }
});

test('configurações: diferenças intencionais viram erro explícito, sem gravar', async (t) => {
  t.mock.method(console, 'error', () => {});
  const huge = [PUT({ pomodoro_focus: 1e20 }), PUT({ full_name: 1e15 }), PUT({ full_name: 1e-7 }), GET];
  const oracle = await makeParityApp('oracle', setup);
  t.after(oracle.dispose);
  const old = await runParityScript(oracle, huge);
  assert.deepEqual(old.slice(0, 3).map((r) => r.status), [200, 200, 200], 'antiga gravava número fora do subconjunto provado');
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    const now = await runParityScript(app, huge);
    for (const step of now.slice(0, 3)) { assert.equal(step.status, 500, kind); assert.match(step.body, /sqlite_coercion_unsupported/); }
    const after = JSON.parse(now[3].body);
    assert.equal(after.pomodoro_focus, 25, `${kind}: nada gravado`);
    assert.equal(after.full_name, 'João Victor', `${kind}: nada gravado`);
  }
});

test('configurações: PUTs simultâneos não se perdem (cada campo do seu pedido fica)', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    const bodies = [{ full_name: 'Paralelo' }, { avatar_url: 'a' }, { pomodoro_focus: 40 }, { pomodoro_break: 9 }, { notif_habits: 0 }, { notif_goals: 0 }, { list_density: 'compact' }, { focus_weekly_goal_minutes: 120 }];
    const res = await Promise.all(bodies.map((body) => fetch(`${app.base}/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })));
    for (const r of res) assert.equal(r.status, 200, kind);
    const final = await (await fetch(`${app.base}/settings`)).json();
    assert.deepEqual(final, {
      id: 'default', full_name: 'Paralelo', email: 'joao@praxis.local', avatar_url: 'a', pomodoro_focus: 40, pomodoro_break: 9,
      notif_habits: 0, notif_goals: 0, list_density: 'compact', focus_weekly_goal_minutes: 120,
    }, kind);
  }
});
