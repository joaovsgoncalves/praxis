import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createTasksRouter } from './routes/tasks.js';
import { createDayRollover } from './lib/dayRollover.js';
import { buildRouteCtx, createTestDb, fixedDate, requestJson, startTestServer } from './test-support/helpers.mjs';
import { sqliteStorageFor, tasksServiceFor } from './test-support/httpParity.fase3.mjs';

const TODAY = '2026-10-15';
const YESTERDAY = '2026-10-14';

async function setup(t) {
  const db = createTestDb({ withTaskRoutine: true });
  const calendarCalls = [];
  const app = express();
  app.use(express.json());
  const ctx = buildRouteCtx(db, {
    getLocalDateString: fixedDate(TODAY),
    syncTaskToCalendar: (task) => {
      calendarCalls.push(task.id);
      return { skipped: true };
    },
  });
  const { storage, scoped } = sqliteStorageFor(db);
  app.use('/api/tasks', scoped(createTasksRouter({ tasks: tasksServiceFor(storage, ctx) })));
  // O fechamento é da virada do dia; a lista só lê.
  const rollover = createDayRollover({
    db,
    getLocalDateString: fixedDate(TODAY),
    nextSortOrder: ctx.nextSortOrder,
    log: { log() {}, error() {} },
  });
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  const insert = db.prepare(`
    INSERT INTO tasks (id, title, date, time, status, priority, category, sort_order, recurrence, recurrence_parent_id, calendar_event_id)
    VALUES (?, ?, ?, ?, 'pending', 'medium', 'pessoal', ?, ?, ?, ?)
  `);
  const readList = () => requestJson(server.base, `/api/tasks?limit=50&include_overdue=1&today=${TODAY}`);
  const list = () => {
    rollover.run('teste');
    return readList();
  };
  const xp = () => db.prepare("SELECT xp_total FROM gamification WHERE id = 'main'").get().xp_total;
  const snapshot = () => db.prepare('SELECT * FROM tasks ORDER BY id, date').all();
  return { db, insert, list, readList, xp, snapshot, calendarCalls };
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

test('abrir a lista não fecha nem cria nada, com ou sem include_overdue', async (t) => {
  const { insert, readList, snapshot, xp, calendarCalls } = await setup(t);
  insert.run('faculdade', 'Sair para a faculdade', YESTERDAY, '18:40', 1, 'daily', null, null);
  const before = snapshot();
  const xpBefore = xp();

  const tasks = await readList();
  await readList();

  assert.deepEqual(snapshot(), before, 'a leitura não grava nada');
  assert.equal(xp(), xpBefore);
  assert.deepEqual(calendarCalls, []);
  assert.equal(tasks.find((task) => task.id === 'faculdade').status, 'pending', 'até a virada rodar, aparece como atrasada');
});

test('bloco com hora do Sêneca de ontem vira não rolou, sem gerar filho; avulsa manual continua atrasada', async (t) => {
  const { db, list, xp } = await setup(t);
  const ins = db.prepare(`INSERT INTO tasks (id, title, date, time, status, priority, category, sort_order, recurrence, source)
    VALUES (?, ?, ?, ?, 'pending', 'medium', 'rotina', ?, 'none', ?)`);
  ins.run('fac-seneca', 'Sair para a faculdade', YESTERDAY, '18:20', 1, 'seneca');
  ins.run('fac-hoje', 'Sair para a faculdade', TODAY, '18:20', 2, 'seneca');
  ins.run('sem-hora', 'Gravar vídeo', YESTERDAY, '', 3, 'seneca');
  ins.run('manual', 'Pagar boleto', YESTERDAY, '10:00', 4, 'manual');
  const xpBefore = xp();

  const tasks = await list();
  await list();

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('fac-seneca');
  assert.equal(row.status, 'cancelled');
  assert.equal(row.day_outcome, 'missed');
  assert.equal(row.day_outcome_date, YESTERDAY);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM tasks WHERE recurrence_parent_id = ?').get('fac-seneca').c, 0, 'não cria filho');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get('fac-hoje').status, 'pending', 'a de hoje fica intacta');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get('sem-hora').status, 'pending', 'sem hora continua atrasada');
  assert.equal(db.prepare('SELECT status FROM tasks WHERE id = ?').get('manual').status, 'pending', 'manual continua atrasada');
  const openOverdue = tasks.filter((task) => task.date && task.date < TODAY && task.status === 'pending').map((task) => task.id).sort();
  assert.deepEqual(openOverdue, ['manual', 'sem-hora']);
  assert.equal(xp(), xpBefore);
});
