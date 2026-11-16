import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import Database from 'better-sqlite3';
import { createGoalsRouter } from './routes/goals.js';
import { createGoalsService } from './services/routine/goals.js';
import { habitServicesFor, sqliteStorageFor, tasksServiceFor } from './test-support/httpParity.fase3.mjs';
import { createTasksRouter } from './routes/tasks.js';
import { createHabitsRouter } from './routes/habits.js';
import { initializeDatabase } from './lib/dbInit.js';
import { repairOrphanGoalLinks } from './lib/goalLinks.js';
import { buildRouteCtx, createTestDb, startTestServer } from './test-support/helpers.mjs';

async function setup(t) {
  const db = createTestDb({ withTaskRoutine: true });
  const app = express();
  app.use(express.json());
  const ctx = buildRouteCtx(db);
  const { storage, scoped } = sqliteStorageFor(db);
  app.use('/api/goals', scoped(createGoalsRouter({ goals: createGoalsService({ storage, getLocalDateString: ctx.getLocalDateString }) })));
  app.use('/api/tasks', scoped(createTasksRouter({ tasks: tasksServiceFor(storage, ctx) })));
  app.use('/api/habits', scoped(createHabitsRouter(habitServicesFor(storage, ctx))));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  const call = async (method, path, body) => {
    const response = await fetch(`${server.base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const createGoal = async (title) => (await call('POST', '/api/goals', { title, timeframe: 'short' })).body.goal;
  const goalOf = (table, id) => db.prepare(`SELECT goal_id FROM ${table} WHERE id = ?`).get(id)?.goal_id;
  return { db, call, createGoal, goalOf };
}

test('excluir a meta solta as tarefas e os hábitos dela e preserva os itens', async (t) => {
  const { db, call, createGoal, goalOf } = await setup(t);
  const goal = await createGoal('Correr 5 km');
  const other = await createGoal('Ler 12 livros');
  const task = (await call('POST', '/api/tasks', { title: 'Treino de tiro', date: '2026-11-14', goal_id: goal.id })).body;
  const habit = (await call('POST', '/api/habits', { title: 'Correr', goal_id: goal.id })).body;
  const untouched = (await call('POST', '/api/tasks', { title: 'Ler capítulo', date: '2026-11-14', goal_id: other.id })).body;
  assert.equal(goalOf('tasks', task.id), goal.id);
  assert.equal(goalOf('habits', habit.id), goal.id);

  const removed = await call('DELETE', `/api/goals/${goal.id}`);

  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.unlinked, { tasks: 1, habits: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM goals WHERE id = ?').get(goal.id).c, 0);
  assert.equal(goalOf('tasks', task.id), null);
  assert.equal(goalOf('habits', habit.id), null);
  assert.equal(db.prepare('SELECT title FROM tasks WHERE id = ?').get(task.id).title, 'Treino de tiro', 'a tarefa continua existindo');
  assert.equal(db.prepare('SELECT status FROM habits WHERE id = ?').get(habit.id).status, 'active', 'o hábito continua ativo');
  assert.equal(goalOf('tasks', untouched.id), other.id, 'vínculo de outra meta fica intacto');
});

test('se soltar os itens falhar, a meta não é excluída (tudo ou nada)', async (t) => {
  const { db, call, createGoal, goalOf } = await setup(t);
  const goal = await createGoal('Correr 5 km');
  const task = (await call('POST', '/api/tasks', { title: 'Treino de tiro', date: '2026-11-14', goal_id: goal.id })).body;
  const habit = (await call('POST', '/api/habits', { title: 'Correr', goal_id: goal.id })).body;
  db.exec(`
    CREATE TRIGGER falha_ao_soltar_habito BEFORE UPDATE OF goal_id ON habits
    BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
  `);

  const removed = await call('DELETE', `/api/goals/${goal.id}`);

  assert.equal(removed.status, 500);
  assert.equal(removed.body.code, 'goal_delete_failed');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM goals WHERE id = ?').get(goal.id).c, 1, 'a meta continua lá');
  assert.equal(goalOf('tasks', task.id), goal.id, 'a tarefa não ficou solta pela metade');
  assert.equal(goalOf('habits', habit.id), goal.id);
});

test('criar tarefa ou hábito com meta que não existe é recusado', async (t) => {
  const { db, call } = await setup(t);

  const task = await call('POST', '/api/tasks', { title: 'Órfã', date: '2026-11-14', goal_id: 'meta-fantasma' });
  const habit = await call('POST', '/api/habits', { title: 'Órfão', goal_id: 'meta-fantasma' });

  assert.equal(task.status, 400);
  assert.equal(task.body.code, 'goal_not_found');
  assert.equal(habit.status, 400);
  assert.equal(habit.body.code, 'goal_not_found');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM tasks').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM habits').get().c, 0);
});

test('criar sem meta (ausente, null ou vazio) grava sem vínculo', async (t) => {
  const { call, goalOf } = await setup(t);

  const a = (await call('POST', '/api/tasks', { title: 'A', date: '2026-11-14' })).body;
  const b = (await call('POST', '/api/tasks', { title: 'B', date: '2026-11-14', goal_id: '' })).body;
  const c = (await call('POST', '/api/habits', { title: 'C', goal_id: null })).body;

  assert.equal(goalOf('tasks', a.id), null);
  assert.equal(goalOf('tasks', b.id), null);
  assert.equal(goalOf('habits', c.id), null);
});

test('editar: meta inexistente é recusada, vazio desvincula e campo ausente mantém', async (t) => {
  const { call, createGoal, goalOf } = await setup(t);
  const goal = await createGoal('Correr 5 km');
  const other = await createGoal('Ler 12 livros');
  const task = (await call('POST', '/api/tasks', { title: 'Treino', date: '2026-11-14', goal_id: goal.id })).body;
  const habit = (await call('POST', '/api/habits', { title: 'Correr', goal_id: goal.id })).body;

  for (const [table, path, id] of [['tasks', '/api/tasks', task.id], ['habits', '/api/habits', habit.id]]) {
    const invalid = await call('PUT', `${path}/${id}`, { goal_id: 'meta-fantasma' });
    assert.equal(invalid.status, 400, `${table}: vínculo inválido`);
    assert.equal(invalid.body.code, 'goal_not_found');
    assert.equal(goalOf(table, id), goal.id, `${table}: vínculo antigo intacto`);

    assert.equal((await call('PUT', `${path}/${id}`, { title: 'Novo título' })).status, 200);
    assert.equal(goalOf(table, id), goal.id, `${table}: editar outro campo mantém a meta`);

    assert.equal((await call('PUT', `${path}/${id}`, { goal_id: other.id })).status, 200);
    assert.equal(goalOf(table, id), other.id, `${table}: troca de meta`);

    assert.equal((await call('PUT', `${path}/${id}`, { goal_id: '' })).status, 200);
    assert.equal(goalOf(table, id), null, `${table}: vazio desvincula`);

    assert.equal((await call('PUT', `${path}/${id}`, { goal_id: goal.id })).status, 200);
    assert.equal((await call('PUT', `${path}/${id}`, { goal_id: null })).status, 200);
    assert.equal(goalOf(table, id), null, `${table}: null desvincula`);
  }
});

test('item que já estava órfão ainda pode ser editado reenviando o mesmo vínculo', async (t) => {
  const { db, call } = await setup(t);
  db.prepare(`INSERT INTO tasks (id, title, date, status, goal_id, sort_order) VALUES ('velha', 'Tarefa antiga', '2026-11-14', 'pending', 'meta-apagada', 1)`).run();

  const edited = await call('PUT', '/api/tasks/velha', { title: 'Tarefa antiga editada', goal_id: 'meta-apagada' });

  assert.equal(edited.status, 200, 'formulário antigo que reenvia o valor gravado não trava a edição');
  assert.equal(db.prepare("SELECT title FROM tasks WHERE id = 'velha'").get().title, 'Tarefa antiga editada');
});

test('reparo: órfãos perdem só o vínculo, ficam registrados e o reparo é idempotente', (t) => {
  const db = createTestDb();
  t.after(() => db.close());
  db.prepare(`INSERT INTO goals (id, title) VALUES ('viva', 'Meta viva')`).run();
  const task = db.prepare(`INSERT INTO tasks (id, title, date, status, goal_id, sort_order) VALUES (?, ?, '2026-11-14', ?, ?, ?)`);
  task.run('t-orfa', 'Tarefa órfã', 'pending', 'meta-apagada', 1);
  task.run('t-ok', 'Tarefa com meta', 'pending', 'viva', 2);
  task.run('t-vazia', 'Tarefa com vínculo vazio', 'completed', '', 3);
  const habit = db.prepare(`INSERT INTO habits (id, title, goal_id, sort_order) VALUES (?, ?, ?, ?)`);
  habit.run('h1', 'Hábito órfão 1', 'meta-apagada', 1);
  habit.run('h2', 'Hábito órfão 2', 'outra-apagada', 2);
  habit.run('h3', 'Hábito órfão 3', 'meta-apagada', 3);
  habit.run('h-ok', 'Hábito com meta', 'viva', 4);
  db.prepare(`INSERT INTO habit_logs (id, habit_id, date, completed) VALUES ('l1', 'h1', '2026-11-13', 1)`).run();
  const counts = () => ({
    tasks: db.prepare('SELECT COUNT(*) c FROM tasks').get().c,
    habits: db.prepare('SELECT COUNT(*) c FROM habits').get().c,
    logs: db.prepare('SELECT COUNT(*) c FROM habit_logs').get().c,
  });
  const before = counts();

  assert.equal(repairOrphanGoalLinks(db), 4);

  assert.deepEqual(counts(), before, 'nenhum item nem histórico é apagado');
  assert.equal(db.prepare("SELECT goal_id FROM tasks WHERE id = 't-orfa'").get().goal_id, null);
  assert.equal(db.prepare("SELECT goal_id FROM tasks WHERE id = 't-vazia'").get().goal_id, null);
  assert.equal(db.prepare("SELECT goal_id FROM tasks WHERE id = 't-ok'").get().goal_id, 'viva');
  assert.equal(db.prepare("SELECT goal_id FROM habits WHERE id = 'h-ok'").get().goal_id, 'viva');
  assert.deepEqual(
    db.prepare('SELECT item_type, item_id, missing_goal_id FROM goal_link_repairs ORDER BY item_type, item_id').all(),
    [
      { item_type: 'habit', item_id: 'h1', missing_goal_id: 'meta-apagada' },
      { item_type: 'habit', item_id: 'h2', missing_goal_id: 'outra-apagada' },
      { item_type: 'habit', item_id: 'h3', missing_goal_id: 'meta-apagada' },
      { item_type: 'task', item_id: 't-orfa', missing_goal_id: 'meta-apagada' },
    ],
  );

  assert.equal(repairOrphanGoalLinks(db), 0, 'segunda passada não acha nada');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM goal_link_repairs').get().c, 4);
});

test('a subida da API repara os órfãos sozinha', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  initializeDatabase(db);
  db.prepare(`INSERT INTO habits (id, title, goal_id, sort_order) VALUES ('h1', 'Hábito órfão', 'meta-apagada', 1)`).run();

  initializeDatabase(db);

  assert.equal(db.prepare("SELECT goal_id FROM habits WHERE id = 'h1'").get().goal_id, null);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM goal_link_repairs').get().c, 1);
});
