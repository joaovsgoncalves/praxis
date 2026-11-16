/**
 * Paridade HTTP de gamificação (/api/gamification, 3 rotas): rota antiga congelada × rota nova sobre a
 * camada assíncrona (SQLite e emulador Firestore). Cada cenário parte de um banco antigo semeado igual
 * nos três motores; além do corpo HTTP confere o que a rota gravou (eventos de XP, espelho da
 * `gamification`, conquistas), passo a passo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGamificationRouter as createOracleGamification } from './test-support/oracles/gamification.bcbadad.js';
import { createGamificationRouter } from './routes/gamification.js';
import { createGamificationService } from './services/routine/gamification.js';
import { buildRouteCtx } from './test-support/helpers.mjs';
import { habitRow } from './storage/domains/phase3.js';
import { TASK_DEFAULTS } from './storage/contract.js';
import { makeParityApp, parityEngines, runParityScript, testClock } from './test-support/httpParity.fase3.mjs';

const TODAY = '2026-11-15'; // domingo: a semana começa em 2026-11-09 03:00:00 UTC
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY = 86400000;
const day = (back) => new Date(Date.parse(`${TODAY}T12:00:00Z`) - back * DAY).toISOString().slice(0, 10);
const STAMP = '2026-11-10 10:00:00';

const task = (id, extra = {}) => ({ ...TASK_DEFAULTS, id, title: id, category: 'pessoal', created_date: STAMP, updated_date: STAMP, ...extra });
const habit = (id, extra = {}) => habitRow({ id, title: id, created_date: STAMP, ...extra });
const hlog = (id, habitId, date, extra = {}) => ({ id, habit_id: habitId, date, completed: 1, created_date: STAMP, value: null, outcome: 'done', skip_reason: null, note: '', ...extra });
const ritual = (id, extra = {}) => ({ id, name: id, emoji: 'r', time_of_day: 'morning', habits_order: '[]', status: 'active', created_date: STAMP, ...extra });
const focus = (id, seconds) => ({ id, task_id: null, task_title: null, date: TODAY, duration_seconds: seconds, created_date: STAMP });
const wellness = (id, date) => ({ id, date, sleep_hours: 7, sleep_quality: 3, mood: 3, productivity: 3, note: '', created_date: STAMP });
const xpRow = (id, type, source, amount, extra = {}) => ({ id, source_type: type, source_id: source, amount, reason: null, created_date: STAMP, reversed_date: null, ...extra });

const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

/** [tabela, domínio, linhas], na ordem de inserção (hábitos antes dos registros: chave estrangeira). */
function seeds(parts) {
  const order = [['tasks', 'tasks'], ['habits', 'habits'], ['habit_logs', 'habitLogs'], ['rituals', 'rituals'], ['focus_sessions', 'focusSessions'], ['wellness_checks', 'wellnessChecks'], ['xp_events', 'xpEvents']];
  return order.filter(([table]) => parts[table]?.length).map(([table, domain]) => ({ table, domain, rows: parts[table] }));
}

// ---- cenários ----
const everything = seeds({
  tasks: [...range(60, (i) => task(`c${i}`, { status: 'completed' })), ...range(40, (i) => task(`d${i}`, { status: 'done' })), ...range(10, (i) => task(`j${i}`, { category: 'jotav_fit' }))],
  habits: [habit('run'), habit('hc', { kind: 'compound', source: 'ritual_migration:r1' }), habit('ca', { parent_id: 'hc', position_in_parent: 1 }), habit('cb', { parent_id: 'hc', position_in_parent: 2 })],
  habit_logs: [
    ...range(31, (i) => hlog(`run${i}`, 'run', day(i))),
    ...range(6, (i) => hlog(`ca${i}`, 'ca', day(i))), ...range(6, (i) => hlog(`cb${i}`, 'cb', day(i))),
  ],
  rituals: [ritual('r1')],
  focus_sessions: range(4, (i) => focus(`f${i}`, 10000)),
  wellness_checks: range(8, (i) => wellness(`w${i}`, day(i))),
});

const partial = seeds({
  tasks: [task('t1', { status: 'completed' }), task('t2', { status: 'Completed' }), ...range(9, (i) => task(`j${i}`, { category: 'jotav_fit' }))],
  habits: [habit('six'), habit('bridge'), habit('old', { status: 'paused' }), habit('ha'), habit('hb'), habit('hn', { kind: 'compound' })],
  habit_logs: [
    ...range(6, (i) => hlog(`six${i}`, 'six', day(i))),
    // 3 feitos, 1 pulado (congela), 4 feitos: sequência de 7
    ...[0, 1, 2, 4, 5, 6, 7].map((k) => hlog(`br${k}`, 'bridge', day(k))), hlog('br3', 'bridge', day(3), { completed: 0, outcome: 'skipped', skip_reason: 'viagem' }),
    ...range(40, (i) => hlog(`old${i}`, 'old', day(i))),
    ...range(5, (i) => hlog(`ha${i}`, 'ha', day(i + 1))), ...range(5, (i) => hlog(`hb${i}`, 'hb', day(i + 1))),
    ...range(40, (i) => hlog(`hn${i}`, 'hn', day(i))),
  ],
  rituals: [
    ritual('lixo', { habits_order: 'não é json' }), ritual('objeto', { habits_order: '{"a":1}' }), ritual('nulo', { habits_order: null }),
    ritual('tarde', { time_of_day: 'evening', habits_order: '["ha","hb"]' }), ritual('legado', { habits_order: '["ha","hb"]' }),
  ],
  focus_sessions: [focus('f1', 35999)],
  wellness_checks: [...range(6, (i) => wellness(`w${i}`, day(i))), wellness('w9', day(8))],
});

const balanced = seeds({
  habits: [habit('pausado', { status: 'paused' }), habit('sem-registro')],
  habit_logs: range(35, (i) => hlog(`p${i}`, 'pausado', day(i))),
  // 7 dias seguidos atravessando a virada de mês, com repetidos (DISTINCT) e um buraco antes
  wellness_checks: [...['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-03', '2026-10-20'].map((d, i) => wellness(`w${i}`, d))],
});

const rewards = seeds({
  tasks: [task('t1', { status: 'completed' })],
  habits: [habit('streak')],
  habit_logs: range(8, (i) => hlog(`s${i}`, 'streak', day(i))),
  xp_events: [
    xpRow('x1', 'baseline', 'main', 300), xpRow('x2', 'achievement', 'first_task', 10), // já pago: não paga de novo
    xpRow('x3', 'achievement', 'on_fire', 50, { reversed_date: '2026-11-11 00:00:00' }), // estornado: paga outra vez
  ],
});

const week = seeds({
  xp_events: [
    xpRow('x01', 'baseline', 'main', 580, { created_date: '2026-11-01 00:00:00' }),
    xpRow('x02', 'manual', 'a', 10, { created_date: '2026-11-09 03:00:00' }), xpRow('x03', 'manual', 'b', 7, { created_date: '2026-11-09 02:59:59' }),
    xpRow('x04', 'manual', 'c', 5, { created_date: null }), xpRow('x05', 'task', 'd', 9, { created_date: '2026-11-12 08:00:00', reversed_date: '2026-11-13 00:00:00' }),
    xpRow('x06', 'task', 'd', 4, { created_date: '2026-11-14 08:00:00' }), xpRow('x07', 'manual', 'e', 6, { created_date: '2026-11-08 23:00:00' }),
    xpRow('x08', 'manual', 'f', 3, { created_date: '2099-01-01 00:00:00' }),
  ],
});

const negative = seeds({ xp_events: [xpRow('n1', 'manual', 'a', -50), xpRow('n2', 'manual', 'b', 8)] });

const ADD = (body) => ['POST', '/add-xp', body];
const CHECK = ['POST', '/check-achievements'];
const GET = ['GET', ''];

const SCENARIOS = [
  { name: 'tudo de uma vez: as oito conquistas na mesma checagem, depois nada novo', seed: everything, script: [GET, CHECK, GET, CHECK, ADD({ amount: 25, reason: 'depois' }), GET], expect: { unlocked: 8 } },
  { name: 'parciais: sequência com dia pulado, ritual antigo em JSON, quase lá', seed: partial, script: [GET, CHECK, CHECK, GET, ADD({ amount: 1 }), GET], expect: { unlocked: 3 } },
  { name: 'bem-estar: 7 dias seguidos na virada de mês, repetidos, hábito pausado ignorado', seed: balanced, script: [CHECK, GET, CHECK], expect: { unlocked: 1 } },
  { name: 'recompensas: origem já paga não paga de novo; estornada paga outra vez', seed: rewards, script: [GET, CHECK, GET, CHECK], expect: { unlocked: 2 } },
  {
    name: 'XP manual: validação, arredondamento, subida de nível, razões e semana',
    seed: week,
    script: [
      GET,
      ADD({}), ADD({ amount: 0 }), ADD({ amount: -3 }), ADD({ amount: '5' }), ADD({ amount: true }), ADD({ amount: null }), ADD({ amount: [5] }), ADD({ amount: {} }), ADD([]),
      ['POST', '/add-xp', '"x"', true],
      ADD({ amount: 0.5, reason: 'meio' }), ADD({ amount: 12.9, reason: 'quase 13' }), ADD({ amount: 10, reason: '' }), ADD({ amount: 10, reason: 5 }),
      ADD({ amount: 20, reason: 'sobe para o nível 4' }), ADD({ amount: 1e15, reason: 'enorme' }), ADD({ amount: 3, reason: 'ç é ã 🎯'.repeat(50) }),
      GET, CHECK, GET,
    ],
    expect: { unlocked: 0 },
  },
  { name: 'saldo negativo: total nunca abaixo de zero e espelho em 0', seed: negative, script: [GET, ADD({ amount: 10, reason: 'ainda negativo' }), GET, ADD({ amount: 100 }), GET], expect: { unlocked: 0 } },
];

const clock = testClock();
const baseSetup = (scenario) => ({
  mount: '/api/gamification',
  oracle: (db) => createOracleGamification(buildRouteCtx(db, { getLocalDateString: () => TODAY })),
  build: (storage, c) => createGamificationRouter({ gamification: createGamificationService({ storage, getLocalDateString: () => TODAY, now: c.now }) }),
  seed: scenario.seed,
  mirror: [{ table: 'gamification', domain: 'gamification' }, { table: 'achievements', domain: 'achievements' }],
  clock,
  clockTables: ['xp_events'],
});

const norm = (value) => (typeof value === 'string' && UUID.test(value) ? 'UUID' : value);
const sortedJson = (rows) => rows.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, norm(v)])))).sort();

/** O que a rota gravou: eventos de XP (sem o id), espelho `gamification` e conquistas. */
async function savedState(app, kind) {
  if (kind === 'oracle') {
    const events = app.db.prepare('SELECT source_type, source_id, amount, reason, created_date, reversed_date FROM xp_events').all();
    const { xp_total, level } = app.db.prepare("SELECT xp_total, level FROM gamification WHERE id = 'main'").get();
    return { events: sortedJson(events), mirror: { xp_total, level }, achievements: app.db.prepare('SELECT * FROM achievements ORDER BY unlocked_date DESC NULLS LAST, id').all() };
  }
  return app.as(async () => {
    const events = (await app.storage.xpEvents.list()).map(({ id, ...rest }) => rest);
    const { xp_total, level } = await app.storage.gamification.get('main');
    return { events: sortedJson(events), mirror: { xp_total, level }, achievements: await app.storage.achievements.list() };
  });
}

test('gamificação: rota nova responde igual à antiga em cada cenário e grava o mesmo', async (t) => {
  t.mock.method(console, 'error', () => {});
  let steps = 0;
  for (const scenario of SCENARIOS) {
    const setup = baseSetup(scenario);
    const oracle = await makeParityApp('oracle', setup);
    t.after(oracle.dispose);
    clock.reset();
    const expected = await runParityScript(oracle, scenario.script);
    const expectedState = await savedState(oracle, 'oracle');
    const unlocked = expectedState.achievements.filter((a) => a.unlocked_date).length;
    assert.equal(unlocked, scenario.expect.unlocked, `${scenario.name}: conquistas desbloqueadas no oráculo`);
    for (const status of [200]) assert.ok(expected.some((r) => r.status === status), `${scenario.name}: roteiro cobre ${status}`);
    for (const kind of parityEngines()) {
      const app = await makeParityApp(kind, setup);
      t.after(app.dispose);
      clock.reset();
      const actual = await runParityScript(app, scenario.script);
      for (let i = 0; i < scenario.script.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, ${scenario.name}, passo ${i}: ${expected[i].step}`);
      assert.deepEqual(await savedState(app, kind), expectedState, `${kind}, ${scenario.name}: o que foi gravado`);
    }
    steps += scenario.script.length;
  }
  t.diagnostic(`cenários=${SCENARIOS.length} passos=${steps} motores=oráculo,${parityEngines().join(',')}`);
});

test('gamificação: o roteiro de XP manual cobre 200, 400 e os dois níveis (o teste morde)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const scenario = SCENARIOS.find((s) => s.name.startsWith('XP manual'));
  const oracle = await makeParityApp('oracle', baseSetup(scenario));
  t.after(oracle.dispose);
  clock.reset();
  const out = await runParityScript(oracle, scenario.script);
  assert.ok(out.some((r) => r.status === 400), '400 de validação');
  const bodies = out.filter((r) => r.status === 200).map((r) => JSON.parse(r.body));
  assert.ok(bodies.some((b) => b.leveled_up === true), 'subiu de nível');
  assert.ok(bodies.some((b) => b.leveled_up === false && 'xp_total' in b), 'não subiu');
  assert.ok(bodies.some((b) => b.xp_week !== undefined && b.xp_week > 0), 'XP da semana somado');
});

test('gamificação: diferenças intencionais viram erro explícito, sem gravar nada', async (t) => {
  t.mock.method(console, 'error', () => {});
  const steps = [ADD({ amount: 1e300 }), GET, CHECK, GET];
  const scenario = { seed: seeds({ xp_events: [xpRow('x1', 'manual', 'a', 5)] }) };
  const old = await makeParityApp('oracle', baseSetup(scenario)); t.after(old.dispose);
  clock.reset();
  const before = await runParityScript(old, steps);
  assert.equal(before[0].status, 200, 'a antiga gravava um valor que o SQLite não guarda como inteiro');
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, baseSetup(scenario)); t.after(app.dispose);
    clock.reset();
    const now = await runParityScript(app, steps);
    assert.equal(now[0].status, 500, kind); assert.match(now[0].body, /sqlite_coercion_unsupported/, kind);
    assert.equal(JSON.parse(now[1].body).xp_total, 5, `${kind}: nada gravado`);
  }
});

test('gamificação: ritual antigo com id que não é texto é recusado, sem desbloquear nada', async (t) => {
  t.mock.method(console, 'error', () => {});
  const scenario = { seed: seeds({ habits: [habit('a')], rituals: [ritual('estranho', { habits_order: '[1, {"x": 1}]' })], tasks: [task('t1', { status: 'completed' })] }) };
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, baseSetup(scenario)); t.after(app.dispose);
    clock.reset();
    const [check, summary] = await runParityScript(app, [CHECK, GET]);
    assert.equal(check.status, 500, kind); assert.match(check.body, /sqlite_coercion_unsupported/, kind);
    assert.equal(JSON.parse(summary.body).achievements.filter((a) => a.unlocked_date).length, 0, `${kind}: transação desfeita`);
    assert.equal(JSON.parse(summary.body).xp_total, 0, kind);
  }
});

// A regra legada de add-xp desbloqueia sem bônus: a corrida mista NÃO tem bônus total fixo.
// Separar os dois ordenamentos prova 540/0; a disputa mista prova invariantes, sem aceitar erros.
for (const order of ['checks-first', 'manual-first', 'mixed']) {
  test(`gamificação: simultâneos ${order} preservam origens únicas e espelho exato`, async (t) => {
    for (const kind of parityEngines()) {
      const app = await makeParityApp(kind, baseSetup({ seed: everything })); t.after(app.dispose);
      clock.reset();
      const service = createGamificationService({ storage: app.storage, getLocalDateString: () => TODAY, now: clock.now });
      const checks = [], adds = [];
      const check = async () => { const r = await service.checkAchievements(); checks.push(r); };
      const add = async (i) => { const r = await service.addXp({ amount: 10 + i, reason: `corrida ${i}` }); adds.push(r); };
      await app.as(async () => {
        if (order === 'checks-first') {
          await Promise.all(Array.from({ length: 6 }, check));
          await Promise.all(Array.from({ length: 5 }, (_, i) => add(i)));
        } else if (order === 'manual-first') {
          await Promise.all(Array.from({ length: 5 }, (_, i) => add(i)));
          await Promise.all(Array.from({ length: 6 }, check));
        } else {
          // Três escritores concorrentes de cada vez: não presumir a ordem nem mascarar rejeições.
          for (let i = 0; i < 5; i++) await Promise.all([check(), add(i), check()]);
        }
      });
      const paid = checks.reduce((sum, r) => sum + r.bonus_xp, 0);
      if (order === 'checks-first') assert.equal(paid, 540, `${kind}: seis checagens pagam cada bônus uma vez`);
      if (order === 'manual-first') assert.equal(paid, 0, `${kind}: regra legada de desbloqueio sem bônus`);
      const state = await savedState(app, kind);
      const events = state.events.map(JSON.parse).filter((e) => e.reversed_date === null);
      const achievements = events.filter((e) => e.source_type === 'achievement');
      assert.equal(new Set(achievements.map((e) => e.source_id)).size, achievements.length, `${kind}: nenhuma origem paga duas vezes`);
      assert.equal(achievements.reduce((sum, e) => sum + e.amount, 0), paid);
      assert.ok(paid >= 0 && paid <= 540);
      assert.equal(events.filter((e) => e.source_type === 'manual').length, 5);
      assert.equal(state.achievements.filter((a) => a.unlocked_date).length, 8);
      const unlockedResponses = [...checks, ...adds].flatMap((r) => r.new_achievements);
      assert.equal(unlockedResponses.length, 8);
      assert.equal(new Set(unlockedResponses.map((a) => a.id)).size, 8);
      assert.equal(state.mirror.xp_total, paid + 60);
      assert.equal(state.mirror.xp_total, events.reduce((sum, e) => sum + e.amount, 0));
    }
  });
}
