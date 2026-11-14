// Fase 3: Finanças confiável e navegável.
// Três abas no topo com Lançar ao alcance, aba e mês na URL, totais que só afirmam o que o extrato
// sustenta, "O banco mostrou" com origem e data, reenvio seguro depois de queda de rede e valores ocultos.
// Grava dados, então roda numa pilha descartável: npm run build && npm run test:e2e:local
import { test, expect } from '@playwright/test';
import { latestRelease } from '../src/data/changelog.js';

const LOCAL = process.env.PRAXIS_E2E_LOCAL_STACK === '1';
const BASE = process.env.PRAXIS_E2E_BASE || '';
const PASSWORD = process.env.PRAXIS_E2E_PASSWORD || '';
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(d);
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);
const TODAY = dayKey(new Date());
const MONEY = /R\$\s?\d/;

test.skip(!LOCAL, 'Grava dados: rode pela pilha local (npm run test:e2e:local).');
test.describe.configure({ mode: 'serial' });

const SIZES = [
  { name: '360', viewport: { width: 360, height: 780 }, mobile: true },
  { name: '390', viewport: { width: 390, height: 844 }, mobile: true },
  { name: '1440', viewport: { width: 1440, height: 900 }, mobile: false },
];
const PHONE = SIZES[1];

async function openSession(browser, size, { path = '/financas', before } = {}) {
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
  await context.addInitScript((id) => localStorage.setItem('praxis:last-seen-release', id), latestRelease.id);
  const page = await context.newPage();
  if (before) await before(page, context);
  await page.goto('/entrar');
  await page.getByLabel('Senha').waitFor({ timeout: 30_000 });
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await expect(page.getByLabel('Senha')).toHaveCount(0);
  await page.goto(path);
  await expect(page.getByRole('tablist', { name: 'Áreas de Finanças' })).toBeVisible();
  return { context, page };
}

async function api(page, method, url, data) {
  const res = await page.request.fetch(url, { method, data });
  expect(res.ok(), `${method} ${url} → ${res.status()}`).toBeTruthy();
  return res.json();
}

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

async function expectNoSidewaysScroll(page, what) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, `${what}: sem rolagem lateral`).toBeLessThanOrEqual(1);
}

const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const panel = (page) => page.getByRole('tabpanel');

function pluggy({ readDaysAgo = 0, statement, transactions = [], balance = 321.5 }) {
  return {
    source: 'pluggy',
    fetched_at: new Date().toISOString(),
    institutions: [
      {
        institution: 'inter',
        updated_at: daysAgo(readDaysAgo).toISOString(),
        status: 'UPDATED',
        bank: { balance, reserved: [] },
        card: null,
        ...(statement ? { statement } : {}),
      },
    ],
    transactions,
  };
}

test('sem extrato: o Resumo não afirma R$ 0 e diz o que se sabe do período', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE);
  const totals = page.getByTestId('totals-30d');
  await expect(totals.getByTestId('coverage-note')).toHaveAttribute('data-status', /^(unavailable|manual_only)$/);
  await expect(totals).not.toContainText(/R\$\s?0,00/);
  await expect(totals.locator('[data-covered="unknown"]').first()).toBeVisible();
  await expect(page.getByTestId('bank-shown')).toContainText('Nenhum banco mandou saldo ainda');

  await tab(page, 'Movimentações').click();
  await expect(panel(page).getByTestId('coverage-note')).toHaveAttribute('data-status', /^(unavailable|manual_only)$/);
  await expect(panel(page)).toContainText('Vazio aqui não quer dizer que não houve gasto');
  await context.close();
});

for (const size of SIZES) {
  test(`primeira tela em ${size.name}: três abas no topo e Lançar ao alcance`, async ({ browser }) => {
    const { context, page } = await openSession(browser, size);
    const list = page.getByRole('tablist', { name: 'Áreas de Finanças' });
    await expect(list.getByRole('tab')).toHaveText(['Resumo', 'Movimentações', 'Organização']);
    await expect(tab(page, 'Resumo')).toHaveAttribute('aria-selected', 'true');
    await expectAboveFold(page, size, list, 'seletor de abas');
    await expectAboveFold(page, size, page.getByRole('button', { name: 'Lançar gasto' }), 'Lançar gasto');
    await expectNoSidewaysScroll(page, 'Resumo');

    // o seletor continua à vista depois de rolar
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(async () => (await list.boundingBox()).y).toBeLessThan(120);
    expect((await list.boundingBox()).y).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => window.scrollTo(0, 0));

    // extrato a um toque da primeira tela
    await tab(page, 'Movimentações').click();
    await expect(panel(page).getByRole('heading', { name: /Movimentações/ })).toBeVisible();
    await expectNoSidewaysScroll(page, 'Movimentações');

    // gasto a um toque, de qualquer aba
    await page.getByRole('button', { name: 'Lançar gasto' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lançar gasto' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    await tab(page, 'Organização').click();
    for (const title of ['Contas', 'Dívidas', 'Parcelas', 'Assinaturas']) {
      await expect(panel(page).getByRole('heading', { name: title, exact: true }).first()).toBeAttached();
    }
    await expectNoSidewaysScroll(page, 'Organização');
    await context.close();
  });
}

test('aba e mês ficam na URL, voltam ao recarregar e o leitor de tela sabe qual aba está aberta', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE);
  await tab(page, 'Movimentações').click();
  await expect(page).toHaveURL(/[?&]aba=movimentacoes/);
  await expect(tab(page, 'Movimentações')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Resumo')).toHaveAttribute('aria-selected', 'false');
  await expect(panel(page)).toHaveAttribute('aria-labelledby', 'finance-tab-movimentacoes');
  await page.reload();
  await expect(tab(page, 'Movimentações')).toHaveAttribute('aria-selected', 'true');

  // teclado: seta para a direita abre Organização
  await tab(page, 'Movimentações').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Organização')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Organização')).toBeFocused();
  await expect(page).toHaveURL(/[?&]aba=organizacao/);

  // mês anterior vai para a URL e sobrevive ao recarregar
  const month = page.getByTestId('finance-month');
  const current = await month.innerText();
  await panel(page).getByRole('button', { name: /anterior/i }).click();
  await expect(page).toHaveURL(/[?&]mes=\d{4}-\d{2}/);
  await expect(month).not.toHaveText(current);
  const previous = await month.innerText();
  await page.reload();
  await expect(tab(page, 'Organização')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('finance-month')).toHaveText(previous);

  // voltar do navegador devolve a aba anterior
  await page.goBack();
  await expect(tab(page, 'Movimentações')).toHaveAttribute('aria-selected', 'true');

  // link antigo de aba continua abrindo o lugar certo
  await page.goto('/financas?aba=dividas');
  await expect(tab(page, 'Organização')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#financas-dividas')).toBeInViewport();
  await page.goto('/financas?aba=inventada&mes=2999-01');
  await expect(tab(page, 'Resumo')).toHaveAttribute('aria-selected', 'true');
  await context.close();
});

test('atraso e cobertura: leitura antiga é sinalizada, extrato parcial não vira total e extrato completo sustenta o zero', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE);
  // o banco foi lido há 5 dias e o extrato só vai até lá
  await api(page, 'POST', '/api/finance/ingest/pluggy', pluggy({
    readDaysAgo: 5,
    statement: { from: dayKey(daysAgo(29)), to: dayKey(daysAgo(5)) },
    transactions: [
      { external_id: 'e2e-mercado', institution: 'inter', account_type: 'BANK', amount: -42.5, date: dayKey(daysAgo(6)), category: 'Groceries', description: 'Mercado E2E' },
    ],
  }));
  await page.reload();
  const bank = page.getByTestId('bank-shown');
  const row = bank.locator('li').filter({ hasText: 'Inter' }).first();
  await expect(row).toHaveAttribute('data-stale', '1');
  await expect(row).toContainText('lido há 5 dias, pode ter mudado');
  await expect(row).toContainText(/banco/i);
  await expect(row).toContainText('R$ 321,50');
  const totals = page.getByTestId('totals-30d');
  await expect(totals.getByTestId('coverage-note')).toHaveAttribute('data-status', 'partial');
  await expect(totals).toContainText('R$ 42,50');
  await expect(totals).toContainText('parcial');
  await expect(totals).not.toContainText(/R\$\s?0,00/);

  // leitura de hoje com o período inteiro
  await api(page, 'POST', '/api/finance/ingest/pluggy', pluggy({
    readDaysAgo: 0,
    statement: { from: dayKey(daysAgo(120)), to: TODAY },
    balance: 300,
  }));
  await page.reload();
  const fresh = page.getByTestId('bank-shown').locator('li').filter({ hasText: 'Inter' }).first();
  await expect(fresh).toHaveAttribute('data-stale', '0');
  await expect(fresh).toContainText('lido hoje');
  await expect(page.getByTestId('bank-shown').locator('li').filter({ hasText: 'Inter' }).filter({ hasText: 'livre' })).toHaveCount(1);
  await expect(totals.getByTestId('coverage-note')).toHaveAttribute('data-status', 'complete');
  await expect(totals).toContainText('R$ 42,50');
  await expect(totals).toContainText('R$ 0,00');
  await expect(totals).not.toContainText('parcial');

  await tab(page, 'Movimentações').click();
  await expect(panel(page)).toContainText('Mercado E2E');
  await expect(panel(page).getByTestId('coverage-note')).toHaveAttribute('data-status', 'complete');
  await context.close();
});

test('erro de leitura: os totais ficam em branco e a lista diz que não chegou', async ({ browser }) => {
  let failing = true;
  const fail = (route) =>
    failing && route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"e2e"}' })
      : route.fallback();
  const { context, page } = await openSession(browser, PHONE, {
    before: async (p) => {
      await p.route(/\/api\/finance\/insights/, fail);
      await p.route(/\/api\/finance\/transactions(\?|$)/, fail);
      await p.route(/\/api\/finance\/coverage/, fail);
    },
  });
  const totals = page.getByTestId('totals-30d');
  await expect(totals.getByTestId('coverage-note')).toHaveAttribute('data-status', 'error', { timeout: 20_000 });
  await expect(totals).not.toContainText(MONEY);

  await tab(page, 'Movimentações').click();
  await expect(panel(page)).toContainText('Não deu para ler as movimentações', { timeout: 20_000 });
  failing = false;
  await panel(page).getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(panel(page)).toContainText('Mercado E2E');
  await context.close();
});

test('baixa de dívida: a rede cai depois de o servidor gravar e o reenvio não baixa duas vezes', async ({ browser }) => {
  let drop = true;
  const { context, page } = await openSession(browser, PHONE, {
    before: (p) =>
      p.route(/\/api\/finance\/debts\/[^/]+\/pay$/, async (route) => {
        if (!drop) return route.fallback();
        drop = false;
        await route.fetch(); // o servidor grava
        return route.abort('connectionreset'); // e a resposta se perde
      }),
  });
  const debt = await api(page, 'POST', '/api/finance/debts', { title: 'Dívida E2E', balance: 100, kind: 'loan', status: 'open' });
  const balance = async () => (await api(page, 'GET', '/api/finance/debts')).find((d) => d.id === debt.id).balance;
  const entries = async () =>
    (await api(page, 'GET', `/api/finance/transactions?from=${dayKey(daysAgo(3))}&to=${TODAY}&limit=1000`)).filter((t) => t.debt_id === debt.id).length;

  await page.goto('/financas?aba=dividas');
  const row = page.getByTestId('debt-row').filter({ hasText: 'Dívida E2E' });
  await row.getByRole('button', { name: 'Paguei' }).click();
  let dialog = page.getByRole('dialog', { name: /Registrar pagamento/ });
  await dialog.getByRole('textbox').fill('25');
  await dialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Não deu para confirmar se gravou');
  expect(await balance(), 'o servidor já tinha gravado').toBe(75);

  // fecha tudo e volta: a tentativa sem confirmação é lembrada com o mesmo valor
  await page.reload();
  await page.getByTestId('debt-row').filter({ hasText: 'Dívida E2E' }).getByRole('button', { name: 'Paguei' }).click();
  dialog = page.getByRole('dialog', { name: /Registrar pagamento/ });
  await expect(dialog.getByRole('textbox')).toHaveValue('25');
  await expect(dialog.getByRole('alert')).toContainText('não entra duas vezes');
  await dialog.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByText('Esse pagamento já estava registrado')).toBeVisible();
  expect(await balance(), 'reenvio não baixa de novo').toBe(75);
  expect(await entries(), 'um lançamento só').toBe(1);

  // uma segunda baixa de verdade, do mesmo valor, continua valendo
  await page.getByTestId('debt-row').filter({ hasText: 'Dívida E2E' }).getByRole('button', { name: 'Paguei' }).click();
  dialog = page.getByRole('dialog', { name: /Registrar pagamento/ });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('textbox').fill('25');
  await dialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Pagamento registrado', { exact: true })).toBeVisible();
  expect(await balance()).toBe(50);
  expect(await entries()).toBe(2);
  await context.close();
});

test('lançar gasto: a rede cai depois de gravar e o reenvio não lança duas vezes', async ({ browser }) => {
  let drop = true;
  const { context, page } = await openSession(browser, PHONE, {
    before: (p) =>
      p.route(/\/api\/finance\/transactions$/, async (route) => {
        if (route.request().method() !== 'POST' || !drop) return route.fallback();
        drop = false;
        await route.fetch();
        return route.abort('connectionreset');
      }),
  });
  const count = async () =>
    (await api(page, 'GET', `/api/finance/transactions?from=${dayKey(daysAgo(3))}&to=${TODAY}&limit=1000`)).filter((t) => t.merchant === 'Padaria E2E').length;

  await page.getByRole('button', { name: 'Lançar gasto' }).click();
  const sheet = page.getByRole('dialog', { name: 'Lançar gasto' });
  await sheet.getByPlaceholder('0,00').fill('18,90');
  await sheet.getByPlaceholder(/Padaria/).fill('Padaria E2E');
  await sheet.locator('button[type="submit"]').click();
  await expect(sheet).toContainText('Não deu para confirmar se gravou');
  expect(await count(), 'o servidor já tinha gravado').toBe(1);
  await sheet.locator('button[type="submit"]').click();
  await expect(page.getByText('Esse gasto já estava lançado')).toBeVisible();
  expect(await count(), 'reenvio não duplica').toBe(1);
  await context.close();
});

test('valores ocultos: nenhuma aba, lista ou diálogo mostra dinheiro', async ({ browser }) => {
  const { context, page } = await openSession(browser, PHONE);
  await api(page, 'PATCH', '/api/finance/settings', { hide_values: true });
  try {
    for (const [aba, name] of [['', 'Resumo'], ['movimentacoes', 'Movimentações'], ['organizacao', 'Organização']]) {
      await page.goto(aba ? `/financas?aba=${aba}` : '/financas');
      await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('button', { name: 'Mostrar valores' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await page.locator('#root').innerText(), `aba ${name}`).not.toMatch(MONEY);
    }

    // lista de detalhe do Resumo
    await page.goto('/financas');
    const commitments = page.getByRole('button', { name: /Compromissos/ });
    if (await commitments.count()) {
      await commitments.first().click();
      await expect(page.locator('[data-radix-popper-content-wrapper]')).toBeVisible();
      expect(await page.locator('[data-radix-popper-content-wrapper]').innerText(), 'compromissos').not.toMatch(MONEY);
      await page.keyboard.press('Escape');
    }

    // detalhe de um lançamento
    await page.goto('/financas?aba=movimentacoes');
    await panel(page).getByRole('button', { name: /Mercado E2E/ }).click();
    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    expect(await detail.innerText(), 'detalhe do lançamento').not.toMatch(MONEY);
    await page.keyboard.press('Escape');

    // diálogos que pedem valor não mostram o número
    await page.goto('/financas?aba=dividas');
    await page.getByTestId('debt-row').filter({ hasText: 'Dívida E2E' }).getByRole('button', { name: 'Paguei' }).click();
    const pay = page.getByRole('dialog', { name: /Registrar pagamento/ });
    await expect(pay.locator('input')).toHaveAttribute('type', 'password');
    expect(await pay.innerText(), 'diálogo de baixa').not.toMatch(MONEY);
    await page.keyboard.press('Escape');

    await page.goto('/financas');
    await page.getByRole('button', { name: 'Atualizar saldo' }).click();
    await expect(page.getByRole('dialog').locator('input')).toHaveAttribute('type', 'password');
  } finally {
    await api(page, 'PATCH', '/api/finance/settings', { hide_values: false });
  }
  await context.close();
});
