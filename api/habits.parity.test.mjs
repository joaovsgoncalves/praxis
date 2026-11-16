/**
 * Paridade HTTP de hábitos (/api/habits, 7 rotas), registros (/api/habit-logs, 3 rotas) e rituais
 * (/api/rituals, 3 rotas de leitura): rotas antigas congeladas × rotas novas sobre a camada assíncrona
 * (SQLite e emulador Firestore). Banco antigo semeado igual nos três motores, volume para morder
 * ordenações e sequências, e conferência do que as rotas gravaram (hábitos, registros, rituais).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHabitsRouter as createOracleHabits, registerHabitLogRoutes as registerOracleLogs } from './test-support/oracles/habits.bcbadad.js';
import { createRitualsRouter as createOracleRituals } from './test-support/oracles/rituals.bcbadad.js';
import { createHabitsRouter, registerHabitLogRoutes } from './routes/habits.js';
import { createRitualsRouter } from './routes/rituals.js';
import { createHabitsService, createHabitLogsService } from './services/routine/habits.js';
import { buildRouteCtx } from './test-support/helpers.mjs';
import { habitRow } from './storage/domains/phase3.js';
import { makeParityApp, parityEngines, runParityScript, testClock } from './test-support/httpParity.fase3.mjs';

const TODAY = '2026-11-15';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY = 86400000;
const day = (back) => new Date(Date.parse(`${TODAY}T12:00:00Z`) - back * DAY).toISOString().slice(0, 10);
const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
const T0 = '2026-10-01 09:00:00';

const goal = (id) => ({ id, title: id, description: '', deadline: null, timeframe: 'short', category: 'personal', status: 'active', manual_progress: 0, created_date: T0 });
const habit = (id, extra = {}) => habitRow({ id, title: id, created_date: T0, ...extra });
const hlog = (id, habitId, date, extra = {}) => ({ id, habit_id: habitId, date, completed: 1, created_date: T0, value: null, outcome: 'done', skip_reason: null, note: '', ...extra });
const ritual = (id, extra = {}) => ({ id, name: id, emoji: '🌅', time_of_day: 'morning', habits_order: '[]', status: 'active', created_date: T0, ...extra });

const GOALS = [goal('g-1'), goal('g-2')];
const HABITS = [
  habit('h-run', { sort_order: 0, goal_id: 'g-1' }), habit('h-read', { sort_order: 1, category: 'mente' }),
  habit('h-null1', { sort_order: null, created_date: '2026-10-03 09:00:00' }), habit('h-null2', { sort_order: null, created_date: '2026-10-05 09:00:00' }),
  habit('h-tie-a', { sort_order: 2 }), habit('h-tie-b', { sort_order: 2 }),
  habit('h-paused', { status: 'paused', sort_order: 3 }), habit('h-arch', { status: 'archived', sort_order: 4 }),
  habit('h-since', { tracking_mode: 'since', since_date: '2026-10-20', sort_order: 5 }),
  habit('h-target', { target_value: 3, unit: 'L', quick_increment: 0.5, sort_order: 6 }),
  habit('h-nullstatus', { status: null, sort_order: 7 }),
  habit('c-morning', { kind: 'compound', source: 'ritual_migration:r-morning', sort_order: 8 }),
  habit('c1', { parent_id: 'c-morning', position_in_parent: 1, sort_order: 20, preferred_time: '06:30' }),
  habit('c2', { parent_id: 'c-morning', position_in_parent: 0, sort_order: 21, preferred_time: '07:00' }),
  habit('c3', { parent_id: 'c-morning', position_in_parent: null, sort_order: 1, preferred_time: '14:00' }),
  habit('c4', { parent_id: 'c-morning', position_in_parent: null, sort_order: null }),
  habit('c-derived', { kind: 'compound', source: 'compound:x', sort_order: 9 }),
  habit('d1', { parent_id: 'c-derived', position_in_parent: 0, preferred_time: '20:00' }), habit('d2', { parent_id: 'c-derived', position_in_parent: 1, preferred_time: '21:30' }),
  habit('c-empty', { kind: 'compound', source: 'ritual_migration:r-ghost', emoji: '🔥', sort_order: 10 }),
  habit('c-pausada', { kind: 'compound', status: 'paused', source: 'ritual_migration:r-evening', sort_order: 11 }),
  habit('p1', { parent_id: 'c-pausada', position_in_parent: 0, status: 'paused' }),
];
const LOGS = [
  ...range(40, (i) => hlog(`run${i}`, 'h-run', day(i))),
  ...[0, 1, 3, 4, 5, 8].map((k) => hlog(`rd${k}`, 'h-read', day(k))), hlog('rd-skip', 'h-read', day(2), { completed: 0, outcome: 'skipped', skip_reason: 'time', note: 'sem tempo' }),
  hlog('t1', 'h-target', day(0), { completed: 0, outcome: null, value: 1.5 }), hlog('t2', 'h-target', day(1), { value: 3 }),
  hlog('c1l', 'c1', day(0)), hlog('c2l', 'c2', day(0), { completed: 0, outcome: 'skipped', skip_reason: 'energy', note: '  cansado  ' }), hlog('c3l', 'c3', day(1)),
  hlog('d1l', 'd1', day(0)), hlog('d2l', 'd2', day(0)),
  hlog('legacy', 'h-null1', day(0), { completed: 1, outcome: null }), hlog('legacy2', 'h-null2', day(0), { completed: 0, outcome: null }),
  ...range(5, (i) => hlog(`old${i}`, 'h-arch', day(i + 10))),
];
const RITUALS = [
  ritual('r-morning', { habits_order: '["h-run","c1","h-read"]' }), ritual('r-evening', { emoji: '🌙', time_of_day: 'evening', habits_order: '["c1"]' }),
  ritual('r-bad', { habits_order: '{ruim' }), ritual('r-obj', { habits_order: '{"a":1}' }), ritual('r-null', { habits_order: null, time_of_day: null, emoji: null }),
];
const SEED = [
  { table: 'goals', domain: 'goals', rows: GOALS }, { table: 'habits', domain: 'habits', rows: HABITS },
  { table: 'habit_logs', domain: 'habitLogs', rows: LOGS }, { table: 'rituals', domain: 'rituals', rows: RITUALS },
];

/** As rotas de registro se montam em `app` com o prefixo '/api'; aqui o prefixo já vem do ponto de montagem. */
const underApi = (router) => Object.fromEntries(['get', 'post', 'delete'].map((verb) => [verb, (path, ...handlers) => router[verb](path.replace(/^\/api/, ''), ...handlers)]));


const clock = testClock();
const tick = (seconds, step) => () => { clock.advance(seconds); return step; };
const fresh = (seen, n) => seen.filter((id) => UUID.test(id))[n];
const withFresh = (n, build) => (seen) => build(fresh(seen, n));

const setup = {
  mount: '/api',
  dbOptions: {},
  oracle: (db) => {
    const ctx = buildRouteCtx(db, { getLocalDateString: () => TODAY });
    const app = express.Router();
    app.use('/habits', createOracleHabits(ctx));
    registerOracleLogs(underApi(app), ctx);
    app.use('/rituals', createOracleRituals(ctx));
    return app;
  },
  build: (storage, c) => {
    const ctx = buildRouteCtx(null, { getLocalDateString: () => TODAY });
    const services = {
      habits: createHabitsService({ storage, getLocalDateString: () => TODAY, stripPriorityPrefix: ctx.stripPriorityPrefix, now: c.now }),
      habitLogs: createHabitLogsService({ storage, HABIT_OUTCOMES: ctx.HABIT_OUTCOMES, SKIP_REASONS: ctx.SKIP_REASONS, now: c.now }),
    };
    const app = express.Router();
    app.use('/habits', createHabitsRouter(services));
    registerHabitLogRoutes(underApi(app), services);
    app.use('/rituals', createRitualsRouter({ habits: services.habits, getLocalDateString: () => TODAY }));
    return app;
  },
  seed: SEED,
  clock,
  clockTables: ['habits', 'habit_logs'],
};

const J = (path, body) => ['POST', path, body];
const GETS = [
  ['GET', '/habits'], ['GET', '/habits?status=all'], ['GET', '/habits?status=paused'], ['GET', '/habits?status=archived'], ['GET', '/habits?status=lixo'],
  ['GET', `/habits?date=${day(1)}`], ['GET', '/habits?date=2026-11-16&status=all'], ['GET', '/habits?status='],
];
const SCRIPT = [
  ...GETS,
  ['GET', '/habits/h-run/streak'], ['GET', '/habits/h-read/streak'], ['GET', '/habits/h-since/streak'], ['GET', '/habits/c-morning/streak'], ['GET', '/habits/h-null1/streak'],
  ['GET', '/habits/nope/streak'], ['GET', '/habits/h-arch/streak'],
  ['GET', '/rituals'], ['GET', '/rituals?status=all'], ['GET', '/rituals?status=paused'], ['GET', '/rituals?status=lixo'], ['GET', `/rituals?date=${day(1)}`],
  ['GET', '/rituals/c-morning'], ['GET', '/rituals/c-derived'], ['GET', '/rituals/c-empty'], ['GET', '/rituals/h-run'], ['GET', '/rituals/c-pausada?status=all'],
  ['GET', '/rituals/c-morning/progress'], ['GET', `/rituals/c-morning/progress?date=${day(1)}`], ['GET', '/rituals/nope/progress'],
  ['POST', '/rituals', { name: 'x' }], ['PUT', '/rituals/c-morning', {}], ['DELETE', '/rituals/c-morning'],

  // ---- criar: validações, na ordem da antiga ----
  J('/habits', { title: 'x', tracking_mode: 'quinzenal' }), J('/habits', { title: 'x', since_date: '2026-13-45' }), J('/habits', { title: 'x', since_date: 5 }),
  J('/habits', { title: 'x', tracking_mode: 'since' }), J('/habits', { title: 'x', tracking_mode: 'since', since_date: '' }), J('/habits', {}), J('/habits', { title: '' }),
  J('/habits', { title: 0 }), J('/habits', { title: 'x', goal_id: 'g-fantasma' }), J('/habits', { title: 'x', kind: 'tripla' }),
  J('/habits', { title: 'x', parent_id: 'h-run' }), J('/habits', { title: 'x', parent_id: 'nope' }), J('/habits', { title: 'x', kind: 'compound', parent_id: 'c-morning' }),
  J('/habits', { title: 'x', preferred_time: '25:00' }), J('/habits', { title: 'x', preferred_time: 'cedo' }), J('/habits', { title: 'x', preferred_time: {} }),
  J('/habits', { title: 'x', description: {} }), J('/habits', { title: 'x', description: true }), J('/habits', { title: 'x', category: false }),
  J('/habits', { title: {} }), J('/habits', { title: 'x', unit: {} }), J('/habits', { title: 'x', source: {} }),
  J('/habits', { title: 'x', parent_id: {}, kind: 'simple' }), J('/habits', { title: 'x', parent_id: 5 }),
  J('/habits', { title: 'x', streak_target: {} }), J('/habits', { title: 'x', sort_order: {} }), J('/habits', { title: 'x', target_value: {} }), J('/habits', { title: 'x', quick_increment: [] }),
  ['POST', '/habits', 'não é json', true], ['POST', '/habits', '[]', true],
  // ---- criar: sucesso ----
  tick(1, J('/habits', { title: 'Beber água' })),
  J('/habits', { title: 'P1 - Correr', frequency: 'weekdays', category: 'saude', streak_target: '12', goal_id: 'g-2', source: 'tela', sort_order: '40', recurrence_days: [1, 3, 5, 5, 9, 'x'], target_value: '2.5', unit: 'km', preferred_time: '6:5', quick_increment: '0.25' }),
  tick(1, J('/habits', { title: ' Ler ', frequency: 'mensal', recurrence_days: '[2,0,7]', target_value: '', quick_increment: '', streak_target: 'abc', sort_order: 'x' })),
  J('/habits', { title: 'Sem dias', recurrence_days: 'lixo' }), J('/habits', { title: 'Dias objeto', recurrence_days: { a: 1 } }), J('/habits', { title: 'Dias vazio', recurrence_days: null }),
  J('/habits', { title: 5, description: 5, category: 7, unit: 3 }), J('/habits', { title: 'Alvo texto', target_value: 'muito', streak_target: 0 }),
  J('/habits', { title: 'Meta igual', goal_id: 'g-1' }), J('/habits', { title: 'Meta número', goal_id: 5 }), J('/habits', { title: 'Meta nula', goal_id: null }),
  J('/habits', { title: 'Desde', tracking_mode: 'since', since_date: '2026-10-01T10:00:00Z' }), J('/habits', { title: 'Check explícito', tracking_mode: 'CHECK' }),
  J('/habits', { title: 'Modo nulo', tracking_mode: null, since_date: '' }), J('/habits', { title: 'Sem fim', sort_order: null }),
  tick(1, J('/habits', { title: 'Filho de manhã', parent_id: 'c-morning' })), J('/habits', { title: 'Filho na posição', parent_id: 'c-morning', position_in_parent: 7 }),
  J('/habits', { title: 'Filho de derivado', parent_id: 'c-derived', position_in_parent: '2' }), J('/habits', { title: 'Posição lixo', parent_id: 'c-derived', position_in_parent: 'x' }),
  J('/habits', { title: 'Sem pai', position_in_parent: 3 }),
  // composto com filhos
  tick(1, J('/habits', { title: 'Rotina nova', kind: 'compound', emoji: '🌞', children: ['h-null1', { title: 'Passo novo', preferred_time: '9:00' }, { id: 'h-null2', title: 'Renomeado' }] })),
  J('/habits', { title: 'Rotina ids', kind: 'compound', children_ids: [{ title: 'A' }, { title: 'B', preferred_time: '' }, { title: 'C', preferred_time: '23:59' }] }),
  J('/habits', { title: 'Rotina vazia', kind: 'compound', children: [] }), J('/habits', { title: 'Rotina sem lista', kind: 'compound', emoji: 5 }),
  J('/habits', { title: 'Rotina lixo', kind: 'compound', children: 'x' }), J('/habits', { title: 'Rotina repetida', kind: 'compound', children: ['h-read', 'h-read'] }),
  J('/habits', { title: 'Rotina objeto ruim', kind: 'compound', children: [5] }), J('/habits', { title: 'Rotina nulo', kind: 'compound', children: [null] }),
  J('/habits', { title: 'Rotina composto filho', kind: 'compound', children: ['c-morning'] }), J('/habits', { title: 'Rotina fantasma', kind: 'compound', children: ['nope'] }),
  J('/habits', { title: 'Rotina com filho alheio', kind: 'compound', children: ['c1'] }), J('/habits', { title: 'Rotina sem título', kind: 'compound', children: [{}] }),
  J('/habits', { title: 'Rotina hora ruim', kind: 'compound', children: [{ title: 'x', preferred_time: '99:99' }] }),
  J('/habits', { title: 'Simples com filhos', kind: 'simple', children: ['h-read'] }),
  J('/habits', { title: 'Rotina tipo texto', kind: 'compound', children: [{ title: 'P2: Prefixo', preferred_time: 5 }] }),
  ['GET', '/habits?status=all'], ['GET', '/rituals?status=all'],

  // ---- filhos ----
  ['PATCH', '/habits/nope/children', { children: [] }], ['PATCH', '/habits/h-run/children', { children: [] }], ['PATCH', '/habits/c-morning/children', {}],
  ['PATCH', '/habits/c-morning/children', { children: 'x' }], ['PATCH', '/habits/c-morning/children', null], ['PATCH', '/habits/c-morning/children', { children: [{ id: 'c2' }, { id: 'c1' }, { id: 'c2' }] }],
  ['PATCH', '/habits/c-morning/children', { ordered_ids: ['c3', 'c1', 'c2'] }], ['GET', '/habits?status=all'],
  tick(1, ['PATCH', '/habits/c-morning/children', { children_ids: ['c2', { id: 'c1', title: 'P3 - Primeiro', preferred_time: '5:07' }, { title: 'Novo no meio' }, { title: 'Novo 2' }, 'c4'] }]),
  ['PATCH', '/habits/c-morning/children', { children: [{ id: 'c2', preferred_time: 'tarde' }] }], ['PATCH', '/habits/c-morning/children', { children: ['h-since', 'c-derived'] }],
  ['PATCH', '/habits/c-morning/children', { children: ['d1'] }], ['PATCH', '/habits/c-morning/children', { children: [{ id: 'c1', title: '   ' }] }],
  ['PATCH', '/habits/c-derived/children', { children: ['d2', 'd1', { title: 'Terceiro' }] }], ['PATCH', '/habits/c-pausada/children', { children: [{ title: 'Novo numa pausada' }] }],
  ['PATCH', '/habits/c-empty/children', { children: [{ title: 'Primeiro filho' }] }], ['PATCH', '/habits/c-morning/children', { ordered_ids: [] }],
  ['GET', '/habits?status=all'],

  // ---- editar ----
  ['PUT', '/habits/nope', { title: 'x' }], ['PUT', `/habits/${'x'.repeat(1600)}`, { title: 'x' }], ['PUT', '/habits/h-run', { goal_id: 'g-fantasma' }],
  ['PUT', '/habits/h-run', { tracking_mode: 'x' }], ['PUT', '/habits/h-run', { since_date: 'x' }], ['PUT', '/habits/h-run', { tracking_mode: 'since' }],
  ['PUT', '/habits/h-run', { status: 'x' }], ['PUT', '/habits/h-run', { frequency: 'x' }], ['PUT', '/habits/h-run', { kind: 'x' }],
  ['PUT', '/habits/h-run', { parent_id: 'h-read' }], ['PUT', '/habits/h-run', { parent_id: 'h-run' }], ['PUT', '/habits/h-run', { kind: 'compound', parent_id: 'c-morning' }],
  ['PUT', '/habits/h-run', { preferred_time: 'x' }], ['PUT', '/habits/h-run', { title: {} }], ['PUT', '/habits/h-run', { description: {} }],
  ['PUT', '/habits/h-run', { streak_target: {} }], ['PUT', '/habits/h-run', { sort_order: [] }], ['PUT', '/habits/h-run', { target_value: {} }], ['PUT', '/habits/h-run', { quick_increment: {} }],
  ['PUT', '/habits/h-run', {}], ['PUT', '/habits/h-run', []],
  tick(1, ['PUT', '/habits/h-run', { title: 'P1 — Correr 5 km', description: 'novo', frequency: 'weekends', category: 'saude', streak_target: '21', source: 'api', sort_order: '60', recurrence_days: ['1', 2], target_value: '5', unit: 'km', preferred_time: '5:30', quick_increment: 1 }]),
  ['PUT', '/habits/h-run', { goal_id: null }], ['PUT', '/habits/h-run', { goal_id: 'g-2' }], ['PUT', '/habits/h-run', { goal_id: 'g-2', title: 'mesma meta' }], ['PUT', '/habits/h-run', { goal_id: '' }],
  ['PUT', '/habits/h-run', { goal_id: 'g-1' }], ['PUT', '/habits/h-read', { description: null, category: null, unit: null }], ['PUT', '/habits/h-read', { target_value: null, quick_increment: null }],
  ['PUT', '/habits/h-read', { target_value: '', quick_increment: '' }], ['PUT', '/habits/h-read', { streak_target: 'abc', sort_order: 'x', target_value: 'y' }],
  ['PUT', '/habits/h-read', { tracking_mode: 'since', since_date: '2026-11-01' }], ['PUT', '/habits/h-read', { tracking_mode: 'check' }], ['PUT', '/habits/h-read', { tracking_mode: 'since' }],
  ['PUT', '/habits/h-read', { tracking_mode: null, since_date: null }], ['PUT', '/habits/h-since', { since_date: '' }], ['PUT', '/habits/h-since', { tracking_mode: 'check', since_date: '' }],
  ['PUT', '/habits/h-since', { since_date: '2026-09-09T00:00' }], ['PUT', '/habits/h-null1', { emoji: '🎯' }], ['PUT', '/habits/h-null1', { emoji: null }], ['PUT', '/habits/h-null1', { emoji: 7 }],
  ['PUT', '/habits/h-null1', { status: null }], ['PUT', '/habits/h-null1', { status: 'paused' }], ['PUT', '/habits/h-null1', { status: 'active', frequency: null }],
  ['PUT', '/habits/h-null2', { parent_id: 'c-derived' }], ['PUT', '/habits/h-null2', { parent_id: 'c-derived', position_in_parent: 9 }], ['PUT', '/habits/h-null2', { position_in_parent: null }],
  ['PUT', '/habits/h-null2', { parent_id: '' }], ['PUT', '/habits/h-null2', { parent_id: null, position_in_parent: '4' }], ['PUT', '/habits/h-null2', { parent_id: 'c-morning' }], ['PUT', '/habits/h-null2', { parent_id: null }],
  ['PUT', '/habits/h-tie-a', { kind: 'compound' }], ['PUT', '/habits/h-tie-a', { kind: 'simple' }], ['PUT', '/habits/h-tie-b', { preferred_time: '' }], ['PUT', '/habits/h-tie-b', { preferred_time: null }],
  ['PUT', '/habits/h-tie-b', { recurrence_days: null }], ['PUT', '/habits/h-tie-b', { recurrence_days: 'lixo' }], ['PUT', '/habits/h-tie-b', { recurrence_days: [6, 0] }],
  // composto: status propaga aos filhos, filhos pelo PUT, tornar simples
  tick(1, ['PUT', '/habits/c-morning', { status: 'paused' }]), ['PUT', '/habits/c-morning', { status: 'active', title: 'Manhã' }], ['PUT', '/habits/c-morning', { status: null }],
  ['PUT', '/habits/c-morning', { children: [{ id: 'c1' }, { title: 'Filho pelo PUT' }], status: 'paused', frequency: 'weekdays', category: 'saude', recurrence_days: [1, 2] }],
  ['PUT', '/habits/c-morning', { children: [{ id: 'c1' }, 'c2'], status: 'active' }], ['PUT', '/habits/c-morning', { children_ids: [{ title: 'Só um' }], sort_order: 99 }],
  ['PUT', '/habits/c-morning', { children: 'x' }], ['PUT', '/habits/c-morning', { children: [{ id: 'h-run' }], title: 'não grava' }], ['PUT', '/habits/c-morning', { children: [{ id: 'c-morning' }] }],
  ['PUT', '/habits/c-derived', { children: [{ title: 'N1' }, { title: 'N2' }], sort_order: 5 }], ['PUT', '/habits/c-derived', { kind: 'simple', children: [] }], ['PUT', '/habits/c-empty', { children: [], status: 'archived' }],
  ['PUT', '/habits/h-read', { children: [] }], ['PUT', '/habits/c-pausada', { status: 'active' }],
  withFresh(0, (id) => ['PUT', `/habits/${id}`, { title: 'Água renomeada', sort_order: 1, children: [] }]),
  ['GET', '/habits?status=all'],

  // ---- registros ----
  ['GET', '/habit-logs'], ['GET', `/habit-logs?date=${day(0)}`], ['GET', `/habit-logs?from=${day(5)}&to=${day(1)}`], ['GET', `/habit-logs?from=${day(30)}`], ['GET', `/habit-logs?to=${day(35)}`],
  ['GET', '/habit-logs?habit_id=h-read'], ['GET', '/habit-logs?habit_id=h-run&from=2026-11-01'], ['GET', `/habit-logs?habit_id=h-run&to=${day(37)}`], ['GET', `/habit-logs?habit_id=h-read&from=${day(4)}&to=${day(1)}`],
  ['GET', `/habit-logs?habit_id=h-read&date=${day(3)}`], ['GET', '/habit-logs?habit_id=nada'], ['GET', '/habit-logs?date=&from=&habit_id='], ['GET', `/habit-logs?date=${day(0)}&habit_id=c1&from=${day(9)}&to=${day(0)}`],
  ['GET', '/habit-logs?date=a&date=b'], ['GET', '/habit-logs?habit_id[x]=1'],
  J('/habit-logs', {}), J('/habit-logs', { habit_id: 'h-run' }), J('/habit-logs', { date: day(0) }), J('/habit-logs', { habit_id: 'nope', date: day(0) }),
  J('/habit-logs', { habit_id: 'c-morning', date: day(0) }), J('/habit-logs', { habit_id: 'h-since', date: day(0) }),
  ['POST', '/habit-logs', 'x', true], ['POST', '/habit-logs', 'null', true],
  J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', outcome: 'talvez' }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', completed: false }),
  J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', completed: 0 }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', completed: '0' }),
  J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', outcome: 'skipped', skip_reason: 'preguiça' }),
  tick(1, J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', completed: true })), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', outcome: ' DONE ', note: 'some', skip_reason: 'time' }),
  J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', outcome: 'skipped', skip_reason: ' Energy ', note: `  ${'n'.repeat(300)}  ` }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', outcome: 'skipped', skip_note: 'pela outra chave' }),
  J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', outcome: 'skipped', value: 5 }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', value: '0,5' }),
  J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', value: 'muito' }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', value: -1 }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', value: 2000000 }),
  J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', value: '1e3' }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', increment: 0.1 }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', delta: '0.2' }),
  J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', increment: -5 }), J('/habit-logs', { habit_id: 'h-run', date: '2026-11-16', value: 3, increment: 0.0004 }),
  J('/habit-logs', { habit_id: 'h-target', date: day(0) }), J('/habit-logs', { habit_id: 'h-target', date: day(0), increment: 0.5 }), J('/habit-logs', { habit_id: 'h-target', date: day(0), increment: 1 }),
  J('/habit-logs', { habit_id: 'h-target', date: day(0), increment: 1 }), J('/habit-logs', { habit_id: 'h-target', date: day(5), value: 2 }), J('/habit-logs', { habit_id: 'h-target', date: day(5), value: 3 }),
  J('/habit-logs', { habit_id: 'h-target', date: day(6) }), J('/habit-logs', { habit_id: 'h-target', date: day(0), outcome: 'skipped', skip_reason: 'other', note: 'x' }), J('/habit-logs', { habit_id: 'h-target', date: day(0), value: 4 }),
  J('/habit-logs', { habit_id: 'h-read', date: 20261117 }), J('/habit-logs', { habit_id: 'h-read', date: 20261117 }), J('/habit-logs', { habit_id: 'h-read', date: 5.5 }), J('/habit-logs', { habit_id: 'h-read', date: [] }),
  J('/habit-logs', { habit_id: 'h-read', date: {} }), J('/habit-logs', { habit_id: 'h-read', date: true }), J('/habit-logs', { habit_id: 'h-read', date: ['2026-11-18'] }),
  J('/habit-logs', { habit_id: 'h-read', date: ['2026-11-18', 'b'] }), J('/habit-logs', { habit_id: ['h-read'], date: '2026-11-19' }),
  J('/habit-logs', { habit_id: 'h-null1', date: day(1), completed: true }), J('/habit-logs', { habit_id: 'h-tie-a', date: day(0) }), J('/habit-logs', { habit_id: 'h-tie-a', date: day(1) }),
  J('/habit-logs', { habit_id: 'h-tie-a', date: day(2) }), J('/habit-logs', { habit_id: 'h-tie-a', date: day(3), outcome: 'skipped' }), J('/habit-logs', { habit_id: 'h-tie-a', date: day(4) }),
  J('/habit-logs', { habit_id: 'h-tie-a', date: day(5) }), J('/habit-logs', { habit_id: 'h-tie-a', date: day(6) }), J('/habit-logs', { habit_id: 'h-tie-a', date: day(7) }),
  ['GET', '/habits/h-tie-a/streak'], ['GET', '/habits/h-run/streak'], ['GET', '/habits/h-read/streak'], ['GET', '/habits'], ['GET', '/rituals?status=all'],
  ['GET', '/habit-logs?habit_id=h-tie-a'], ['GET', '/habit-logs?habit_id=h-target'], ['GET', '/habit-logs?date=2026-11-16'], ['GET', '/habit-logs'],
  ['DELETE', '/habit-logs/nope'], ['DELETE', `/habit-logs/${'x'.repeat(1600)}`], ['DELETE', '/habit-logs/c1l'], ['DELETE', '/habit-logs/c1l'], ['DELETE', '/habit-logs/run3'], ['GET', '/habits/h-run/streak'],
  ['GET', `/habit-logs?habit_id=c1`], ['GET', '/habits?status=all'],

  // ---- reordenar ----
  ['PATCH', '/habits/reorder', {}], ['PATCH', '/habits/reorder', { ordered_ids: [] }], ['PATCH', '/habits/reorder', { ordered_ids: 'x' }], ['PATCH', '/habits/reorder', { ids: ['h-read', '', null, 'h-run', 'nope', 'h-read', 7] }],
  ['PATCH', '/habits/reorder', { ordered_ids: ['h-tie-b', 'h-tie-a', `${'x'.repeat(1600)}`, 'h-null2', 'h-null1'], ids: ['h-run'] }], ['PATCH', '/habits/reorder', null], ['PATCH', '/habits/reorder', []],
  ['GET', '/habits?status=all'],

  // ---- excluir ----
  ['DELETE', '/habits/nope'], ['DELETE', `/habits/${'x'.repeat(1600)}`], ['DELETE', '/habits/h-null1'], ['DELETE', '/habits/h-null1'], ['DELETE', '/habits/c-morning'], ['DELETE', '/habits/c1'],
  ['DELETE', '/habits/h-run'], ['DELETE', '/habits/h-arch'], ['DELETE', '/habits/c-derived'], ['DELETE', '/habits/c-pausada'], ['DELETE', '/habits/c-empty'], ['DELETE', '/habits/h-since'],
  ['GET', '/habits?status=all'], ['GET', '/rituals?status=all'], ['GET', '/habit-logs'], ['GET', '/habits/h-run/streak'],
];

/** UUID fora dos campos `id` (pai, `source: 'compound:<id>'`) vira ficha pela ordem de aparição. */
function foldUuids(results) {
  const seen = new Map();
  const fold = (text) => text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, (id) => { if (!seen.has(id)) seen.set(id, `#u${seen.size + 1}`); return seen.get(id); });
  return results.map((result) => ({ ...result, body: fold(result.body) }));
}

const norm = (value) => (typeof value === 'string' ? value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, 'UUID') : value);
const sortedJson = (rows) => rows.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, norm(v)])))).sort();

/** O que as rotas gravaram: hábitos, registros e rituais. */
async function savedState(app, kind) {
  if (kind === 'oracle') {
    return { habits: sortedJson(app.db.prepare('SELECT * FROM habits').all()), logs: sortedJson(app.db.prepare('SELECT * FROM habit_logs').all()), rituals: sortedJson(app.db.prepare('SELECT * FROM rituals').all()) };
  }
  return app.as(async () => ({
    habits: sortedJson(await app.storage.habits.list({ status: null })), logs: sortedJson(await app.storage.habitLogs.list({})), rituals: sortedJson(await app.storage.rituals.list()),
  }));
}

test('hábitos, registros e rituais: rotas novas respondem igual às antigas, passo a passo, e gravam o mesmo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const oracle = await makeParityApp('oracle', setup);
  t.after(oracle.dispose);
  clock.reset();
  const expected = foldUuids(await runParityScript(oracle, SCRIPT));
  const expectedState = await savedState(oracle, 'oracle');
  for (const status of [200, 201, 400, 404, 410, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  assert.ok(expected.filter((r) => r.status === 201).length >= 25, 'muitas criações com sucesso');
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

test('hábitos: registros e criações simultâneos não perdem soma nem repetem posição', async (t) => {
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, { ...setup, clock: null, clockTables: [], build: (storage) => setup.build(storage, { now: () => new Date() }) });
    t.after(app.dispose);
    const post = (path, body) => fetch(app.base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (res) => ({ status: res.status, json: await res.json() }));
    const logs = await Promise.all(Array.from({ length: 6 }, () => post('/habit-logs', { habit_id: 'h-read', date: '2026-12-01', increment: 0.5 })));
    assert.deepEqual(logs.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 201], `${kind}: um registro criado, os outros regravam`);
    assert.deepEqual(logs.map((r) => r.json.value).sort((a, b) => a - b), [0.5, 1, 1.5, 2, 2.5, 3], `${kind}: cada incremento soma sobre o anterior`);
    assert.equal((await (await fetch(`${app.base}/habit-logs?habit_id=h-read&date=2026-12-01`)).json()).length, 1, `${kind}: um registro por hábito e dia`);

    const made = await Promise.all(Array.from({ length: 6 }, (_, i) => post('/habits', { title: `corrida ${i}` })));
    assert.ok(made.every((r) => r.status === 201), kind);
    assert.deepEqual(made.map((r) => r.json.sort_order).sort((a, b) => a - b), [22, 23, 24, 25, 26, 27], `${kind}: MAX + 1 dentro da transação, sem repetir`);
    const comp = await Promise.all(Array.from({ length: 3 }, (_, i) => post('/habits', { title: `rotina ${i}`, kind: 'compound', children: [{ title: `a${i}` }, { title: `b${i}` }] })));
    const orders = comp.flatMap((r) => [r.json.sort_order, ...r.json.children.map((c) => c.sort_order)]);
    assert.equal(new Set(orders).size, orders.length, `${kind}: compostos e filhos criados juntos não repetem posição (${orders})`);
  }
});
