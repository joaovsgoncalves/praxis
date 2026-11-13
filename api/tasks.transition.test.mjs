/**
 * Fase 1B: concluir uma tarefa vale inteiro ou não vale.
 * Status, XP e próxima ocorrência entram na mesma transação; a agenda vira intenção em fila.
 * As falhas são provocadas com gatilhos no SQLite, sem ganchos de teste no código de produção.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createTasksRouter } from './routes/tasks.js';
import { createTaskCalendarQueue } from './lib/taskCalendarQueue.js';
import { buildRouteCtx, createTestDb, fixedDate, startTestServer } from './test-support/helpers.mjs';

const TODAY = '2026-11-13';
const TOMORROW = '2026-11-14';
const AFTER = '2026-11-15';

async function setup(t, { sync } = {}) {
  const db = createTestDb();
  const clock = { now: new Date('2026-11-13T21:00:00.000Z') };
  const calls = [];
  const syncTaskToCalendar = (task) => {
    calls.push({ id: task.id, status: task.status, calendar_event_id: task.calendar_event_id || null });
    return sync ? sync(task) : { skipped: true };
  };
  const calendarQueue = createTaskCalendarQueue({ db, syncTaskToCalendar, now: () => clock.now });
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTasksRouter(buildRouteCtx(db, {
    getLocalDateString: fixedDate(TODAY),
    syncTaskToCalendar,
    calendarQueue,
    // Nos testes a fila só anda quando o teste manda: prova que a rota não espera a agenda.
    scheduleCalendarDrain: () => {},
  })));
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
  const insert = (id, fields = {}) => {
    const row = {
      title: `Tarefa ${id}`, date: TODAY, time: null, status: 'pending', recurrence: 'none',
      recurrence_parent_id: null, calendar_event_id: null, ...fields,
    };
    db.prepare(`
      INSERT INTO tasks (id, title, date, time, status, priority, category, sort_order, recurrence, recurrence_days, recurrence_parent_id, calendar_event_id)
      VALUES (?, ?, ?, ?, ?, 'medium', 'pessoal', 1, ?, '[]', ?, ?)
    `).run(id, row.title, row.date, row.time, row.status, row.recurrence, row.recurrence_parent_id, row.calendar_event_id);
  };
  const task = (id) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  const xp = () => db.prepare("SELECT xp_total FROM gamification WHERE id = 'main'").get().xp_total;
  const activeXpEvents = (id) => db
    .prepare("SELECT COUNT(*) AS n FROM xp_events WHERE source_type = 'task' AND source_id = ? AND reversed_date IS NULL")
    .get(id).n;
  const series = (rootId) => db
    .prepare('SELECT id, date, status FROM tasks WHERE id = ? OR recurrence_parent_id = ? ORDER BY date ASC, created_date ASC')
    .all(rootId, rootId);
  const queue = () => db.prepare('SELECT * FROM task_calendar_queue ORDER BY task_id').all();
  const failOn = (name, sql) => db.exec(`CREATE TRIGGER ${name} ${sql} BEGIN SELECT RAISE(ABORT, 'falha induzida: ${name}'); END;`);
  const heal = (name) => db.exec(`DROP TRIGGER ${name}`);

  return { db, clock, calls, calendarQueue, call, insert, task, xp, activeXpEvents, series, queue, failOn, heal };
}

function assertUntouched(ctx, id, xpBefore) {
  const row = ctx.task(id);
  assert.equal(row.status, 'pending', 'a tarefa continua pendente');
  assert.equal(row.completed_at, null);
  assert.equal(row.completed_date, null);
  assert.equal(ctx.xp(), xpBefore, 'XP não mudou');
  assert.equal(ctx.activeXpEvents(id), 0, 'sem evento de XP ativo');
  assert.equal(ctx.series(id).length, 1, 'sem próxima ocorrência');
  assert.equal(ctx.queue().length, 0, 'sem intenção de agenda');
}

test('falha no XP desfaz a conclusão inteira; repetir conclui com XP e próxima ocorrência', async (t) => {
  const ctx = await setup(t);
  ctx.insert('a', { recurrence: 'daily' });
  const xpBefore = ctx.xp();

  ctx.failOn('quebra_xp', 'BEFORE INSERT ON xp_events');
  const failed = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  assert.equal(failed.status, 500);
  assert.equal(failed.body.code, 'task_write_failed');
  assertUntouched(ctx, 'a', xpBefore);

  ctx.heal('quebra_xp');
  const ok = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'completed');
  assert.equal(ok.body.xp_sync.awarded, 10);
  assert.equal(ok.body.next_occurrence.created, true);
  assert.equal(ok.body.next_occurrence.date, TOMORROW);
  assert.equal(ctx.xp(), xpBefore + 10);
  assert.equal(ctx.series('a').length, 2);
});

test('falha ao criar a próxima ocorrência desfaz status e XP', async (t) => {
  const ctx = await setup(t);
  ctx.insert('a', { recurrence: 'daily' });
  const xpBefore = ctx.xp();

  ctx.failOn('quebra_recorrencia', 'BEFORE INSERT ON tasks WHEN NEW.recurrence_parent_id IS NOT NULL');
  const failed = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  assert.equal(failed.status, 500);
  assertUntouched(ctx, 'a', xpBefore);

  ctx.heal('quebra_recorrencia');
  const ok = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  assert.equal(ok.status, 200);
  assert.equal(ctx.xp(), xpBefore + 10);
  assert.equal(ctx.series('a').length, 2);
});

test('falha ao gravar a intenção de agenda desfaz status, XP e ocorrência', async (t) => {
  const ctx = await setup(t);
  ctx.insert('a', { recurrence: 'daily', time: '09:00' });
  const xpBefore = ctx.xp();

  ctx.failOn('quebra_fila', 'BEFORE INSERT ON task_calendar_queue');
  const failed = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  assert.equal(failed.status, 500);
  assertUntouched(ctx, 'a', xpBefore);
});

test('resposta perdida: reenviar a mesma conclusão não soma XP nem cria outra ocorrência', async (t) => {
  const ctx = await setup(t);
  ctx.insert('a', { recurrence: 'daily' });
  const xpBefore = ctx.xp();

  const first = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  const completedAt = ctx.task('a').completed_at;
  const second = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  const third = await ctx.call('PUT', '/api/tasks/a', { status: 'done' });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 200);
  assert.equal(second.body.xp_sync, null);
  assert.equal(second.body.next_occurrence, null);
  assert.equal(ctx.task('a').completed_at, completedAt, 'a hora da primeira conclusão fica');
  assert.equal(ctx.xp(), xpBefore + 10);
  assert.equal(ctx.activeXpEvents('a'), 1);
  assert.equal(ctx.series('a').length, 2);
});

test('uma ocorrência por série e data: concluir A, concluir B, reabrir A e concluir de novo', async (t) => {
  const ctx = await setup(t);
  ctx.insert('a', { recurrence: 'daily' });
  const xpBefore = ctx.xp();

  const doneA = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  const bId = doneA.body.next_occurrence.id;
  await ctx.call('PUT', `/api/tasks/${bId}`, { status: 'completed' });
  await ctx.call('PUT', '/api/tasks/a', { status: 'pending' });
  const again = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });

  assert.equal(again.status, 200);
  assert.deepEqual(again.body.next_occurrence, { id: bId, date: TOMORROW, created: false });
  const rows = ctx.series('a');
  const perDate = rows.reduce((acc, row) => ({ ...acc, [row.date]: (acc[row.date] || 0) + 1 }), {});
  assert.deepEqual(perDate, { [TODAY]: 1, [TOMORROW]: 1, [AFTER]: 1 });
  assert.equal(ctx.xp(), xpBefore + 20, 'A e B valem +10 cada, uma vez');
});

test('criar tarefa já concluída passa pela mesma transição: +10 uma vez, estorno ao reabrir', async (t) => {
  const ctx = await setup(t);
  const xpBefore = ctx.xp();

  const created = await ctx.call('POST', '/api/tasks', { title: 'Já feita no quadro', date: TODAY, status: 'completed' });
  assert.equal(created.status, 201);
  assert.equal(created.body.xp_sync.awarded, 10);
  assert.ok(created.body.completed_at);
  assert.equal(ctx.xp(), xpBefore + 10);

  const resend = await ctx.call('PUT', `/api/tasks/${created.body.id}`, { status: 'completed' });
  assert.equal(resend.body.xp_sync, null);
  assert.equal(ctx.xp(), xpBefore + 10);

  const reopened = await ctx.call('PUT', `/api/tasks/${created.body.id}`, { status: 'pending' });
  assert.equal(reopened.body.xp_sync.awarded, -10);
  assert.equal(ctx.xp(), xpBefore);

  const pending = await ctx.call('POST', '/api/tasks', { title: 'Aberta', date: TODAY });
  assert.equal(pending.body.xp_sync, null);
  assert.equal(ctx.xp(), xpBefore);
});

test('criar recorrente já concluída gera a próxima ocorrência; falha no XP não deixa tarefa órfã', async (t) => {
  const ctx = await setup(t);
  const xpBefore = ctx.xp();

  ctx.failOn('quebra_xp', 'BEFORE INSERT ON xp_events');
  const failed = await ctx.call('POST', '/api/tasks', { title: 'Treino', date: TODAY, status: 'completed', recurrence: 'daily' });
  assert.equal(failed.status, 500);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0);
  ctx.heal('quebra_xp');

  const created = await ctx.call('POST', '/api/tasks', { title: 'Treino', date: TODAY, status: 'completed', recurrence: 'daily' });
  assert.equal(created.status, 201);
  assert.equal(created.body.next_occurrence.date, TOMORROW);
  assert.equal(ctx.series(created.body.id).length, 2);
  assert.equal(ctx.xp(), xpBefore + 10);
});

test('agenda fora do ar não bloqueia o check: fica registrada e é recuperada na retentativa', async (t) => {
  let agendaNoAr = false;
  const ctx = await setup(t, {
    sync: (task) => {
      if (!agendaNoAr) return { action: 'delete_failed', event_id: task.calendar_event_id, error: 'gog: timeout' };
      return { action: 'deleted', event_id: task.calendar_event_id };
    },
  });
  ctx.insert('a', { time: '09:00', calendar_event_id: 'evt-1' });

  const done = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'completed');
  assert.deepEqual(done.body.calendar_sync, { queued: true });
  assert.equal(ctx.calls.length, 0, 'a rota respondeu sem chamar a agenda');
  assert.equal(ctx.queue().length, 1);

  assert.deepEqual(ctx.calendarQueue.drain(), { processed: 1, done: 0, retry: 1, failed: 0 });
  const [pending] = ctx.queue();
  assert.equal(pending.status, 'pending');
  assert.equal(pending.attempts, 1);
  assert.match(pending.last_error, /timeout/);
  assert.equal(ctx.task('a').status, 'completed', 'a conclusão não foi desfeita');

  // Antes do prazo da retentativa a fila não insiste.
  assert.equal(ctx.calendarQueue.drain().processed, 0);

  agendaNoAr = true;
  ctx.clock.now = new Date(ctx.clock.now.getTime() + 61 * 1000);
  assert.deepEqual(ctx.calendarQueue.drain(), { processed: 1, done: 1, retry: 0, failed: 0 });
  assert.equal(ctx.queue().length, 0);
  assert.equal(ctx.calls.at(-1).status, 'completed');
});

test('agenda que lança erro não derruba a fila e desiste depois do limite de tentativas', async (t) => {
  const ctx = await setup(t, { sync: () => { throw new Error('gog ausente'); } });
  ctx.insert('a', { time: '09:00' });
  await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });

  let last = null;
  for (let i = 0; i < 8; i += 1) {
    last = ctx.calendarQueue.drain();
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 7 * 60 * 60 * 1000);
  }
  assert.equal(last.failed, 1);
  const [row] = ctx.queue();
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 8);
  assert.equal(ctx.calendarQueue.drain().processed, 0, 'falha definitiva sai da fila ativa e fica registrada');
  assert.deepEqual(ctx.calendarQueue.stats(), { pending: 0, failed: 1 });
});

test('excluir tarefa com evento: some na hora e o evento sai depois, pelo retrato da fila', async (t) => {
  const ctx = await setup(t, { sync: (task) => ({ action: 'deleted', event_id: task.calendar_event_id }) });
  ctx.insert('a', { time: '09:00', calendar_event_id: 'evt-9', status: 'completed' });
  ctx.db.prepare("INSERT INTO xp_events (id, source_type, source_id, amount, reason) VALUES ('x1', 'task', 'a', 10, 'teste')").run();
  ctx.db.prepare("UPDATE gamification SET xp_total = 10 WHERE id = 'main'").run();

  const removed = await ctx.call('DELETE', '/api/tasks/a');
  assert.equal(removed.status, 200);
  assert.equal(removed.body.xp_sync.awarded, -10);
  assert.equal(ctx.task('a'), undefined);
  assert.equal(ctx.calls.length, 0);

  assert.equal(ctx.calendarQueue.drain().done, 1);
  assert.deepEqual(ctx.calls, [{ id: 'a', status: 'cancelled', calendar_event_id: 'evt-9' }]);
  assert.equal(ctx.queue().length, 0);
});

test('"não hoje" e a próxima ocorrência também só deixam intenção de agenda', async (t) => {
  const ctx = await setup(t);
  ctx.insert('a', { time: '09:00', recurrence: 'daily' });
  ctx.insert('b', { time: '10:00' });

  const moved = await ctx.call('POST', '/api/tasks/b/not-today', {});
  assert.equal(moved.status, 200);
  assert.equal(moved.body.date, TOMORROW);
  const done = await ctx.call('PUT', '/api/tasks/a', { status: 'completed' });

  assert.equal(ctx.calls.length, 0);
  assert.deepEqual(
    ctx.queue().map((row) => row.task_id).sort(),
    ['a', 'b', done.body.next_occurrence.id].sort(),
  );
  assert.equal(ctx.calendarQueue.drain().done, 3);
  assert.equal(ctx.queue().length, 0);
});
