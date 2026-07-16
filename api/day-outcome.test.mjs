/**
 * Unit tests for day-outcome (streak freeze + log consistency rules).
 * Run: node api/day-outcome.test.mjs
 */
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { buildAvoidanceInsights } from './lib/avoidanceInsights.js';
import { buildWeeklyInsights, addDaysYmd } from './lib/weeklyInsights.js';

function isHabitLogDone(log) {
  if (!log) return false;
  if (log.outcome === 'skipped') return false;
  if (log.outcome === 'done') return true;
  return log.completed === 1 || log.completed === true;
}

function isHabitLogSkipped(log) {
  if (!log) return false;
  return log.outcome === 'skipped';
}

function getStreaksFromLogs(logs, today) {
  if (logs.length === 0) return { current_streak: 0, best_streak: 0 };
  const byDate = new Map();
  for (const log of logs) {
    if (!byDate.has(log.date)) byDate.set(log.date, log);
  }

  let currentStreak = 0;
  let checkDate = new Date(`${today}T12:00:00`);
  for (let i = 0; i < 4000; i++) {
    const ds = checkDate.toISOString().split('T')[0];
    const log = byDate.get(ds);
    if (isHabitLogDone(log)) {
      currentStreak += 1;
      checkDate.setDate(checkDate.getDate() - 1);
      continue;
    }
    if (isHabitLogSkipped(log)) {
      checkDate.setDate(checkDate.getDate() - 1);
      continue;
    }
    break;
  }

  const allDates = [...byDate.keys()].sort();
  if (allDates.length === 0) return { current_streak: currentStreak, best_streak: 0 };
  const start = new Date(`${allDates[0]}T12:00:00`);
  const end = new Date(`${allDates[allDates.length - 1]}T12:00:00`);
  let bestStreak = 0;
  let streak = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const ds = cursor.toISOString().split('T')[0];
    const log = byDate.get(ds);
    if (isHabitLogDone(log)) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else if (isHabitLogSkipped(log)) {
      // freeze
    } else {
      streak = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { current_streak: currentStreak, best_streak: Math.max(bestStreak, currentStreak) };
}

// --- streak freeze ---
{
  const logs = [
    { date: '2026-07-14', completed: 1, outcome: 'done' },
    { date: '2026-07-15', completed: 0, outcome: 'skipped' },
    { date: '2026-07-16', completed: 1, outcome: 'done' },
  ];
  const s = getStreaksFromLogs(logs, '2026-07-16');
  assert.equal(s.current_streak, 2, 'skip freezes — done+skip+done = 2');
  assert.ok(s.best_streak >= 2);
  console.log('✓ streak freezes across skip');
}

{
  const logs = [
    { date: '2026-07-14', completed: 1, outcome: 'done' },
    // 15 open miss
    { date: '2026-07-16', completed: 1, outcome: 'done' },
  ];
  const s = getStreaksFromLogs(logs, '2026-07-16');
  assert.equal(s.current_streak, 1, 'open day breaks streak');
  console.log('✓ open day breaks streak');
}

// --- insights with temp db ---
{
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE habits (
      id TEXT PRIMARY KEY, title TEXT, status TEXT DEFAULT 'active',
      frequency TEXT DEFAULT 'daily', recurrence_days TEXT DEFAULT '[]'
    );
    CREATE TABLE habit_logs (
      id TEXT PRIMARY KEY, habit_id TEXT, date TEXT, completed INTEGER DEFAULT 0,
      outcome TEXT, skip_reason TEXT, created_date TEXT
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT, date TEXT, status TEXT, priority TEXT,
      category TEXT DEFAULT 'pessoal', created_date TEXT, updated_date TEXT,
      idea_status TEXT, completed_date TEXT, completed_at TEXT
    );
    CREATE TABLE focus_sessions (id TEXT PRIMARY KEY, date TEXT, duration_seconds INTEGER);
    CREATE TABLE wellness_checks (id TEXT PRIMARY KEY, date TEXT, mood INTEGER, productivity INTEGER, sleep_hours REAL, sleep_quality INTEGER);
    CREATE TABLE capture_queue (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE nutrition_profile (id TEXT PRIMARY KEY);
    CREATE TABLE nutrition_logs (id TEXT PRIMARY KEY, date TEXT);
    CREATE TABLE nutrition_foods (id TEXT PRIMARY KEY);
  `);

  const today = '2026-07-16';
  const yesterday = addDaysYmd(today, -1);
  db.prepare("INSERT INTO habits (id, title, status, frequency) VALUES ('h1', 'Treino', 'active', 'daily')").run();
  db.prepare(
    "INSERT INTO habit_logs (id, habit_id, date, completed, outcome) VALUES ('l1', 'h1', ?, 0, 'skipped')",
  ).run(today);

  const avoidance = buildAvoidanceInsights(db, today);
  const openHabit = avoidance.items.find((i) => i.entity_id === 'h1' && i.type === 'habit');
  assert.equal(openHabit, undefined, 'skip today should not appear as open miss');
  console.log('✓ avoidance: skip today closes loop');

  // yesterday skipped, today open
  db.prepare('DELETE FROM habit_logs').run();
  db.prepare(
    "INSERT INTO habit_logs (id, habit_id, date, completed, outcome) VALUES ('l2', 'h1', ?, 0, 'skipped')",
  ).run(yesterday);
  const avoidance2 = buildAvoidanceInsights(db, today);
  const mild = avoidance2.items.find((i) => i.id === 'habit-skip-open-h1');
  assert.ok(mild, 'yesterday skip + today open → mild nudge');
  console.log('✓ avoidance: yesterday skip + today open nudge');

  // weekly
  const weekStart = '2026-07-13'; // mon
  db.prepare('DELETE FROM habit_logs').run();
  for (const [id, day, outcome, completed] of [
    ['a', '2026-07-13', 'done', 1],
    ['b', '2026-07-14', 'skipped', 0],
    ['c', '2026-07-15', 'done', 1],
    // 16 open
  ]) {
    db.prepare(
      'INSERT INTO habit_logs (id, habit_id, date, completed, outcome) VALUES (?, ?, ?, ?, ?)',
    ).run(id, 'h1', day, completed, outcome);
  }
  const weekly = buildWeeklyInsights(db, weekStart);
  assert.equal(weekly.victories.habits_done, 2);
  assert.equal(weekly.victories.habits_skipped, 1);
  assert.ok(weekly.victories.habits_open_slots >= 1);
  assert.ok(Array.isArray(weekly.bottlenecks.top_skipped));
  assert.equal(weekly.bottlenecks.top_skipped[0]?.skips, 1);
  console.log('✓ weeklyInsights separates skipped vs open');
}

console.log('\nAll day-outcome tests passed.');
