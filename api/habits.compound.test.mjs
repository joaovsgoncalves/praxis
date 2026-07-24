import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { migrateActiveRitualsToCompoundHabits } from './lib/dbInit.js';
import { createHabitsRouter, registerHabitLogRoutes } from './routes/habits.js';
import { createRitualsRouter } from './routes/rituals.js';
import {
  buildRouteCtx,
  createTestDb,
  requestJson,
  startTestServer,
} from './test-support/helpers.mjs';

test('boot migration turns each active legacy sequence into one ordered compound habit', () => {
  const db = createTestDb();
  db.prepare(`
    INSERT INTO habits (id, title, preferred_time, status, sort_order)
    VALUES
      ('wake', 'Acordar', '06:30', 'active', 1),
      ('water', 'Beber água', '06:35', 'active', 2)
  `).run();
  db.prepare(`
    INSERT INTO rituals (id, name, emoji, time_of_day, habits_order, status)
    VALUES ('morning', 'Rotina matinal', '🌅', 'morning', '["water","wake"]', 'active')
  `).run();

  assert.equal(migrateActiveRitualsToCompoundHabits(db), 1);

  const compound = db.prepare(`
    SELECT * FROM habits WHERE source = 'ritual_migration:morning'
  `).get();
  assert.equal(compound.kind, 'compound');
  assert.equal(compound.title, 'Rotina matinal');
  assert.equal(compound.description, '🌅');

  const children = db.prepare(`
    SELECT id, parent_id, position_in_parent, preferred_time
    FROM habits WHERE parent_id = ?
    ORDER BY position_in_parent
  `).all(compound.id);
  assert.deepEqual(children.map((child) => child.id), ['water', 'wake']);
  assert.deepEqual(children.map((child) => child.preferred_time), ['06:35', '06:30']);
  assert.equal(db.prepare("SELECT status FROM rituals WHERE id = 'morning'").get().status, 'migrated');

  assert.equal(migrateActiveRitualsToCompoundHabits(db), 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM habits WHERE kind = 'compound'").get().count,
    1,
  );
  db.close();
});

test('compound API creates and reorders children, nests day outcomes, and keeps legacy read shim', async (t) => {
  const db = createTestDb();
  const ctx = buildRouteCtx(db);
  const app = express();
  app.use(express.json());
  app.use('/api/habits', createHabitsRouter(ctx));
  registerHabitLogRoutes(app, ctx);
  app.use('/api/rituals', createRitualsRouter(ctx));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  const compound = await requestJson(server.base, '/api/habits', {
    method: 'POST',
    body: { title: 'Rotina noturna', kind: 'compound', emoji: '🌙' },
  });
  assert.equal(compound.kind, 'compound');
  assert.deepEqual(compound.children, []);

  const first = await requestJson(server.base, '/api/habits', {
    method: 'POST',
    body: {
      title: 'Desligar telas',
      parent_id: compound.id,
      preferred_time: '22:00',
    },
  });
  const second = await requestJson(server.base, '/api/habits', {
    method: 'POST',
    body: {
      title: 'Preparar amanhã',
      parent_id: compound.id,
      preferred_time: '21:45',
    },
  });

  await requestJson(server.base, `/api/habits/${compound.id}/children`, {
    method: 'PATCH',
    body: { ordered_ids: [second.id, first.id] },
  });
  await requestJson(server.base, '/api/habit-logs', {
    method: 'POST',
    body: {
      habit_id: second.id,
      date: '2026-07-18',
      outcome: 'done',
      completed: true,
    },
  });
  await requestJson(server.base, '/api/habit-logs', {
    method: 'POST',
    body: {
      habit_id: first.id,
      date: '2026-07-18',
      outcome: 'skipped',
      skip_reason: 'energy',
      note: 'Cheguei tarde',
    },
  });

  const habits = await requestJson(
    server.base,
    '/api/habits?status=active&date=2026-07-18',
  );
  assert.equal(habits.length, 1);
  assert.equal(habits[0].id, compound.id);
  assert.equal(habits[0].current_streak, null);
  assert.equal(habits[0].completed_steps, 1);
  assert.equal(habits[0].skipped_steps, 1);
  assert.equal(habits[0].total_steps, 2);
  assert.deepEqual(habits[0].children.map((child) => child.id), [second.id, first.id]);
  assert.equal(habits[0].children[0].completed_today, true);
  assert.equal(habits[0].children[0].preferred_time, '21:45');
  assert.equal(habits[0].children[1].day_outcome, 'skipped');
  assert.equal(habits[0].children[1].skip_note, 'Cheguei tarde');

  const parentLogResponse = await fetch(`${server.base}/api/habit-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      habit_id: compound.id,
      date: '2026-07-18',
      outcome: 'done',
    }),
  });
  assert.equal(parentLogResponse.status, 400);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM habit_logs WHERE habit_id = ?').get(compound.id).count,
    0,
  );

  const shim = await requestJson(
    server.base,
    '/api/rituals?status=active&date=2026-07-18',
  );
  assert.equal(shim.length, 1);
  assert.equal(shim[0].name, 'Rotina noturna');
  assert.deepEqual(shim[0].habits_order, [second.id, first.id]);
});
