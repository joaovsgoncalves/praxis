import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createTasksRouter } from './routes/tasks.js';
import { buildRouteCtx, createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

test('include_overdue keeps today pending tasks when old rows fill the base limit', async (t) => {
  const db = createTestDb();
  const app = express();
  app.use('/api/tasks', createTasksRouter(buildRouteCtx(db)));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  const insert = db.prepare(`
    INSERT INTO tasks (id, title, date, status, priority, category, sort_order, completed_date)
    VALUES (?, ?, ?, ?, 'medium', 'pessoal', ?, ?)
  `);

  for (let index = 0; index < 50; index += 1) {
    insert.run(`old-${index}`, `Old task ${index}`, '2026-06-01', 'completed', index, '2026-06-01');
  }
  insert.run('today-open', 'Task due today', '2026-07-18', 'pending', 100, null);

  const tasks = await requestJson(server.base, '/api/tasks?limit=50&include_overdue=1&today=2026-07-18');

  assert.ok(tasks.some((task) => task.id === 'today-open'));
});
