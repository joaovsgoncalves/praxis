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

/**
 * Stateful mock for goals + global endpoints the shell consults.
 * Auth web desativada; goals partem vazios.
 */
async function mockGoalsApi(page) {
  const state = {
    goals: /** @type {Array<Record<string, unknown>>} */ ([]),
    seq: 0,
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
    if (path === '/api/rituals') return json(route, []);
    if (path === '/api/tasks' || path.startsWith('/api/tasks?')) return json(route, []);
    if (path === '/api/habits' || path.startsWith('/api/habits?')) return json(route, []);
    if (path === '/api/habit-logs' || path.startsWith('/api/habit-logs?')) return json(route, []);
    if (path === '/api/user/settings') {
      return json(route, {
        id: 'default',
        full_name: 'João',
        list_density: 'comfortable',
      });
    }

    if (path === '/api/goals' && method === 'GET') {
      return json(route, state.goals);
    }

    if (path === '/api/goals' && method === 'POST') {
      const body = request.postDataJSON() || {};
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return json(route, { error: 'Title is required' }, 400);
      }
      state.seq += 1;
      const goal = {
        id: `goal-${state.seq}`,
        title,
        description: body.description || '',
        deadline: body.deadline || null,
        timeframe: body.timeframe || 'short',
        category: body.category || 'personal',
        status: 'active',
        manual_progress: 0,
        created_date: new Date().toISOString(),
      };
      state.goals.unshift(goal);
      return json(route, { goal, linked: null }, 201);
    }

    const putMatch = path.match(/^\/api\/goals\/([^/]+)$/);
    if (putMatch && method === 'PUT') {
      const id = putMatch[1];
      const idx = state.goals.findIndex((g) => g.id === id);
      if (idx < 0) return json(route, { error: 'Goal not found' }, 404);
      const body = request.postDataJSON() || {};
      const current = state.goals[idx];
      let title = current.title;
      if (Object.prototype.hasOwnProperty.call(body, 'title')) {
        title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) return json(route, { error: 'Title is required' }, 400);
      }
      const deadline = Object.prototype.hasOwnProperty.call(body, 'deadline')
        ? (body.deadline || null)
        : current.deadline;
      const updated = {
        ...current,
        title,
        description: body.description !== undefined ? body.description : current.description,
        timeframe: body.timeframe !== undefined ? body.timeframe : current.timeframe,
        deadline,
        category: body.category !== undefined ? body.category : current.category,
        status: body.status !== undefined ? body.status : current.status,
        manual_progress:
          body.manual_progress !== undefined ? body.manual_progress : current.manual_progress,
      };
      state.goals[idx] = updated;
      return json(route, updated);
    }

    if (putMatch && method === 'DELETE') {
      const id = putMatch[1];
      state.goals = state.goals.filter((g) => g.id !== id);
      return json(route, { success: true });
    }

    // Endpoints globais mínimos — evita 404 ruidoso no shell
    return json(route, {});
  });

  return state;
}

test('metas simples: escrever, filtrar e editar em 390px com API mockada', async ({ page }) => {
  await mockGoalsApi(page);
  await page.goto('/metas');

  await expect(page.getByRole('heading', { name: 'Metas pessoais' })).toBeVisible();

  // Metas permanece encontrável no menu mesmo com zero metas ativas.
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await expect(page.getByRole('link', { name: 'Metas' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar menu' }).click();

  await expect(page.getByRole('button', { name: /Escrever meta/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Criar meta guiada/i }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Cadastro rápido sem prazo/vínculo — horizonte médio
  await page.getByRole('button', { name: /Escrever meta/i }).first().click();
  const createDialog = page.getByRole('dialog');
  await expect(createDialog.getByRole('heading', { name: 'Escrever meta' })).toBeVisible();

  await createDialog.getByLabel(/O que você quer alcançar/i).fill('Ler mais');
  await createDialog.getByLabel('Horizonte da meta').click();
  await page.getByRole('option', { name: 'Médio prazo' }).click();
  await createDialog.getByRole('button', { name: /Salvar meta/i }).click();

  await expect(page.getByText('Ler mais').first()).toBeVisible();
  await expect(page.getByText('Médio prazo').first()).toBeVisible();

  // Filtro correto
  await page.getByRole('button', { name: 'Médio prazo', exact: true }).click();
  await expect(page.getByText('Ler mais').first()).toBeVisible();
  await page.getByRole('button', { name: 'Curto prazo', exact: true }).click();
  await expect(page.getByText('Ler mais')).toHaveCount(0);
  await page.getByRole('button', { name: 'Todas', exact: true }).click();
  await expect(page.getByText('Ler mais').first()).toBeVisible();

  // Editar título, descrição, horizonte e prazo
  await page.getByRole('button', { name: 'Editar meta' }).click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog.getByRole('heading', { name: 'Editar meta' })).toBeVisible();

  await editDialog.getByLabel(/O que você quer alcançar/i).fill('Ler 12 livros');
  await editDialog.getByLabel(/Descrição/i).fill('Um por mês');
  await editDialog.getByLabel('Horizonte da meta').click();
  await page.getByRole('option', { name: 'Longo prazo' }).click();
  await editDialog.locator('#goal-quick-deadline').fill('2026-12-31');
  await editDialog.getByRole('button', { name: /Salvar alterações/i }).click();

  await expect(page.getByText('Ler 12 livros').first()).toBeVisible();
  await expect(page.getByText('Um por mês').first()).toBeVisible();
  await expect(page.getByText('Longo prazo').first()).toBeVisible();
  await expect(page.getByText(/Prazo:\s*31\/12\/2026/i).first()).toBeVisible();

  await expectNoHorizontalOverflow(page);
});
