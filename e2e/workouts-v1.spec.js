// @ts-check
import { test, expect } from '@playwright/test';

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Sem scroll horizontal no viewport mobile (DESIGN.md). */
async function expectNoHorizontalOverflow(page) {
  const bad = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
  expect(bad).toBe(false);
}

function buildProgram() {
  const push = {
    id: 'day-push',
    program_id: 'program-forca',
    name: 'Push Força',
    day_type: 'training',
    position: 0,
    estimated_duration_minutes: 45,
    notes: '',
    exercise_count: 2,
    exercises: [
      {
        id: 'day-ex-1',
        workout_day_id: 'day-push',
        exercise_id: 'exercise-bench',
        position: 0,
        target_sets: 2,
        rep_min: 5,
        rep_max: 8,
        target_duration_seconds: null,
        rest_seconds: 90,
        purpose: 'strength',
        target_rir_min: 1,
        target_rir_max: 2,
        notes: '',
        exercise_name: 'Supino reto',
        exercise_category: 'strength',
        tracking_type: 'weight_reps',
      },
      {
        id: 'day-ex-2',
        workout_day_id: 'day-push',
        exercise_id: 'exercise-pull-up',
        position: 1,
        target_sets: 1,
        rep_min: 5,
        rep_max: 8,
        target_duration_seconds: null,
        rest_seconds: 90,
        purpose: 'strength',
        target_rir_min: null,
        target_rir_max: null,
        notes: '',
        exercise_name: 'Barra fixa',
        exercise_category: 'calisthenics',
        tracking_type: 'reps',
      },
    ],
  };
  const rest = {
    id: 'day-rest',
    program_id: 'program-forca',
    name: 'Descanso',
    day_type: 'rest',
    position: 1,
    estimated_duration_minutes: null,
    notes: '',
    exercise_count: 0,
    exercises: [],
  };
  return {
    id: 'program-forca',
    name: 'Força',
    description: '',
    is_active: 1,
    current_day_id: push.id,
    days: [push, rest],
  };
}

async function mockPraxisApi(page) {
  const state = {
    program: buildProgram(),
    session: null,
    completed: [],
    sessionSeq: 0,
  };

  const isWarmup = (set) => set.set_role === 'warmup';

  /** Totais só-trabalho vs. aquecimento — o backend real expõe os dois separadamente. */
  const withCounts = (session) => {
    if (!session) return null;
    const all = session.exercises.flatMap((exercise) => exercise.sets);
    return {
      ...session,
      completed_sets: all.length,
      completed_work_sets: all.filter((set) => !isWarmup(set)).length,
      completed_warmup_sets: all.filter((set) => isWarmup(set)).length,
    };
  };

  /** Prefill = só as séries de trabalho da última sessão concluída (aquecimentos ficam de fora). */
  const previousWorkSets = (exerciseId) => {
    for (const done of state.completed) {
      const exercise = done.exercises.find((item) => item.exercise_id === exerciseId);
      if (exercise) {
        return exercise.sets
          .filter((set) => !isWarmup(set))
          .map((set, index) => ({
            id: `prev-${done.id}-${index}`,
            set_number: index + 1,
            weight_kg: set.weight_kg,
            reps: set.reps,
            band_level: set.band_level,
            set_role: 'work',
          }));
      }
    }
    return [];
  };

  const currentDay = () => state.program.days.find((day) => day.id === state.program.current_day_id);

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
        current_day: currentDay(),
        active_session: state.session?.status === 'active' ? withCounts(state.session) : null,
        total_completed: state.completed.length,
      });
    }

    if (path === '/api/workouts/programs' && method === 'GET') {
      return json(route, [{
        id: state.program.id,
        name: state.program.name,
        is_active: 1,
        day_count: state.program.days.length,
        completed_sessions: state.completed.length,
      }]);
    }

    const advanceMatch = path.match(/^\/api\/workouts\/programs\/[^/]+\/advance$/);
    if (advanceMatch && method === 'POST') {
      const days = state.program.days;
      const index = days.findIndex((day) => day.id === state.program.current_day_id);
      state.program.current_day_id = days[(index + 1) % days.length].id;
      return json(route, { ...state.program });
    }

    if (path === '/api/workouts/sessions' && method === 'POST') {
      const payload = request.postDataJSON() || {};
      const requestedDayId = payload.workout_day_id || 'day-push';
      const day = state.program.days.find((d) => d.id === requestedDayId) || state.program.days[0];
      state.sessionSeq += 1;
      const id = `session-${state.sessionSeq}`;
      state.session = {
        id,
        workout_program_id: state.program.id,
        workout_day_id: day.id,
        program_name_snapshot: state.program.name,
        workout_day_name_snapshot: day.name,
        status: 'active',
        started_at: new Date().toISOString(),
        completed_at: null,
        duration_seconds: null,
        exercise_count: day.exercises?.length || 0,
        exercises: (day.exercises || []).map((ex, index) => ({
          id: `session-ex-${index}-${state.sessionSeq}`,
          session_id: id,
          exercise_id: ex.exercise_id,
          exercise_name_snapshot: ex.exercise_name,
          tracking_type: ex.tracking_type,
          position: ex.position,
          target_sets: ex.target_sets,
          rep_min: ex.rep_min,
          rep_max: ex.rep_max,
          target_duration_seconds: ex.target_duration_seconds,
          rest_seconds: ex.rest_seconds,
          purpose: ex.purpose,
          target_rir_min: ex.target_rir_min,
          target_rir_max: ex.target_rir_max,
          notes: ex.notes,
          sets: [],
          previous_sets: previousWorkSets(ex.exercise_id),
        })),
      };
      return json(route, withCounts(state.session), 201);
    }

    if (path === '/api/workouts/sessions' && method === 'GET') {
      return json(route, state.completed);
    }

    if (path === '/api/workouts/sessions/active' && method === 'GET') {
      return json(route, state.session?.status === 'active' ? withCounts(state.session) : null);
    }

    const setsMatch = path.match(/^\/api\/workouts\/sessions\/[^/]+\/sets$/);
    if (setsMatch && method === 'POST') {
      const payload = request.postDataJSON();
      const exercise = state.session.exercises.find((item) => item.id === payload.session_exercise_id);
      exercise.sets.push({
        id: `set-${exercise.sets.length + 1}`,
        session_id: state.session.id,
        session_exercise_id: exercise.id,
        set_number: exercise.sets.length + 1,
        weight_kg: payload.weight_kg ?? null,
        reps: payload.reps ?? null,
        duration_seconds: payload.duration_seconds ?? null,
        distance_m: payload.distance_m ?? null,
        band_level: payload.band_level ?? null,
        set_role: payload.set_role === 'warmup' ? 'warmup' : 'work',
        rir: payload.rir ?? null,
        technical_quality: payload.technical_quality ?? null,
        notes: payload.notes ?? '',
        completed_at: new Date().toISOString(),
      });
      return json(route, withCounts(state.session), 201);
    }

    const finishMatch = path.match(/^\/api\/workouts\/sessions\/[^/]+\/finish$/);
    if (finishMatch && method === 'POST') {
      const workSets = state.session.exercises.flatMap((exercise) => exercise.sets).filter((set) => !isWarmup(set));
      if (!workSets.length) {
        return json(route, { error: 'Registre pelo menos uma série de trabalho antes de finalizar.' }, 400);
      }
      state.session.status = 'completed';
      state.session.completed_at = new Date().toISOString();
      state.session.duration_seconds = 1500;
      const finished = withCounts(state.session);
      state.completed.unshift(finished);
      // Finalizar avança o ciclo: o dia atual passa a ser o descanso.
      state.program.current_day_id = 'day-rest';
      state.session = null;
      return json(route, finished);
    }

    const abandonMatch = path.match(/^\/api\/workouts\/sessions\/[^/]+\/abandon$/);
    if (abandonMatch && method === 'POST') {
      const abandoned = withCounts({ ...state.session, status: 'abandoned' });
      state.session = null;
      return json(route, abandoned);
    }

    const detailMatch = path.match(/^\/api\/workouts\/sessions\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      const id = detailMatch[1];
      if (state.session?.id === id) return json(route, withCounts(state.session));
      const done = state.completed.find((session) => session.id === id);
      return json(route, done || {});
    }

    if (path.startsWith('/api/workouts/')) {
      return json(route, {});
    }

    return json(route, {});
  });

  return state;
}

test('treinos v3: aquecimento, carga, elástico, descanso, prefill e histórico em 390px', async ({ page }) => {
  await mockPraxisApi(page);
  await page.goto('/jota-fit');

  await expect(page.getByRole('main').getByRole('heading', { name: 'JOTA FIT' })).toBeVisible();
  await expect(page).toHaveTitle('Jota Fit');
  const jotaNav = page.getByRole('navigation', { name: 'Seções do Jota Fit' });
  await expect(jotaNav.getByRole('link', { name: 'Hoje' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0);
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.locator('canvas[data-praxis-particles]')).toHaveCount(0);
  await expect(page.getByText('Push Força', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Começar treino/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: /Começar treino/i }).click();
  await expect(page.getByRole('heading', { name: 'Supino reto' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0);
  await expect(jotaNav).toHaveCount(0);
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.locator('canvas[data-praxis-particles]')).toHaveCount(0);

  // 1 aquecimento — não conta como série de trabalho e não dispara descanso.
  await page.getByRole('button', { name: 'Mais', exact: true }).click();
  await page.getByRole('button', { name: 'Aquecimento', exact: true }).click();
  await page.getByRole('button', { name: 'Aumentar repetições', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Repetições', exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Aumentar carga (kg)', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Carga (kg)', exact: true })).toHaveValue('2.5');
  await page.getByRole('spinbutton', { name: 'Repetições', exact: true }).fill('5');
  await page.getByRole('spinbutton', { name: 'Carga (kg)', exact: true }).fill('40');
  await page.getByRole('button', { name: /Registrar aquecimento A1/i }).click();
  await expect(page.getByText('40 kg', { exact: true })).toBeVisible();

  // Série de trabalho 1 — com RIR e qualidade técnica.
  await page.getByRole('spinbutton', { name: 'Repetições', exact: true }).fill('6');
  await page.getByRole('spinbutton', { name: 'Carga (kg)', exact: true }).fill('60');
  await page.getByRole('button', { name: 'Mais', exact: true }).click();
  await page.getByRole('group', { name: 'RIR da série' }).getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('group', { name: 'Qualidade técnica' }).getByRole('button', { name: 'Limpa', exact: true }).click();
  await page.getByRole('button', { name: /Registrar série 1/i }).click();
  await expect(page.getByText('RIR 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Limpa', { exact: true })).toBeVisible();
  await expect(page.getByText('Descanso', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '−15s', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+15s', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pular', exact: true })).toBeVisible();

  // Série de trabalho 2.
  await page.getByRole('spinbutton', { name: 'Repetições', exact: true }).fill('5');
  await page.getByRole('spinbutton', { name: 'Carga (kg)', exact: true }).fill('60');
  await page.getByRole('button', { name: /Registrar série 2/i }).click();

  // Reps + elástico: fica em Mais no primeiro uso e reaparece sozinho depois de registrado.
  await page.getByRole('button', { name: /Próximo/i }).click();
  await expect(page.getByRole('heading', { name: 'Barra fixa' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Elástico da série' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mais', exact: true }).click();
  await page.getByRole('group', { name: 'Elástico da série' }).getByRole('button', { name: 'Médio', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Repetições', exact: true }).fill('6');
  await page.getByRole('button', { name: /Registrar série 1/i }).click();
  await expect(page.getByRole('group', { name: 'Elástico da série' })).toBeVisible();

  // Progresso é só-trabalho: 3/3 planejadas = 100%, com o aquecimento contado à parte.
  await expect(page.getByText('100% do planejado')).toBeVisible();
  await expect(page.getByText(/1 aquec\./)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Finalizar avança o ciclo para o descanso.
  await page.getByRole('button', { name: /Finalizar treino/i }).click();
  await expect(page.getByText('Descanso', { exact: true }).first()).toBeVisible();

  // Progresso: a sessão aparece com séries de trabalho + aquecimento e detalhes de RIR/qualidade.
  await page.getByRole('navigation', { name: 'Seções do Jota Fit' }).getByRole('link', { name: 'Progresso' }).click();
  await page.getByRole('button', { name: /Push Força/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('RIR 2', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('Limpa', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/aquec\./).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Prefill: conclui o descanso, reinicia o treino e a "Última" traz só as séries de trabalho.
  await page.getByRole('navigation', { name: 'Seções do Jota Fit' }).getByRole('link', { name: 'Hoje' }).click();
  await page.getByRole('button', { name: /Concluir descanso/i }).click();
  await page.getByRole('button', { name: /Começar treino/i }).click();
  await expect(page.getByText('60 kg · 6 reps · 60 kg · 5 reps')).toBeVisible();
  await page.getByRole('button', { name: /Próximo/i }).click();
  await expect(page.getByRole('group', { name: 'Elástico da série' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Elástico da série' }).getByRole('button', { name: 'Médio', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalOverflow(page);
});
