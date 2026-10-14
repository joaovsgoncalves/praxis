import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  tasksForDay,
  dayLoad,
  shiftWeek,
  isSameWeek,
  buildWeekStrip,
  toggleSelectedDay,
  visibleWeekDays,
  formatWeekRangeLabel,
  formatDayLabel,
} from '../src/lib/taskWeekStrip.js';
import {
  taskIdFromSearchParams,
  setTaskIdInSearchParams,
  taskLensFromSearchParams,
} from '../src/lib/urlDeepLinks.js';

const TODAY = '2026-10-14'; // quarta

const TASKS = [
  { id: 'open-today', status: 'pending', date: TODAY },
  { id: 'doing-today', status: 'in_progress', date: TODAY },
  { id: 'done-today', status: 'completed', date: TODAY, completed_date: TODAY },
  { id: 'done-late', status: 'completed', date: '2026-10-10', completed_date: TODAY },
  { id: 'open-fri', status: 'pending', date: '2026-10-16' },
  { id: 'cancelled', status: 'cancelled', date: TODAY },
  { id: 'idea', status: 'pending', category: 'ideias', date: TODAY },
  { id: 'inbox', status: 'pending', date: null },
];

describe('taskWeekStrip - dias da semana', () => {
  it('builds monday..sunday from any base date, marking today', () => {
    const strip = buildWeekStrip('2026-10-18', TODAY, []);
    assert.deepEqual(strip.map((d) => d.date), [
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
    ]);
    assert.deepEqual(strip.map((d) => d.dow), ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
    assert.equal(strip[2].dayNum, 14);
    assert.deepEqual(strip.filter((d) => d.isToday).map((d) => d.date), [TODAY]);
  });

  it('shifts weeks across month boundaries and keeps the monday', () => {
    assert.equal(shiftWeek(TODAY, 0), '2026-10-12');
    assert.equal(shiftWeek(TODAY, 1), '2026-10-19');
    assert.equal(shiftWeek(TODAY, -2), '2026-09-28');
    assert.equal(shiftWeek('2026-12-31', 1), '2027-01-04');
    assert.equal(isSameWeek('2026-10-12', '2026-10-18'), true);
    assert.equal(isSameWeek('2026-10-18', '2026-10-19'), false);
  });

  it('formats the week and day labels in PT-BR', () => {
    assert.equal(formatWeekRangeLabel(TODAY), '12 a 18 de out');
    assert.equal(formatWeekRangeLabel('2026-09-30'), '28 de set a 4 de out');
    assert.equal(formatDayLabel(TODAY), 'qua, 14/10');
  });
});

describe('taskWeekStrip - carga e filtro por dia', () => {
  it('counts open and done per day, skipping ideas, cancelled and inbox', () => {
    assert.deepEqual(dayLoad(TASKS, TODAY), { open: 2, done: 2, total: 4 });
    assert.deepEqual(dayLoad(TASKS, '2026-10-16'), { open: 1, done: 0, total: 1 });
    assert.deepEqual(dayLoad(TASKS, '2026-10-13'), { open: 0, done: 0, total: 0 });
  });

  it('a task closed today counts on the day it was closed, not only on its date', () => {
    assert.deepEqual(tasksForDay(TASKS, '2026-10-10').map((t) => t.id), ['done-late']);
    assert.ok(tasksForDay(TASKS, TODAY).some((t) => t.id === 'done-late'));
  });

  it('strip carries the load of each day', () => {
    const strip = buildWeekStrip(TODAY, TODAY, TASKS);
    const byDate = Object.fromEntries(strip.map((d) => [d.date, d.load.total]));
    assert.equal(byDate[TODAY], 4);
    assert.equal(byDate['2026-10-16'], 1);
    assert.equal(byDate['2026-10-12'], 0);
  });

  it('tapping the selected day again clears the filter', () => {
    assert.equal(toggleSelectedDay(null, TODAY), TODAY);
    assert.equal(toggleSelectedDay(TODAY, TODAY), null);
    assert.equal(toggleSelectedDay(TODAY, '2026-10-15'), '2026-10-15');
  });

  it('timeline shows a single focused day only when it belongs to the week', () => {
    assert.deepEqual(visibleWeekDays(TODAY, '2026-10-15'), ['2026-10-15']);
    assert.equal(visibleWeekDays(TODAY, null).length, 7);
    assert.equal(visibleWeekDays(TODAY, '2026-10-20').length, 7);
  });

  it('tolerates empty input', () => {
    assert.deepEqual(tasksForDay(null, TODAY), []);
    assert.deepEqual(tasksForDay(TASKS, null), []);
  });
});

describe('deep link ?task=<id>', () => {
  it('reads and writes the task id without touching other params', () => {
    const params = new URLSearchParams('tab=tasks&lens=week&task=abc-123');
    assert.equal(taskIdFromSearchParams(params), 'abc-123');
    assert.equal(taskLensFromSearchParams(params), 'week', '?lens=week continua abrindo a linha do tempo');

    const closed = setTaskIdInSearchParams(params, null);
    assert.equal(closed.get('task'), null);
    assert.equal(closed.get('lens'), 'week');

    const opened = setTaskIdInSearchParams(new URLSearchParams(), 42);
    assert.equal(opened.get('task'), '42');
    assert.equal(taskIdFromSearchParams(new URLSearchParams('task=')), null);
  });
});
