// Fase 2: Hoje, Hábitos e Tarefas curtos; estados de leitura; aviso de novidades; sem regressão.
// Grava dados e parte de um banco vazio, então roda numa pilha descartável só dele:
//   npm run build && npm run test:e2e:local
import { test, expect } from '@playwright/test';
import { latestRelease } from '../src/data/changelog.js';

const LOCAL = process.env.PRAXIS_E2E_LOCAL_STACK === '1';
const BASE = process.env.PRAXIS_E2E_BASE || '';
const PASSWORD = process.env.PRAXIS_E2E_PASSWORD || '';
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(d);
const TODAY = dayKey(new Date());
const YESTERDAY = dayKey(new Date(Date.now() - 24 * 3600 * 1000));
const TOMORROW = dayKey(new Date(Date.now() + 24 * 3600 * 1000));

test.skip(!LOCAL, 'Grava dados: rode pela pilha local (npm run test:e2e:local).');
test.describe.configure({ mode: 'serial' });

const SIZES = [
  { name: '360', viewport: { width: 360, height: 780 }, mobile: true },
  { name: '390', viewport: { width: 390, height: 844 }, mobile: true },
  { name: '1440', viewport: { width: 1440, height: 900 }, mobile: false },
];
const PHONE = SIZES[1];
const LONG_TITLE =
  'Revisar o contrato de manutenção mensal do site da clínica e responder o cliente com os ajustes combinados na reunião';

/**
 * Abre o app logado num tamanho de tela.
 * `seen: false` deixa o aviso de novidades pendente; `before` roda antes de qualquer página (rotas, scripts).
 */
async function openSession(browser, size, { seen = true, path = '/', before } = {}) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: size.viewport,
    isMobile: size.mobile,
    hasTouch: size.mobile,
    deviceScaleFactor: size.mobile ? 2 : 1,
    timezoneId: 'America/Fortaleza',
    locale: 'pt-BR',
  });
  await context.addInitScript(() => localStorage.setItem('praxis:pwa-install-dismissed', '1'));
  if (seen) {
    await context.addInitScript((id) => localStorage.setItem('praxis:last-seen-release', id), latestRelease.id);
  }
  const page = await context.newPage();
  if (before) await before(page, context);
  await page.goto('/entrar');
  await page.getByLabel('Senha').waitFor({ timeout: 30_000 });
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await expect(page.getByLabel('Senha')).toHaveCount(0);
  if (path !== '/') await page.goto(path);
  return { context, page };
}

async function post(page, url, data) {
  const res = await page.request.post(url, { data });
  expect(res.ok(), `${url} → ${res.status()}`).toBeTruthy();
  return res.json();
}

/** Massa de aceite: 6 tarefas (uma com título longo, uma vencida, uma já feita) e 4 hábitos (um é rotina de 3 passos). */
async function seedOnce(page) {
  const existing = await (await page.request.get('/api/habits')).json();
  if (existing.length) return;
  await post(page, '/api/habits', { title: 'Beber água', target_value: 3, unit: 'L', quick_increment: 0.5, category: 'saude' });
  await post(page, '/api/habits', { title: 'Ler 10 páginas', category: 'estudo' });
  await post(page, '/api/habits', { title: 'Alongar antes de dormir', category: 'saude', preferred_time: '22:00' });
  const p1 = await post(page, '/api/habits', { title: 'Arrumar a cama', preferred_time: '06:30' });
  const p2 = await post(page, '/api/habits', { title: 'Tomar creatina', preferred_time: '06:40' });
  const p3 = await post(page, '/api/habits', { title: 'Planejar o dia', preferred_time: '06:50' });
  await post(page, '/api/habits', { title: 'Abertura do dia', kind: 'compound', emoji: '🌅', children_ids: [p1.id, p2.id, p3.id] });
  const task = (title, extra = {}) =>
    post(page, '/api/tasks', { title, date: TODAY, status: 'pending', source: 'manual', ...extra });
  await task('Enviar proposta da CDL', { time: '09:00', duration_minutes: 45, priority: 'high' });
  await task(LONG_TITLE, { time: '11:00', duration_minutes: 30 });
  await task('Ligar para o Raul', { time: '15:30', duration_minutes: 15 });
  await task('Comprar ração');
  await task('Pagar boleto do condomínio', { date: YESTERDAY });
  const done = await task('Treino de pernas', { time: '06:00', duration_minutes: 60 });
  await page.request.put(`/api/tasks/${done.id}`, { data: { status: 'completed' } });
}

/** Até onde a tela mostra sem rolar: o topo da barra de baixo no celular, a altura da janela no desktop. */
async function foldLine(page, size) {
  if (!size.mobile) return size.viewport.height;
  const bar = await page.locator('nav[aria-label="Navegação principal"] .praxis-nav-island').boundingBox();
  expect(bar, 'barra de baixo visível').not.toBeNull();
  return bar.y;
}

async function expectAboveFold(page, size, locator, what) {
  await expect(locator, what).toBeVisible();
  expect(await page.evaluate(() => window.scrollY), `${what}: sem rolar`).toBe(0);
  const box = await locator.boundingBox();
  const fold = await foldLine(page, size);
  expect(box.y, `${what}: começa dentro da tela`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${what}: termina acima de ${fold}px`).toBeLessThanOrEqual(fold);
}

async function expectNoSidewaysScroll(page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, 'sem rolagem lateral').toBeLessThanOrEqual(1);
}

const habitAction = (scope) => scope.getByRole('button', { name: /^(Concluir|Adicionar) / }).first();
const failWith500 = (route) =>
  route.request().method() === 'GET'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"e2e"}' })
    : route.fallback();

async function taskByTitle(page, title) {
  const list = await (await page.request.get('/api/tasks?limit=200')).json();
  return list.filter((t) => t.title === title);
}

async function habitToday(page, title) {
  const list = await (await page.request.get(`/api/habits?status=active&date=${TODAY}`)).json();
  const flat = list.flatMap((h) => [h, ...(h.children || [])]);
  return flat.find((h) => h.title === title);
}

for (const size of SIZES) {
  test(`${size.name}px: próxima tarefa e primeiro hábito ficam marcáveis sem rolar`, async ({ browser }) => {
    const { context, page } = await openSession(browser, size);
    await seedOnce(page);
    await page.goto('/');

    await expectAboveFold(page, size, page.getByTestId('now-complete'), 'Concluir do Agora');
    await expectAboveFold(page, size, habitAction(page.getByTestId('habits-glance')), 'primeiro hábito do Hoje');
    await expectNoSidewaysScroll(page);

    if (size.mobile) {
      const nav = page.getByRole('navigation', { name: 'Navegação principal' });
      await expect(nav.getByRole('link')).toHaveText(['Hoje', 'Hábitos', 'Tarefas', 'Finanças']);

      await nav.getByRole('link', { name: 'Hábitos' }).click();
      await expect(page).toHaveURL(/\/habitos$/);
      await expectAboveFold(page, size, habitAction(page.getByRole('main')), 'primeiro hábito da lista');
      await expectNoSidewaysScroll(page);

      await nav.getByRole('link', { name: 'Tarefas' }).click();
      await expect(page).toHaveURL(/\/tarefas$/);
      const firstTask = page.getByRole('main').getByRole('button', { name: /^Concluir / }).first();
      await expectAboveFold(page, size, firstTask, 'primeira tarefa da lista');
      // O título longo quebra a linha em vez de empurrar a tela para o lado.
      await expect(page.getByText(LONG_TITLE).first()).toBeVisible();
      await expectNoSidewaysScroll(page);
    } else {
      // No desktop os hábitos abrem a segunda coluna, ao lado da trilha.
      const habits = await page.getByTestId('habits-glance').boundingBox();
      const track = await page.getByTestId('day-track').boundingBox();
      expect(habits.x, 'hábitos à direita da trilha').toBeGreaterThan(track.x + track.width - 1);
    }
    await context.close();
  });
}

test('primeiro toque já grava: Concluir do Agora e hábito do Hoje', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE);
  const nowButton = page.getByTestId('now-complete');
  const label = await nowButton.getAttribute('aria-label');
  const title = label.replace(/^Concluir /, '');
  await nowButton.tap();
  await expect.poll(async () => (await taskByTitle(page, title))[0]?.status).toBe('completed');

  const glance = page.getByTestId('habits-glance');
  await glance.getByRole('button', { name: 'Concluir Ler 10 páginas', exact: true }).tap();
  await expect(glance.getByRole('button', { name: 'Desmarcar Ler 10 páginas', exact: true })).toBeVisible();
  await expect.poll(async () => (await habitToday(page, 'Ler 10 páginas'))?.completed_today).toBe(true);
  await context.close();
});

test('quantidade parcial soma, mas não marca o hábito como feito em nenhuma tela', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE);
  const add = page.getByTestId('habits-glance').getByRole('button', { name: /^Adicionar .*Beber água/ });
  await add.tap();
  await expect.poll(async () => (await habitToday(page, 'Beber água'))?.value_today).toBe(0.5);
  expect((await habitToday(page, 'Beber água')).completed_today).toBe(false);
  await expect(add).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desmarcar Beber água', exact: true })).toHaveCount(0);

  await page.goto('/habitos');
  await expect(page.getByRole('main').getByRole('button', { name: /^Adicionar .*Beber água/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desmarcar Beber água', exact: true })).toHaveCount(0);
  await context.close();
});

test('o servidor recusa quantidade inválida em vez de gravar', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE);
  const water = await habitToday(page, 'Beber água');
  for (const value of [-1, 'abc', 1e9]) {
    const res = await page.request.post('/api/habit-logs', { data: { habit_id: water.id, date: TODAY, value } });
    expect(res.status(), `valor ${value}`).toBe(400);
  }
  expect((await habitToday(page, 'Beber água')).value_today).toBe(0.5);
  await context.close();
});

test('Não rolou registra em um toque e desfaz', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE, { path: '/habitos' });
  const title = 'Alongar antes de dormir';
  const row = page.getByRole('main');
  await row.getByRole('button', { name: `Concluir ${title}`, exact: true }).waitFor();
  // O botão "Não rolou" da linha deste hábito.
  const skip = page.getByRole('button', { name: 'Não rolou', exact: true });
  await page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: `Concluir ${title}`, exact: true }) })
    .filter({ has: skip })
    .last()
    .getByRole('button', { name: 'Não rolou', exact: true })
    .tap();
  await expect.poll(async () => (await habitToday(page, title))?.day_outcome).toBe('skipped');
  expect((await habitToday(page, title)).completed_today).toBe(false);

  await page.getByRole('button', { name: new RegExp(`^Desfazer não rolou . ${title}$`) }).tap();
  await expect.poll(async () => (await habitToday(page, title))?.day_outcome).toBe('open');
  await context.close();
});

test('tarefa recorrente concluída gera a próxima, uma vez só', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE);
  const title = `Recorrente ${Date.now().toString(36)}`;
  await post(page, '/api/tasks', { title, date: TODAY, status: 'pending', source: 'manual', recurrence: 'daily' });
  await page.goto('/tarefas');
  await page.getByRole('button', { name: `Concluir ${title}`, exact: true }).tap();
  await expect
    .poll(async () => (await taskByTitle(page, title)).map((t) => `${t.date}:${t.status}`).sort())
    .toEqual([`${TODAY}:completed`, `${TOMORROW}:pending`].sort());
  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
  expect((await taskByTitle(page, title)).length).toBe(2);
  await context.close();
});

test('links antigos, link de tarefa do Hermes e Jota Fit continuam valendo', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE, { path: '/habitos-tarefas?tab=habits' });
  await expect(habitAction(page.getByRole('main'))).toBeVisible();
  await expect(page).toHaveURL(/\/habitos-tarefas\?tab=habits/);

  await page.goto('/habitos-tarefas?tab=tasks');
  await expect(page.getByRole('main').getByRole('button', { name: /^Concluir / }).first()).toBeVisible();

  const [raul] = await taskByTitle(page, 'Ligar para o Raul');
  await page.goto(`/habitos-tarefas?tab=tasks&task=${raul.id}`);
  await expect(page.getByRole('dialog').getByText('Ligar para o Raul').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/');
  await page.getByRole('button', { name: 'Menu', exact: true }).tap();
  const jotaFit = page.getByRole('link', { name: /Jota Fit/ }).first();
  await expect(jotaFit).toHaveAttribute('href', 'https://jota-fit.web.app');
  await expect(jotaFit).toHaveAttribute('target', '_blank');
  await context.close();
});

test('leitura de tarefas falha: erro com Tentar novamente, nunca "Dia livre"', async ({ browser }) => {
  let failing = true;
  const { context, page } = await openSession(browser, PHONE, {
    before: (p) => p.route(/\/api\/tasks(\?|$)/, (route) => (failing ? failWith500(route) : route.fallback())),
  });
  const trackError = page.getByTestId('track-error');
  await expect(trackError).toBeVisible();
  await expect(trackError).toContainText('O servidor falhou ao carregar as tarefas.');
  await expect(page.getByTestId('now-error')).toBeVisible();
  await expect(page.getByText('Dia livre')).toHaveCount(0);
  await expect(page.getByText('Nada urgente na fila.')).toHaveCount(0);
  await expect(page.getByTestId('day-left')).toHaveText('–');
  // Os hábitos leram bem e seguem utilizáveis.
  await expect(habitAction(page.getByTestId('habits-glance'))).toBeVisible();

  failing = false;
  await trackError.getByRole('button', { name: 'Tentar novamente' }).tap();
  await expect(page.getByTestId('now-complete')).toBeVisible();
  await expect(page.getByTestId('track-error')).toHaveCount(0);
  await expect(page.getByTestId('now-error')).toHaveCount(0);
  await context.close();
});

test('servidor fora com cópia no aparelho: a tela diz que é cópia e de que horas', async ({ browser }) => {
  let failing = false;
  const { context, page } = await openSession(browser, PHONE, {
    before: (p) => p.route(/\/api\/tasks(\?|$)/, (route) => (failing ? failWith500(route) : route.fallback())),
  });
  await expect(page.getByTestId('now-complete')).toBeVisible();
  await expect(page.getByTestId('track-stale')).toHaveCount(0);

  failing = true;
  await page.reload();
  const note = page.getByTestId('track-stale');
  await expect(note).toBeVisible();
  await expect(note).toContainText(/Cópia salva às \d{2}:\d{2}, pode estar desatualizada\./);
  await expect(page.getByTestId('now-stale')).toBeVisible();
  await expect(page.getByTestId('track-error')).toHaveCount(0);
  await expect(page.getByTestId('now-complete')).toBeVisible();

  failing = false;
  await note.getByRole('button', { name: 'Tentar novamente' }).tap();
  await expect(page.getByTestId('track-stale')).toHaveCount(0);
  await expect(page.getByTestId('now-stale')).toHaveCount(0);
  await context.close();
});

test('Hábitos e Tarefas: enquanto lê ou se a leitura falha, a tela não diz que está vazia', async ({ browser }) => {
  // Hábitos: a leitura demora. Nada de "Nenhum hábito ainda" antes da resposta.
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const slow = await openSession(browser, PHONE, {
    path: '/habitos',
    before: (p) => p.route(/\/api\/habits(\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await held;
      return route.fallback();
    }),
  });
  await expect(slow.page.getByRole('status', { name: 'Carregando os hábitos' })).toBeVisible();
  await expect(slow.page.getByText('Nenhum hábito ainda')).toHaveCount(0);
  release();
  await expect(habitAction(slow.page.getByRole('main'))).toBeVisible();
  await expect(slow.page.getByRole('status', { name: 'Carregando os hábitos' })).toHaveCount(0);
  await slow.context.close();

  // Hábitos: o servidor falha e não há cópia no aparelho. Erro com saída, nunca vazio.
  let failing = true;
  const broken = await openSession(browser, PHONE, {
    path: '/habitos',
    before: (p) => p.route(/\/api\/(habits|tasks)(\?|$)/, (route) =>
      (failing && route.request().method() === 'GET' ? failWith500(route) : route.fallback())),
  });
  const habitsError = broken.page.getByTestId('habits-page-error');
  await expect(habitsError).toBeVisible();
  await expect(habitsError).toContainText('O servidor falhou ao carregar os hábitos.');
  await expect(broken.page.getByText('Nenhum hábito ainda')).toHaveCount(0);

  // Tarefas: mesma regra.
  await broken.page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Tarefas' }).tap();
  const tasksError = broken.page.getByTestId('tasks-page-error');
  await expect(tasksError).toBeVisible();
  await expect(broken.page.getByText('Nenhuma tarefa neste filtro')).toHaveCount(0);
  failing = false;
  await tasksError.getByRole('button', { name: 'Tentar novamente' }).tap();
  await expect(broken.page.getByTestId('tasks-page-error')).toHaveCount(0);
  await expect(broken.page.getByRole('main').getByRole('button', { name: /^Concluir / }).first()).toBeVisible();
  await broken.context.close();
});

test('lista vazia de verdade mostra o vazio, sem erro', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE, {
    before: (p) =>
      p.route(/\/api\/tasks(\?|$)/, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          : route.fallback(),
      ),
  });
  await expect(page.getByText('Nada urgente na fila.')).toBeVisible();
  await expect(page.getByTestId('day-track').getByText('Dia livre')).toBeVisible();
  await expect(page.getByTestId('track-error')).toHaveCount(0);
  await expect(page.getByTestId('now-error')).toHaveCount(0);
  await expect(page.getByTestId('track-stale')).toHaveCount(0);
  await context.close();
});

test('sem os registros do dia os hábitos não aparecem como "não feitos"', async ({ browser }) => {
  let failing = true;
  const { context, page } = await openSession(browser, PHONE, {
    before: (p) => p.route(/\/api\/habit-logs(\?|$)/, (route) => (failing ? failWith500(route) : route.fallback())),
  });
  const error = page.getByTestId('habits-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('carregar os hábitos');
  const glance = page.getByTestId('habits-glance');
  await expect(glance.getByRole('button', { name: /^(Concluir|Adicionar|Desmarcar) / })).toHaveCount(0);
  await expect(page.getByText('Nenhum hábito para hoje.')).toHaveCount(0);
  // O selo de contagem do título some: "0/4" ao lado de um erro seria mentira.
  await expect(glance.getByText(/^\d+\/\d+$/)).toHaveCount(0);
  await expect(page.getByTestId('day-left')).toHaveText('–');
  // A trilha leu bem e segue utilizável.
  await expect(page.getByTestId('now-complete')).toBeVisible();

  failing = false;
  await error.getByRole('button', { name: 'Tentar novamente' }).tap();
  // "Ler 10 páginas" foi feito num cenário anterior: tem de voltar como feito.
  await expect(glance.getByRole('button', { name: 'Desmarcar Ler 10 páginas', exact: true })).toBeVisible();
  await expect(page.getByTestId('habits-error')).toHaveCount(0);
  await context.close();
});

test('aviso de novidades espera o formulário fechar', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE, {
    seen: false,
    path: '/habitos',
    // Segura o aviso até o formulário de verdade abrir; sem isso o teste disputa corrida com o 1,2 s do aviso.
    before: (_p, ctx) =>
      ctx.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const hold = document.createElement('div');
          hold.setAttribute('role', 'dialog');
          hold.setAttribute('data-e2e-hold', '');
          hold.hidden = true;
          document.body.appendChild(hold);
        });
      }),
  });
  const whatsNew = page.getByText(/Últimas atualizações ·/);

  await page.getByRole('button', { name: 'Novo hábito' }).first().tap();
  const titleField = page.getByPlaceholder('Ex.: Beber água');
  await titleField.fill('Meditar 5 minutos');
  await page.evaluate(() => document.querySelector('[data-e2e-hold]')?.remove());

  // Bem mais que o 1,2 s do aviso: com o formulário aberto ele não aparece e o texto fica onde estava.
  await page.waitForTimeout(4000);
  await expect(whatsNew).toHaveCount(0);
  await expect(titleField).toHaveValue('Meditar 5 minutos');
  await expect(page.getByRole('dialog')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(titleField).toHaveCount(0);
  await expect(whatsNew).toBeVisible({ timeout: 20_000 });
  await context.close();
});
