import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createTasksRouter } from './routes/tasks.js';
import { buildRouteCtx, createTestDb, fixedDate, requestJson, startTestServer } from './test-support/helpers.mjs';

const TODAY = '2026-10-15';
const YESTERDAY = '2026-10-14';

async function setup(t) {
  const db = createTestDb();
  const calendarCalls = [];
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTasksRouter(buildRouteCtx(db, {
    getLocalDateString: fixedDate(TODAY),
    syncTaskToCalendar: (task) => {
      calendarCalls.push(task.id);
      return { skipped: true };
    },
  })));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  const insert = db.prepare(`
    INSERT INTO tasks (id, title, date, time, status, priority, category, sort_order, recurrence, recurrence_parent_id, calendar_event_id)
    VALUES (?, ?, ?, ?, 'pending', 'medium', 'pessoal', ?, ?, ?, ?)
  `);
  const list = () => requestJson(server.base, `/api/tasks?limit=50&include_overdue=1&today=${TODAY}`);
  const xp = () => db.prepare("SELECT xp_total FROM gamification WHERE id = 'main'").get().xp_total;
  const snapshot = () => db.prepare('SELECT * FROM tasks ORDER BY id, date').all();
  return { db, insert, list, xp, snapshot, calendarCalls };
}

test('recorrente de ontem aberta vira não rolou e garante a de hoje, sem XP nem agenda', async (t) => {
  const { db, insert, list, xp, calendarCalls } = await setup(t);
  insert.run('faculdade', 'Sair para a faculdade', YESTERDAY, '18:40', 1, 'daily', null, 'evt-ontem');
  insert.run('avulsa', 'Pagar boleto', YESTERDAY, '10:00', 2, 'none', null, null);
  const xpBefore = xp();

  const tasks = await list();

  const missed = db.prepare('SELECT * FROM tasks WHERE id = ?').get('faculdade');
  assert.equal(missed.status, 'cancelled');
  assert.equal(missed.day_outcome, 'missed');
  assert.equal(missed.day_outcome_date, YESTERDAY);
  assert.equal(missed.calendar_event_id, 'evt-ontem', 'evento antigo fica intacto');

  const todays = db.prepare('SELECT * FROM tasks WHERE recurrence_parent_id = ? AND date = ?').all('faculdade', TODAY);
  assert.equal(todays.length, 1);
  assert.equal(todays[0].status, 'pending');
  assert.equal(todays[0].time, '18:40');

  const openOverdue = tasks.filter((task) => task.date < TODAY && ['pending', 'in_progress'].includes(task.status));
  assert.deepEqual(openOverdue.map((task) => task.id), ['avulsa'], 'só a avulsa continua atrasada');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get('avulsa').status, 'pending');

  const missedInPayload = tasks.find((task) => task.id === 'faculdade');
  assert.equal(missedInPayload?.day_outcome, 'missed', 'o desfecho vem na lista para o histórico');

  assert.equal(xp(), xpBefore, 'nenhum XP somado');
  assert.deepEqual(calendarCalls, [], 'fechamento não sincroniza o Google Agenda');
});

test('rodar duas vezes não duplica nem muda nada', async (t) => {
  const { insert, list, snapshot, xp } = await setup(t);
  insert.run('faculdade', 'Sair para a faculdade', YESTERDAY, '18:40', 1, 'daily', null, null);

  await list();
  const first = snapshot();
  const xpAfterFirst = xp();
  await list();
  const second = snapshot();

  assert.deepEqual(second, first);
  assert.equal(xp(), xpAfterFirst);
  assert.equal(first.filter((task) => task.date === TODAY).length, 1);
});

test('não cria outra ocorrência quando a de hoje já existe', async (t) => {
  const { db, insert, list } = await setup(t);
  insert.run('faculdade', 'Sair para a faculdade', YESTERDAY, '18:40', 1, 'daily', null, null);
  insert.run('faculdade-hoje', 'Sair para a faculdade', TODAY, '18:40', 2, 'daily', 'faculdade', null);

  await list();

  const todays = db.prepare("SELECT id FROM tasks WHERE date = ? AND status = 'pending'").all(TODAY);
  assert.deepEqual(todays.map((row) => row.id), ['faculdade-hoje']);
});

test('instância antiga de vários dias não cria filhos no passado', async (t) => {
  const { db, insert, list } = await setup(t);
  insert.run('agua', 'Regar plantas', '2026-10-10', '07:00', 1, 'daily', null, null);

  await list();

  const open = db.prepare("SELECT date FROM tasks WHERE status = 'pending'").all();
  assert.deepEqual(open.map((row) => row.date), [TODAY]);
  assert.equal(db.prepare('SELECT day_outcome_date FROM tasks WHERE id = ?').get('agua').day_outcome_date, '2026-10-10');
});

test('lista sem include_overdue não fecha nada', async (t) => {
  const { db, insert } = await setup(t);
  insert.run('faculdade', 'Sair para a faculdade', YESTERDAY, '18:40', 1, 'daily', null, null);
  const app = express();
  app.use('/api/tasks', createTasksRouter(buildRouteCtx(db, { getLocalDateString: fixedDate(TODAY) })));
  const server = await startTestServer(app);
  t.after(() => server.close());

  await requestJson(server.base, '/api/tasks?limit=50');

  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get('faculdade').status, 'pending');
});
