// @ts-check
import { test, expect } from '@playwright/test';

/** @param {import('@playwright/test').Route} route */
/** @param {unknown} body */
function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test('Jota Fit: Biblioteca, Progresso e Corpo aparecem no mobile 390', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (!path.startsWith('/api/')) return route.continue();

    if (path === '/api/auth/config') {
      return json(route, { webAuthEnabled: false, loginAvailable: true });
    }
    if (path === '/api/auth/me' || path === '/api/auth/session') {
      return json(route, { authenticated: true, username: 'jota' });
    }
    if (path === '/api/workouts/summary' && method === 'GET') {
      return json(route, {
        active_program: null,
        today: null,
        active_session: null,
        streak_days: 0,
      });
    }
    if (path === '/api/workouts/sessions/active') {
      return json(route, null);
    }
    if (path === '/api/workouts/exercises') {
      return json(route, {
        total: 1324,
        items: [
          {
            id: 'ex-bench',
            name: 'Barbell Bench Press',
            body_part: 'chest',
            equipment: 'barbell',
            source: 'catalog',
            gif_url: 'https://example.test/bench.gif',
            thumb_url: 'https://example.test/bench.png',
          },
        ],
      });
    }
    if (path === '/api/workouts/muscle-map') {
      return json(route, {
        mode: url.searchParams.get('mode') || 'balance',
        days: 14,
        muscles: [{ id: 'chest', label: 'Peito', score: 0.8, raw: 8, unit: 'sets' }],
        window: { from: '2026-08-01', to: '2026-08-22' },
        ranked: { most: ['chest'], least: [] },
      });
    }
    if (path === '/api/workouts/heatmap') {
      return json(route, { year: 2026, days: [{ date: '2026-08-22', sessions: 1, sets: 12, work_sets: 10 }] });
    }
    if (path === '/api/workouts/sessions' && method === 'GET') {
      return json(route, []);
    }
    if (path === '/api/workouts/programs') {
      return json(route, []);
    }
    return json(route, {});
  });

  await page.goto('/jota-fit');
  await expect(page.getByRole('heading', { name: 'JOTA FIT' })).toBeVisible();
  await expect(page).toHaveTitle('Jota Fit');
  const jotaNav = page.getByRole('navigation', { name: 'Seções do Jota Fit' });
  await expect(jotaNav.getByRole('link', { name: 'Hoje' })).toBeVisible();
  await expect(jotaNav.getByRole('link', { name: 'Programa' })).toBeVisible();
  await expect(jotaNav.getByRole('link', { name: 'Biblioteca' })).toBeVisible();
  await expect(jotaNav.getByRole('link', { name: 'Progresso' })).toBeVisible();
  await expect(jotaNav.getByRole('link', { name: 'Corpo' })).toBeVisible();
  await expect(jotaNav.getByRole('link', { name: 'Mapa' })).toHaveCount(0);
  await expect(jotaNav.getByRole('link', { name: 'Histórico' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0);

  await jotaNav.getByRole('link', { name: 'Biblioteca' }).click();
  await expect(page.getByText(/Barbell Bench Press|Biblioteca/i).first()).toBeVisible();

  await jotaNav.getByRole('link', { name: 'Progresso' }).click();
  await expect(page.getByText(/Nenhum treino concluído/i).first()).toBeVisible();

  await jotaNav.getByRole('link', { name: 'Corpo' }).click();
  await expect(page.getByText(/Peito|Balanço|Balance|Fadiga/i).first()).toBeVisible();
});
