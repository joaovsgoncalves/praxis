// @ts-check
import { test, expect } from '@playwright/test';

/** Sem scroll horizontal no viewport mobile (DESIGN.md). */
async function expectNoHorizontalOverflow(page) {
  const bad = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });
  expect(bad).toBe(false);
}

test('app carrega em 390px sem overflow horizontal', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page
    .getByText(/Entrar|Carregando o Praxis|Agora|Missão do dia|Vitórias do dia|Praxis/i)
    .first()
    .waitFor({ timeout: 60_000 });
  await expectNoHorizontalOverflow(page);
});

test('login visível em 390px (quando auth web ativa)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  const login = page.getByRole('button', { name: /Entrar/i });
  const app = page.getByText(/Agora|Missão do dia|Vitórias/i).first();
  const hasLogin = await login.isVisible().catch(() => false);
  const hasApp = await app.isVisible().catch(() => false);
  expect(hasLogin || hasApp).toBeTruthy();
  await expectNoHorizontalOverflow(page);
});

const AUTH_ROUTES = [
  { path: '/', name: 'Hoje' },
  { path: '/compras', name: 'Compras' },
  { path: '/habitos-tarefas', name: 'Tarefas' },
  { path: '/metas', name: 'Metas' },
  { path: '/rituais', name: 'Rituais' },
  { path: '/historico', name: 'Histórico' },
  { path: '/capturas', name: 'Capturas' },
  { path: '/conquistas', name: 'Conquistas' },
  { path: '/revisao-semanal', name: 'Revisão' },
];

test.describe('rotas autenticadas @390px', () => {
  test.beforeEach(async ({ page }) => {
    const pass =
      process.env.PRAXIS_E2E_PASSWORD ||
      process.env.PRAXIS_APP_PASSWORD ||
      process.env.FORJA_APP_PASSWORD;
    test.skip(!pass, 'Defina PRAXIS_E2E_PASSWORD para testes logados');

    await page.goto('/');
    await page.getByLabel('Senha').waitFor({ timeout: 30_000 });
    await page.getByLabel('Senha').fill(pass);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await page
      .getByText(/Agora|Missão do dia|Vitórias/i)
      .first()
      .waitFor({ timeout: 45_000 });
  });

  for (const route of AUTH_ROUTES) {
    test(`${route.name} (${route.path}) sem overflow`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      await expectNoHorizontalOverflow(page);
    });
  }
});

test('404 ou login em rota inexistente', async ({ page }) => {
  await page.goto('/rota-inexistente-praxis-e2e');
  await page.waitForLoadState('domcontentloaded');
  const notFound = page.getByText(/Página não encontrada/i);
  const login = page.getByRole('button', { name: /Entrar/i });
  await notFound.or(login).first().waitFor({ timeout: 45_000 });
  await expectNoHorizontalOverflow(page);
});