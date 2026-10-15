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

async function setupMocks(page, {
  guidance = FRESH_GUIDANCE,
  guidanceStatus = 200,
  projects = CANONICAL_PROJECTS,
  initialUpdates = {},
  initialTasks = [],
  onCompleteNextStepOverride = null,
} = {}) {
  const currentProjects = JSON.parse(JSON.stringify(projects));
  const updatesState = { ...initialUpdates };
  const tasksState = [...initialTasks];
  const capturedCalls = {
    completeNextStep: [],
    createdTasks: [],
    patchedProjects: [],
  };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
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

    if (path === '/api/projects' && method === 'GET') {
      return json(route, currentProjects);
    }

    if (path.startsWith('/api/projects/') && path.endsWith('/complete-next-step') && method === 'POST') {
      const slugOrId = path.split('/')[3];
      const project = currentProjects.find((p) => p.slug === slugOrId || p.id === slugOrId);
      const postData = req.postDataJSON() || {};
      capturedCalls.completeNextStep.push({ slugOrId, postData });

      if (onCompleteNextStepOverride) {
        return onCompleteNextStepOverride(route, { project, postData, currentProjects, updatesState });
      }

      if (!project) return route.fulfill({ status: 404, body: 'Not found' });

      const oldStep = project.next_step;
      project.next_step = '';
      const update = {
        id: `up-${Date.now()}`,
        project_id: project.id,
        date: '2026-09-09',
        summary: `Concluído: ${oldStep}`,
        source: 'conclusao',
        created_by: 'joao',
        created_at: new Date().toISOString(),
      };
      if (!updatesState[project.id]) updatesState[project.id] = [];
      if (!updatesState[project.slug]) updatesState[project.slug] = updatesState[project.id];
      updatesState[project.id].unshift(update);

      return json(route, {
        project,
        update,
        completed_step: oldStep,
      });
    }

    if (path.startsWith('/api/projects/') && path.endsWith('/updates')) {
      const slugOrId = path.split('/')[3];
      const project = currentProjects.find((p) => p.slug === slugOrId || p.id === slugOrId);
      const projKey = project?.id || slugOrId;

      if (method === 'GET') {
        return json(route, updatesState[projKey] || []);
      }
      if (method === 'POST') {
        const body = req.postDataJSON() || {};
        const update = {
          id: `up-${Date.now()}`,
          project_id: projKey,
          date: '2026-09-09',
          summary: body.summary || 'Avanço',
          source: body.source || 'manual',
          created_by: body.created_by || 'joao',
          created_at: new Date().toISOString(),
        };
        if (!updatesState[projKey]) updatesState[projKey] = [];
        updatesState[projKey].unshift(update);
        return json(route, update, 201);
      }
    }

    if (path.startsWith('/api/projects/') && method === 'PATCH') {
      const slugOrId = path.split('/')[3];
      const project = currentProjects.find((p) => p.slug === slugOrId || p.id === slugOrId);
      if (!project) return route.fulfill({ status: 404, body: 'Not found' });
      const patchData = req.postDataJSON() || {};
      Object.assign(project, patchData);
      capturedCalls.patchedProjects.push({ slugOrId, patchData });
      return json(route, project);
    }

    if (path.startsWith('/api/projects/') && method === 'GET') {
      const slugOrId = path.split('/')[3];
      const found = currentProjects.find((p) => p.slug === slugOrId || p.id === slugOrId);
      if (found) return json(route, found);
      return route.fulfill({ status: 404, body: 'Not found' });
    }

    if (path === '/api/tasks' && method === 'GET') {
      return json(route, tasksState);
    }

    if (path === '/api/tasks' && method === 'POST') {
      const taskBody = req.postDataJSON() || {};
      const newTask = {
        id: `task-${Date.now()}`,
        ...taskBody,
      };
      tasksState.push(newTask);
      capturedCalls.createdTasks.push(newTask);
      return json(route, newTask, 201);
    }

    if (path === '/api/gamification') {
      return json(route, { level: 1, level_name: 'Iniciante', xp_total: 0, next_level_xp: 100, progress_pct: 0, achievements: [] });
    }
    if (path === '/api/captures/pending-count') return json(route, { count: 0 });
    if (path === '/api/habits' || path.startsWith('/api/habits?')) return json(route, []);
    if (path === '/api/habit-logs' || path.startsWith('/api/habit-logs?')) return json(route, []);
    if (path === '/api/wellness' || path.startsWith('/api/wellness?')) return json(route, []);
    if (path === '/api/user/settings') return json(route, { id: 'default' });

    return route.continue();
  });

  return {
    currentProjects,
    updatesState,
    tasksState,
    capturedCalls,
  };
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

  test('sem overflow horizontal em 390, 768, 1024, 1365 e 1440', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

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

    const priorityPanel = page.locator('section').filter({ hasText: 'O que vem primeiro' });
    const abrirBtn = priorityPanel.getByRole('button', { name: 'Abrir frente Praxis' });
    await expect(abrirBtn).toBeVisible();
    await abrirBtn.click();

    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Praxis' })).toBeVisible();
    await expect(page.getByText('O app do dia.')).toBeVisible();
  });

  test('empty guidance: exibe copy exata sem esconder a lista de frentes', async ({ page }) => {
    await setupMocks(page, { guidance: { date: '2026-09-09', fresh: false, priorities: [] } });
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByText('O Sêneca ainda não atualizou a ordem de hoje. Suas frentes continuam disponíveis abaixo.')
    ).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Suas frentes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir frente Praxis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir frente GoFluxo' })).toBeVisible();
  });

  test('error guidance: erro de rede/API nunca esconde a lista de frentes', async ({ page }) => {
    await setupMocks(page, { guidanceStatus: 500 });
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByText('Não foi possível carregar a recomendação do dia. Suas frentes continuam disponíveis abaixo.')
    ).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Suas frentes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir frente Praxis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir frente RCA' })).toBeVisible();
  });

  test('subfrente Animália aparece aninhada abaixo de GoFluxo e abre drawer', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    const animaliaRow = frontsList.getByRole('button', { name: 'Abrir frente Animália' });
    await expect(animaliaRow).toBeVisible();
    await expect(animaliaRow.getByText('Cliente · GoFluxo')).toBeVisible();
    await expect(animaliaRow.getByText('Bloqueada')).toBeVisible();

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

    const closeBtn = page.getByRole('button', { name: 'Close' });
    await closeBtn.click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('texto restrito da lista e ausência completa de drag / Kanban legados', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Arraste para mudar o estado')).not.toBeVisible();
    await expect(page.getByText('máx. 2')).not.toBeVisible();
    await expect(page.getByText('Foco agora')).not.toBeVisible();

    await expect(page.getByText('Ser o cockpit simples do dia a dia do João.')).not.toBeVisible();
    await expect(page.getByText('Jota Fit + continuidade das frentes')).not.toBeVisible();
    await expect(page.getByText('Usar a nova visão de Frentes no fluxo real.')).not.toBeVisible();

    await expect(page.getByText('Em curso').first()).toBeVisible();
    await expect(page.getByText('Depois').first()).toBeVisible();
    await expect(page.getByText('Pausado').first()).toBeVisible();
  });
});

test.describe('Frentes - Fase 3 E2E (Detalhe simples e execução protegida)', () => {
  test('modo leitura padrão: drawer abre sem formulário completo e com primeira dobra clara', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Abre drawer da Praxis
    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente Praxis' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Título e subtítulo em linguagem natural
    await expect(dialog.getByRole('heading', { name: 'Praxis' })).toBeVisible();
    await expect(dialog.getByText(/Produto · Em curso · Foco · No ar/)).toBeVisible();

    // Primeira dobra em linguagem natural
    await expect(dialog.getByRole('heading', { name: 'Onde ficou' })).toBeVisible();
    await expect(dialog.getByText('Produto ativo e em evolução.')).toBeVisible();

    await expect(dialog.getByRole('heading', { name: 'Mexendo agora' })).toBeVisible();
    await expect(dialog.getByText('Jota Fit + continuidade das frentes')).toBeVisible();

    await expect(dialog.getByRole('heading', { name: 'Próximo passo' })).toBeVisible();
    await expect(dialog.getByText('Usar a nova visão de Frentes no fluxo real.')).toBeVisible();

    // Ações operacionais presentes no detalhe
    await expect(dialog.getByRole('button', { name: 'Começar no Modo Foco' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Fiz isso' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Editar estado' })).toBeVisible();

    // Formulário completo de edição NÃO deve estar aberto por padrão
    await expect(dialog.locator('#project-kind')).not.toBeVisible();
    await expect(dialog.locator('#project-column')).not.toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Salvar estado' })).not.toBeVisible();
  });

  test('campos vazios são omitidos honestamente no modo leitura', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // CatálogoZap tem blocked_note e current_slice vazios
    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente CatálogoZap' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Sem bloqueio na frente -> "Travado por" não deve ser renderizado
    await expect(dialog.getByRole('heading', { name: 'Travado por' })).not.toBeVisible();
  });

  test('bloqueio real é exibido em destaque quando presente', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Animália tem blocked_note: "Aguardando aprovação do cliente"
    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente Animália' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(dialog.getByRole('heading', { name: 'Travado por' })).toBeVisible();
    await expect(dialog.getByText('Aguardando aprovação do cliente')).toBeVisible();
  });

  test('editar estado: revela formulário com seletor de coluna e cancelar restaura estado sem apagar dados', async ({ page }) => {
    const { capturedCalls } = await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente Praxis' }).click();

    const dialog = page.getByRole('dialog');

    // Clica em "Editar estado"
    await dialog.getByRole('button', { name: 'Editar estado' }).click();

    // Formulário revelado
    await expect(dialog.getByText('Editando estado da frente')).toBeVisible();
    await expect(dialog.locator('#project-column')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Salvar estado' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeVisible();

    // Altera o campo de objetivo provisoriamente
    const objField = dialog.locator('#project-objective');
    await objField.fill('Texto provisório não salvo');

    // Clica em Cancelar
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    // Volta ao modo leitura
    await expect(dialog.locator('#project-column')).not.toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Editar estado' })).toBeVisible();

    // Estado original foi preservado (objetivo fica em "Mais contexto")
    await dialog.getByRole('button', { name: /Mais contexto/ }).click();
    await expect(dialog.getByText('Ser o cockpit simples do dia a dia do João.')).toBeVisible();
    await expect(dialog.getByText('Texto provisório não salvo')).not.toBeVisible();
    expect(capturedCalls.patchedProjects.length).toBe(0);

    // Agora edita e salva de verdade
    await dialog.getByRole('button', { name: 'Editar estado' }).click();
    await dialog.locator('#project-column').click();
    await page.getByRole('option', { name: 'Pausado' }).click();
    await dialog.getByRole('button', { name: 'Salvar estado' }).click();

    // Verifica que enviou PATCH
    await expect(dialog.getByText('Editando estado da frente')).not.toBeVisible();
    expect(capturedCalls.patchedProjects.length).toBe(1);
    expect(capturedCalls.patchedProjects[0].patchData.column).toBe('pausado');
  });

  test('foco manual: Começar no Modo Foco cria tarefa com copy Frentes apenas sob demanda e navega para /foco', async ({ page }) => {
    const { capturedCalls } = await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    // Antes do clique, nenhuma tarefa foi criada automaticamente
    expect(capturedCalls.createdTasks.length).toBe(0);

    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente Praxis' }).click();

    const dialog = page.getByRole('dialog');
    const startFocusBtn = dialog.getByRole('button', { name: 'Começar no Modo Foco' });
    await expect(startFocusBtn).toBeVisible();
    await startFocusBtn.click();

    // Navega para /foco após criar a tarefa sob demanda
    await expect(page).toHaveURL(/.*\/foco\?taskId=.+&project=praxis/);

    // Tarefa foi criada com copy correta
    expect(capturedCalls.createdTasks.length).toBe(1);
    const createdTask = capturedCalls.createdTasks[0];
    expect(createdTask.source).toBe('project_focus:praxis');
    expect(createdTask.title).toBe('Usar a nova visão de Frentes no fluxo real.');
    expect(createdTask.description).toContain('Criada por Frentes para uma sessão de foco.');
    expect(createdTask.description).not.toContain('Criada pela Continuidade');
  });

  test('Fiz isso: envia expected_step, registra timeline, mantém frente aberta e preserva coluna/foco/live', async ({ page }) => {
    const { capturedCalls } = await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente Praxis' }).click();

    const dialog = page.getByRole('dialog');
    const completeBtn = dialog.getByRole('button', { name: 'Fiz isso' });
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    // Envia expected_step correto
    expect(capturedCalls.completeNextStep.length).toBe(1);
    expect(capturedCalls.completeNextStep[0].postData.expected_step).toBe('Usar a nova visão de Frentes no fluxo real.');

    // Toast de sucesso
    await expect(page.getByText('Feito e registrado')).toBeVisible();

    // Drawer permanece aberto
    await expect(dialog).toBeVisible();

    // Próximo passo concluído exibe fallback
    await expect(dialog.getByText('Próximo passo pendente de revisão.')).toBeVisible();

    // Subtítulo mantém coluna, foco e live intactos
    await expect(dialog.getByText(/Produto · Em curso · Foco · No ar/)).toBeVisible();

    // Timeline agora exibe a conclusão
    await expect(dialog.getByText('Concluído: Usar a nova visão de Frentes no fluxo real.')).toBeVisible();
  });

  test('conflito 409 NEXT_STEP_CHANGED: exibe mensagem clara, não apaga passo novo e atualiza o drawer', async ({ page }) => {
    await setupMocks(page, {
      onCompleteNextStepOverride: (route, { project }) => {
        // Simula que o Sêneca alterou o próximo passo em background
        project.next_step = 'Passo novo definido pelo Sêneca';
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'NEXT_STEP_CHANGED' }),
        });
      },
    });

    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente Praxis' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Fiz isso' }).click();

    // Mensagem clara de conflito
    await expect(page.getByText('O próximo passo mudou')).toBeVisible();
    await expect(page.getByText('Feito e registrado')).not.toBeVisible();

    // Drawer permanece aberto e exibe o passo novo sem apagá-lo
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Passo novo definido pelo Sêneca')).toBeVisible();
  });

  test('timeline: avanço manual é registrado via POST e exibido na lista', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente Praxis' }).click();

    const dialog = page.getByRole('dialog');
    const updateInput = dialog.getByPlaceholder('Registrar um avanço curto…');
    await updateInput.fill('Validamos o piloto comercial em campo');

    await dialog.getByRole('button', { name: 'Registrar' }).click();

    // Avanço registrado é exibido
    await expect(dialog.getByText('Validamos o piloto comercial em campo')).toBeVisible();
  });

  test('persistência e reload: alteração de estado no drawer permanece após recarregar a página', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/frentes');
    await page.waitForLoadState('domcontentloaded');

    const frontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    await frontsList.getByRole('button', { name: 'Abrir frente Praxis' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Editar estado' }).click();
    await dialog.locator('#project-column').click();
    await page.getByRole('option', { name: 'Pausado' }).click();
    await dialog.getByRole('button', { name: 'Salvar estado' }).click();

    // Recarrega a página
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Na lista, Praxis agora aparece como Pausado
    const updatedFrontsList = page.locator('section').filter({ hasText: 'Suas frentes' });
    const praxisRow = updatedFrontsList.getByRole('button', { name: 'Abrir frente Praxis' });
    await expect(praxisRow.getByText('Pausado')).toBeVisible();

    // No drawer, o estado persiste como Pausado
    await praxisRow.click();
    await expect(page.getByRole('dialog').getByText(/Pausado/)).toBeVisible();
  });
});
