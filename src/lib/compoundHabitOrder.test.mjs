/**
 * Minimal unit test for compound day order.
 * Run: node src/lib/compoundHabitOrder.test.mjs
 *
 * Note: imports habits via relative path (no @ alias under plain node).
 */

import assert from 'node:assert/strict';
import {
  compareCompoundHabitsForDay,
  isRitualOpenByDefault,
  partitionCompoundHabitsForDay,
  ritualPhase,
  sortCompoundHabitsForDay,
  titlePeriodMinutes,
} from './compoundHabitOrder.js';

// title keywords
assert.equal(titlePeriodMinutes('Abertura do dia'), 6 * 60);
assert.equal(titlePeriodMinutes('Fechamento do dia'), 21 * 60);
assert.equal(titlePeriodMinutes('Rotina da tarde'), 14 * 60);
assert.equal(titlePeriodMinutes('Algo aleatório'), null);

// João case: Abertura above Fechamento (no preferred_time)
const abertura = { id: 'a', title: 'Abertura do dia', sort_order: 2 };
const fechamento = { id: 'f', title: 'Fechamento do dia', sort_order: 1 };
const ordered = sortCompoundHabitsForDay([fechamento, abertura]);
assert.equal(ordered[0].title, 'Abertura do dia');
assert.equal(ordered[1].title, 'Fechamento do dia');

// preferred_time wins over title
const lateOpening = {
  id: 'late',
  title: 'Abertura do dia',
  preferred_time: '22:00',
};
const earlyClose = {
  id: 'early',
  title: 'Fechamento do dia',
  preferred_time: '07:00',
};
const byTime = sortCompoundHabitsForDay([lateOpening, earlyClose]);
assert.equal(byTime[0].id, 'early');
assert.equal(byTime[1].id, 'late');

// first step preferred_time
const withStep = {
  id: 's',
  title: 'Rotina X',
  children: [{ preferred_time: '08:30', title: 'Café' }],
};
const eveningTitle = { id: 'e', title: 'Noite de sono' };
assert.ok(compareCompoundHabitsForDay(withStep, eveningTitle) < 0);

// Unified list: morning routines, checks, since clock, then closing last.
const simple = { id: 'water', title: 'Beber 2L' };
const since = { id: 'clean', title: 'Sem pornografia', tracking_mode: 'since' };
const night = { id: 'night', title: 'Preparar o sono' };
const { beforeChecks, afterChecks } = partitionCompoundHabitsForDay([
  fechamento,
  night,
  abertura,
]);
const unified = [...beforeChecks, simple, since, ...afterChecks];
assert.deepEqual(unified.map((item) => item.title), [
  'Abertura do dia',
  'Beber 2L',
  'Sem pornografia',
  'Preparar o sono',
  'Fechamento do dia',
]);

// Janelas do Hoje: Abertura expandida antes das 11h, Fechamento a partir das 20h.
assert.equal(ritualPhase(abertura), 'opening');
assert.equal(ritualPhase(fechamento), 'closing');
assert.equal(ritualPhase({ title: 'Revisão', preferred_time: '15:00' }), 'other');
assert.equal(isRitualOpenByDefault(abertura, '06:30'), true);
assert.equal(isRitualOpenByDefault(abertura, '10:59'), true);
assert.equal(isRitualOpenByDefault(abertura, '11:00'), false);
assert.equal(isRitualOpenByDefault(abertura, 21), false);
assert.equal(isRitualOpenByDefault(fechamento, '19:59'), false);
assert.equal(isRitualOpenByDefault(fechamento, '20:00'), true);
assert.equal(isRitualOpenByDefault(fechamento, 23), true);
assert.equal(isRitualOpenByDefault(fechamento, '08:00'), false);
assert.equal(isRitualOpenByDefault({ title: 'Revisão', preferred_time: '15:00' }, '15:00'), false);
assert.equal(isRitualOpenByDefault(abertura, new Date(2026, 9, 15, 9, 0)), true);

console.log('compoundHabitOrder.test.mjs: ok');
