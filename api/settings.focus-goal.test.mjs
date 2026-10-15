import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createSettingsRouter } from './routes/settings.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';

async function setup(t) {
  const db = createTestDb();
  const app = express();
  app.use(express.json());
  app.use('/api/user', createSettingsRouter({ db }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  const get = () => requestJson(server.base, '/api/user/settings');
  const put = (body) => requestJson(server.base, '/api/user/settings', { method: 'PUT', body });
  const putRaw = (body) => fetch(`${server.base}/api/user/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { get, put, putRaw };
}

test('meta semanal de foco vem desligada por padrão', async (t) => {
  const { get } = await setup(t);
  const settings = await get();
  assert.ok('focus_weekly_goal_minutes' in settings);
  assert.equal(settings.focus_weekly_goal_minutes, null);
});

test('liga com 300 e desliga com null explícito', async (t) => {
  const { get, put } = await setup(t);
  assert.equal((await put({ focus_weekly_goal_minutes: 300 })).focus_weekly_goal_minutes, 300);
  assert.equal((await get()).focus_weekly_goal_minutes, 300);
  assert.equal((await put({ focus_weekly_goal_minutes: null })).focus_weekly_goal_minutes, null);
  assert.equal((await get()).focus_weekly_goal_minutes, null);
});

test('campo ausente preserva a meta', async (t) => {
  const { get, put } = await setup(t);
  await put({ focus_weekly_goal_minutes: 300 });
  const after = await put({ pomodoro_focus: 30 });
  assert.equal(after.focus_weekly_goal_minutes, 300);
  assert.equal(after.pomodoro_focus, 30);
  assert.equal((await get()).focus_weekly_goal_minutes, 300);
});

test('valor inválido devolve 400 e não muda nada', async (t) => {
  const { get, put, putRaw } = await setup(t);
  await put({ focus_weekly_goal_minutes: 300 });
  for (const value of [29, 3001, 120.5, '300', 'abc', true, 0, -10]) {
    const res = await putRaw({ focus_weekly_goal_minutes: value, pomodoro_focus: 50 });
    assert.equal(res.status, 400, `valor ${JSON.stringify(value)} deveria ser rejeitado`);
  }
  const settings = await get();
  assert.equal(settings.focus_weekly_goal_minutes, 300);
  assert.equal(settings.pomodoro_focus, 25);
});

test('limites 30 e 3000 são aceitos', async (t) => {
  const { put } = await setup(t);
  assert.equal((await put({ focus_weekly_goal_minutes: 30 })).focus_weekly_goal_minutes, 30);
  assert.equal((await put({ focus_weekly_goal_minutes: 3000 })).focus_weekly_goal_minutes, 3000);
});
