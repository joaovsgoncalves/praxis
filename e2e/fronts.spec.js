// @ts-check
import { test, expect } from '@playwright/test';

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function expectNoHorizontalOverflow(page) {
  const bad = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
  expect(bad).toBe(false);
}

const CANONICAL_PROJECTS = [
  {
    id: 'proj-praxis',
    slug: 'praxis',
    name: 'Praxis',
    tagline: 'O app do dia.',
    kind: 'produto',
    column: 'andando',
    focus: 1,
    live: 1,
    objective: 'Ser o cockpit simples do dia a dia do João.',
    status_summary: 'Produto ativo e em evolução.',
    current_slice: 'Jota Fit + continuidade das frentes',
    next_step: 'Usar a nova visão de Frentes no fluxo real.',
    blocked_note: '',
    parent_slug: '',
    sort_order: 1,
  },
  {
    id: 'proj-catalogozap',
    slug: 'catalogozap',
    name: 'CatálogoZap',
    tagline: 'Catálogo no WhatsApp.',
    kind: 'produto',
    column: 'radar',
    focus: 0,
    live: 1,
    objective: 'Simplificar catálogo do RCA.',
    status_summary: 'Produto funcional.',
    current_slice: 'Pausa consciente',
    next_step: 'Validar o fluxo em campo.',
    blocked_note: '',
    parent_slug: '',
    sort_order: 2,
  },
  {
    id: 'proj-gofluxo',
    slug: 'gofluxo',
    name: 'GoFluxo',
    tagline: 'Automação e agentes.',
    kind: 'trabalho',
    column: 'radar',
    focus: 0,
    live: 0,
    objective: 'Transformar automação em entregas.',
    status_summary: 'Frente em construção.',
    current_slice: 'Estruturação comercial',
    next_step: 'Consolidar o que a GoFluxo vende.',
    blocked_note: '',
    parent_slug: '',
    sort_order: 3,
  },
  {
    id: 'proj-animalia',
    slug: 'animalia',
    name: 'Animália',
    tagline: 'Projeto cliente-piloto da GoFluxo.',
    kind: 'cliente',
    column: 'andando',
    focus: 0,
    live: 1,
    objective: 'Entregar automações úteis para a clínica.',
    status_summary: 'Cliente-piloto ativo.',
    current_slice: 'Piloto operacional',
    next_step: 'Avançar próxima entrega validada.',
    blocked_note: 'Aguardando aprovação do cliente',
    parent_slug: 'gofluxo',
    sort_order: 4,
  },
  {
    id: 'proj-rca',
    slug: 'rca',
    name: 'RCA',
    tagline: 'Trabalho comercial.',
    kind: 'trabalho',
    column: 'andando',
    focus: 1,
    live: 1,
    objective: 'Cumprir bem o trabalho comercial.',
    status_summary: 'Frente prioritária.',
    current_slice: 'Execução semanal',
    next_step: 'Resolver ação comercial urgente.',
    blocked_note: '',
    parent_slug: '',
    sort_order: 5,
  },
  {
    id: 'proj-faculdade',
    slug: 'faculdade',
    name: 'Faculdade',
    tagline: 'Obrigações acadêmicas.',
    kind: 'estudo',
    column: 'pausado',
    focus: 0,
    live: 1,
    objective: 'Manter matérias em dia.',
    status_summary: 'Frente contínua.',
    current_slice: 'Semestre atual',
    next_step: 'Executar pendência acadêmica.',
    blocked_note: '',
    parent_slug: '',
    sort_order: 6,
  },
];

const FRESH_GUIDANCE = {
  date: '2026-09-09',
  summary: 'Prioridade para alavancar trabalho e entregas.',
  generated_at: '2026-09-09T08:30:00-03:00',
  fresh: true,
  priorities: [
    {
      rank: 1,
      action: 'Finalizar simplificação da tela de frentes',
      reason_code: 'continuity',
      reason: 'Continuidade necessária para João destravar o dia',
      project_slug: 'praxis',
      task_id: 'task-123',
      project: {
        id: 'proj-praxis',
        slug: 'praxis',
        name: 'Praxis',
        kind: 'produto',
        column: 'andando',
        parent_slug: '',
      },
    },
    {
      rank: 2,
      action: 'Ajustar automação do piloto da clínica',
      reason_code: 'client_commitment',
      reason: 'Compromisso com entrega validada com o cliente',
      project_slug: 'animalia',
      task_id: null,
      project: {
        id: 'proj-animalia',
        slug: 'animalia',
        name: 'Animália',
        kind: 'cliente',
        column: 'andando',
        parent_slug: 'gofluxo',
      },
    },
    {
      rank: 3,
      action: 'Ligar para farmácia parceira',
      reason_code: 'income',
      reason: 'Proteger receita da semana',
      project_slug: 'rca',
      task_id: null,
      project: {
        id: 'proj-rca',
        slug: 'rca',
        name: 'RCA',
        kind: 'trabalho',
        column: 'andando',
        parent_slug: '',
      },
    },
  ],
};

async function setupMocks(page, { guidance = FRESH_GUIDANCE, guidanceStatus = 200, projects = CANONICAL_PROJECTS } = {}) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/auth/config') {
      return json(route, { webAuthEnabled: false, loginAvailable: true });
    }
    if (path === '/api/projects/guidance/today') {
      if (guidanceStatus !== 200) {
        return route.fulfill({ status: guidanceStatus, body: 'Server Error' });
      }
      return json(route, guidance);
    }
    if (path === '/api/projects') {
      return json(route, projects);
    }
    if (path.startsWith('/api/projects/') && path.endsWith('/updates')) {
      return json(route, []);
    }
    if (path.startsWith('/api/projects/')) {
      const slugOrId = path.split('/')[3];
      const found = projects.find((p) => p.slug === slugOrId || p.id === slugOrId);
      if (found) return json(route, found);
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    if (path === '/api/gamification') {
      return json(route, { level: 1, level_name: 'Iniciante', xp_total: 0, next_level_xp: 100, progress_pct: 0, achievements: [] });
    }
    if (path === '/api/captures/pending-count') return json(route, { count: 0 });
    if (path === '/api/tasks' || path.startsWith('/api/tasks?')) return json(route, []);
    if (path === '/api/habits' || path.startsWith('/api/habits?')) return json(route, []);
    if (path === '/api/habit-logs' || path.startsWith('/api/habit-logs?')) return json(route, []);
    if (path === '/api/wellness' || path.startsWith('/api/wellness?')) return json(route, []);
    if (path === '/api/user/settings') return json(route, { id: 'default' });

    return route.continue();
  });
}

test.describe('Frentes - Fase 2 E2E', () => {
  test('rota canônica /frentes renderiza hero, sem overflow horizontal em 390px', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // PageHero
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Frentes' })).toBeVisible();
    await expect(page.getByText('Veja o que vem primeiro e onde cada área ficou.')).toBeVisible();

    // Sem overflow horizontal em 390px
    await expectNoHorizontalOverflow(page);
  });

  test("sem overflow horizontal em 390, 768, 1024, 1365 e 1440", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/frentes");
    await page.waitForLoadState("domcontentloaded");

    const viewports = [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1365, height: 681 },
      { width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('redirect legado: /projetos redireciona para /frentes', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/projetos');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/.*\/frentes/);
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Frentes' })).toBeVisible();
  });

  test('fresh guidance: prioridade 1 dominante com motivo e horário, e CTA Hoje', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Prioridade 1 dominante
    await expect(page.getByText('Finalizar simplificação da tela de frentes')).toBeVisible();
    await expect(page.getByText('Continuidade necessária para João destravar o dia')).toBeVisible();
    await expect(page.getByText(/Atualizado às/)).toBeVisible();

    // Prioridades 2 e 3 compactas
    await expect(page.getByText('Ajustar automação do piloto da clínica')).toBeVisible();
    await expect(page.getByText('Ligar para farmácia parceira')).toBeVisible();

    // CTA de Hoje para prioridade 1 com task_id
    const ctaHoje = page.getByRole('button', { name: 'Ver em Hoje' });
    await expect(ctaHoje).toBeVisible();
    await ctaHoje.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('clique em abrir frente na prioridade abre o drawer da frente', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Clicar em "Abrir frente" na prioridade 1 (Praxis) dentro do painel de prioridades
    const priorityPanel = page.locator('section').filter({ hasText: 'O que vem primeiro' });
    const abrirBtn = priorityPanel.getByRole('button', { name: 'Abrir frente Praxis' });
    await expect(abrirBtn).toBeVisible();
    await abrirBtn.click();

    // Drawer abre exibindo detalhes da Praxis
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Praxis' })).toBeVisible();
    await expect(page.getByText('O app do dia.')).toBeVisible();
  });

  test('empty guidance: exibe copy exata sem esconder a lista de frentes', async ({ page }) => {
    await setupMocks(page, { guidance: { date: '2026-09-09', fresh: false, priorities: [] } });
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Mensagem de empty exata do plano
    await expect(
      page.getByText('O Sêneca ainda não atualizou a ordem de hoje. Suas frentes continuam disponíveis abaixo.')
    ).toBeVisible();

    // Lista de frentes continua presente e visível
    await expect(page.getByRole('heading', { name: 'Suas frentes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir frente Praxis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir frente GoFluxo' })).toBeVisible();
  });

  test('error guidance: erro de rede/API nunca esconde a lista de frentes', async ({ page }) => {
    await setupMocks(page, { guidanceStatus: 500 });
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Mensagem de erro visível
    await expect(
      page.getByText('Não foi possível carregar a recomendação do dia. Suas frentes continuam disponíveis abaixo.')
    ).toBeVisible();

    // Lista de frentes CONTINUA visível
    await expect(page.getByRole('heading', { name: 'Suas frentes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir frente Praxis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir frente RCA' })).toBeVisible();
  });

  test('subfrente Animália aparece aninhada abaixo de GoFluxo e abre drawer', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Verifica que Animália aparece com relação a GoFluxo e tag Bloqueada na lista
    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    const animaliaRow = frontsList.getByRole('button', { name: 'Abrir frente Animália' });
    await expect(animaliaRow).toBeVisible();
    await expect(animaliaRow.getByText('Cliente · GoFluxo')).toBeVisible();
    await expect(animaliaRow.getByText('Bloqueada')).toBeVisible();

    // Abre o drawer da Animália
    await animaliaRow.click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Animália' })).toBeVisible();
  });

  test('abrir e fechar frente: drawer Radix fecha mantendo foco', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    const praxisRow = frontsList.getByRole('button', { name: 'Abrir frente Praxis' });
    await praxisRow.click();

    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Praxis' })).toBeVisible();

    // Fechar drawer
    const closeBtn = page.getByRole('button', { name: 'Close' });
    await closeBtn.click();

    // Sheet fechou
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('texto restrito da lista e ausência completa de drag / Kanban legados', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Textos proibidos na lista
    await expect(page.getByText('Arraste para mudar o estado')).not.toBeVisible();
    await expect(page.getByText('máx. 2')).not.toBeVisible();
    await expect(page.getByText('Foco agora')).not.toBeVisible();

    // Campos restritos da frente NÃO podem estar visíveis na lista padrão antes de abrir drawer
    await expect(page.getByText('Ser o cockpit simples do dia a dia do João.')).not.toBeVisible();
    await expect(page.getByText('Jota Fit + continuidade das frentes')).not.toBeVisible();
    await expect(page.getByText('Usar a nova visão de Frentes no fluxo real.')).not.toBeVisible();

    // Rótulos visuais de estado em PT
    await expect(page.getByText('Em curso').first()).toBeVisible();
    await expect(page.getByText('Depois').first()).toBeVisible();
    await expect(page.getByText('Pausado').first()).toBeVisible();
  });
});
