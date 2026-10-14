import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createTasksRouter } from './routes/tasks.js';
import { buildRouteCtx, createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

async function setup(t) {
  const db = createTestDb();
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTasksRouter(buildRouteCtx(db)));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  const insert = db.prepare(`
    INSERT INTO tasks (id, title, date, status, priority, category, sort_order)
    VALUES (?, ?, ?, 'pending', 'medium', 'pessoal', ?)
  `);
  insert.run('task-a', 'Tarefa A', '2026-07-18', 0);
  insert.run('task-b', 'Tarefa B', '2026-07-18', 1);
  return { db, base: server.base };
}

async function rawRequest(base, path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('checklist CRUD: create, list, toggle, rename and delete', async (t) => {
  const { base } = await setup(t);

  const first = await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title: '  Comprar papel ' } });
  const second = await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title: 'Imprimir' } });
  assert.equal(first.title, 'Comprar papel');
  assert.equal(first.done, false);
  assert.equal(first.sort_order, 0);
  assert.equal(second.sort_order, 1);

  let items = await requestJson(base, '/api/tasks/task-a/checklist');
  assert.deepEqual(items.map((i) => i.id), [first.id, second.id]);

  const toggled = await requestJson(base, `/api/tasks/task-a/checklist/${first.id}`, { method: 'PATCH', body: { done: true } });
  assert.equal(toggled.done, true);
  assert.equal(toggled.title, 'Comprar papel');

  const renamed = await requestJson(base, `/api/tasks/task-a/checklist/${second.id}`, { method: 'PATCH', body: { title: 'Imprimir 2 vias' } });
  assert.equal(renamed.title, 'Imprimir 2 vias');
  assert.equal(renamed.done, false);

  await requestJson(base, `/api/tasks/task-a/checklist/${first.id}`, { method: 'DELETE' });
  items = await requestJson(base, '/api/tasks/task-a/checklist');
  assert.deepEqual(items.map((i) => i.title), ['Imprimir 2 vias']);
});

test('checklist validates title, task and item ownership', async (t) => {
  const { base } = await setup(t);

  assert.equal((await rawRequest(base, '/api/tasks/task-a/checklist', 'POST', { title: '   ' })).status, 400);
  assert.equal((await rawRequest(base, '/api/tasks/missing/checklist', 'POST', { title: 'x' })).status, 404);
  assert.equal((await rawRequest(base, '/api/tasks/missing/checklist')).status, 404);

  const item = await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title: 'Item' } });
  // Item de outra tarefa não pode ser mexido por esta rota.
  assert.equal((await rawRequest(base, `/api/tasks/task-b/checklist/${item.id}`, 'PATCH', { done: true })).status, 404);
  assert.equal((await rawRequest(base, `/api/tasks/task-b/checklist/${item.id}`, 'DELETE')).status, 404);
  assert.equal((await rawRequest(base, `/api/tasks/task-a/checklist/${item.id}`, 'PATCH', { title: '' })).status, 400);
});

test('checklist reorder persists sort_order within the task', async (t) => {
  const { base } = await setup(t);
  const ids = [];
  for (const title of ['Um', 'Dois', 'Três']) {
    const item = await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title } });
    ids.push(item.id);
  }

  const reordered = await requestJson(base, '/api/tasks/task-a/checklist/reorder', {
    method: 'PATCH',
    body: { ordered_ids: [ids[2], ids[0], ids[1]] },
  });
  assert.deepEqual(reordered.items.map((i) => i.title), ['Três', 'Um', 'Dois']);

  const items = await requestJson(base, '/api/tasks/task-a/checklist');
  assert.deepEqual(items.map((i) => i.title), ['Três', 'Um', 'Dois']);
  assert.deepEqual(items.map((i) => i.sort_order), [0, 1, 2]);

  assert.equal((await rawRequest(base, '/api/tasks/task-a/checklist/reorder', 'PATCH', { ordered_ids: 'x' })).status, 400);
});

test('task list includes checklist_total and checklist_done (both modes)', async (t) => {
  const { base } = await setup(t);
  const a1 = await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title: 'a1' } });
  await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title: 'a2' } });
  await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title: 'a3' } });
  await requestJson(base, `/api/tasks/task-a/checklist/${a1.id}`, { method: 'PATCH', body: { done: true } });

  const plain = await requestJson(base, '/api/tasks');
  const byIdPlain = new Map(plain.map((task) => [task.id, task]));
  assert.equal(byIdPlain.get('task-a').checklist_total, 3);
  assert.equal(byIdPlain.get('task-a').checklist_done, 1);
  assert.equal(byIdPlain.get('task-b').checklist_total, 0);
  assert.equal(byIdPlain.get('task-b').checklist_done, 0);

  const operational = await requestJson(base, '/api/tasks?include_overdue=1&today=2026-07-18');
  const a = operational.find((task) => task.id === 'task-a');
  assert.equal(a.checklist_total, 3);
  assert.equal(a.checklist_done, 1);

  const single = await requestJson(base, '/api/tasks/task-a');
  assert.equal(single.checklist_total, 3);
  assert.equal(single.checklist_done, 1);
});

test('deleting a task deletes its checklist items', async (t) => {
  const { db, base } = await setup(t);
  await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title: 'a1' } });
  await requestJson(base, '/api/tasks/task-a/checklist', { method: 'POST', body: { title: 'a2' } });
  await requestJson(base, '/api/tasks/task-b/checklist', { method: 'POST', body: { title: 'b1' } });

  await requestJson(base, '/api/tasks/task-a', { method: 'DELETE' });

  const leftover = db.prepare('SELECT task_id, COUNT(*) AS n FROM task_checklist_items GROUP BY task_id').all();
  assert.deepEqual(leftover, [{ task_id: 'task-b', n: 1 }]);
});

test('board move to Caixa: empty date/time clears the schedule (PUT COALESCE keeps null)', async (t) => {
  const { db, base } = await setup(t);
  db.prepare("UPDATE tasks SET time = '09:00' WHERE id = 'task-a'").run();

  await requestJson(base, '/api/tasks/task-a', { method: 'PUT', body: { date: '', time: '' } });

  const row = db.prepare("SELECT date, time FROM tasks WHERE id = 'task-a'").get();
  assert.ok(!row.date, 'date limpa');
  assert.ok(!row.time, 'time limpo');
});

test('task reorder persists sort_order for a board column', async (t) => {
  const { db, base } = await setup(t);
  db.prepare(`
    INSERT INTO tasks (id, title, date, status, priority, category, sort_order)
    VALUES ('task-c', 'Tarefa C', '2026-07-18', 'pending', 'medium', 'pessoal', 2)
  `).run();

  await requestJson(base, '/api/tasks/reorder', { method: 'PATCH', body: { ordered_ids: ['task-c', 'task-a', 'task-b'] } });

  const rows = db.prepare("SELECT id, sort_order FROM tasks WHERE id IN ('task-a','task-b','task-c') ORDER BY sort_order").all();
  assert.deepEqual(rows.map((r) => r.id), ['task-c', 'task-a', 'task-b']);
});
