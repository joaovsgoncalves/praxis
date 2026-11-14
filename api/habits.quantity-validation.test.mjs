import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createHabitsRouter, registerHabitLogRoutes } from './routes/habits.js';
import { readHabitQuantity } from './lib/habitQuantity.js';
import { buildRouteCtx, createTestDb, startTestServer } from './test-support/helpers.mjs';

const DAY = '2026-11-14';

async function setup(t) {
  const db = createTestDb();
  const app = express();
  app.use(express.json());
  const ctx = buildRouteCtx(db);
  app.use('/api/habits', createHabitsRouter(ctx));
  registerHabitLogRoutes(app, ctx);
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  db.prepare(`INSERT INTO habits (id, title, target_value, unit, quick_increment, sort_order) VALUES ('agua', 'Beber água', 3, 'L', 0.5, 1)`).run();
  db.prepare(`INSERT INTO habits (id, title, sort_order) VALUES ('ler', 'Ler 10 páginas', 2)`).run();

  const post = async (body) => {
    const response = await fetch(`${server.base}/api/habit-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const log = (habitId) => db.prepare('SELECT completed, value, outcome FROM habit_logs WHERE habit_id = ? AND date = ?').get(habitId, DAY);
  return { db, post, log };
}

test('0,5 L de 3 L fica registrado e o hábito continua aberto', async (t) => {
  const { post, log } = await setup(t);

  const first = await post({ habit_id: 'agua', date: DAY, completed: true, outcome: 'done', value: 0.5 });

  assert.equal(first.status, 201);
  assert.deepEqual(log('agua'), { completed: 0, value: 0.5, outcome: null });

  const viaIncrement = await post({ habit_id: 'agua', date: DAY, increment: 0.5 });
  assert.equal(viaIncrement.status, 200);
  assert.deepEqual(log('agua'), { completed: 0, value: 1, outcome: null });
});

test('só fecha ao atingir a meta', async (t) => {
  const { post, log } = await setup(t);
  await post({ habit_id: 'agua', date: DAY, value: 2.5 });
  assert.equal(log('agua').completed, 0);

  await post({ habit_id: 'agua', date: DAY, increment: 0.5 });

  assert.deepEqual(log('agua'), { completed: 1, value: 3, outcome: 'done' });
});

test('quantidade inválida é recusada e não cria nem altera registro', async (t) => {
  const { db, post, log } = await setup(t);
  await post({ habit_id: 'agua', date: DAY, value: 1 });
  const before = log('agua');

  const invalid = [
    { value: 'meio litro' },
    { value: 'NaN' },
    { value: -1 },
    { value: '1e9' },
    { value: [] },
    { value: {} },
    { value: true },
    { value: 5_000_000 },
    { increment: 'abc' },
    { increment: -2 },
    { delta: {} },
  ];
  for (const extra of invalid) {
    const response = await post({ habit_id: 'agua', date: DAY, completed: true, outcome: 'done', ...extra });
    assert.equal(response.status, 400, `deveria recusar ${JSON.stringify(extra)}`);
    assert.equal(response.body.code, 'habit_log_invalid_value');
    assert.ok(response.body.error.length > 0);
  }

  assert.deepEqual(log('agua'), before, 'o registro do dia fica como estava');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM habit_logs').get().c, 1);
});

test('quantidade inválida em hábito sem meta também é recusada, em vez de virar feito', async (t) => {
  const { post, log } = await setup(t);

  const response = await post({ habit_id: 'ler', date: DAY, completed: true, value: 'abc' });

  assert.equal(response.status, 400);
  assert.equal(log('ler'), undefined);
});

test('formato antigo continua valendo: check sem valor completa com a meta', async (t) => {
  const { post, log } = await setup(t);

  const quantitative = await post({ habit_id: 'agua', date: DAY, completed: true });
  const simple = await post({ habit_id: 'ler', date: DAY, completed: true });
  const emptyValue = await post({ habit_id: 'ler', date: '2026-11-13', completed: true, value: '' });

  assert.equal(quantitative.status, 201);
  assert.deepEqual(log('agua'), { completed: 1, value: 3, outcome: 'done' });
  assert.equal(simple.status, 201);
  assert.equal(log('ler').completed, 1);
  assert.equal(emptyValue.status, 201);
});

test('aceita vírgula e texto numérico; reduzir abaixo da meta reabre', async (t) => {
  const { post, log } = await setup(t);

  assert.equal((await post({ habit_id: 'agua', date: DAY, value: '3' })).status, 201);
  assert.equal(log('agua').completed, 1);

  assert.equal((await post({ habit_id: 'agua', date: DAY, value: '0,5' })).status, 200);
  assert.deepEqual(log('agua'), { completed: 0, value: 0.5, outcome: null });

  assert.equal((await post({ habit_id: 'agua', date: DAY, increment: -0.5 })).status, 200);
  assert.equal(log('agua').value, 0);
});

test('Não rolou ignora a quantidade enviada junto', async (t) => {
  const { post, log } = await setup(t);

  const response = await post({ habit_id: 'agua', date: DAY, outcome: 'skipped', value: 'qualquer coisa' });

  assert.equal(response.status, 201);
  assert.deepEqual(log('agua'), { completed: 0, value: null, outcome: 'skipped' });
});

test('readHabitQuantity: casos de borda', () => {
  assert.deepEqual(readHabitQuantity({}), { value: null });
  assert.deepEqual(readHabitQuantity({ value: null, increment: '' }), { value: null });
  assert.deepEqual(readHabitQuantity({ value: 0 }), { value: 0 });
  assert.deepEqual(readHabitQuantity({ value: ' 1,25 ' }), { value: 1.25 });
  assert.deepEqual(readHabitQuantity({ increment: 0.1, currentValue: 0.2 }), { value: 0.3 });
  assert.deepEqual(readHabitQuantity({ increment: 1, currentValue: null }), { value: 1 });
  assert.ok(readHabitQuantity({ value: Infinity }).error);
  assert.ok(readHabitQuantity({ value: Number.NaN }).error);
  assert.ok(readHabitQuantity({ value: '0x10' }).error);
  assert.ok(readHabitQuantity({ increment: -1, currentValue: 0.5 }).error);
});
