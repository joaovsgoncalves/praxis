// Fase 1: o check do dia. Sessão perdida, sem rede, conexão que cai no meio e toque duplo.
// Grava dados, então só roda na pilha descartável:
//   npm run build && npm run test:e2e:local
import { test, expect } from '@playwright/test';
import { latestRelease } from '../src/data/changelog.js';

const LOCAL = process.env.PRAXIS_E2E_LOCAL_STACK === '1';
const PASSWORD = process.env.PRAXIS_E2E_PASSWORD || '';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());

test.skip(!LOCAL, 'Grava dados: rode pela pilha local (npm run test:e2e:local).');
test.describe.configure({ mode: 'serial' });

let serial = 0;
const uniqueTitle = (label) => `${label} ${Date.now().toString(36)}${(serial += 1)}`;

async function signIn(page) {
  await page.getByLabel('Senha').waitFor({ timeout: 30_000 });
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /Entrar/i }).click();
}

async function openApp(page, path = '/habitos-tarefas') {
  // O aviso de novidades não faz parte destes cenários.
  await page.addInitScript((id) => localStorage.setItem('praxis:last-seen-release', id), latestRelease.id);
  await page.goto('/entrar');
  await signIn(page);
  await expect(page.getByLabel('Senha')).toHaveCount(0);
  if (path !== '/') await page.goto(path);
}

async function createTask(page, label, extra = {}) {
  const title = uniqueTitle(label);
  const res = await page.request.post('/api/tasks', {
    data: { title, date: TODAY, status: 'pending', source: 'manual', ...extra },
  });
  expect(res.status(), 'criar tarefa de teste').toBe(201);
  const task = await res.json();
  return { id: task.id, title };
}

async function serverStatus(page, id) {
  const res = await page.request.get(`/api/tasks/${id}`);
  return res.ok() ? (await res.json()).status : `http_${res.status()}`;
}

/** Conta as gravações de status que saíram do navegador. */
function countTaskWrites(page) {
  const writes = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && /\/api\/tasks\/[^/]+$/.test(new URL(req.url()).pathname)) writes.push(req.url());
  });
  return writes;
}

const completeButton = (page, title) => page.getByRole('button', { name: `Concluir ${title}`, exact: true });
const reopenButton = (page, title) => page.getByRole('button', { name: `Reabrir ${title}`, exact: true });

test('sessão perdida: um pedido de login, mesma tela, e a tarefa só conclui depois de confirmar', async ({ page, context }) => {
  await openApp(page);
  const task = await createTask(page, 'Sessão');
  await page.reload();
  await completeButton(page, task.title).waitFor();

  const writes = countTaskWrites(page);
  let firstRejection = 0;
  const lateProtected = [];
  page.on('response', (res) => {
    if (res.status() === 401 && !firstRejection) firstRejection = Date.now();
  });
  page.on('request', (req) => {
    const pathname = new URL(req.url()).pathname;
    if (firstRejection && pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) lateProtected.push(pathname);
  });

  await context.clearCookies();
  await completeButton(page, task.title).click();

  const notice = page.getByTestId('session-lost-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Sua sessão terminou');
  await expect(notice).toContainText(task.title);
  await expect(page).toHaveURL(/\/habitos-tarefas/);
  await expect(page.getByText('Erro ao atualizar tarefa')).toHaveCount(0);

  await page.waitForTimeout(1500);
  expect(writes.length, 'uma única gravação rejeitada').toBe(1);
  expect(lateProtected, 'nenhuma chamada protegida depois do primeiro 401').toEqual([]);
  expect(await page.getByTestId('session-lost-notice').count()).toBe(1);

  await signIn(page);
  const prompt = page.getByTestId('pending-intent-prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText(task.title);
  await expect(page).toHaveURL(/\/habitos-tarefas/);
  // Entrar de novo não conclui nada sozinho.
  expect(await serverStatus(page, task.id)).toBe('pending');

  await prompt.getByRole('button', { name: 'Concluir agora' }).click();
  await expect.poll(() => serverStatus(page, task.id)).toBe('completed');
  expect(writes.length).toBe(2);

  await page.reload();
  await expect(completeButton(page, task.title)).toHaveCount(0);
  await expect(page.getByTestId('pending-intent-prompt')).toHaveCount(0);
  expect(await serverStatus(page, task.id)).toBe('completed');
});

test('sessão perdida: "Deixar como está" não altera a tarefa nem pergunta de novo', async ({ page, context }) => {
  await openApp(page);
  const task = await createTask(page, 'Deixar');
  await page.reload();
  await completeButton(page, task.title).waitFor();

  await context.clearCookies();
  await completeButton(page, task.title).click();
  await expect(page.getByTestId('session-lost-notice')).toBeVisible();
  await signIn(page);

  const prompt = page.getByTestId('pending-intent-prompt');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Deixar como está' }).click();
  await expect(prompt).toHaveCount(0);

  await page.reload();
  await expect(completeButton(page, task.title)).toBeVisible();
  await expect(page.getByTestId('pending-intent-prompt')).toHaveCount(0);
  expect(await serverStatus(page, task.id)).toBe('pending');
});

test('sem rede: não marca, não envia; com rede de volta conclui e a recarga confirma', async ({ page, context }) => {
  await openApp(page);
  const task = await createTask(page, 'Offline');
  await page.reload();
  await completeButton(page, task.title).waitFor();
  const writes = countTaskWrites(page);

  await context.setOffline(true);
  await completeButton(page, task.title).click();
  await expect(page.getByText(/Sem conexão\. A tarefa não foi marcada/)).toBeVisible();
  await expect(completeButton(page, task.title)).toBeVisible();
  await expect(reopenButton(page, task.title)).toHaveCount(0);
  expect(writes.length, 'nada saiu do aparelho').toBe(0);

  await context.setOffline(false);
  expect(await serverStatus(page, task.id)).toBe('pending');
  await page.waitForTimeout(600);
  await completeButton(page, task.title).click();
  await expect.poll(() => serverStatus(page, task.id)).toBe('completed');
  expect(writes.length).toBe(1);

  await page.reload();
  await expect(completeButton(page, task.title)).toHaveCount(0);
  expect(await serverStatus(page, task.id)).toBe('completed');
});

test('conexão cai depois do envio: confere no servidor em vez de adivinhar', async ({ page }) => {
  await openApp(page);
  const saved = await createTask(page, 'Caiu depois');
  const lost = await createTask(page, 'Nem chegou');
  await page.reload();
  await completeButton(page, saved.title).waitFor();
  const writes = countTaskWrites(page);

  // O servidor grava, mas a resposta nunca chega ao navegador.
  await page.route(`**/api/tasks/${saved.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    await route.fetch();
    return route.abort('connectionreset');
  });
  await completeButton(page, saved.title).click();
  await expect(page.getByText('Confirmado: tarefa concluída.')).toBeVisible({ timeout: 20_000 });
  expect(await serverStatus(page, saved.id)).toBe('completed');
  expect(writes.filter((url) => url.endsWith(saved.id)).length, 'sem reenvio às cegas').toBe(1);

  // O pedido se perde antes de chegar: a tela volta ao estado real.
  await page.route(`**/api/tasks/${lost.id}`, (route) =>
    route.request().method() === 'PUT' ? route.abort('connectionreset') : route.fallback(),
  );
  await completeButton(page, lost.title).click();
  await expect(page.getByText(/Não salvou: a tarefa continua como estava/)).toBeVisible({ timeout: 20_000 });
  await expect(completeButton(page, lost.title)).toBeVisible();
  expect(await serverStatus(page, lost.id)).toBe('pending');
});

test('toque duplo conclui só a tarefa tocada (lista)', async ({ page }) => {
  await openApp(page);
  const first = await createTask(page, 'Duplo A');
  const second = await createTask(page, 'Duplo B');
  await page.reload();
  await completeButton(page, first.title).waitFor();
  await completeButton(page, second.title).waitFor();
  const writes = countTaskWrites(page);

  await completeButton(page, first.title).dblclick();
  await expect.poll(() => serverStatus(page, first.id)).toBe('completed');
  await page.waitForTimeout(1200);
  expect(await serverStatus(page, second.id)).toBe('pending');
  expect(writes.length, 'uma gravação só').toBe(1);
});

test('toque duplo conclui só a tarefa tocada (Hoje)', async ({ page }) => {
  await openApp(page, '/');
  const first = await createTask(page, 'Hoje A');
  const second = await createTask(page, 'Hoje B');
  await page.goto('/');
  const firstCheck = page.getByRole('checkbox', { name: `Concluir ${first.title}`, exact: true });
  await firstCheck.waitFor();
  await page.getByRole('checkbox', { name: `Concluir ${second.title}`, exact: true }).waitFor();
  const writes = countTaskWrites(page);

  await firstCheck.dblclick();
  await expect.poll(() => serverStatus(page, first.id)).toBe('completed');
  await page.waitForTimeout(1200);
  expect(await serverStatus(page, second.id)).toBe('pending');
  expect(writes.length, 'uma gravação só').toBe(1);
});

test('cada falha tem a sua mensagem: servidor, permissão e tarefa removida', async ({ page }) => {
  await openApp(page);
  const task = await createTask(page, 'Falhas');
  await page.reload();
  await completeButton(page, task.title).waitFor();

  let answer = { status: 500, body: { error: 'falha simulada', code: 'task_write_failed' } };
  await page.route(`**/api/tasks/${task.id}`, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) })
      : route.fallback(),
  );

  await completeButton(page, task.title).click();
  await expect(page.getByText(/O servidor falhou ao salvar/)).toBeVisible();
  await expect(completeButton(page, task.title)).toBeVisible();

  answer = { status: 403, body: { error: 'Forbidden' } };
  await page.waitForTimeout(600);
  await completeButton(page, task.title).click();
  await expect(page.getByText(/não tem permissão/)).toBeVisible();

  answer = { status: 404, body: { error: 'Task not found' } };
  await page.waitForTimeout(600);
  await completeButton(page, task.title).click();
  await expect(page.getByText(/não existe mais/)).toBeVisible();

  await expect(page.getByText('Erro ao atualizar tarefa')).toHaveCount(0);
  expect(await serverStatus(page, task.id)).toBe('pending');
});
