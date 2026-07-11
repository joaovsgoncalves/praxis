import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import express from 'express';
import { initWorkoutSchema, registerWorkoutRoutes } from './workouts.js';

const db = new Database(':memory:');
initWorkoutSchema(db);

const app = express();
app.use(express.json());
registerWorkoutRoutes(app, db);

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

try {
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
    },
  });
  assert.equal(session.exercises[0].sets.length, 1);
  assert.equal(session.exercises[0].sets[0].reps, 10);

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

  console.log('✓ workout API smoke test passed');
} finally {
  await new Promise((resolve) => server.close(resolve));
  db.close();
}
