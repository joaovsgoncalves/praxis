import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createTasksRouter } from './routes/tasks.js';
import { createGamificationRouter } from './routes/gamification.js';
import { initializeDatabase } from './lib/dbInit.js';
import { awardXp, recomputeXp, reverseXp } from './lib/xpEvents.js';
import { buildRouteCtx, createTestDb, fixedDate, requestJson, startTestServer } from './test-support/helpers.mjs';

const TODAY = '2026-10-15';

async function setup(t, { xpTotal = 0 } = {}) {
  const db = createTestDb();
  if (xpTotal > 0) {
    // Simula o banco antigo: XP gravado direto na gamification, registro ainda vazio.
    db.prepare("UPDATE gamification SET xp_total = ?, level = 6 WHERE id = 'main'").run(xpTotal);
    initializeDatabase(db);
  }
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTasksRouter(buildRouteCtx(db, {
    getLocalDateString: fixedDate(TODAY),
    syncTaskToCalendar: () => ({ skipped: true }),
  })));
  app.use('/api/gamification', createGamificationRouter({ db, getLocalDateString: fixedDate(TODAY) }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  db.prepare(`
    INSERT INTO tasks (id, title, date, status, priority, category, sort_order)
    VALUES ('t1', 'Escrever o relatório', ?, 'pending', 'medium', 'pessoal', 1)
  `).run(TODAY);

  const put = (id, body) => requestJson(server.base, `/api/tasks/${id}`, { method: 'PUT', body });
  const gam = () => requestJson(server.base, '/api/gamification');
  const xp = () => db.prepare("SELECT xp_total FROM gamification WHERE id = 'main'").get().xp_total;
  return { db, server, put, gam, xp };
}

test('(a) marcar, desmarcar e marcar soma +10 uma vez só; desmarcar volta ao valor anterior', async (t) => {
  const { put, gam, xp } = await setup(t, { xpTotal: 2225 });
  const before = (await gam()).xp_total;
  assert.equal(before, 2225);

  await put('t1', { status: 'completed' });
  assert.equal(xp(), before + 10);

  await put('t1', { status: 'pending' });
  assert.equal(xp(), before);
  assert.equal((await gam()).xp_total, before);

  await put('t1', { status: 'completed' });
  assert.equal(xp(), before + 10);
  assert.equal((await gam()).xp_total, before + 10);
});

test('(b) marcar duas vezes seguidas sem desmarcar não duplica', async (t) => {
  const { put, xp } = await setup(t);
  const first = await put('t1', { status: 'completed' });
  assert.equal(first.xp_sync.awarded, 10);
  const second = await put('t1', { status: 'done' });
  assert.equal(second.xp_sync, null, 'sem xp_sync quando já estava premiada');
  assert.equal(xp(), 10);
});

test('(c) migração grava baseline com o XP atual sem mudar nível nem barra, e não duplica', async (t) => {
  const { db, gam } = await setup(t, { xpTotal: 2225 });
  const events = () => db.prepare('SELECT * FROM xp_events').all();
  assert.equal(events().length, 1);
  assert.equal(events()[0].source_type, 'baseline');
  assert.equal(events()[0].source_id, 'main');
  assert.equal(events()[0].amount, 2225);
  assert.equal(events()[0].reversed_date, null);

  const row = db.prepare("SELECT xp_total, level FROM gamification WHERE id = 'main'").get();
  assert.deepEqual(row, { xp_total: 2225, level: 6 });
  const g = await gam();
  assert.equal(g.xp_total, 2225);
  assert.equal(g.level, 6);
  assert.equal(g.progress_pct, 73);

  initializeDatabase(db);
  initializeDatabase(db);
  assert.equal(events().length, 1);
  assert.equal((await gam()).xp_total, 2225);
});

test('(c) banco novo com XP zero não grava baseline', () => {
  const db = createTestDb();
  initializeDatabase(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM xp_events').get().c, 0);
  db.close();
});

test('(d) excluir tarefa concluída estorna o XP dela', async (t) => {
  const { server, put, xp } = await setup(t, { xpTotal: 2225 });
  await put('t1', { status: 'completed' });
  assert.equal(xp(), 2235);
  const res = await requestJson(server.base, '/api/tasks/t1', { method: 'DELETE' });
  assert.equal(res.success, true);
  assert.equal(res.xp_sync.awarded, -10);
  assert.equal(xp(), 2225);
});

test('(d) excluir tarefa aberta não mexe no XP', async (t) => {
  const { server, xp } = await setup(t, { xpTotal: 2225 });
  const res = await requestJson(server.base, '/api/tasks/t1', { method: 'DELETE' });
  assert.equal(res.xp_sync, undefined);
  assert.equal(xp(), 2225);
});

test('(e) conquista vira evento idempotente por id', async (t) => {
  const { db, server, put, xp } = await setup(t);
  await put('t1', { status: 'completed' });
  const first = await requestJson(server.base, '/api/gamification/check-achievements', { method: 'POST' });
  assert.deepEqual(first.new_achievements.map((a) => a.id), ['first_task']);
  assert.equal(first.bonus_xp, 10);
  assert.equal(xp(), 20);

  // Mesmo que a conquista volte a aparecer como nova, o registro não premia duas vezes.
  db.prepare("UPDATE achievements SET unlocked_date = NULL WHERE id = 'first_task'").run();
  const second = await requestJson(server.base, '/api/gamification/check-achievements', { method: 'POST' });
  assert.equal(second.bonus_xp, 0);
  assert.equal(xp(), 20);
  const rows = db.prepare("SELECT * FROM xp_events WHERE source_type = 'achievement'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_id, 'first_task');
});

test('add-xp grava evento manual e recalcula pelo registro', async (t) => {
  const { db, server, xp } = await setup(t, { xpTotal: 2225 });
  const res = await requestJson(server.base, '/api/gamification/add-xp', { method: 'POST', body: { amount: 300, reason: 'teste' } });
  assert.equal(res.xp_total, 2525);
  assert.equal(res.level, 7);
  assert.equal(res.leveled_up, true);
  assert.equal(xp(), 2525);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM xp_events WHERE source_type = 'manual'").get().c, 1);
});

test('(f) recomputeXp nunca fica abaixo de zero', () => {
  const db = createTestDb();
  db.prepare("INSERT INTO xp_events (id, source_type, source_id, amount) VALUES ('neg', 'manual', 'x', -50)").run();
  const result = recomputeXp(db);
  assert.equal(result.xp_total, 0);
  assert.equal(result.level, 1);
  assert.deepEqual(db.prepare("SELECT xp_total, level FROM gamification WHERE id = 'main'").get(), { xp_total: 0, level: 1 });
  db.close();
});

test('awardXp e reverseXp são idempotentes', () => {
  const db = createTestDb();
  assert.equal(awardXp(db, { sourceType: 'task', sourceId: 'a', amount: 10, reason: 'x' }).awarded, 10);
  assert.equal(awardXp(db, { sourceType: 'task', sourceId: 'a', amount: 10, reason: 'x' }).awarded, 0);
  assert.equal(reverseXp(db, { sourceType: 'task', sourceId: 'a' }).reversed, 10);
  assert.equal(reverseXp(db, { sourceType: 'task', sourceId: 'a' }).reversed, 0);
  assert.equal(recomputeXp(db).xp_total, 0);
  db.close();
});

test('(g) estorno devolve xp_sync.awarded negativo e sem leveled_up', async (t) => {
  const { put } = await setup(t, { xpTotal: 2495 });
  const done = await put('t1', { status: 'completed' });
  assert.equal(done.xp_sync.awarded, 10);
  assert.equal(done.xp_sync.leveled_up, true);
  assert.equal(done.xp_sync.level, 7);

  const undone = await put('t1', { status: 'pending' });
  assert.equal(undone.xp_sync.awarded, -10);
  assert.equal(undone.xp_sync.xp_total, 2495);
  assert.equal(undone.xp_sync.level, 6);
  assert.equal(typeof undone.xp_sync.reason, 'string');
  assert.equal('leveled_up' in undone.xp_sync, false);
});

test('GET /api/gamification devolve xp_week sem contar o baseline', async (t) => {
  const { put, gam } = await setup(t, { xpTotal: 2225 });
  await put('t1', { status: 'completed' });
  const g = await gam();
  assert.equal(g.xp_week, 10);
});
