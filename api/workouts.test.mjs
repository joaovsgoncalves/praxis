import fs from "node:fs";
import { seedExerciseCatalog } from "../scripts/seed-exercise-catalog.mjs";
import Database from 'better-sqlite3';
import { formatRestDuration, formatSessionElapsed } from "../src/lib/workouts.js";
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import { registerWorkoutRoutes, initWorkoutSchema } from './workouts.js';
import { createTestDb, startTestServer, requestJson } from './test-support/helpers.mjs';

describe('workout routes', () => {
  let db;
  let server;

  before(async () => {
    db = createTestDb({ withWorkouts: true });
    const app = express();
    app.use(express.json());
    registerWorkoutRoutes(app, db);
    server = await startTestServer(app);
  });

  after(async () => {
    await server.close();
    db.close();
  });

  test('program setup, session logging, and summary track a full workout flow', async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    const empty = await request('/api/workouts/summary');
    assert.equal(empty.active_program, null);
    assert.equal(empty.active_session, null);

    let program = await request('/api/workouts/programs', {
      method: 'POST',
      body: { name: 'Push Pull Legs' },
    });
    assert.equal(program.name, 'Push Pull Legs');
    assert.equal(program.is_active, 1);

    program = await request(`/api/workouts/programs/${program.id}/days`, {
      method: 'POST',
      body: { name: 'Pull 1', day_type: 'training', estimated_duration_minutes: 45 },
    });
    const pullDay = program.days[0];
    assert.equal(program.current_day_id, pullDay.id);

    program = await request(`/api/workouts/programs/${program.id}/days`, {
      method: 'POST',
      body: { name: 'Descanso', day_type: 'rest' },
    });
    const restDay = program.days[1];
    assert.equal(restDay.day_type, 'rest');

    const exercise = await request('/api/workouts/exercises', {
      method: 'POST',
      body: {
        name: 'Barra fixa pronada',
        category: 'calisthenics',
        tracking_type: 'reps',
      },
    });

    program = await request(`/api/workouts/days/${pullDay.id}/exercises`, {
      method: 'POST',
      body: {
        exercise_id: exercise.id,
        target_sets: 3,
        rep_min: 8,
        rep_max: 10,
        rest_seconds: 120,
      },
    });
    assert.equal(program.days[0].exercises.length, 1);
    assert.equal(program.days[0].exercises[0].target_sets, 3);

    let session = await request('/api/workouts/sessions', {
      method: 'POST',
      body: { workout_day_id: pullDay.id },
    });
    assert.equal(session.status, 'active');
    assert.equal(session.exercises.length, 1);
    assert.deepEqual(session.exercises[0].previous_sets, []);

    session = await request(`/api/workouts/sessions/${session.id}/sets`, {
      method: 'POST',
      body: {
        session_exercise_id: session.exercises[0].id,
        reps: 10,
        band_level: 'extra_heavy',
      },
    });
    assert.equal(session.exercises[0].sets.length, 1);
    assert.equal(session.exercises[0].sets[0].reps, 10);
    assert.equal(session.exercises[0].sets[0].band_level, 'extra_heavy');

    await assert.rejects(
      () => request(`/api/workouts/sessions/${session.id}/sets`, {
        method: 'POST',
        body: {
          session_exercise_id: session.exercises[0].id,
          reps: 9,
          band_level: 'purple',
        },
      }),
      /400/,
    );

    session = await request(`/api/workouts/sessions/${session.id}/finish`, {
      method: 'POST',
      body: {},
    });
    assert.equal(session.status, 'completed');

    let summary = await request('/api/workouts/summary');
    assert.equal(summary.current_day.id, restDay.id);
    assert.equal(summary.total_completed, 1);
    assert.equal(summary.active_session, null);

    program = await request(`/api/workouts/programs/${program.id}/advance`, {
      method: 'POST',
      body: { current_day_id: restDay.id },
    });
    assert.equal(program.current_day_id, pullDay.id);

    const second = await request('/api/workouts/sessions', {
      method: 'POST',
      body: { workout_day_id: pullDay.id },
    });
    assert.equal(second.exercises[0].previous_sets.length, 1);
    assert.equal(second.exercises[0].previous_sets[0].reps, 10);
    assert.equal(second.exercises[0].previous_sets[0].band_level, 'extra_heavy');

    await request(`/api/workouts/sessions/${second.id}/sets`, {
      method: 'POST',
      body: { session_exercise_id: second.exercises[0].id, reps: 11 },
    });
    await request(`/api/workouts/sessions/${second.id}/finish`, { method: 'POST', body: {} });

    const history = await request('/api/workouts/sessions?limit=10');
    assert.equal(history.length, 2);
    assert.equal(history[0].completed_sets, 1);

    summary = await request('/api/workouts/summary');
    assert.equal(summary.total_completed, 2);
  });

  test('logbook v1.1: purpose, target RIR, warmup/work roles, quality and work-only metrics', async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    let program = await request('/api/workouts/programs', {
      method: 'POST',
      body: { name: 'Força Superior' },
    });
    program = await request(`/api/workouts/programs/${program.id}/days`, {
      method: 'POST',
      body: { name: 'Push Força', day_type: 'training' },
    });
    const day = program.days[0];

    const exercise = await request('/api/workouts/exercises', {
      method: 'POST',
      body: { name: 'Supino reto', category: 'strength', tracking_type: 'weight_reps' },
    });

    // Purpose + inverted target RIR (min > max) is normalized on write.
    program = await request(`/api/workouts/days/${day.id}/exercises`, {
      method: 'POST',
      body: {
        exercise_id: exercise.id,
        target_sets: 2,
        rep_min: 5,
        rep_max: 8,
        purpose: 'strength',
        target_rir_min: 2,
        target_rir_max: 1,
      },
    });
    const dayExercise = program.days[0].exercises[0];
    assert.equal(dayExercise.purpose, 'strength');
    assert.equal(dayExercise.target_rir_min, 1);
    assert.equal(dayExercise.target_rir_max, 2);

    // Invalid purpose is rejected with a 400.
    await assert.rejects(
      () => request(`/api/workouts/days/${day.id}/exercises`, {
        method: 'POST',
        body: { exercise_id: exercise.id, purpose: 'bulking' },
      }),
      /400/,
    );

    // Session snapshots the objective + target RIR.
    let session = await request('/api/workouts/sessions', {
      method: 'POST',
      body: { workout_day_id: day.id },
    });
    const sessionExerciseId = session.exercises[0].id;
    assert.equal(session.exercises[0].purpose, 'strength');
    assert.equal(session.exercises[0].target_rir_min, 1);
    assert.equal(session.exercises[0].target_rir_max, 2);

    // One warmup set.
    session = await request(`/api/workouts/sessions/${session.id}/sets`, {
      method: 'POST',
      body: { session_exercise_id: sessionExerciseId, reps: 5, weight_kg: 20, set_role: 'warmup' },
    });
    assert.equal(session.exercises[0].sets[0].set_role, 'warmup');

    // A warmup-only session cannot be finished.
    await assert.rejects(
      () => request(`/api/workouts/sessions/${session.id}/finish`, { method: 'POST', body: {} }),
      /400/,
    );

    // Invalid set_role / technical_quality are rejected.
    await assert.rejects(
      () => request(`/api/workouts/sessions/${session.id}/sets`, {
        method: 'POST',
        body: { session_exercise_id: sessionExerciseId, reps: 5, set_role: 'drop' },
      }),
      /400/,
    );
    await assert.rejects(
      () => request(`/api/workouts/sessions/${session.id}/sets`, {
        method: 'POST',
        body: { session_exercise_id: sessionExerciseId, reps: 5, technical_quality: 'perfect' },
      }),
      /400/,
    );

    // Two working sets, one with RIR + technical quality.
    await request(`/api/workouts/sessions/${session.id}/sets`, {
      method: 'POST',
      body: { session_exercise_id: sessionExerciseId, reps: 6, weight_kg: 60, rir: 2, technical_quality: 'clean' },
    });
    session = await request(`/api/workouts/sessions/${session.id}/sets`, {
      method: 'POST',
      body: { session_exercise_id: sessionExerciseId, reps: 5, weight_kg: 60, set_role: 'work' },
    });

    // Set numbers stay sequential across every set regardless of role.
    assert.deepEqual(session.exercises[0].sets.map((s) => s.set_number), [1, 2, 3]);
    const workSet = session.exercises[0].sets.find((s) => s.rir === 2);
    assert.equal(workSet.technical_quality, 'clean');

    // Work / warmup totals are separated; completed_sets stays as the raw total for compat.
    const detail = await request(`/api/workouts/sessions/${session.id}`);
    assert.equal(detail.completed_warmup_sets, 1);
    assert.equal(detail.completed_work_sets, 2);
    assert.equal(detail.completed_sets, 3);

    session = await request(`/api/workouts/sessions/${session.id}/finish`, { method: 'POST', body: {} });
    assert.equal(session.status, 'completed');

    // Reset current day so we can re-run this training day, then prefill from work sets only.
    await request(`/api/workouts/programs/${program.id}`, {
      method: 'PATCH',
      body: { current_day_id: day.id },
    });
    const second = await request('/api/workouts/sessions', {
      method: 'POST',
      body: { workout_day_id: day.id },
    });
    // Prefill ignores the warmup — only the two working sets carry over.
    assert.equal(second.exercises[0].previous_sets.length, 2);
    assert.ok(second.exercises[0].previous_sets.every((s) => s.set_role !== 'warmup'));

    await request(`/api/workouts/sessions/${second.id}/abandon`, { method: 'POST', body: {} });
  });
  test("active session collisions: resumes same day, abandons empty session for another day, protects session with work sets", async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    let program = await request("/api/workouts/programs", {
      method: "POST",
      body: { name: "Ciclo PPL Teste" },
    });
    program = await request("/api/workouts/programs/" + program.id + "/days", {
      method: "POST",
      body: { name: "Pull 1", day_type: "training" },
    });
    program = await request("/api/workouts/programs/" + program.id + "/days", {
      method: "POST",
      body: { name: "Push 1", day_type: "training" },
    });
    const pullDay = program.days[0];
    const pushDay = program.days[1];

    const exercise = await request("/api/workouts/exercises", {
      method: "POST",
      body: { name: "Remada curvada", category: "strength", tracking_type: "weight_reps" },
    });
    await request("/api/workouts/days/" + pullDay.id + "/exercises", {
      method: "POST",
      body: { exercise_id: exercise.id, target_sets: 3, rep_min: 8, rep_max: 10, rest_seconds: 90 },
    });
    await request("/api/workouts/days/" + pushDay.id + "/exercises", {
      method: "POST",
      body: { exercise_id: exercise.id, target_sets: 3, rep_min: 8, rep_max: 10, rest_seconds: 90 },
    });

    // 1. Start Pull 1 session (empty: 0 sets)
    const pullSession = await request("/api/workouts/sessions", {
      method: "POST",
      body: { workout_day_id: pullDay.id },
    });
    assert.equal(pullSession.status, "active");
    assert.equal(pullSession.workout_day_id, pullDay.id);

    // 2. Starting same day again returns 409 + existing session
    const sameDayRes = await fetch(server.base + "/api/workouts/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workout_day_id: pullDay.id }),
    });
    assert.equal(sameDayRes.status, 409);
    const sameDayBody = await sameDayRes.json();
    assert.equal(sameDayBody.session.id, pullSession.id);

    // 3. Starting Push 1 while Pull 1 is empty abandons Pull 1 and starts Push 1 (201)
    const pushSession = await request("/api/workouts/sessions", {
      method: "POST",
      body: { workout_day_id: pushDay.id },
    });
    assert.equal(pushSession.status, "active");
    assert.equal(pushSession.workout_day_id, pushDay.id);
    assert.notEqual(pushSession.id, pullSession.id);

    const pullSessionAfter = await request("/api/workouts/sessions/" + pullSession.id);
    assert.equal(pullSessionAfter.status, "abandoned");

    const summary = await request("/api/workouts/summary");
    assert.equal(summary.active_session.id, pushSession.id);

    // 4. Log a work set in Push 1 session
    await request("/api/workouts/sessions/" + pushSession.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: pushSession.exercises[0].id,
        reps: 10,
        weight_kg: 50,
        set_role: "work",
      },
    });

    // 5. Trying to start Pull 1 while Push 1 has work sets returns 409 and protects Push 1
    const diffDayWithSetsRes = await fetch(server.base + "/api/workouts/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workout_day_id: pullDay.id }),
    });
    assert.equal(diffDayWithSetsRes.status, 409);
    const diffDayBody = await diffDayWithSetsRes.json();
    assert.equal(diffDayBody.session.id, pushSession.id);

    const pushSessionAfter = await request("/api/workouts/sessions/" + pushSession.id);
    assert.equal(pushSessionAfter.status, "active");
    assert.equal(pushSessionAfter.completed_work_sets, 1);

    // Clean up
    await request("/api/workouts/sessions/" + pushSession.id + "/abandon", { method: "POST", body: {} });
  });
});

describe("workout format helpers", () => {
  test("formatRestDuration formats seconds to MM:SS or M:SS without leading 0 for single-digit minutes", () => {
    assert.equal(formatRestDuration(120), "2:00");
    assert.equal(formatRestDuration(90), "1:30");
    assert.equal(formatRestDuration(60), "1:00");
    assert.equal(formatRestDuration(45), "0:45");
    assert.equal(formatRestDuration(0), "0:00");
    assert.equal(formatRestDuration(null), "0:00");
  });

  test("formatSessionElapsed displays humanized short format and never looks like a rest countdown", () => {
    assert.equal(formatSessionElapsed(0), "< 1 min");
    assert.equal(formatSessionElapsed(30), "< 1 min");
    assert.equal(formatSessionElapsed(60), "1 min");
    assert.equal(formatSessionElapsed(125), "2 min");
    assert.equal(formatSessionElapsed(2500), "41 min");
    assert.equal(formatSessionElapsed(3600), "1h");
    assert.equal(formatSessionElapsed(4500), "1h 15min");
    assert.equal(formatSessionElapsed(95063), "26h");
  });
});


describe('Treinos V4 Fase 1 schema and catalog exercise migration', () => {
  let db;
  let server;

  before(async () => {
    db = createTestDb({ withWorkouts: true });
    const app = express();
    app.use(express.json());
    registerWorkoutRoutes(app, db);
    server = await startTestServer(app);
  });

  after(async () => {
    await server.close();
    db.close();
  });

  test('PRAGMA table_info(workout_exercises) includes all catalog columns and indexes exist', () => {
    const columns = db.prepare("PRAGMA table_info(workout_exercises)").all().map((c) => c.name);
    const expectedColumns = [
      'id',
      'name',
      'category',
      'muscle_group',
      'equipment',
      'tracking_type',
      'instructions',
      'is_custom',
      'catalog_external_id',
      'source',
      'body_part',
      'target_muscle',
      'secondary_muscles_json',
      'media_id',
      'thumb_path',
      'gif_path',
      'attribution',
      'instructions_json',
      'equipment_key',
      'is_bodyweight_default',
      'status',
      'created_at',
      'updated_at',
    ];

    for (const col of expectedColumns) {
      assert.ok(columns.includes(col), `Missing column ${col} in workout_exercises`);
    }

    const indexes = db.prepare("PRAGMA index_list('workout_exercises')").all().map((i) => i.name);
    assert.ok(indexes.includes('idx_workout_exercises_catalog_external_id'));
    assert.ok(indexes.includes('idx_workout_exercises_body_part'));
    assert.ok(indexes.includes('idx_workout_exercises_target_muscle'));
  });

  test('idempotent migration applies cleanly to legacy pre-V4 database and sets correct defaults', () => {
    const legacyDb = new Database(':memory:');
    legacyDb.exec(`
      CREATE TABLE workout_exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'strength',
        muscle_group TEXT DEFAULT '',
        equipment TEXT DEFAULT '',
        tracking_type TEXT DEFAULT 'reps',
        instructions TEXT DEFAULT '',
        is_custom INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO workout_exercises (id, name, category, muscle_group)
      VALUES ('legacy-1', 'Flexão clássica', 'calisthenics', 'chest');
    `);

    initWorkoutSchema(legacyDb);
    initWorkoutSchema(legacyDb);

    const cols = legacyDb.prepare("PRAGMA table_info(workout_exercises)").all().map((c) => c.name);
    assert.ok(cols.includes('catalog_external_id'));
    assert.ok(cols.includes('source'));
    assert.ok(cols.includes('body_part'));
    assert.ok(cols.includes('target_muscle'));
    assert.ok(cols.includes('secondary_muscles_json'));
    assert.ok(cols.includes('media_id'));
    assert.ok(cols.includes('thumb_path'));
    assert.ok(cols.includes('gif_path'));
    assert.ok(cols.includes('attribution'));
    assert.ok(cols.includes('instructions_json'));
    assert.ok(cols.includes('equipment_key'));
    assert.ok(cols.includes('is_bodyweight_default'));

    const legacyRow = legacyDb.prepare('SELECT * FROM workout_exercises WHERE id = ?').get('legacy-1');
    assert.equal(legacyRow.name, 'Flexão clássica');
    assert.equal(legacyRow.is_custom, 1);
    assert.equal(legacyRow.source, 'custom');
    assert.equal(legacyRow.is_bodyweight_default, 0);
    assert.equal(legacyRow.catalog_external_id, null);
    assert.equal(legacyRow.target_muscle, null);

    legacyDb.close();
  });

  test('create classic custom exercise retains custom defaults and works through program/day flow', async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    const created = await request('/api/workouts/exercises', {
      method: 'POST',
      body: {
        name: 'Flexão diamante personalizada',
        category: 'calisthenics',
        tracking_type: 'reps',
        muscle_group: 'tríceps',
      },
    });

    assert.equal(created.name, 'Flexão diamante personalizada');
    assert.equal(created.is_custom, 1);
    assert.equal(created.source, 'custom');
    assert.equal(created.catalog_external_id, null);
    assert.equal(created.body_part, null);
    assert.equal(created.target_muscle, null);
    assert.equal(created.secondary_muscles_json, null);
    assert.equal(created.media_id, null);
    assert.equal(created.thumb_path, null);
    assert.equal(created.gif_path, null);
    assert.equal(created.attribution, null);
    assert.equal(created.instructions_json, null);
    assert.equal(created.equipment_key, null);
    assert.equal(created.is_bodyweight_default, 0);
  });

  test('create and update catalog exercise round-trips all metadata fields correctly', async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    const catalogPayload = {
      name: 'Barbell Bench Press',
      category: 'strength',
      source: 'catalog',
      catalog_external_id: '0001',
      body_part: 'chest',
      target_muscle: 'pectorals',
      secondary_muscles_json: ['deltoids', 'triceps'],
      media_id: '2gPfomN',
      thumb_path: 'images/0001-2gPfomN.jpg',
      gif_path: 'videos/0001-2gPfomN.gif',
      attribution: '© Gym visual — https://gymvisual.com/',
      instructions_json: {
        en: ['Lie down on bench.', 'Lower bar to chest.', 'Press back up.'],
      },
      equipment_key: 'barbell',
      is_bodyweight_default: 0,
    };

    const created = await request('/api/workouts/exercises', {
      method: 'POST',
      body: catalogPayload,
    });

    assert.equal(created.name, 'Barbell Bench Press');
    assert.equal(created.source, 'catalog');
    assert.equal(created.is_custom, 0);
    assert.equal(created.catalog_external_id, '0001');
    assert.equal(created.body_part, 'chest');
    assert.equal(created.target_muscle, 'pectorals');
    assert.equal(created.secondary_muscles_json, JSON.stringify(['deltoids', 'triceps']));
    assert.equal(created.media_id, '2gPfomN');
    assert.equal(created.thumb_path, 'images/0001-2gPfomN.jpg');
    assert.equal(created.gif_path, 'videos/0001-2gPfomN.gif');
    assert.equal(created.attribution, '© Gym visual — https://gymvisual.com/');
    assert.equal(
      created.instructions_json,
      JSON.stringify({ en: ['Lie down on bench.', 'Lower bar to chest.', 'Press back up.'] }),
    );
    assert.equal(created.equipment_key, 'barbell');
    assert.equal(created.is_bodyweight_default, 0);

    // Update via PATCH
    const patched = await request(`/api/workouts/exercises/${created.id}`, {
      method: 'PATCH',
      body: {
        target_muscle: 'chest',
        is_bodyweight_default: 1,
      },
    });

    assert.equal(patched.target_muscle, 'chest');
    assert.equal(patched.is_bodyweight_default, 1);
    assert.equal(patched.catalog_external_id, '0001');
    assert.equal(patched.source, 'catalog');
    assert.equal(patched.is_custom, 0);
  });
});

describe("Treinos V4 Fase 2 exercise catalog seed", () => {
  let db;
  let server;

  before(async () => {
    db = createTestDb({ withWorkouts: true });
    const app = express();
    app.use(express.json());
    registerWorkoutRoutes(app, db);
    server = await startTestServer(app);
  });

  after(async () => {
    await server.close();
    db.close();
  });

  test("seeding catalog exercises preserves existing custom exercises and enables program linking", async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    // 1. Create a custom user exercise
    const customEx = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Tríceps Banco Customizado",
        category: "calisthenics",
        tracking_type: "reps",
        muscle_group: "tríceps",
      },
    });
    assert.equal(customEx.is_custom, 1);
    assert.equal(customEx.source, "custom");

    // 2. Load fixture and apply seed
    const fixtureData = JSON.parse(
      fs.readFileSync(new URL("./test-support/fixtures/catalog-sample.json", import.meta.url), "utf8"),
    );
    const seedResult = seedExerciseCatalog({
      db,
      dataset: fixtureData,
      apply: true,
      dryRun: false,
    });

    assert.equal(seedResult.inserted, 3);
    assert.equal(seedResult.customPreserved, 1);
    assert.equal(seedResult.totalInDb, 4);

    // 3. Custom exercise remains untouched and can be retrieved
    const exercises = await request("/api/workouts/exercises?limit=100");
    assert.equal(exercises.length, 4);
    const foundCustom = exercises.find((e) => e.id === customEx.id);
    assert.ok(foundCustom);
    assert.equal(foundCustom.is_custom, 1);
    assert.equal(foundCustom.source, "custom");

    // 4. Catalog exercises are queryable and can be added to a program day
    const catalogBench = exercises.find((e) => e.catalog_external_id === "1316");
    assert.ok(catalogBench);
    assert.equal(catalogBench.is_custom, 0);
    assert.equal(catalogBench.source, "catalog");

    let program = await request("/api/workouts/programs", {
      method: "POST",
      body: { name: "Programa V4 Catálogo" },
    });
    program = await request("/api/workouts/programs/" + program.id + "/days", {
      method: "POST",
      body: { name: "Treino A", day_type: "training" },
    });
    const day = program.days[0];

    program = await request("/api/workouts/days/" + day.id + "/exercises", {
      method: "POST",
      body: {
        exercise_id: catalogBench.id,
        target_sets: 4,
        rep_min: 6,
        rep_max: 8,
        rest_seconds: 120,
      },
    });
    assert.equal(program.days[0].exercises.length, 1);
    assert.equal(program.days[0].exercises[0].exercise_id, catalogBench.id);
    assert.equal(program.days[0].exercises[0].exercise_name, "barbell bent arm pullover");
  });
});

describe("Treinos V4 Fase 3 exercise catalog API and filters", () => {
  let db;
  let server;
  let customEx;
  let catalogExercises;

  before(async () => {
    db = createTestDb({ withWorkouts: true });
    const app = express();
    app.use(express.json());
    registerWorkoutRoutes(app, db);
    server = await startTestServer(app);

    const request = (path, opts) => requestJson(server.base, path, opts);

    // 1. Seed 1 custom exercise
    customEx = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Flexão Diamante Custom",
        category: "calisthenics",
        tracking_type: "reps",
        muscle_group: "tríceps",
        equipment: "body weight",
        body_part: "arms",
        target_muscle: "triceps",
      },
    });

    // 2. Seed 3 catalog exercises from fixture
    const fixtureData = JSON.parse(
      fs.readFileSync(new URL("./test-support/fixtures/catalog-sample.json", import.meta.url), "utf8"),
    );
    seedExerciseCatalog({
      db,
      dataset: fixtureData,
      apply: true,
      dryRun: false,
    });

    const allExercises = await request("/api/workouts/exercises?limit=100");
    catalogExercises = allExercises.filter((e) => e.source === "catalog");
  });

  after(async () => {
    await server.close();
    db.close();
  });

  test("GET /api/workouts/exercises filters by source (catalog vs custom vs all)", async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    const catalogOnly = await request("/api/workouts/exercises?source=catalog");
    assert.equal(catalogOnly.length, 3);
    assert.ok(catalogOnly.every((e) => e.source === "catalog" && e.is_custom === 0));

    const customOnly = await request("/api/workouts/exercises?source=custom");
    assert.equal(customOnly.length, 1);
    assert.equal(customOnly[0].id, customEx.id);
    assert.equal(customOnly[0].source, "custom");
    assert.equal(customOnly[0].is_custom, 1);

    const all = await request("/api/workouts/exercises?source=all");
    assert.equal(all.length, 4);
  });

  test("GET /api/workouts/exercises filters by body_part, equipment, target_muscle and query q", async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    // Filter body_part
    const waistList = await request("/api/workouts/exercises?body_part=waist");
    assert.equal(waistList.length, 1);
    assert.equal(waistList[0].name, "3/4 sit-up");

    // Filter equipment
    const barbellList = await request("/api/workouts/exercises?equipment=barbell");
    assert.equal(barbellList.length, 1);
    assert.equal(barbellList[0].name, "barbell bent arm pullover");

    // Filter equipment_key
    const eqKeyList = await request("/api/workouts/exercises?equipment_key=barbell");
    assert.equal(eqKeyList.length, 1);
    assert.equal(eqKeyList[0].name, "barbell bent arm pullover");

    // Filter target_muscle
    const absList = await request("/api/workouts/exercises?target_muscle=abs");
    assert.equal(absList.length, 1);
    assert.equal(absList[0].name, "3/4 sit-up");

    // Search query q matches name or catalog attributes
    const qList = await request("/api/workouts/exercises?q=pullover");
    assert.equal(qList.length, 1);
    assert.equal(qList[0].name, "barbell bent arm pullover");

    // Combined filters
    const combined = await request("/api/workouts/exercises?source=catalog&body_part=back&equipment=barbell");
    assert.equal(combined.length, 1);
    assert.equal(combined[0].name, "barbell bent arm pullover");
  });

  test("GET /api/workouts/exercises supports pagination with offset/limit and meta envelope", async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    const pagedMeta = await request("/api/workouts/exercises?limit=2&offset=1&meta=1");
    assert.ok(pagedMeta && !Array.isArray(pagedMeta));
    assert.equal(pagedMeta.total, 4);
    assert.equal(pagedMeta.limit, 2);
    assert.equal(pagedMeta.offset, 1);
    assert.equal(pagedMeta.items.length, 2);

    const page2Meta = await request("/api/workouts/exercises?limit=2&page=2&meta=true");
    assert.equal(page2Meta.total, 4);
    assert.equal(page2Meta.limit, 2);
    assert.equal(page2Meta.offset, 2);
    assert.equal(page2Meta.items.length, 2);
  });

  test("GET /api/workouts/exercises/:id returns full row including catalog fields and 404 in PT", async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    const catalogEx = catalogExercises.find((e) => e.catalog_external_id === "1316");
    assert.ok(catalogEx);

    const detail = await request("/api/workouts/exercises/" + catalogEx.id);
    assert.equal(detail.id, catalogEx.id);
    assert.equal(detail.name, "barbell bent arm pullover");
    assert.equal(detail.catalog_external_id, "1316");
    assert.equal(detail.source, "catalog");
    assert.equal(detail.body_part, "back");
    assert.equal(detail.target_muscle, "lats");
    assert.equal(detail.media_id, "j599l3T");
    assert.equal(detail.thumb_path, "images/1316-j599l3T.jpg");
    assert.equal(detail.gif_path, "videos/1316-j599l3T.gif");
    assert.equal(detail.attribution, "© Gym visual — https://gymvisual.com/");
    assert.ok(detail.instructions_json);

    // 404 test with PT error message
    await assert.rejects(
      () => request("/api/workouts/exercises/non-existent-id"),
      /404.*Exercício não encontrado./,
    );
  });
});

describe("Treinos V4 Fase 5 — Session exercise media enrichment", () => {
  let db;
  let server;

  before(async () => {
    db = createTestDb({ withWorkouts: true });
    const app = express();
    app.use(express.json());
    registerWorkoutRoutes(app, db);
    server = await startTestServer(app);
  });

  after(async () => {
    await server.close();
    db.close();
  });

  test("session detail enriches exercises with catalog media paths and preserves custom without media", async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    // 1. Create a catalog exercise with media paths
    const catalogEx = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Barbell Bench Press",
        category: "strength",
        source: "catalog",
        catalog_external_id: "0001",
        body_part: "chest",
        target_muscle: "pectorals",
        thumb_path: "images/0001-2gPfomN.jpg",
        gif_path: "videos/0001-2gPfomN.gif",
        attribution: "© Gym visual — https://gymvisual.com/",
      },
    });
    assert.equal(catalogEx.source, "catalog");
    assert.equal(catalogEx.thumb_path, "images/0001-2gPfomN.jpg");
    assert.equal(catalogEx.gif_path, "videos/0001-2gPfomN.gif");

    // 2. Create a custom exercise without media
    const customEx = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Abdominal Supra Custom",
        category: "calisthenics",
        source: "custom",
        muscle_group: "abs",
      },
    });
    assert.equal(customEx.source, "custom");
    assert.equal(customEx.thumb_path, null);
    assert.equal(customEx.gif_path, null);

    // 3. Create program and day containing both exercises
    let program = await request("/api/workouts/programs", {
      method: "POST",
      body: { name: "Treino Fase 5 Teste" },
    });
    program = await request("/api/workouts/programs/" + program.id + "/days", {
      method: "POST",
      body: { name: "Dia A", day_type: "training" },
    });
    const day = program.days[0];

    await request("/api/workouts/days/" + day.id + "/exercises", {
      method: "POST",
      body: { exercise_id: catalogEx.id, target_sets: 3, rep_min: 8, rep_max: 10 },
    });
    await request("/api/workouts/days/" + day.id + "/exercises", {
      method: "POST",
      body: { exercise_id: customEx.id, target_sets: 3, rep_min: 15, rep_max: 20 },
    });

    // 4. Start active session
    let session = await request("/api/workouts/sessions", {
      method: "POST",
      body: { workout_day_id: day.id },
    });
    assert.equal(session.status, "active");
    assert.equal(session.exercises.length, 2);

    // Exercise 0 (catalog): must have media paths and attribution
    const sessionCatalog = session.exercises[0];
    assert.equal(sessionCatalog.exercise_id, catalogEx.id);
    assert.equal(sessionCatalog.exercise_name_snapshot, "Barbell Bench Press");
    assert.equal(sessionCatalog.source, "catalog");
    assert.equal(sessionCatalog.thumb_path, "images/0001-2gPfomN.jpg");
    assert.equal(sessionCatalog.gif_path, "videos/0001-2gPfomN.gif");
    assert.equal(sessionCatalog.attribution, "© Gym visual — https://gymvisual.com/");

    // Exercise 1 (custom): without media stays null
    const sessionCustom = session.exercises[1];
    assert.equal(sessionCustom.exercise_id, customEx.id);
    assert.equal(sessionCustom.exercise_name_snapshot, "Abdominal Supra Custom");
    assert.equal(sessionCustom.source, "custom");
    assert.equal(sessionCustom.thumb_path, null);
    assert.equal(sessionCustom.gif_path, null);
    assert.equal(sessionCustom.attribution, null);

    // 5. GET /api/workouts/sessions/active returns the same enriched structure
    const active = await request("/api/workouts/sessions/active");
    assert.equal(active.id, session.id);
    assert.equal(active.exercises[0].thumb_path, "images/0001-2gPfomN.jpg");
    assert.equal(active.exercises[0].gif_path, "videos/0001-2gPfomN.gif");
    assert.equal(active.exercises[1].thumb_path, null);

    // 6. Adding a set preserves media fields on response
    session = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionCatalog.id,
        reps: 10,
        weight_kg: 80,
      },
    });
    assert.equal(session.exercises[0].thumb_path, "images/0001-2gPfomN.jpg");
    assert.equal(session.exercises[0].gif_path, "videos/0001-2gPfomN.gif");
    assert.equal(session.exercises[1].thumb_path, null);

    // 7. GET /api/workouts/sessions/:id returns enriched fields
    const byId = await request("/api/workouts/sessions/" + session.id);
    assert.equal(byId.exercises[0].thumb_path, "images/0001-2gPfomN.jpg");
    assert.equal(byId.exercises[0].gif_path, "videos/0001-2gPfomN.gif");

    // 8. Finishing session preserves media fields
    session = await request("/api/workouts/sessions/" + session.id + "/finish", {
      method: "POST",
      body: {},
    });
    assert.equal(session.status, "completed");
    assert.equal(session.exercises[0].thumb_path, "images/0001-2gPfomN.jpg");
    assert.equal(session.exercises[0].gif_path, "videos/0001-2gPfomN.gif");
  });

  test("Treinos V4 Fase 6: personal record (PR) detection, warmup exclusion, and schema", async () => {
    const request = (path, opts) => requestJson(server.base, path, opts);

    // 1. Schema check
    const columns = db.prepare("PRAGMA table_info(workout_session_sets)").all();
    const colNames = columns.map((c) => c.name);
    assert.ok(colNames.includes("is_pr"), "workout_session_sets must include is_pr column");
    assert.ok(colNames.includes("pr_type"), "workout_session_sets must include pr_type column");

    // 2. Setup program, day, and exercise
    const prExercise = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Supino Reto PR Test",
        category: "strength",
        tracking_type: "weight_reps",
      },
    });

    let program = await request("/api/workouts/programs", {
      method: "POST",
      body: { name: "Programa PR Test" },
    });

    program = await request("/api/workouts/programs/" + program.id + "/days", {
      method: "POST",
      body: { name: "Peito PR", day_type: "training" },
    });
    const trainingDay = program.days[0];

    await request("/api/workouts/days/" + trainingDay.id + "/exercises", {
      method: "POST",
      body: {
        exercise_id: prExercise.id,
        target_sets: 4,
        rep_min: 6,
        rep_max: 10,
      },
    });

    // 3. Start session
    let session = await request("/api/workouts/sessions", {
      method: "POST",
      body: { workout_day_id: trainingDay.id },
    });
    assert.equal(session.status, "active");
    const sessionExerciseId = session.exercises[0].id;

    // Set 1 (Work): 50 kg x 8 reps -> Baseline (NOT PR)
    let res1 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 50,
        reps: 8,
        set_role: "work",
      },
    });
    assert.equal(res1.is_pr, false);
    assert.equal(res1.exercises[0].sets[0].is_pr, 0);

    // Set 2 (Work): 45 kg x 8 reps -> Weaker weight (NOT PR)
    let res2 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 45,
        reps: 8,
        set_role: "work",
      },
    });
    assert.equal(res2.is_pr, false);
    assert.equal(res2.exercises[0].sets[1].is_pr, 0);

    // Set 3 (Work): 60 kg x 6 reps -> Heavier weight (PR weight!)
    let res3 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 60,
        reps: 6,
        set_role: "work",
      },
    });
    assert.equal(res3.is_pr, true);
    assert.equal(res3.pr_type, "weight");
    assert.equal(res3.exercises[0].sets[2].is_pr, 1);
    assert.equal(res3.exercises[0].sets[2].pr_type, "weight");

    // Set 4 (Work): 60 kg x 10 reps -> Same weight, higher reps (PR reps!)
    let res4 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 60,
        reps: 10,
        set_role: "work",
      },
    });
    assert.equal(res4.is_pr, true);
    assert.equal(res4.pr_type, "reps");
    assert.equal(res4.exercises[0].sets[3].is_pr, 1);
    assert.equal(res4.exercises[0].sets[3].pr_type, "reps");

    // Set 5 (Warmup): 70 kg x 5 reps -> Warmup is NEVER PR
    let res5 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 70,
        reps: 5,
        set_role: "warmup",
      },
    });
    assert.equal(res5.is_pr, false);
    assert.equal(res5.pr_type, null);
    assert.equal(res5.exercises[0].sets[4].is_pr, 0);

    // Set 6 (Work): 65 kg x 5 reps -> Work set heavier than previous work max (60kg), warmup 70kg ignored -> PR weight!
    let res6 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 65,
        reps: 5,
        set_role: "work",
      },
    });
    assert.equal(res6.is_pr, true);
    assert.equal(res6.pr_type, "weight");
    assert.equal(res6.exercises[0].sets[5].is_pr, 1);

    // Set 7 (Work): 65 kg x 5 reps -> Same weight, same reps -> NOT PR
    let res7 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 65,
        reps: 5,
        set_role: "work",
      },
    });
    assert.equal(res7.is_pr, false);
    assert.equal(res7.exercises[0].sets[6].is_pr, 0);

    // 4. Finish session successfully
    session = await request("/api/workouts/sessions/" + session.id + "/finish", {
      method: "POST",
      body: {},
    });
    assert.equal(session.status, "completed");
  });
});

describe("Treinos V4 Fase 8 — 1RM API and stats", () => {
  let db;
  let server;

  before(async () => {
    db = createTestDb({ withWorkouts: true });
    const app = express();
    app.use(express.json());
    registerWorkoutRoutes(app, db);
    server = await startTestServer(app);
  });

  after(async () => {
    await server.close();
    db.close();
  });

  test("GET /api/workouts/exercises/:id/stats returns 404 for unknown or inactive exercise", async () => {
    const request = (p, opts) => requestJson(server.base, p, opts);
    await assert.rejects(
      () => request("/api/workouts/exercises/non-existent-id/stats"),
      /404.*Exercício não encontrado./
    );
  });

  test("GET /api/workouts/exercises/:id/stats returns null stats for unused exercise", async () => {
    const request = (p, opts) => requestJson(server.base, p, opts);

    const exercise = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Desenvolvimento Halteres",
        category: "strength",
        tracking_type: "weight_reps",
      },
    });

    const stats = await request("/api/workouts/exercises/" + exercise.id + "/stats");
    assert.equal(stats.exercise_id, exercise.id);
    assert.equal(stats.best_1rm, null);
    assert.equal(stats.best_weight, null);
    assert.equal(stats.best_reps, null);
    assert.equal(stats.last_performed_at, null);
    assert.equal(stats.total_work_sets, 0);
    assert.equal(stats.total_sessions, 0);
  });

  test("Session detail includes estimated_1rm on sets and exercise stats reflect history", async () => {
    const request = (p, opts) => requestJson(server.base, p, opts);

    // 1. Setup program and day with Supino Reto
    let program = await request("/api/workouts/programs", {
      method: "POST",
      body: { name: "Força A/B" },
    });
    program = await request("/api/workouts/programs/" + program.id + "/days", {
      method: "POST",
      body: { name: "Treino A" },
    });
    const day = program.days[0];

    const exercise = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Supino Reto Barra",
        category: "strength",
        tracking_type: "weight_reps",
      },
    });

    await request("/api/workouts/days/" + day.id + "/exercises", {
      method: "POST",
      body: { exercise_id: exercise.id, target_sets: 3 },
    });

    // 2. Start session
    let session = await request("/api/workouts/sessions", {
      method: "POST",
      body: { workout_day_id: day.id },
    });
    const sessionExerciseId = session.exercises[0].id;

    // Set 1: Warmup 50kg x 12 reps -> Epley would be 70kg, but warmup estimated_1rm must be null
    let res1 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 50,
        reps: 12,
        set_role: "warmup",
      },
    });
    assert.equal(res1.exercises[0].sets[0].estimated_1rm, null);

    // Set 2: Work 80kg x 8 reps -> 80 * (1 + 8/30) = 101.3
    let res2 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 80,
        reps: 8,
        set_role: "work",
      },
    });
    assert.equal(res2.exercises[0].sets[1].estimated_1rm, 101.3);
    assert.equal(res2.exercises[0].best_1rm, 101.3);

    // Set 3: Work 90kg x 5 reps -> 90 * (1 + 5/30) = 105
    let res3 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 90,
        reps: 5,
        set_role: "work",
      },
    });
    assert.equal(res3.exercises[0].sets[2].estimated_1rm, 105);
    assert.equal(res3.exercises[0].best_1rm, 105);

    // Set 4: Heavy warmup 120kg x 5 reps (140 1RM) -> Warmup MUST be excluded from best 1RM
    let res4 = await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: sessionExerciseId,
        weight_kg: 120,
        reps: 5,
        set_role: "warmup",
      },
    });
    assert.equal(res4.exercises[0].sets[3].estimated_1rm, null);
    assert.equal(res4.exercises[0].best_1rm, 105); // Still 105 from work sets

    // 3. Complete session
    await request("/api/workouts/sessions/" + session.id + "/finish", {
      method: "POST",
      body: {},
    });

    // 4. Query stats endpoint
    const stats = await request("/api/workouts/exercises/" + exercise.id + "/stats");
    assert.equal(stats.exercise_id, exercise.id);
    assert.equal(stats.best_1rm, 105); // 90kg x 5 reps
    assert.equal(stats.best_weight, 90); // 120kg warmup is excluded from work metrics
    assert.equal(stats.best_reps, 8); // 8 reps (warmup 12 reps excluded)
    assert.ok(stats.last_performed_at);
    assert.equal(stats.total_work_sets, 2);
    assert.equal(stats.total_sessions, 1);
  });

  test("GET /api/workouts/muscle-map aggregates balance volume across completed sessions", async () => {
    const request = (p, opts) => requestJson(server.base, p, opts);

    // 1. Check empty muscle map
    const emptyMap = await request("/api/workouts/muscle-map?mode=balance&days=14");
    assert.equal(emptyMap.mode, "balance");
    assert.equal(emptyMap.days, 14);
    assert.equal(emptyMap.muscles.length, 18);
    assert.ok(emptyMap.window.from);
    assert.ok(emptyMap.window.to);
    assert.deepEqual(emptyMap.ranked.most, []);
    assert.equal(emptyMap.ranked.least.length, 18);

    // 2. Setup program with Bench Press and Row
    let program = await request("/api/workouts/programs", {
      method: "POST",
      body: { name: "Mapa Test Program" },
    });
    program = await request("/api/workouts/programs/" + program.id + "/days", {
      method: "POST",
      body: { name: "Superior A" },
    });
    const day = program.days[0];

    const bench = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Supino Reto Mapa Test",
        category: "strength",
        body_part: "chest",
        target_muscle: "chest",
        secondary_muscles_json: JSON.stringify(["triceps", "deltoids"]),
      },
    });

    const row = await request("/api/workouts/exercises", {
      method: "POST",
      body: {
        name: "Remada Curvada Mapa Test",
        category: "strength",
        body_part: "back",
        target_muscle: "upper-back",
        secondary_muscles_json: JSON.stringify(["biceps"]),
      },
    });

    await request("/api/workouts/days/" + day.id + "/exercises", {
      method: "POST",
      body: { exercise_id: bench.id, target_sets: 3 },
    });
    await request("/api/workouts/days/" + day.id + "/exercises", {
      method: "POST",
      body: { exercise_id: row.id, target_sets: 2 },
    });

    // 3. Start session and log sets
    let session = await request("/api/workouts/sessions", {
      method: "POST",
      body: { workout_day_id: day.id },
    });

    const benchSessionEx = session.exercises.find((e) => e.exercise_id === bench.id);
    const rowSessionEx = session.exercises.find((e) => e.exercise_id === row.id);

    // Bench: 1 warmup + 2 work sets
    await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: benchSessionEx.id,
        weight_kg: 50,
        reps: 12,
        set_role: "warmup",
      },
    });
    await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: benchSessionEx.id,
        weight_kg: 80,
        reps: 10,
        set_role: "work",
      },
    });
    await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: benchSessionEx.id,
        weight_kg: 85,
        reps: 8,
        set_role: "work",
      },
    });

    // Row: 1 work set
    await request("/api/workouts/sessions/" + session.id + "/sets", {
      method: "POST",
      body: {
        session_exercise_id: rowSessionEx.id,
        weight_kg: 70,
        reps: 10,
        set_role: "work",
      },
    });

    // While session is active (not finished), muscle map should NOT include active session sets
    const activeMap = await request("/api/workouts/muscle-map?mode=balance&days=14");
    const activeChest = activeMap.muscles.find((m) => m.id === "chest");
    assert.equal(activeChest.raw, 0);

    // 4. Finish session
    await request("/api/workouts/sessions/" + session.id + "/finish", {
      method: "POST",
      body: {},
    });

    // 5. Query muscle map after finish
    const finishedMap = await request("/api/workouts/muscle-map?mode=balance&days=14");
    assert.equal(finishedMap.mode, "balance");
    assert.equal(finishedMap.days, 14);

    const chest = finishedMap.muscles.find((m) => m.id === "chest");
    const upperBack = finishedMap.muscles.find((m) => m.id === "upper-back");
    const triceps = finishedMap.muscles.find((m) => m.id === "triceps");
    const deltoids = finishedMap.muscles.find((m) => m.id === "deltoids");
    const biceps = finishedMap.muscles.find((m) => m.id === "biceps");
    const quads = finishedMap.muscles.find((m) => m.id === "quadriceps");

    // Bench: 2 work sets -> chest raw = 2.0
    // Row: 1 work set -> upper-back raw = 1.0
    // Bench secondaries: triceps 2 * 0.4 = 0.8, deltoids 2 * 0.4 = 0.8
    // Row secondary: biceps 1 * 0.4 = 0.4
    // Max raw = 2.0 (chest)
    assert.equal(chest.raw, 2.0);
    assert.equal(chest.score, 1.0);

    assert.equal(upperBack.raw, 1.0);
    assert.equal(upperBack.score, 0.5);

    assert.equal(triceps.raw, 0.8);
    assert.equal(triceps.score, 0.4);

    assert.equal(deltoids.raw, 0.8);
    assert.equal(deltoids.score, 0.4);

    assert.equal(biceps.raw, 0.4);
    assert.equal(biceps.score, 0.2);

    assert.equal(quads.raw, 0.0);
    assert.equal(quads.score, 0.0);

    assert.deepEqual(finishedMap.ranked.most, [
      "chest",
      "upper-back",
      "deltoids",
      "triceps",
      "biceps",
    ]);

    // Test different days window (e.g. 7, 28)
    const map7 = await request("/api/workouts/muscle-map?days=7");
    assert.equal(map7.days, 7);
    assert.equal(map7.muscles.find((m) => m.id === "chest").raw, 2.0);

    // Test mode fatigue / strength preserves mode in response
    const fatigueMap = await request("/api/workouts/muscle-map?mode=fatigue&days=14");
    assert.equal(fatigueMap.mode, "fatigue");
    assert.equal(fatigueMap.muscles.length, 18);
  });

});
