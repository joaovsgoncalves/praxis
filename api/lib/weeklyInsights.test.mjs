import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDaysYmd, buildWeeklyInsights, isHabitDueOnDate } from './weeklyInsights.js';
import { createTestDb } from '../test-support/helpers.mjs';

test('addDaysYmd adds/subtracts calendar days across month boundaries', () => {
  assert.equal(addDaysYmd('2026-07-13', 6), '2026-07-19');
  assert.equal(addDaysYmd('2026-07-31', 1), '2026-08-01');
  assert.equal(addDaysYmd('2026-07-13', -7), '2026-07-06');
});

test('isHabitDueOnDate respects frequency', () => {
  const monday = '2026-07-13'; // Mon
  const saturday = '2026-07-18'; // Sat
  assert.equal(isHabitDueOnDate({ status: 'active', frequency: 'daily' }, monday), true);
  assert.equal(isHabitDueOnDate({ status: 'active', frequency: 'weekdays' }, monday), true);
  assert.equal(isHabitDueOnDate({ status: 'active', frequency: 'weekdays' }, saturday), false);
  assert.equal(isHabitDueOnDate({ status: 'active', frequency: 'weekends' }, saturday), true);
  assert.equal(isHabitDueOnDate({ status: 'active', frequency: 'weekends' }, monday), false);
});

test('isHabitDueOnDate weekly frequency respects recurrence_days, empty array = every day', () => {
  const monday = '2026-07-13';
  const tuesday = '2026-07-14';
  const habit = { status: 'active', frequency: 'weekly', recurrence_days: '[1]' }; // Monday only
  assert.equal(isHabitDueOnDate(habit, monday), true);
  assert.equal(isHabitDueOnDate(habit, tuesday), false);
  const everyDay = { status: 'active', frequency: 'weekly', recurrence_days: '[]' };
  assert.equal(isHabitDueOnDate(everyDay, monday), true);
  assert.equal(isHabitDueOnDate(everyDay, tuesday), true);
});

test('isHabitDueOnDate is false for non-active habits', () => {
  assert.equal(isHabitDueOnDate({ status: 'paused', frequency: 'daily' }, '2026-07-13'), false);
});

test('buildWeeklyInsights separates done vs skipped vs open habit slots', () => {
  const db = createTestDb();
  db.prepare("INSERT INTO habits (id, title, status, frequency) VALUES ('h1', 'Treino', 'active', 'daily')").run();
  const weekStart = '2026-07-13'; // Monday
  for (const [id, day, outcome, completed] of [
    ['a', '2026-07-13', 'done', 1],
    ['b', '2026-07-14', 'skipped', 0],
    ['c', '2026-07-15', 'done', 1],
    // 2026-07-16..19 left open (no log rows)
  ]) {
    db.prepare(
      'INSERT INTO habit_logs (id, habit_id, date, completed, outcome) VALUES (?, ?, ?, ?, ?)',
    ).run(id, 'h1', day, completed, outcome);
  }
  const weekly = buildWeeklyInsights(db, weekStart);
  assert.equal(weekly.victories.habits_done, 2);
  assert.equal(weekly.victories.habits_skipped, 1);
  assert.ok(weekly.victories.habits_open_slots >= 1);
  assert.equal(weekly.victories.habits_target, 7);
});

test('completedTasks counts tasks whose date OR completed_date falls in the week, excludes ideias', () => {
  const db = createTestDb();
  const weekStart = '2026-07-13';
  const weekEnd = '2026-07-19';
  db.prepare(`
    INSERT INTO tasks (id, title, status, category, date, completed_date)
    VALUES ('t1', 'Feita na semana (por date)', 'completed', 'pessoal', ?, NULL)
  `).run(weekStart);
  db.prepare(`
    INSERT INTO tasks (id, title, status, category, date, completed_date)
    VALUES ('t2', 'Feita na semana (por completed_date)', 'completed', 'pessoal', '2026-06-01', ?)
  `).run(weekEnd);
  db.prepare(`
    INSERT INTO tasks (id, title, status, category, date, completed_date)
    VALUES ('t3', 'Fora da semana', 'completed', 'pessoal', '2026-06-01', '2026-06-02')
  `).run();
  db.prepare(`
    INSERT INTO tasks (id, title, status, category, date)
    VALUES ('t4', 'Ideia completada', 'completed', 'ideias', ?)
  `).run(weekStart);
  const weekly = buildWeeklyInsights(db, weekStart);
  assert.equal(weekly.victories.tasks_completed_count, 2);
  assert.ok(weekly.victories.tasks_completed_samples.includes('Feita na semana (por date)'));
  assert.ok(weekly.victories.tasks_completed_samples.includes('Feita na semana (por completed_date)'));
});

test('stalePending/overdue only counts pending non-ideias tasks dated before the week', () => {
  const db = createTestDb();
  const weekStart = '2026-07-13';
  db.prepare(`INSERT INTO tasks (id, title, status, category, date) VALUES ('t1', 'Atrasada', 'pending', 'pessoal', '2026-07-01')`).run();
  db.prepare(`INSERT INTO tasks (id, title, status, category, date) VALUES ('t2', 'Ideia atrasada', 'pending', 'ideias', '2026-07-01')`).run();
  db.prepare(`INSERT INTO tasks (id, title, status, category, date) VALUES ('t3', 'Concluída atrasada', 'completed', 'pessoal', '2026-07-01')`).run();
  db.prepare(`INSERT INTO tasks (id, title, status, category, date) VALUES ('t4', 'Dentro da semana', 'pending', 'pessoal', ?)`).run(weekStart);
  const weekly = buildWeeklyInsights(db, weekStart);
  assert.equal(weekly.bottlenecks.overdue_tasks_count, 1);
  assert.deepEqual(weekly.bottlenecks.overdue_samples, ['Atrasada']);
});

test('bottlenecks.top_skipped sorts by skip count and surfaces the most common skip reason', () => {
  const db = createTestDb();
  db.prepare("INSERT INTO habits (id, title, status, frequency) VALUES ('h1', 'Água', 'active', 'daily')").run();
  db.prepare("INSERT INTO habits (id, title, status, frequency) VALUES ('h2', 'Leitura', 'active', 'daily')").run();
  const weekStart = '2026-07-13';
  const rows = [
    ['a', 'h1', '2026-07-13', 'time'],
    ['b', 'h1', '2026-07-14', 'time'],
    ['c', 'h2', '2026-07-13', 'energy'],
  ];
  for (const [id, habitId, day, reason] of rows) {
    db.prepare(
      'INSERT INTO habit_logs (id, habit_id, date, completed, outcome, skip_reason) VALUES (?, ?, ?, 0, ?, ?)',
    ).run(id, habitId, day, 'skipped', reason);
  }
  const weekly = buildWeeklyInsights(db, weekStart);
  assert.equal(weekly.bottlenecks.top_skipped[0].title, 'Água');
  assert.equal(weekly.bottlenecks.top_skipped[0].skips, 2);
  assert.equal(weekly.bottlenecks.top_skipped[0].top_reason, 'time');
});

test('suggested_priorities leads with overdue tasks when present', () => {
  const db = createTestDb();
  const weekStart = '2026-07-13';
  db.prepare(`INSERT INTO tasks (id, title, status, category, date) VALUES ('t1', 'Responder cliente', 'pending', 'pessoal', '2026-07-01')`).run();
  const weekly = buildWeeklyInsights(db, weekStart);
  assert.match(weekly.suggested_priorities[0], /Fechar pendência atrasada: Responder cliente/);
});

test('suggested_priorities falls back to generic suggestions when no signals fire', () => {
  const db = createTestDb();
  const weekly = buildWeeklyInsights(db, '2026-07-13');
  assert.ok(weekly.suggested_priorities.length >= 1);
  assert.ok(weekly.suggested_priorities.length <= 3);
});

test('nutrition falls back to null when nutrition tables are not initialized', () => {
  const db = createTestDb(); // withNutrition: false
  const weekly = buildWeeklyInsights(db, '2026-07-13');
  assert.equal(weekly.nutrition, null);
});

test('ideas new_captures and promoted are counted within the week window', () => {
  const db = createTestDb();
  const weekStart = '2026-07-13';
  db.prepare(`
    INSERT INTO tasks (id, title, category, idea_status, created_date, updated_date)
    VALUES ('i1', 'Ideia nova', 'ideias', 'capturada', ?, ?)
  `).run(`${weekStart} 10:00:00`, `${weekStart} 10:00:00`);
  db.prepare(`
    INSERT INTO tasks (id, title, category, idea_status, created_date, updated_date)
    VALUES ('i2', 'Ideia promovida', 'ideias', 'virou_tarefa', '2026-06-01 10:00:00', ?)
  `).run(`${weekStart} 11:00:00`);
  const weekly = buildWeeklyInsights(db, weekStart);
  assert.equal(weekly.ideas.new_captures, 1);
  assert.equal(weekly.ideas.promoted, 1);
});

test('drafts fall back to placeholder strings for an empty week', () => {
  const db = createTestDb();
  const weekly = buildWeeklyInsights(db, '2026-07-13');
  assert.equal(typeof weekly.drafts.highlights, 'string');
  assert.ok(weekly.drafts.highlights.length > 0);
  assert.equal(typeof weekly.drafts.blockers, 'string');
});
