import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSettingsRouter } from './routes/settings.js';
import { createSettingsService } from './services/personal/settings.js';
import { requestJson } from './test-support/helpers.mjs';
import { makeParityApp, parityEngines } from './test-support/httpParity.mjs';

// Arnês: a rota nova sobre a camada assíncrona, em cada motor disponível (SQLite sempre; Firestore no emulador).
async function setup(t, kind) {
  const app = await makeParityApp(kind, {
    mount: '/api/user',
    build: (storage) => createSettingsRouter({ settings: createSettingsService({ storage }) }),
  });
  t.after(app.dispose);
  const base = app.base.slice(0, -'/api/user'.length);
  const get = () => requestJson(base, '/api/user/settings');
  const put = (body) => requestJson(base, '/api/user/settings', { method: 'PUT', body });
  const putRaw = (body) => fetch(`${base}/api/user/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { get, put, putRaw };
}

for (const kind of parityEngines()) {
  test(`${kind}: meta semanal de foco vem desligada por padrão`, async (t) => {
    const { get } = await setup(t, kind);
    const settings = await get();
    assert.ok('focus_weekly_goal_minutes' in settings);
    assert.equal(settings.focus_weekly_goal_minutes, null);
  });

  test(`${kind}: liga com 300 e desliga com null explícito`, async (t) => {
    const { get, put } = await setup(t, kind);
    assert.equal((await put({ focus_weekly_goal_minutes: 300 })).focus_weekly_goal_minutes, 300);
    assert.equal((await get()).focus_weekly_goal_minutes, 300);
    assert.equal((await put({ focus_weekly_goal_minutes: null })).focus_weekly_goal_minutes, null);
    assert.equal((await get()).focus_weekly_goal_minutes, null);
  });

  test(`${kind}: campo ausente preserva a meta`, async (t) => {
    const { get, put } = await setup(t, kind);
    await put({ focus_weekly_goal_minutes: 300 });
    const after = await put({ pomodoro_focus: 30 });
    assert.equal(after.focus_weekly_goal_minutes, 300);
    assert.equal(after.pomodoro_focus, 30);
    assert.equal((await get()).focus_weekly_goal_minutes, 300);
  });

  test(`${kind}: valor inválido devolve 400 e não muda nada`, async (t) => {
    const { get, put, putRaw } = await setup(t, kind);
    await put({ focus_weekly_goal_minutes: 300 });
    for (const value of [29, 3001, 120.5, '300', 'abc', true, 0, -10]) {
      const res = await putRaw({ focus_weekly_goal_minutes: value, pomodoro_focus: 50 });
      assert.equal(res.status, 400, `valor ${JSON.stringify(value)} deveria ser rejeitado`);
    }
    const settings = await get();
    assert.equal(settings.focus_weekly_goal_minutes, 300);
    assert.equal(settings.pomodoro_focus, 25);
  });

  test(`${kind}: limites 30 e 3000 são aceitos`, async (t) => {
    const { put } = await setup(t, kind);
    assert.equal((await put({ focus_weekly_goal_minutes: 30 })).focus_weekly_goal_minutes, 30);
    assert.equal((await put({ focus_weekly_goal_minutes: 3000 })).focus_weekly_goal_minutes, 3000);
  });
}
