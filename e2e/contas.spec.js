// Fase 4: duas pessoas no mesmo navegador. O que é de uma conta não aparece para a outra:
// nem pela rede, nem pela cópia guardada no aparelho, nem em outra aba que ficou aberta.
// Grava dados, então roda numa pilha descartável: npm run build && npm run test:e2e:local
import { test, expect } from '@playwright/test';
import { latestRelease } from '../src/data/changelog.js';

const LOCAL = process.env.PRAXIS_E2E_LOCAL_STACK === '1';
const BASE = process.env.PRAXIS_E2E_BASE || '';
const PASSWORD = process.env.PRAXIS_E2E_PASSWORD || '';
const USER2 = process.env.PRAXIS_E2E_USER2 || '';
const PASSWORD2 = process.env.PRAXIS_E2E_PASSWORD2 || '';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
const TASK_A = 'Tarefa que só o dono vê';
const TASK_B = 'Tarefa que só a visita vê';

test.skip(!LOCAL || !USER2, 'Grava dados e precisa da segunda conta: rode pela pilha local (npm run test:e2e:local).');

async function signIn(page, { username = '', password }) {
  await page.goto('/entrar');
  await page.getByLabel('Senha').waitFor({ timeout: 30_000 });
  if (username) await page.getByLabel('Usuário').fill(username);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await expect(page.getByLabel('Senha')).toHaveCount(0);
}

async function signOut(page) {
  await page.goto('/configuracoes');
  // O menu lateral (fora da tela no celular) tem um botão igual: usa o da página.
  await page.getByRole('main').getByRole('button', { name: 'Sair da conta' }).click({ timeout: 20_000 });
  // Sair leva para a página de apresentação: espera ela antes de olhar o que ficou guardado.
  await page.getByText('Entrar no Praxis').first().waitFor({ timeout: 30_000 });
  expect(await page.evaluate(() => localStorage.getItem('praxis:account'))).toBeNull();
}

/** O que a Praxis guarda neste navegador: dono, cópias offline (com o carimbo de cada uma) e o resto pessoal. */
const stored = (page) => page.evaluate(() => {
  const device = new Set(['praxis:account', 'praxis:session-hint', 'praxis:last-seen-release', 'praxis:open-whats-new', 'praxis:pwa-install-dismissed']);
  const offline = [];
  const personal = [];
  for (const storage of [localStorage, sessionStorage]) {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key.startsWith('praxis:') && !key.startsWith('forja:')) continue;
      if (key.startsWith('praxis:offline:')) {
        let account = null;
        try { account = JSON.parse(storage.getItem(key)).account ?? null; } catch { /* entrada quebrada */ }
        offline.push({ key, account, text: storage.getItem(key) });
      } else if (!device.has(key)) personal.push(key);
    }
  }
  return { account: localStorage.getItem('praxis:account'), offline, personal };
});

const myId = async (page) => (await (await page.request.get('/api/auth/me')).json()).user.id;

async function addTask(page, title) {
  const res = await page.request.post('/api/tasks', { data: { title, date: TODAY, time: '23:30', priority: 'high' } });
  expect(res.ok(), `criar tarefa: ${res.status()}`).toBeTruthy();
}

test('duas contas no mesmo navegador não se enxergam: rede, cópia guardada e outra aba', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'America/Fortaleza',
    locale: 'pt-BR',
  });
  await context.addInitScript(() => localStorage.setItem('praxis:pwa-install-dismissed', '1'));
  await context.addInitScript((id) => localStorage.setItem('praxis:last-seen-release', id), latestRelease.id);
  const page = await context.newPage();
  let idA; let idB;

  await test.step('o dono entra só com a senha, como sempre, e as cópias guardadas levam o carimbo dele', async () => {
    await signIn(page, { password: PASSWORD });
    idA = await myId(page);
    await addTask(page, TASK_A);
    await page.goto('/tarefas');
    await expect(page.getByText(TASK_A).first()).toBeVisible();
    const state = await stored(page);
    expect(state.account).toBe(idA);
    expect(state.offline.length).toBeGreaterThan(0);
    expect(state.offline.filter((entry) => entry.account !== idA)).toEqual([]);
    expect(state.offline.some((entry) => entry.text.includes(TASK_A))).toBeTruthy();
  });

  await test.step('saiu: nada da conta fica no navegador', async () => {
    await signOut(page);
    const state = await stored(page);
    expect(state.account).toBeNull();
    expect(state.offline).toEqual([]);
    expect(state.personal).toEqual([]);
  });

  await test.step('a visita entra com usuário e senha e começa do zero', async () => {
    await signIn(page, { username: USER2, password: PASSWORD2 });
    idB = await myId(page);
    expect(idB).not.toBe(idA);
    await addTask(page, TASK_B);
    await page.goto('/tarefas');
    await expect(page.getByText(TASK_B).first()).toBeVisible();
    await expect(page.getByText(TASK_A)).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByText(TASK_B).first()).toBeVisible();
    await expect(page.getByText(TASK_A)).toHaveCount(0);
    await page.goto('/frentes');
    await expect(page.getByRole('main')).toBeVisible();
    const fronts = await (await page.request.get('/api/projects')).json();
    expect(Array.isArray(fronts) ? fronts.length : (fronts.projects || []).length).toBe(0);
    const state = await stored(page);
    expect(state.account).toBe(idB);
    expect(state.offline.filter((entry) => entry.account !== idB)).toEqual([]);
    expect(state.offline.some((entry) => entry.text.includes(TASK_A))).toBeFalsy();
  });

  await test.step('senha do dono com o usuário da visita não entra', async () => {
    const res = await page.request.post('/api/auth/login', { data: { username: USER2, password: PASSWORD } });
    expect(res.status()).toBe(401);
  });

  await test.step('sem rede, a tela usa a cópia da conta ativa; cópia com carimbo de outra conta não é lida', async () => {
    await page.route('**/api/tasks**', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue()));
    await page.goto('/tarefas');
    await expect(page.getByText(TASK_B).first()).toBeVisible();

    // Simula sobra de outra conta: as mesmas cópias, com o carimbo do dono.
    await page.evaluate((foreign) => {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key.startsWith('praxis:offline:')) continue;
        const entry = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ ...entry, account: foreign }));
      }
    }, idA);
    await page.goto('/tarefas');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect(page.getByText(TASK_B)).toHaveCount(0);
    await page.unroute('**/api/tasks**');
    await page.goto('/tarefas');
    await expect(page.getByText(TASK_B).first()).toBeVisible();
  });

  await test.step('outra aba sai da conta: a aba que ficou aberta para de mostrar os dados', async () => {
    const other = await context.newPage();
    await signOut(other);
    await expect(page.getByText(TASK_B)).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => stored(page).then((state) => state.offline.length + state.personal.length)).toBe(0);

    await signIn(other, { password: PASSWORD });
    await other.goto('/tarefas');
    await expect(other.getByText(TASK_A).first()).toBeVisible();
    await page.goto('/tarefas');
    await expect(page.getByText(TASK_A).first()).toBeVisible();
    await expect(page.getByText(TASK_B)).toHaveCount(0);
    expect((await stored(page)).account).toBe(idA);
    await other.close();
  });

  await context.close();
});
