import { test, expect } from '@playwright/test';

const FOOD = { id: 'food-test', name: 'Arroz de teste', serving_label: '100 g', serving_grams: 100, kcal: 130, protein_g: 2.5, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4 };
const PROFILE = { onboarding_done: 1, goal: 'maintain', target_kcal: 2200, target_protein_g: 1, target_carbs_g: 250, target_fat_g: 70 };
const SLOT_IDS = ['breakfast', 'snack_morning', 'lunch', 'snack_afternoon', 'dinner'];

function makeLog(body, id = 'log-test') {
  const grams = body.grams ?? body.servings * FOOD.serving_grams;
  const servings = grams / FOOD.serving_grams;
  return { id, food_item_id: FOOD.id, name_snapshot: FOOD.name, date: body.date || '2026-09-14', meal_slot: body.meal_slot || 'lunch', grams, servings,
    kcal: Math.round(FOOD.kcal * servings), protein_g: FOOD.protein_g * servings, carbs_g: FOOD.carbs_g * servings, fat_g: FOOD.fat_g * servings,
    quantity_basis_json: JSON.stringify({ ...FOOD, servings: 1, grams: 100 }),
  };
}

async function setup(page, { populated = false, recentDelayMs = 0, failRecent = false } = {}) {
  page.on('pageerror', (error) => console.error(`[browser pageerror] ${error.stack || error.message}`));
  // Browser day is already Sept 15 in UTC, but it is still Sept 14 in Fortaleza.
  await page.clock.install({ time: new Date('2026-09-15T01:30:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('water_ml_2026-09-14', '250');
    localStorage.setItem('water_ml_2026-09-13', '1000');
  });
  const state = { logs: populated ? [makeLog({ grams: 100 })] : [], writes: [], dayDates: [], regimenDates: [] };
  // No real API, remote images or telemetry may leave this browser test.
  await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:18736/') ? route.continue() : route.abort());
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/config') return reply({ webAuthEnabled: false, loginAvailable: true });
    if (path === '/api/auth/me') return reply({ authenticated: true });
    if (path === '/api/nutrition/profile') return reply(PROFILE);
    if (path === '/api/nutrition/day') {
      const date = url.searchParams.get('date');
      state.dayDates.push(date);
      const logs = state.logs.filter((log) => log.date === date);
      const totals = logs.reduce((sum, log) => {
        for (const key of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) sum[key] += log[key];
        return sum;
      }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      return reply({ date, logs, totals, targets: { kcal: 2200, protein_g: 1, carbs_g: 250, fat_g: 70 }, by_slot: Object.fromEntries(SLOT_IDS.map((slot) => [slot, logs.filter((log) => log.meal_slot === slot)])) });
    }
    if (path === '/api/nutrition/regimen') {
      state.regimenDates.push(url.searchParams.get('date'));
      return reply({ items: [], due_count: 0, taken_count: 0 });
    }
    if (path === '/api/nutrition/foods/recent') {
      if (recentDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, recentDelayMs));
      if (failRecent) return reply({ error: 'test_failure' }, 503);
      return reply([FOOD]);
    }
    if (path === '/api/nutrition/foods') {
      return reply(url.searchParams.get('favorites') === '1' ? [] : [FOOD]);
    }
    if (path === '/api/nutrition/meals') return reply([]);
    if (path.startsWith('/api/nutrition/barcode/')) return reply({ source: 'cache', food: FOOD, barcode: '7891000100103' });
    if (path === '/api/nutrition/logs' && method === 'POST') {
      const body = request.postDataJSON();
      state.writes.push({ method, body });
      const log = makeLog(body, `log-${state.logs.length + 1}`);
      state.logs.push(log);
      return reply(log, 201);
    }
    if (path.startsWith('/api/nutrition/logs/') && method === 'PATCH') {
      const body = request.postDataJSON();
      state.writes.push({ method, body });
      const id = path.split('/').at(-1);
      const previous = state.logs.find((log) => log.id === id);
      const log = makeLog({ date: previous.date, meal_slot: previous.meal_slot, ...body }, id);
      state.logs = state.logs.map((item) => item.id === id ? log : item);
      return reply(log);
    }
    if (path === '/api/user/settings') return reply({ id: 'default' });
    if (path === '/api/gamification') return reply({ level: 1, level_name: 'Teste', xp_total: 0, next_level_xp: 100, progress_pct: 0, achievements: [] });
    if (path === '/api/captures/pending-count') return reply({ count: 0 });
    return reply([]);
  });
  await page.goto('/jota-fit/nutricao');
  await expect(page.getByText('Total do dia', { exact: true })).toBeVisible();
  return state;
}

async function openMeal(page, label) {
  await page.getByRole('heading', { name: label, exact: true }).locator('..').getByRole('button', { name: 'Adicionar', exact: true }).click();
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);
}

test('adicionar 137 g e editar porções preserva a quantidade escolhida', async ({ page }) => {
  const state = await setup(page);
  await openMeal(page, 'Almoço');
  await page.getByRole('dialog').getByRole('button', { name: /Arroz de teste/ }).click();
  const add = page.getByRole('dialog');
  await add.getByLabel('Quantidade', { exact: true }).fill('137');
  await expect(add.getByLabel('Unidade da quantidade')).toHaveValue('grams');
  await add.getByRole('button', { name: 'Salvar no diário' }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toMatchObject({ grams: 137, meal_slot: 'lunch', date: '2026-09-14' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Arroz de teste/ }).click();
  const edit = page.getByRole('dialog');
  await expect(edit.getByLabel('Quantidade', { exact: true })).toHaveValue('137');
  await edit.getByLabel('Unidade da quantidade').selectOption('servings');
  await expect(edit.getByLabel('Quantidade', { exact: true })).toHaveValue('1.37');
  await edit.getByLabel('Quantidade', { exact: true }).fill('2');
  await edit.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1].body).toEqual({ servings: 2 });
  await expect(page.getByRole('button', { name: /Arroz de teste/ })).toContainText('200 g');
  await noOverflow(page);
});

test('entrada inválida não se transforma silenciosamente em uma porção', async ({ page }) => {
  const state = await setup(page);
  await openMeal(page, 'Almoço');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Arroz de teste/ }).click();
  for (const value of ['', '0', '-1', 'abc']) {
    await dialog.getByLabel('Quantidade', { exact: true }).fill(value);
    await expect(dialog.getByRole('button', { name: 'Salvar no diário' })).toBeDisabled();
  }
  expect(state.writes).toEqual([]);
  await noOverflow(page);
});

test('texto e código herdam a refeição em cada abertura', async ({ page }) => {
  await setup(page);
  for (const label of ['Almoço', 'Jantar']) {
    await openMeal(page, label);
    await page.getByRole('dialog').getByRole('button', { name: 'Texto', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('combobox')).toContainText(label);
    await page.keyboard.press('Escape');
    await openMeal(page, label);
    await page.getByRole('dialog').getByRole('button', { name: 'Código', exact: true }).click();
    await page.getByLabel('Código', { exact: true }).fill('7891000100103');
    await page.getByRole('button', { name: 'Buscar produto', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('combobox')).toContainText(label);
    await page.keyboard.press('Escape');
  }
});

test('água e suplementos seguem a data visível e preservam o valor de hoje', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Dia anterior', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Progresso de água no dia' })).toHaveAttribute('aria-valuenow', '1000');
  await page.getByRole('button', { name: 'Mais um gole (250 ml)', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('water_ml_2026-09-13'))).toBe('1250');
  expect(await page.evaluate(() => localStorage.getItem('water_ml_2026-09-14'))).toBe('250');
  await page.getByRole('button', { name: 'Próximo dia', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Progresso de água no dia' })).toHaveAttribute('aria-valuenow', '250');
  expect(state.dayDates).toContain('2026-09-13');
  expect(state.regimenDates).toContain('2026-09-13');
});

test('saldo de proteína não esconde calorias restantes e diário vem primeiro', async ({ page }, testInfo) => {
  await setup(page, { populated: true });
  await expect(page.getByText('Proteína: meta atingida', { exact: true })).toBeVisible();
  await expect(page.getByText(/Restam .*kcal/)).toBeVisible();
  await expect(page.getByText(/Passou 0/)).toHaveCount(0);
  const diary = await page.getByText('Total do dia', { exact: true }).boundingBox();
  const water = await page.getByRole('progressbar', { name: 'Progresso de água no dia' }).boundingBox();
  expect(diary.y).toBeLessThan(water.y);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('nutrition-layout.png'), fullPage: true });
});

test('diário aberto acompanha a meia-noite de Fortaleza', async ({ page }) => {
  const state = await setup(page);
  expect(state.dayDates).toContain('2026-09-14');
  expect(state.dayDates).not.toContain('2026-09-15');
  await page.clock.fastForward(5_500_000);
  await expect.poll(() => state.dayDates.includes('2026-09-15')).toBe(true);
  await expect(page.getByText(/Água de 15\/09\/2026/)).toBeVisible();
});

test('vazios, confirmação, teclado e áreas de toque permanecem acessíveis', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Copiar ontem', exact: true }).first().click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation.getByRole('heading', { name: 'Copiar o dia de ontem?' })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancelar' }).click();

  await openMeal(page, 'Almoço');
  const dialog = page.getByRole('dialog');
  for (const name of ['Recentes', 'Favoritos', 'Refeições', 'Buscar']) {
    await expect(dialog.getByRole('button', { name, exact: true })).toHaveCSS('min-height', '44px');
  }
  await dialog.getByRole('button', { name: 'Favoritos', exact: true }).click();
  await expect(dialog.getByText('Nenhum favorito ainda. Marque a estrela em Alimentos.')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true);
  await noOverflow(page);
});

test('lista de recentes comunica carregamento', async ({ page }) => {
  await setup(page, { recentDelayMs: 700 });
  await openMeal(page, 'Almoço');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Carregando opções…')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Arroz de teste/ })).toBeVisible();
});

test('lista de recentes mostra erro com nova tentativa', async ({ page }) => {
  await setup(page, { failRecent: true });
  await openMeal(page, 'Almoço');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Não foi possível carregar esta lista.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
});
