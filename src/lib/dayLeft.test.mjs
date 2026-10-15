import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDayLeft, countOpenTasksForDay } from './dayLeft.js';
import { countHabitDayOutcomes } from './habits.js';

const today = '2026-10-15';

test('faltam N = tarefas abertas de hoje + hábitos folha abertos', () => {
  const tasks = [
    { id: 'a', status: 'pending', date: today },
    { id: 'b', status: 'in_progress', date: today },
    { id: 'feita', status: 'completed', date: today, completed_date: today },
    { id: 'ontem', status: 'pending', date: '2026-10-14' },
    { id: 'nao-hoje', status: 'pending', date: '2026-10-16', day_outcome: 'not_today', day_outcome_date: today },
    { id: 'nao-rolou', status: 'cancelled', date: today, day_outcome: 'missed' },
    { id: 'ideia', status: 'pending', date: today, category: 'ideias' },
  ];
  const habits = [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }, { id: 'h4' }];
  const habitLogs = [
    { habit_id: 'h1', date: today, outcome: 'done', completed: 1 },
    { habit_id: 'h2', date: today, outcome: 'skipped', completed: 0 },
    { habit_id: 'h3', date: today, outcome: null, completed: 0, value: 1 },
  ];

  const result = computeDayLeft({ tasks, habits, habitLogs, today });

  assert.equal(result.openTasks, 2);
  assert.equal(result.openHabits, 2);
  assert.equal(result.left, 4);
  assert.equal(result.total, 7);
  // Bate com os contadores dos cards Tarefas (abertas de hoje) e Hábitos (abertos).
  assert.equal(
    result.left,
    countOpenTasksForDay(tasks, today) + countHabitDayOutcomes(habits, habitLogs, today).open,
  );
});

test('dia vazio: nada falta', () => {
  assert.deepEqual(computeDayLeft({ tasks: [], habits: [], habitLogs: [], today }), {
    left: 0, total: 0, openTasks: 0, openHabits: 0,
  });
});
