import test from 'node:test';
import assert from 'node:assert/strict';
import { focusWeeklyGoalView } from './focusWeeklyGoal.js';

// 2026-10-12 é segunda.
const MONDAY = '2026-10-12';

test('meta desligada não devolve nada', () => {
  assert.equal(focusWeeklyGoalView({ goalMinutes: null, doneMinutes: 120, weekStart: MONDAY, today: '2026-10-15' }), null);
  assert.equal(focusWeeklyGoalView({ goalMinutes: undefined, doneMinutes: 120, weekStart: MONDAY, today: '2026-10-15' }), null);
});

test('feito, meta e proporção da barra (limitada a 1)', () => {
  const view = focusWeeklyGoalView({ goalMinutes: 300, doneMinutes: 150, weekStart: MONDAY, today: '2026-10-13' });
  assert.equal(view.done, 150);
  assert.equal(view.goal, 300);
  assert.equal(view.ratio, 0.5);
  assert.equal(focusWeeklyGoalView({ goalMinutes: 300, doneMinutes: 450, weekStart: MONDAY, today: '2026-10-13' }).ratio, 1);
});

test('projeção só a partir de quarta, na semana atual e com algo feito', () => {
  assert.equal(focusWeeklyGoalView({ goalMinutes: 300, doneMinutes: 100, weekStart: MONDAY, today: '2026-10-13' }).projection, null);
  // Quarta: 90 min em 3 dias → 210 na semana.
  assert.equal(focusWeeklyGoalView({ goalMinutes: 300, doneMinutes: 90, weekStart: MONDAY, today: '2026-10-14' }).projection, 210);
  // Domingo: o ritmo bate com o feito.
  assert.equal(focusWeeklyGoalView({ goalMinutes: 300, doneMinutes: 200, weekStart: MONDAY, today: '2026-10-18' }).projection, 200);
  assert.equal(focusWeeklyGoalView({ goalMinutes: 300, doneMinutes: 0, weekStart: MONDAY, today: '2026-10-16' }).projection, null);
});

test('semana passada não tem projeção', () => {
  const view = focusWeeklyGoalView({ goalMinutes: 300, doneMinutes: 120, weekStart: '2026-10-05', today: '2026-10-15' });
  assert.equal(view.isCurrentWeek, false);
  assert.equal(view.projection, null);
});
