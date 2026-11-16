/**
 * Paridade HTTP de tarefas (/api/tasks, 12 rotas, e /api/ideas/:id/to-task): rota antiga congelada ×
 * rota nova sobre a camada assíncrona (SQLite e emulador Firestore). Banco antigo semeado igual nos três
 * motores, volume para morder a janela da lista (100) e o teto operacional (150), e conferência do que as
 * rotas gravaram (tarefas, checklist, eventos de XP, espelho, fila da agenda), passo a passo.
 *
 * Relógio: o oráculo usa `datetime('now')` (trocado aqui pelo relógio do teste, por função do SQLite) e
 * `new Date()` (só em `completed_at`, que é normalizado); o serviço novo recebe o mesmo relógio.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTasksRouter as createOracleTasks, registerIdeaToTaskRoute as registerOracleIdeas } from './test-support/oracles/tasks.bcbadad.js';
import { createTaskCalendarQueue as createOracleQueue } from './test-support/oracles/taskCalendarQueue.bcbadad.js';
import { createTasksRouter, registerIdeaToTaskRoute } from './routes/tasks.js';
import { createTasksService } from './services/routine/tasks.js';
import { buildRouteCtx } from './test-support/helpers.mjs';
import { taskRow } from './storage/contract.js';
import { makeParityApp, parityEngines, runParityScript, tasksServiceFor, testClock } from './test-support/httpParity.fase3.mjs';

const TODAY = '2026-11-15';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
const DAY = 86400000;
const day = (back) => new Date(Date.parse(`${TODAY}T12:00:00Z`) - back * DAY).toISOString().slice(0, 10);
const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
const T0 = '2026-10-01 09:00:00';

const task = (id, extra = {}) => taskRow({ id, title: id, date: TODAY, created_date: T0, updated_date: T0, ...extra });
const goal = (id) => ({ id, title: id, description: '', deadline: null, timeframe: 'short', category: 'personal', status: 'active', manual_progress: 0, created_date: T0 });
const item = (id, taskId, extra = {}) => ({ id, task_id: taskId, title: id, done: 0, sort_order: null, created_date: T0, updated_date: T0, ...extra });
const xpRow = (id, source, extra = {}) => ({ id, source_type: 'task', source_id: source, amount: 10, reason: 'Tarefa concluída', created_date: T0, reversed_date: null, ...extra });

const GOALS = [goal('g-1'), goal('g-2')];
const PRIORITIES = ['high', 'medium', 'low'];
// 160 abertas: janela de 100 da lista e teto de 150 da visão operacional; empates de sort_order, NULL e data.
const BULK = range(160, (i) => task(`b${String(i).padStart(3, '0')}`, {
  date: i % 11 === 0 ? null : day((i % 9) - 3), priority: PRIORITIES[i % 3], category: i % 4 === 0 ? 'farmacia' : 'pessoal',
  sort_order: i % 7 === 0 ? null : 100 + (i % 5), created_date: `2026-10-${String(1 + (i % 6)).padStart(2, '0')} 09:00:00`,
}));
const TASKS = [
  ...BULK,
  task('t-open'), task('t-prog', { status: 'in_progress', sort_order: 1 }), task('t-late', { date: day(3), sort_order: 2 }),
  task('t-today', { time: '09:00', sort_order: 3 }), task('t-cal', { calendar_event_id: 'ev1', date: day(1), sort_order: 4 }),
  task('t-nodate', { date: null, sort_order: 5 }), task('t-top', { sort_order: 900 }),
  task('r-daily', { recurrence: 'daily', goal_id: 'g-1', description: 'diária', duration_minutes: 20, sort_order: 6 }),
  task('r-weekly', { recurrence: 'weekly', recurrence_days: '[1,3,5]', sort_order: 7 }),
  task('r-month', { recurrence: 'monthly', date: '2026-01-31', sort_order: 8 }),
  task('r-p', { recurrence: 'daily', date: day(1), sort_order: 9 }), task('r-c', { recurrence: 'daily', recurrence_parent_id: 'r-p', date: TODAY, sort_order: 10 }),
  task('r-lixo', { recurrence: 'daily', recurrence_days: 'não é json', date: 'lixo', sort_order: 11 }),
  task('r-nodate', { recurrence: 'daily', date: null, sort_order: 12 }),
  // posição do filho = MAX da tabela com a tarefa já editada: a editada vira o topo, ou deixa de ser o topo
  task('r-big', { recurrence: 'daily', sort_order: 17 }), task('r-drop', { recurrence: 'daily', sort_order: 99999 }),
  task('d-xp', { status: 'completed', completed_date: TODAY, completed_at: '2026-11-15T10:00:00.000Z', updated_date: '2026-11-15 10:00:00' }),
  task('d-rev', { status: 'done', completed_date: TODAY, updated_date: '2026-11-15 09:00:00' }),
  task('d-old', { status: 'completed', completed_date: day(10), updated_date: '2026-11-05 09:00:00' }),
  task('d-null', { status: 'completed', completed_date: null, completed_at: '2026-11-15T20:00:00.000Z', updated_date: '2026-11-14 09:00:00' }),
  task('d-empty', { status: 'done', completed_date: '', completed_at: null, updated_date: '2026-11-15 08:00:00' }),
  task('x-miss1', { status: 'cancelled', day_outcome: 'missed', day_outcome_date: day(2) }), task('x-miss2', { status: 'cancelled', day_outcome: 'missed', day_outcome_date: day(20) }),
  task('x-skip', { status: 'cancelled', day_outcome: 'not_today', day_outcome_date: day(2) }),
  task('i-1', { category: 'ideias', idea_status: 'capturada', date: null, priority: 'low' }), task('i-2', { category: 'ideias', idea_status: 'virou_tarefa', date: null }),
  task('i-3', { category: 'ideias', idea_status: 'capturada', description: 'detalhe', date: null, title: 'P1 - ideia com prefixo' }),
  task('t-chk', { sort_order: 13 }), task('t-chk2', { sort_order: 14 }), task('t-rm', { sort_order: 15, calendar_event_id: 'ev-rm' }), task('t-rm2', { sort_order: 16 }),
];
const CHECKLIST = [
  item('ci1', 't-chk', { sort_order: 1 }), item('ci2', 't-chk', { sort_order: 0, done: 1 }), item('ci3', 't-chk', { sort_order: null }), item('ci4', 't-chk', { sort_order: 1, created_date: '2026-10-01 08:00:00', done: 1 }),
  item('cj1', 't-chk2', { done: 1 }), item('cj2', 't-chk2', { done: 1 }), item('cr1', 't-rm'), item('cr2', 't-rm2', { sort_order: 4 }),
];
const XP = [xpRow('x1', 'd-xp'), xpRow('x2', 'd-rev', { reversed_date: '2026-11-14 10:00:00' }), xpRow('x3', 't-rm2', { amount: 10 })];
const SEED = [
  { table: 'goals', domain: 'goals', rows: GOALS }, { table: 'tasks', domain: 'tasks', rows: TASKS },
  { table: 'task_checklist_items', domain: 'taskChecklistItems', rows: CHECKLIST }, { table: 'xp_events', domain: 'xpEvents', rows: XP },
];

/** O Google só entra no critério de hoje com hora, ou com evento já ligado (como `taskNeedsCalendarSync` do servidor). */
const taskNeedsCalendarSync = (row) => Boolean(row.calendar_event_id) || Boolean(row.date === TODAY && row.time);
const noop = () => {};
const underApi = (router) => Object.fromEntries(['get', 'post', 'delete'].map((verb) => [verb, (path, ...handlers) => router[verb](path.replace(/^\/api/, ''), ...handlers)]));

const clock = testClock();
const tick = (seconds, step) => () => { clock.advance(seconds); return step; };
const fresh = (seen, n) => seen.filter((id) => UUID.test(id))[n];
const withFresh = (n, build) => (seen) => build(fresh(seen, n));
const NO_CALENDAR = { calendarEnabled: () => false };

export const setup = (extra = {}) => ({
  mount: '/api',
  dbOptions: { withTaskRoutine: true },
  oracle: (db) => {
    // Relógio do teste no lugar de `datetime('now')` (carimbos de criação, edição, XP e fila).
    db.function('datetime', { deterministic: false }, (arg) => { if (arg !== 'now') throw new Error(`datetime(${arg}) fora do roteiro`); return clock.stamp(); });
    const ctx = buildRouteCtx(db, {
      getLocalDateString: () => TODAY, taskNeedsCalendarSync, scheduleCalendarDrain: noop,
      calendarQueue: createOracleQueue({ db, syncTaskToCalendar: noop, now: clock.now }),
    });
    const app = express.Router();
    app.use('/tasks', createOracleTasks(ctx));
    registerOracleIdeas(underApi(app), ctx);
    return app;
  },
  build: (storage, c) => {
    const ctx = buildRouteCtx(null, { getLocalDateString: () => TODAY });
    const tasks = createTasksService({
      storage, getLocalDateString: () => TODAY, addDaysLocal: ctx.addDaysLocal, stripPriorityPrefix: ctx.stripPriorityPrefix, SKIP_REASONS: ctx.SKIP_REASONS,
      taskNeedsCalendarSync, scheduleCalendarDrain: noop, now: c.now, ...extra,
    });
    const app = express.Router();
    app.use('/tasks', createTasksRouter({ tasks }));
    registerIdeaToTaskRoute(underApi(app), { tasks });
    return app;
  },
  seed: SEED,
  mirror: [{ table: 'gamification', domain: 'gamification' }, { table: 'achievements', domain: 'achievements' }],
  clock,
});

const J = (path, body) => ['POST', path, body];
const U = (path, body) => ['PUT', path, body];
const PA = (path, body) => ['PATCH', path, body];
const GETS = [
  ['GET', '/tasks'], ['GET', '/tasks?limit=5'], ['GET', '/tasks?limit=5&offset=5'], ['GET', '/tasks?limit=1000'], ['GET', '/tasks?limit=5000&offset=170'], ['GET', '/tasks?offset=300'],
  ['GET', '/tasks?limit=0'], ['GET', '/tasks?limit=abc&offset=xyz'], ['GET', '/tasks?limit=-5&offset=-3'], ['GET', '/tasks?limit=3&offset=-1'],
  ['GET', `/tasks?date=${TODAY}`], ['GET', `/tasks?date=${day(1)}&limit=3`], ['GET', '/tasks?status=pending&limit=4'], ['GET', '/tasks?status=in_progress'], ['GET', '/tasks?status=done'],
  ['GET', '/tasks?category=farmacia&limit=7'], ['GET', '/tasks?category=ideias'], ['GET', '/tasks?idea_status=capturada'], ['GET', '/tasks?idea_status=virou_tarefa&category=ideias'],
  ['GET', `/tasks?date=${TODAY}&status=pending&category=pessoal&limit=6`], ['GET', '/tasks?date=&status=&category=&idea_status='], ['GET', '/tasks?date=nunca'],
  ['GET', '/tasks?limit=1.5'], ['GET', '/tasks?offset=1.5'], ['GET', '/tasks?limit=2&offset=0.5'], ['GET', '/tasks?date=a&date=b'], ['GET', '/tasks?date[x]=1'], ['GET', '/tasks?status[]=pending&limit=2'], ['GET', '/tasks?date[]=a&date[]=b&limit=2'],
  ['GET', '/tasks?include_overdue=1'], ['GET', '/tasks?include_overdue=true'], ['GET', '/tasks?include_overdue=0'], ['GET', '/tasks?include_overdue=true&limit=3'],
  ['GET', `/tasks?include_overdue=1&today=${day(2)}`], ['GET', '/tasks?include_overdue=1&today=2026-11-20'], ['GET', '/tasks?include_overdue=1&today=2026-11-15T23:59:59'],
  ['GET', '/tasks?include_overdue=1&category=ideias'], ['GET', '/tasks?include_overdue=1&status=cancelled'], ['GET', `/tasks?include_overdue=1&date=${TODAY}&limit=9`],
  ['GET', '/tasks?include_overdue=1&today=abc'], ['GET', '/tasks?include_overdue=1&today=2026-13-45'], ['GET', '/tasks?include_overdue=1&limit=1.5'],
  ['GET', '/tasks/t-chk'], ['GET', '/tasks/t-open'], ['GET', '/tasks/i-3'], ['GET', '/tasks/nope'], ['GET', `/tasks/${'x'.repeat(1600)}`],
];
// Antes de qualquer outro filho de série (cada um vira o novo topo): a tarefa editada deixa de ser o topo, depois vira o topo.
const TOP_STEPS = [
  U('/tasks/r-drop', { status: 'completed', sort_order: 5 }), U('/tasks/r-big', { status: 'completed', sort_order: 9000 }), ['GET', '/tasks?include_overdue=1&limit=4'],
];
const CHECKLIST_STEPS = [
  ['GET', '/tasks/t-chk/checklist'], ['GET', '/tasks/t-open/checklist'], ['GET', '/tasks/nope/checklist'], ['GET', `/tasks/${'x'.repeat(1600)}/checklist`],
  J('/tasks/nope/checklist', { title: 'x' }), J('/tasks/t-chk/checklist', {}), J('/tasks/t-chk/checklist', { title: '   ' }), J('/tasks/t-chk/checklist', { title: null }),
  tick(1, J('/tasks/t-chk/checklist', { title: '  Primeiro novo  ' })), J('/tasks/t-chk/checklist', { title: 5 }), J('/tasks/t-open/checklist', { title: 'a' }), J('/tasks/t-open/checklist', { title: 'b' }),
  J('/tasks/t-chk/checklist', { title: ['x', 'y'] }), J('/tasks/t-chk/checklist', { title: { a: 1 } }), ['POST', '/tasks/t-chk/checklist', 'não é json', true],
  ['GET', '/tasks/t-chk/checklist'], ['GET', '/tasks/t-open/checklist'], ['GET', '/tasks?limit=300'],
  PA('/tasks/nope/checklist/reorder', { ordered_ids: [] }), PA('/tasks/t-chk/checklist/reorder', {}), PA('/tasks/t-chk/checklist/reorder', { ordered_ids: 'x' }),
  tick(1, PA('/tasks/t-chk/checklist/reorder', { ordered_ids: ['ci3', 'ci1', '', null, 'ci3', 'cj1', 'nope', 7, 'ci4', `${'x'.repeat(1600)}`] })), PA('/tasks/t-chk/checklist/reorder', { ordered_ids: [] }),
  PA('/tasks/t-chk/checklist/reorder', { ordered_ids: ['ci2', 'ci4'] }), PA('/tasks/t-chk/checklist/reorder', null),
  PA('/tasks/t-chk/checklist/ci1', { done: true }), PA('/tasks/t-chk/checklist/ci1', { done: 0 }), PA('/tasks/t-chk/checklist/ci1', { done: 'sim', title: '  Renomeado  ' }), PA('/tasks/t-chk/checklist/ci1', { title: '' }),
  PA('/tasks/t-chk/checklist/ci1', { title: '   ' }), PA('/tasks/t-chk/checklist/ci1', { title: 5 }), PA('/tasks/t-chk/checklist/ci1', {}), PA('/tasks/t-chk/checklist/ci1', { done: null }),
  PA('/tasks/t-chk/checklist/nope', { done: true }), PA('/tasks/t-chk2/checklist/ci1', { done: true }), PA('/tasks/nope/checklist/ci1', { done: true }), PA(`/tasks/t-chk/checklist/${'x'.repeat(1600)}`, { done: true }),
  PA('/tasks/t-chk/checklist/ci3', { done: 1, title: ['a'] }), PA('/tasks/t-chk/checklist/ci3', { done: 1, title: { a: 1 } }),
  ['DELETE', '/tasks/t-chk/checklist/nope'], ['DELETE', '/tasks/t-chk2/checklist/ci1'], ['DELETE', `/tasks/t-chk/checklist/${'x'.repeat(1600)}`], ['DELETE', '/tasks/t-chk/checklist/ci4'], ['DELETE', '/tasks/t-chk/checklist/ci4'],
  ['GET', '/tasks/t-chk/checklist'], ['GET', '/tasks/t-chk'], ['GET', '/tasks/t-chk2'], ['GET', '/tasks?limit=300&category=pessoal'],
];
const CREATE_STEPS = [
  J('/tasks', {}), J('/tasks', { title: '' }), J('/tasks', { title: 0 }), J('/tasks', { title: null }), J('/tasks', { title: 'x', goal_id: 'g-fantasma' }), J('/tasks', { title: 'x', goal_id: 9 }),
  J('/tasks', { title: 'x', goal_id: `${'g'.repeat(1600)}` }), ['POST', '/tasks', 'não é json', true], ['POST', '/tasks', '[]', true], ['POST', '/tasks', 'null', true],
  J('/tasks', { title: true }), J('/tasks', { title: {} }), J('/tasks', { title: ['a', 'b'] }), J('/tasks', { title: ['a'] }), J('/tasks', { title: 'x', description: {} }), J('/tasks', { title: 'x', description: ['a', 'b'] }),
  J('/tasks', { title: 'x', date: {} }), J('/tasks', { title: 'x', status: {} }), J('/tasks', { title: 'x', priority: true }), J('/tasks', { title: 'x', category: [] }), J('/tasks', { title: 'x', source: {} }),
  J('/tasks', { title: 'x', recurrence: {} }), J('/tasks', { title: 'x', recurrence_parent_id: {} }), J('/tasks', { title: 'x', calendar_event_id: {} }), J('/tasks', { title: 'x', source_idea_id: ['a', 'b'] }),
  J('/tasks', { title: 'x', sort_order: {} }), J('/tasks', { title: 'x', duration_minutes: {} }), J('/tasks', { title: 'x', idea_status: {} }),
  tick(1, J('/tasks', { title: 'Tarefa simples' })), // fresh #0
  tick(1, J('/tasks', { title: 'P1 - Com prefixo', description: 'desc', date: day(2), time: '08:30', priority: 'high', category: 'farmacia', goal_id: 'g-2', source: 'tela', duration_minutes: '45', sort_order: '300', calendar_event_id: 'evx' })), // #1
  J('/tasks', { title: 'Meta número', goal_id: 'g-1', date: TODAY, time: '10:00' }), J('/tasks', { title: 'Sem meta', goal_id: '' }), J('/tasks', { title: 'Meta nula', goal_id: null }),
  J('/tasks', { title: 'Texto no lugar', date: 20261116, description: 5, priority: 7, category: 8, source: 9, status: 'pending' }), J('/tasks', { title: 5 }), J('/tasks', { title: 'Zero', duration_minutes: 0, sort_order: 0 }),
  J('/tasks', { title: 'Texto numérico', duration_minutes: '30', sort_order: 'x' }), J('/tasks', { title: 'Duração texto', duration_minutes: 'abc' }), J('/tasks', { title: 'Nulos', duration_minutes: null, sort_order: null, description: null }),
  J('/tasks', { title: 'Vazios', date: '', time: '', calendar_event_id: '', recurrence_parent_id: '', source_idea_id: '', source: '' }),
  J('/tasks', { title: 'Dias', recurrence: 'weekly', recurrence_days: [1, 3, 'x'] }), J('/tasks', { title: 'Dias texto', recurrence: 'weekly', recurrence_days: '[1]' }), J('/tasks', { title: 'Dias nulos', recurrence_days: null }),
  J('/tasks', { title: 'Ideia nova', category: 'ideias' }), J('/tasks', { title: 'Ideia com dados', category: 'ideias', idea_status: 'pensando', date: day(1), time: '07:00', priority: 'high' }),
  J('/tasks', { title: 'Ideia vazia', category: 'ideias', idea_status: '', date: '', time: '', priority: '' }), J('/tasks', { title: 'Não ideia', idea_status: 'x' }),
  J('/tasks', { title: 'Já nasce concluída', status: 'completed' }), J('/tasks', { title: 'Nasce feita atrasada', status: 'done', date: day(2) }),
  J('/tasks', { title: 'Nasce feita sem data', status: 'done', date: null }), J('/tasks', { title: 'Cancelada', status: 'cancelled' }), J('/tasks', { title: 'Status livre', status: 'qualquer' }),
  J('/tasks', { title: 'Série concluída', status: 'completed', recurrence: 'daily' }), J('/tasks', { title: 'Série semanal', status: 'done', recurrence: 'weekly', recurrence_days: [1, 4], date: day(1), time: '06:00', goal_id: 'g-1', duration_minutes: 15 }),
  J('/tasks', { title: 'Série mensal', status: 'done', recurrence: 'monthly', date: '2026-01-31', source: '', priority: 'low' }), J('/tasks', { title: 'Série sem data', status: 'done', recurrence: 'daily', date: null }),
  J('/tasks', { title: 'Série lixo', status: 'done', recurrence: 'yearly' }), J('/tasks', { title: 'Série com pai', status: 'done', recurrence: 'daily', recurrence_parent_id: 'r-p', date: day(1) }),
  J('/tasks', { title: 'Série já existe', status: 'done', recurrence: 'daily', recurrence_parent_id: 'r-p', date: day(2) }),
  J('/tasks', { title: 'Não concluída com série', recurrence: 'daily' }),
  J('/tasks', { title: 'Posição enorme', sort_order: 1000 }), J('/tasks', { title: 'Concluída depois do topo', status: 'done', recurrence: 'daily', sort_order: 5000 }), J('/tasks', { title: 'Depois do topo' }),
  J('/tasks', { title: 'Agenda hoje', date: TODAY, time: '14:00' }), J('/tasks', { title: 'Agenda outro dia', date: day(1), time: '14:00' }), J('/tasks', { title: 'Agenda evento', calendar_event_id: 'ev-novo' }),
  J('/tasks', { title: `${'ç'.repeat(300)}` }), J('/tasks', { title: '  espaços  ' }), J('/tasks', { title: 'P2: outro prefixo' }), J('/tasks', { title: 'P3 — travessão' }),
  ['GET', '/tasks?limit=300'], ['GET', '/tasks?include_overdue=1'], ['GET', '/tasks?limit=300&category=ideias'],
];
const UPDATE_STEPS = [
  U('/tasks/nope', { title: 'x' }), U(`/tasks/${'x'.repeat(1600)}`, { title: 'x' }), U('/tasks/t-open', { goal_id: 'g-fantasma' }), U('/tasks/t-open', { goal_id: 9, title: 'não grava' }),
  ['PUT', '/tasks/t-open', 'lixo', true], ['PUT', '/tasks/t-open', '[]', true], ['PUT', '/tasks/t-open', 'null', true],
  U('/tasks/t-open', {}), tick(1, U('/tasks/t-open', { title: 'P1 — Renomeada', description: 'nova', date: day(1), time: '07:15', priority: 'high', category: 'estudo', source: 'api', duration_minutes: '25', sort_order: '77', calendar_event_id: 'ev-open', recurrence: 'weekly', recurrence_days: [2, 4], idea_status: 'x', source_idea_id: 'src' })),
  U('/tasks/t-open', { title: '' }), U('/tasks/t-open', { title: 'Depois do vazio' }), U('/tasks/t-open', { title: {} }), U('/tasks/t-open', { description: {} }), U('/tasks/t-open', { date: ['a', 'b'] }), U('/tasks/t-open', { sort_order: {} }), U('/tasks/t-open', { duration_minutes: {} }),
  U('/tasks/t-open', { description: null, date: null, time: null, priority: null, category: null, source: null, sort_order: null, duration_minutes: null, calendar_event_id: null, recurrence: null }),
  U('/tasks/t-open', { duration_minutes: null }), U('/tasks/t-open', { duration_minutes: 0, sort_order: 0 }), U('/tasks/t-open', { duration_minutes: 'abc', sort_order: 'x' }), U('/tasks/t-open', { recurrence_days: 'lixo' }), U('/tasks/t-open', { recurrence_days: null }),
  U('/tasks/t-open', { idea_status: null, source_idea_id: null }), U('/tasks/t-open', { date: 20261201, priority: 3, description: 4 }),
  U('/tasks/t-open', { goal_id: 'g-1' }), U('/tasks/t-open', { goal_id: 'g-1', title: 'mesma meta' }), U('/tasks/t-open', { goal_id: 'g-2' }), U('/tasks/t-open', { goal_id: '' }), U('/tasks/t-open', { goal_id: null }), U('/tasks/t-open', { goal_id: 'g-fantasma' }),
  U('/tasks/r-daily', { goal_id: 'g-fantasma' }), U('/tasks/r-daily', { goal_id: 'g-1' }), U('/tasks/r-daily', { goal_id: 'g-2' }), U('/tasks/r-daily', { goal_id: 'g-1' }),
  // concluir: XP + próxima ocorrência
  tick(1, U('/tasks/t-open', { status: 'completed' })), U('/tasks/t-open', { status: 'completed' }), U('/tasks/t-open', { status: 'pending' }), tick(1, U('/tasks/t-open', { status: 'done' })), U('/tasks/t-open', { status: 'cancelled' }), U('/tasks/t-open', { status: 'pending' }),
  U('/tasks/t-late', { status: 'completed' }), U('/tasks/t-late', { status: 'in_progress' }), U('/tasks/t-late', { status: 'done' }), U('/tasks/t-nodate', { status: 'done' }), U('/tasks/t-nodate', { status: 'pending' }),
  tick(1, U('/tasks/r-daily', { status: 'completed' })), tick(1, U('/tasks/r-daily', { status: 'pending' })), U('/tasks/r-daily', { status: 'completed' }), U('/tasks/r-daily', { status: 'done' }),
  tick(1, U('/tasks/r-weekly', { status: 'done' })), U('/tasks/r-month', { status: 'completed' }), U('/tasks/r-p', { status: 'completed' }), U('/tasks/r-p', { status: 'pending', title: 'reabre' }), U('/tasks/r-p', { status: 'done' }),
  U('/tasks/r-lixo', { status: 'completed' }), U('/tasks/r-nodate', { status: 'completed' }), U('/tasks/r-c', { status: 'completed' }), U('/tasks/r-c', { status: 'pending' }),
  U('/tasks/t-top', { status: 'completed', recurrence: 'daily', sort_order: 1 }), U('/tasks/t-open', { status: 'completed', recurrence: 'daily', sort_order: 2000 }),
  U('/tasks/d-xp', { title: 'só o nome' }), U('/tasks/d-xp', { status: 'pending' }), U('/tasks/d-xp', { status: 'completed' }), U('/tasks/d-rev', { status: 'pending' }), U('/tasks/d-rev', { status: 'done' }), U('/tasks/d-old', { status: 'cancelled' }),
  U('/tasks/d-old', { status: 'completed' }), U('/tasks/d-null', { status: 'in_progress' }), U('/tasks/d-empty', { priority: 'low' }), U('/tasks/x-miss1', { status: 'pending' }), U('/tasks/i-1', { status: 'completed' }),
  // agenda: tarefa de hoje com hora, evento ligado, repetidas (intenção fundida)
  U('/tasks/t-today', { title: 'hoje com hora' }), U('/tasks/t-today', { title: 'de novo' }), U('/tasks/t-cal', { status: 'completed' }), U('/tasks/t-cal', { status: 'pending' }), U('/tasks/t-rm2', { date: day(1) }), U('/tasks/t-chk2', { date: TODAY, time: '11:00' }),
  withFresh(0, (id) => U(`/tasks/${id}`, { title: 'Tarefa renomeada', sort_order: 1 })), withFresh(0, (id) => U(`/tasks/${id}`, { status: 'done' })), withFresh(1, (id) => U(`/tasks/${id}`, { status: 'completed', recurrence: 'daily' })),
  ['GET', '/tasks?limit=400'], ['GET', '/tasks?include_overdue=1'],
];
const REMOVE_STEPS = [
  ['DELETE', '/tasks/nope'], ['DELETE', `/tasks/${'x'.repeat(1600)}`], ['DELETE', '/tasks/t-rm'], ['DELETE', '/tasks/t-rm'], ['DELETE', '/tasks/t-rm2'], ['DELETE', '/tasks/d-xp'], ['DELETE', '/tasks/d-rev'], ['DELETE', '/tasks/t-chk'], ['DELETE', '/tasks/t-cal'],
  ['DELETE', '/tasks/t-open'], ['DELETE', '/tasks/r-c'], withFresh(0, (id) => ['DELETE', `/tasks/${id}`]), ['GET', '/tasks/t-chk/checklist'], ['GET', '/tasks?limit=400'],
];
const NOT_TODAY = [
  J('/tasks/nope/not-today', {}), J(`/tasks/${'x'.repeat(1600)}/not-today`, {}), J('/tasks/d-old/not-today', {}), J('/tasks/x-skip/not-today', {}), J('/tasks/x-miss2/not-today', {}), J('/tasks/i-1/not-today', {}), J('/tasks/t-nodate/not-today', { reason: 'lixo' }),
  J('/tasks/t-nodate/not-today', { reason: 5 }), J('/tasks/t-nodate/not-today', { reason: {} }), J('/tasks/t-nodate/not-today', { reason: ['time'] }),
  tick(1, J('/tasks/t-nodate/not-today', {})), J('/tasks/t-nodate/not-today', { reason: '  ENERGY ' }), J('/tasks/t-prog/not-today', { reason: 'time' }), J('/tasks/t-prog/not-today', { reason: '' }), J('/tasks/t-prog/not-today', { reason: null }),
  J('/tasks/t-today/not-today', { reason: 'context' }), J('/tasks/t-cal/not-today', { reason: 'other' }), J('/tasks/r-weekly/not-today', {}), ['POST', '/tasks/t-late/not-today', 'lixo', true], J('/tasks/t-late/not-today'),
  ['GET', '/tasks?include_overdue=1'], ['GET', '/tasks?status=pending&limit=300'],
];
const IDEAS = [
  J('/ideas/nope/to-task', {}), J(`/ideas/${'x'.repeat(1600)}/to-task`, {}), J('/ideas/t-open/to-task', {}), J('/ideas/i-2/to-task', {}), tick(1, J('/ideas/i-1/to-task', {})), J('/ideas/i-1/to-task', {}),
  J('/ideas/i-3/to-task', { category: 'estudo', date: day(1), priority: 'high' }), ['POST', '/ideas/i-3/to-task', 'lixo', true], ['GET', '/tasks/i-1'], ['GET', '/tasks/i-3'], ['GET', '/tasks?category=ideias'], ['GET', '/tasks?limit=400&status=pending'],
  tick(1, J('/tasks', { title: 'Outra ideia', category: 'ideias' })),
  (seen) => ['POST', `/ideas/${seen.filter((id) => UUID.test(id)).at(-1)}/to-task`, { category: 'ideias', date: TODAY }],
];
const REORDER = [
  PA('/tasks/reorder', {}), PA('/tasks/reorder', { ordered_ids: [] }), PA('/tasks/reorder', { ordered_ids: 'x' }), PA('/tasks/reorder', null), PA('/tasks/reorder', []),
  PA('/tasks/reorder', { ids: ['t-prog', '', null, 't-today', 'nope', 't-prog', 7] }), PA('/tasks/reorder', { ordered_ids: ['t-top', 'r-daily', `${'x'.repeat(1600)}`, 'd-old', 'i-1'], ids: ['t-open'] }),
  PA('/tasks/reorder', { ordered_ids: [null, '', 0] }), ['GET', '/tasks?limit=20'], ['GET', '/tasks?include_overdue=1&limit=5'],
];
// Os ids novos (`fresh`) contam pelas tarefas criadas: as criações vêm antes de qualquer item de checklist novo.
export const SCRIPT = [...GETS, ...TOP_STEPS, ...CREATE_STEPS, ...CHECKLIST_STEPS, ...UPDATE_STEPS, ...NOT_TODAY, ...IDEAS, ...REORDER, ...REMOVE_STEPS, ['GET', '/tasks?limit=1000'], ['GET', '/tasks?include_overdue=1']];

/** UUID fora dos campos `id` (pai da série, ideia de origem) vira ficha pela ordem de aparição; `completed_at` ISO é normalizado. */
function foldUuids(results) {
  const seen = new Map();
  const fold = (text) => text.replace(UUID_G, (id) => { if (!seen.has(id)) seen.set(id, `#u${seen.size + 1}`); return seen.get(id); })
    .replace(/"completed_at":"\d{4}-\d\d-\d\dT[\d:.]+Z"/g, '"completed_at":"ISO"');
  return results.map((result) => ({ ...result, body: fold(result.body) }));
}

const norm = (value) => (typeof value === 'string' ? value.replace(UUID_G, 'UUID').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/, (stamp) => (stamp === '' ? stamp : 'ISO')) : value);
const sortedJson = (rows) => rows.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, norm(v)])))).sort();

/** O que as rotas gravaram: tarefas, checklist, eventos de XP, espelho do XP e a fila da agenda. */
export async function savedState(app, kind) {
  if (kind === 'oracle' || kind === 'sqlite') {
    const q = (sql) => app.db.prepare(sql).all();
    return {
      tasks: sortedJson(q('SELECT * FROM tasks')), checklist: sortedJson(q('SELECT * FROM task_checklist_items')), xp: sortedJson(q('SELECT * FROM xp_events')),
      mirror: q("SELECT xp_total, level FROM gamification WHERE id = 'main'")[0], queue: sortedJson(q('SELECT * FROM task_calendar_queue')),
    };
  }
  return app.as(async () => ({
    tasks: sortedJson(await app.storage.tasks.all()), checklist: sortedJson((await Promise.all((await app.storage.tasks.all()).map((t) => app.storage.taskChecklistItems.list(t.id)))).flat()),
    xp: sortedJson(await app.storage.xpEvents.list()),
    mirror: await (async () => { const { xp_total, level } = await app.storage.gamification.get('main'); return { xp_total, level }; })(),
    queue: sortedJson(await app.storage.taskCalendarQueue.list()),
  }));
}

export async function replay(t, makeSetup) {
  const oracle = await makeParityApp('oracle', makeSetup);
  t.after(oracle.dispose);
  clock.reset();
  const expected = foldUuids(await runParityScript(oracle, SCRIPT));
  return { expected, expectedState: await savedState(oracle, 'oracle') };
}

test('tarefas: rotas novas respondem igual às antigas, passo a passo, e gravam o mesmo', async (t) => {
  if (!process.env.SHOW_ERRORS) t.mock.method(console, 'error', () => {});
  const { expected, expectedState } = await replay(t, setup());
  for (const status of [200, 201, 400, 404, 409, 500]) assert.ok(expected.some((r) => r.status === status), `roteiro cobre ${status}`);
  assert.ok(expected.filter((r) => r.status === 201).length >= 50, 'muitas criações com sucesso');
  assert.ok(expectedState.queue.length >= 6, 'fila da agenda recebeu intenções (novas e fundidas)');
  assert.ok(expectedState.xp.length > XP.length + 5, 'eventos de XP novos e estornos');
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup());
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

/** Diferenças intencionais: valor que nenhum consumidor manda e que o SQLite gravaria como REAL. */
test('tarefas: posição ou duração fracionária é recusada (a antiga gravava REAL); o resto do envelope é o mesmo', async (t) => {
  t.mock.method(console, 'error', () => {});
  const steps = [
    J('/tasks', { title: 'Fração', sort_order: 1.5 }), J('/tasks', { title: 'Fração', duration_minutes: 1.5 }), U('/tasks/t-open', { sort_order: 2.5 }), U('/tasks/t-open', { duration_minutes: 0.5 }),
    ['GET', '/tasks/t-open'],
  ];
  const run = async (kind) => {
    const app = await makeParityApp(kind, setup());
    t.after(app.dispose);
    clock.reset();
    return foldUuids(await runParityScript(app, steps));
  };
  const oracle = await run('oracle');
  assert.deepEqual(oracle.slice(0, 4).map((r) => r.status), [201, 201, 200, 200], 'o oráculo aceita (grava REAL)');
  for (const kind of parityEngines()) {
    const got = await run(kind);
    assert.deepEqual(got.slice(0, 4).map((r) => [r.status, JSON.parse(r.body).code]), Array(4).fill([500, 'task_write_failed']), `${kind}: recusa explícita, nada gravado`);
    assert.notEqual(JSON.parse(got[4].body).sort_order, 2.5, `${kind}: a posição não mudou`);
  }
});

test('tarefas: criações e conclusões simultâneas não repetem posição nem pagam XP duas vezes', async (t) => {
  for (const kind of parityEngines()) {
    // Direto no serviço (sem HTTP no meio): as seis chamadas largam no mesmo instante.
    const app = await makeParityApp(kind, { ...setup(), clock: null, build: () => express.Router() });
    t.after(app.dispose);
    const ctx = buildRouteCtx(null, { getLocalDateString: () => TODAY });
    const service = tasksServiceFor(app.storage, ctx, { taskNeedsCalendarSync, scheduleCalendarDrain: noop });
    await app.as(async () => {
      const made = await Promise.all(Array.from({ length: 6 }, (_, i) => service.create({ title: `corrida ${i}` })));
      assert.ok(made.every((r) => r.status === 201), kind);
      const tops = made.map((r) => r.body.sort_order).sort((a, b) => a - b);
      assert.deepEqual(tops, Array.from({ length: 6 }, (_, i) => tops[0] + i), `${kind}: MAX + 1 dentro da transação, sem repetir`);

      const done = await Promise.all(Array.from({ length: 6 }, () => service.update('r-weekly', { status: 'completed' })));
      assert.ok(done.every((r) => r.status === 200), `${kind}: ${JSON.stringify(done.map((r) => r.status))}`);
      assert.equal(done.filter((r) => r.body.xp_sync?.awarded === 10).length, 1, `${kind}: um só prêmio de XP`);
      assert.equal(done.filter((r) => r.body.next_occurrence?.created === true).length, 1, `${kind}: uma só próxima ocorrência`);
      const serie = (await app.storage.tasks.all()).filter((r) => r.id === 'r-weekly' || r.recurrence_parent_id === 'r-weekly');
      assert.equal(serie.length, 2, `${kind}: a série tem a tarefa e uma ocorrência`);
      assert.equal((await app.storage.xpEvents.list()).filter((e) => e.source_id === 'r-weekly' && e.reversed_date === null).length, 1);
    });
  }
});
