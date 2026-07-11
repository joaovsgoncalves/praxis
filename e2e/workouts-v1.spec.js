// @ts-check
import { test, expect } from '@playwright/test';

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function buildProgram() {
  const pull = {
    id: 'day-pull',
    program_id: 'program-ppl',
    name: 'Pull 2',
    day_type: 'training',
    position: 0,
    estimated_duration_minutes: 45,
    notes: '',
    exercise_count: 1,
    exercises: [
      {
        id: 'day-ex-1',
        workout_day_id: 'day-pull',
        exercise_id: 'exercise-pullup',
        position: 0,
        target_sets: 2,
        rep_min: 8,
        rep_max: 10,
        target_duration_seconds: null,
        rest_seconds: 2,
        notes: '',
        exercise_name: 'Barra fixa pronada',
        exercise_category: 'calisthenics',
        tracking_type: 'reps',
      },
    ],
  };
  const rest = {
    id: 'day-rest',
    program_id: 'program-ppl',
    name: 'Descanso',
    day_type: 'rest',
    position: 1,
    estimated_duration_minutes: null,
    notes: '',
    exercise_count: 0,
    exercises: [],
  };
  return {
    id: 'program-ppl',
    name: 'Push Pull Legs',
    description: '',
    is_active: 1,
    current_day_id: pull.id,
    days: [pull, rest],
  };
}

async function mockPraxisApi(page) {
  const state = {
    program: buildProgram(),
    session: null,
    totalCompleted: 0,
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (!path.startsWith('/api/')) return route.continue();

    if (path === '/api/auth/config') {
      return json(route, { webAuthEnabled: false, loginAvailable: true });
    }

    if (path === '/api/goals' || path === '/api/rituals') return json(route, []);
    if (path === '/api/gamification') {
      return json(route, {
        level: 1,
        level_name: 'Iniciante',
        xp_total: 0,
        next_level_xp: 100,
        progress_pct: 0,
        achievements: [],
      });
    }
    if (path === '/api/captures/pending-count') return json(route, { count: 0 });

    if (path === '/api/workouts/summary') {
      return json(route, {
        active_program: state.program,
        current_day: state.program.days.find((day) => day.id === state.program.current_day_id),
        active_session: state.session?.status === 'active' ? state.session : null,
        total_completed: state.totalCompleted,
      });
    }

    if (path === '/api/workouts/programs' && method === 'GET') {
      return json(route, [{
        id: state.program.id,
        name: state.program.name,
        is_active: 1,
        day_count: state.program.days.length,
        completed_sessions: state.totalCompleted,
      }]);
    }

    if (path === '/api/workouts/sessions' && method === 'POST') {
      state.session = {
        id: 'session-1',
        workout_program_id: state.program.id,
        workout_day_id: 'day-pull',
        program_name_snapshot: state.program.name,
        workout_day_name_snapshot: 'Pull 2',
        status: 'active',
        started_at: new Date().toISOString(),
        completed_at: null,
        duration_seconds: null,
        exercise_count: 1,
        completed_sets: 0,
        exercises: [
          {
            id: 'session-ex-1',
            session_id: 'session-1',
            exercise_id: 'exercise-pullup',
            exercise_name_snapshot: 'Barra fixa pronada',
            tracking_type: 'reps',
            position: 0,
            target_sets: 2,
            rep_min: 8,
            rep_max: 10,
            target_duration_seconds: null,
            rest_seconds: 2,
            notes: '',
            sets: [],
            previous_sets: [{ id: 'old-set-1', set_number: 1, reps: 9 }],
          },
        ],
      };
      return json(route, state.session, 201);
    }

    if (path === '/api/workouts/sessions/active' && method === 'GET') {
      return json(route, state.session?.status === 'active' ? state.session : null);
    }

    if (path === '/api/workouts/sessions/session-1' && method === 'GET') {
      return json(route, state.session);
    }

    if (path === '/api/workouts/sessions/session-1/sets' && method === 'POST') {
      const payload = request.postDataJSON();
      const exercise = state.session.exercises[0];
      exercise.sets.push({
        id: `set-${exercise.sets.length + 1}`,
        session_id: state.session.id,
        session_exercise_id: exercise.id,
        set_number: exercise.sets.length + 1,
        weight_kg: payload.weight_kg,
        reps: payload.reps,
        duration_seconds: payload.duration_seconds,
        distance_m: payload.distance_m,
        completed_at: new Date().toISOString(),
      });
      state.session.completed_sets = exercise.sets.length;
      return json(route, state.session, 201);
    }

    if (path === '/api/workouts/sessions/session-1/finish' && method === 'POST') {
      state.session.status = 'completed';
      state.session.completed_at = new Date().toISOString();
      state.session.duration_seconds = 120;
      state.totalCompleted += 1;
      state.program.current_day_id = 'day-rest';
      return json(route, state.session);
    }

    if (path === '/api/workouts/sessions' && method === 'GET') {
      return json(route, state.session?.status === 'completed' ? [state.session] : []);
    }

    if (path.startsWith('/api/workouts/')) {
      return json(route, {});
    }

    return json(route, {});
  });

  return state;
}

test('treinos v1: abre, inicia, registra série e finaliza em 390px', async ({ page }) => {
  await mockPraxisApi(page);
  await page.goto('/treinos');

  await expect(page.getByRole('main').getByRole('heading', { name: 'Treinos' })).toBeVisible();
  await expect(page.getByText('Pull 2', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Começar treino/i })).toBeVisible();

  const overflowBefore = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflowBefore).toBe(false);

  await page.getByRole('button', { name: /Começar treino/i }).click();
  await expect(page.getByText('Barra fixa pronada', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Último treino/i)).toBeVisible();

  await page.getByLabel('Repetições').fill('10');
  await page.getByRole('button', { name: /Registrar série 1/i }).click();
  await expect(page.getByText('10 reps', { exact: true })).toBeVisible();

  await page.getByLabel('Repetições').fill('9');
  await page.getByRole('button', { name: /Registrar série 2/i }).click();
  await expect(page.getByText('9 reps', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Finalizar treino/i }).click();
  await expect(page.getByText('Descanso', { exact: true }).first()).toBeVisible();

  const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflowAfter).toBe(false);
});
