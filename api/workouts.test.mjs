import { formatRestDuration, formatSessionElapsed } from "../src/lib/workouts.js";
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import { registerWorkoutRoutes } from './workouts.js';
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
