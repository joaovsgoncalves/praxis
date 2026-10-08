import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import {
  getWaterLog,
  initNutritionSchema,
  upsertWaterLog,
} from './nutrition.js';
import { createNutritionRouter } from './routes/nutrition.js';
import { createTestDb, startTestServer } from './test-support/helpers.mjs';
import { migrateLocalWater, readLocalWater } from '../src/lib/nutritionWater.js';

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

async function json(base, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, payload: text ? JSON.parse(text) : null };
}

test('water schema stores one authenticated-day total and survives repeated initialization', (t) => {
  const db = createTestDb({ withNutrition: true });
  t.after(() => db.close());

  assert.deepEqual(getWaterLog(db, '2026-09-15'), {
    date: '2026-09-15', amount_ml: 0, revision: 0, updated_at: null, exists: false,
  });
  const created = upsertWaterLog(db, {
    date: '2026-09-15', amount_ml: 750, expected_revision: 0,
  });
  assert.equal(created.amount_ml, 750);
  assert.equal(created.revision, 1);
  assert.equal(created.exists, true);

  initNutritionSchema(db);
  initNutritionSchema(db);
  assert.equal(getWaterLog(db, '2026-09-15').amount_ml, 750);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM nutrition_water_logs').get().total, 1);
});

test('water writes are idempotent and reject stale device revisions without overwriting', (t) => {
  const db = createTestDb({ withNutrition: true });
  t.after(() => db.close());

  const first = upsertWaterLog(db, { date: '2026-09-15', amount_ml: 500, expected_revision: 0 });
  const retry = upsertWaterLog(db, { date: '2026-09-15', amount_ml: 500, expected_revision: 0 });
  assert.equal(retry.revision, first.revision);

  const second = upsertWaterLog(db, { date: '2026-09-15', amount_ml: 750, expected_revision: first.revision });
  assert.equal(second.revision, 2);
  assert.throws(
    () => upsertWaterLog(db, { date: '2026-09-15', amount_ml: 1000, expected_revision: first.revision }),
    (error) => error.status === 409 && error.current.amount_ml === 750,
  );
  assert.equal(getWaterLog(db, '2026-09-15').amount_ml, 750);
});

test('water API validates date and amount and exposes conflict state', async (t) => {
  const db = createTestDb({ withNutrition: true });
  const app = express();
  app.use(express.json());
  app.use('/api/nutrition', createNutritionRouter({ db, getLocalDateString: () => '2026-09-15' }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  assert.equal((await json(server.base, '/api/nutrition/water?date=2026-09-15')).payload.amount_ml, 0);
  assert.equal((await json(server.base, '/api/nutrition/water', {
    method: 'PUT', body: { date: '2026-09-15', amount_ml: 500, expected_revision: 0 },
  })).status, 200);
  assert.equal((await json(server.base, '/api/nutrition/water', {
    method: 'PUT', body: { date: '2026-09-15', amount_ml: 750, expected_revision: 0 },
  })).status, 409);
  assert.equal((await json(server.base, '/api/nutrition/water', {
    method: 'PUT', body: { date: 'bad', amount_ml: -1, expected_revision: 0 },
  })).status, 400);
});

test('local water migration imports once without duplicating consumption', async () => {
  const storage = memoryStorage({ 'water_2026-09-15': '3' });
  const calls = [];
  const save = async (payload) => {
    calls.push(payload);
    return { date: payload.date, amount_ml: payload.amount_ml, revision: 1, exists: true };
  };
  const empty = { date: '2026-09-15', amount_ml: 0, revision: 0, updated_at: null, exists: false };

  const first = await migrateLocalWater({ storage, date: '2026-09-15', remote: empty, save });
  const repeated = await migrateLocalWater({ storage, date: '2026-09-15', remote: first.record, save });

  assert.equal(readLocalWater(storage, '2026-09-15'), 750);
  assert.equal(first.record.amount_ml, 750);
  assert.equal(repeated.record.amount_ml, 750);
  assert.equal(calls.length, 1);
  assert.equal(storage.getItem('nutrition_water_migrated_2026-09-15'), '1');
});

test('local migration never overwrites a remote record or marks transient failures complete', async () => {
  const storage = memoryStorage({ 'water_ml_2026-09-15': '1250' });
  let calls = 0;
  const remote = { date: '2026-09-15', amount_ml: 500, revision: 2, updated_at: 'now', exists: true };
  const kept = await migrateLocalWater({
    storage, date: '2026-09-15', remote,
    save: async () => { calls += 1; },
  });
  assert.equal(kept.record.amount_ml, 500);
  assert.equal(calls, 0);

  const retryStorage = memoryStorage({ 'water_ml_2026-09-16': '1000' });
  await assert.rejects(() => migrateLocalWater({
    storage: retryStorage,
    date: '2026-09-16',
    remote: { date: '2026-09-16', amount_ml: 0, revision: 0, exists: false },
    save: async () => { throw new Error('offline'); },
  }), /offline/);
  assert.equal(retryStorage.getItem('nutrition_water_migrated_2026-09-16'), null);
  assert.equal(readLocalWater(retryStorage, '2026-09-16'), 1000);
});
