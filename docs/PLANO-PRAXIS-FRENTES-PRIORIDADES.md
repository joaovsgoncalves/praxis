# Praxis — Frentes e Prioridade Diária

> **Execução:** implementar uma fase por vez com uma CLI de código em nível `high`; A.N.A. faz QA de especificação, código, navegador e produção antes de autorizar a fase seguinte.

**Status:** aprovado para planejamento em 2026-09-09  
**Substitui como direção futura:** a UX Kanban descrita em `docs/PLANO-PRAXIS-PROJETOS.md`  
**Rota atual:** `/projetos`  
**Rota canônica proposta:** `/frentes`

## 1. Objetivo

Transformar a atual aba **Continuidade** em **Frentes**, uma tela que permita ao João:

1. descobrir em poucos segundos o que merece atenção agora;
2. visualizar todas as frentes duráveis sem ler o contexto de todas;
3. abrir uma frente e recuperar onde parou, o próximo passo e o bloqueio;
4. executar ou registrar o próximo passo sem criar uma segunda lista de tarefas;
5. confiar que a prioridade exibida foi atualizada pelo Sêneca no dia atual.

A tela deixa de ser um Kanban horizontal e passa a usar **prioridade diária + lista vertical compacta + detalhe sob demanda**.

## 2. Problema observado e evidência atual

Na produção em 2026-09-09:

- o bloco `Foco agora` mostrava Praxis e Animália porque são pins manuais;
- a revisão do Sêneca indicava RCA como prioridade real do dia;
- cada card do mapa repetia tipo, estado, fatia, próximo passo e data;
- o quadro escondia colunas vazias no repouso e mostrava todas no início do drag;
- o card inteiro funcionava como alça de arraste;
- a mudança de largura durante o gesto invalidava a geometria percebida pelo usuário e tornava rolagem/arraste instáveis.

O sistema possui contexto suficiente, mas devolve sua complexidade ao usuário. A solução precisa separar:

- **recomendação diária do Sêneca**;
- **estado durável da frente**;
- **tarefa executável do dia**.

## 3. Promessa de produto

> Abra Frentes, veja o que vem primeiro e recupere qualquer área da sua vida sem reconstruir tudo na cabeça.

## 4. Modelo mental canônico

- **Frente** guarda continuidade: objetivo, situação, fatia atual, próximo passo, bloqueio e timeline.
- **Tarefa** guarda execução do dia.
- **Prioridade diária** é uma recomendação datada do Sêneca, não um pin permanente.
- João continua decidindo se começa, conclui ou muda o estado de uma frente.
- Sêneca pode mexer em tudo na Praxis, inclusive `focus`, `column`, `live`, `kind` e `objective` (decisão do João, 15/10/2026).
- O campo legado `focus` permanece no banco e na API nesta entrega, mas deixa de ser apresentado como a verdade principal da tela.

## 5. Escopo funcional

### 5.1 Entram na tela

Frentes duráveis:

- RCA;
- GoFluxo;
- Faculdade;
- Praxis;
- CatálogoZap;
- CarteiraZap;
- EncarteZap;
- Site pessoal;
- clientes ativos, como Animália, preservando `parent_slug`.

Jota Fit continua dentro da Praxis, não vira frente raiz.

### 5.2 Não entram na visão principal

- fases ou ondas de implementação;
- módulos internos dos aplicativos;
- tarefas individuais;
- ideias ainda não assumidas;
- objetivo, próximo passo e timeline expostos em todos os cards;
- métricas de produtividade;
- drag and drop;
- novas colunas ou novo gerenciador de projetos.

## 6. Arquitetura proposta

### 6.1 Preservar o domínio interno

Para reduzir risco e evitar migração cosmética:

- manter tabela `projects`;
- manter tabela `project_updates`;
- manter rotas internas `/api/projects`;
- manter os campos atuais e a proteção `NEXT_STEP_CHANGED`;
- apresentar **Frentes** somente na linguagem e na arquitetura de interface.

### 6.2 Nova entidade: orientação diária

Criar tabela separada para a recomendação estruturada do Sêneca:

```sql
CREATE TABLE IF NOT EXISTS continuity_guidance (
  date TEXT PRIMARY KEY,
  summary TEXT NOT NULL DEFAULT '',
  priorities_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'seneca',
  generated_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

A escrita é atômica por dia. A revisão das 13h50 substitui integralmente a orientação da manhã para a mesma data, evitando ranks parcialmente antigos.

### 6.3 Payload canônico

```json
{
  "date": "2026-09-09",
  "summary": "RCA vem primeiro porque há ação comercial com impacto imediato.",
  "generated_at": "2026-09-09T07:50:00-03:00",
  "priorities": [
    {
      "rank": 1,
      "action": "Disparar o follow-up da campanha para clientes com investimento adicional.",
      "reason_code": "income",
      "reason": "Protege renda e fechamento",
      "project_slug": "rca",
      "task_id": "opcional"
    },
    {
      "rank": 2,
      "action": "Conferir o processamento dos pedidos enviados e registrar somente divergências.",
      "reason_code": "client_commitment",
      "reason": "Compromisso comercial em andamento",
      "project_slug": "rca",
      "task_id": null
    }
  ]
}
```

Regras:

- zero a três itens;
- `rank` inteiro único entre 1 e 3;
- `action` obrigatória, curta e executável;
- `reason_code` em `deadline`, `income`, `academic`, `client_commitment`, `continuity`, `basic_need` ou `manual`;
- `reason` curta, sem culpa ou linguagem abstrata;
- `project_slug` opcional, mas deve existir quando informado;
- `task_id` opcional;
- uma mesma frente pode ocupar mais de uma posição quando a realidade do dia exigir;
- nenhum conteúdo bruto de e-mail, segredo, OTP ou dado sensível deve ser persistido;
- orientação de outro dia nunca aparece como se fosse atual.

### 6.4 Leitura da API

Novo endpoint autenticado:

```http
GET /api/projects/guidance/today
```

Resposta sem orientação fresca continua `200`:

```json
{
  "date": "2026-09-09",
  "summary": "",
  "generated_at": null,
  "priorities": [],
  "fresh": false
}
```

Resposta com orientação:

```json
{
  "date": "2026-09-09",
  "summary": "RCA vem primeiro porque há ação comercial com impacto imediato.",
  "generated_at": "2026-09-09T07:50:00-03:00",
  "fresh": true,
  "priorities": [
    {
      "rank": 1,
      "action": "Disparar o follow-up da campanha para clientes com investimento adicional.",
      "reason_code": "income",
      "reason": "Protege renda e fechamento",
      "project_slug": "rca",
      "task_id": "opcional",
      "project": {
        "id": "rca",
        "slug": "rca",
        "name": "RCA",
        "kind": "trabalho",
        "column": "andando",
        "parent_slug": ""
      }
    }
  ]
}
```

A rota `/guidance/today` precisa ser registrada antes de `/:id` no Express.

### 6.5 Escrita do Sêneca

Não ampliar o script estreito de atualização por frente para uma escrita multi-registro parcial. Criar um produtor separado e versionado:

```text
scripts/seneca-praxis-guidance-sync.py
scripts/tests/test_seneca_praxis_guidance_sync.py
```

O script:

1. lê um JSON completo por `stdin`;
2. aceita override `PRAXIS_DB` somente para teste;
3. valida todo o payload antes de escrever;
4. abre transação SQLite;
5. verifica os `project_slug` informados;
6. faz `INSERT ... ON CONFLICT(date) DO UPDATE` de um único registro;
7. faz rollback integral em qualquer erro;
8. não aceita nem altera `focus`, `column`, `live`, `kind` ou `objective`;
9. retorna JSON curto com `ok`, `date`, `priority_count` e `updated`;
10. nunca imprime o payload inteiro em logs.

O cron existente `seneca:continuidade-do-dia` será editado, não duplicado. Depois de atualizar a continuidade das frentes, ele chama o novo script uma vez com a orientação estruturada do dia.

## 7. Arquitetura da interface

### 7.1 Nome e navegação

- menu: `Frentes`;
- título mobile: `Frentes`;
- título da página: `Frentes`;
- descrição: `Veja o que vem primeiro e onde cada área ficou.`;
- rota canônica: `/frentes`;
- `/projetos` redireciona para `/frentes` com `replace` para preservar links antigos.

### 7.2 Primeiro bloco: O que vem primeiro

Hierarquia:

1. prioridade 1 em destaque;
2. prioridades 2 e 3 compactas;
3. motivo explícito em linguagem humana;
4. horário da última atualização;
5. clique abre a frente relacionada quando houver `project_slug`;
6. se houver `task_id`, o CTA leva para Hoje, sem concluir nem iniciar nada automaticamente.

Estado sem orientação fresca:

> O Sêneca ainda não atualizou a ordem de hoje. Suas frentes continuam disponíveis abaixo.

Proibido usar os pins legados como fallback silencioso. Prioridade velha precisa parecer ausente, não atual.

### 7.3 Segundo bloco: Suas frentes

Lista vertical estável, sem reordenar diariamente. Grupos:

1. **Trabalho e compromissos**: `trabalho` e clientes raiz;
2. **Formação**: `estudo`;
3. **Construção própria**: `produto`.

Subfrentes aparecem abaixo do pai usando `parent_slug`, sem repetir contexto.

Cada linha mostra somente:

- nome;
- tipo ou relação com a frente pai quando necessário;
- estado curto;
- indicador de bloqueio, somente se houver;
- posição recomendada do dia, somente se a frente estiver na orientação fresca;
- chevron de abertura.

Não mostrar na lista:

- `current_slice`;
- `next_step`;
- `status_summary`;
- `objective`;
- `last_reviewed_at`;
- botões `Modo foco` e `Fiz isso`;
- pin de foco;
- seletor de coluna;
- arraste.

Rótulos visuais, sem mudar valores no banco:

- `andando` → `Em curso`;
- `radar` → `Depois`;
- `aguardando` → `Aguardando`;
- `pausado` → `Pausado`.

### 7.4 Detalhe sob demanda

O painel lateral passa a abrir em modo de leitura. Ordem:

1. nome, tipo e estado;
2. **Onde ficou**: `status_summary` e `current_slice`;
3. **Próximo passo**: `next_step`;
4. bloqueio, somente quando existir;
5. ações `Começar no Modo Foco` e `Fiz isso`;
6. timeline;
7. botão secundário `Editar estado` para revelar o formulário completo.

A alteração de coluna fica somente nesse painel. O formulário administrativo não aparece aberto por padrão.

### 7.5 Segurança de execução

- `Fiz isso` sempre envia `expected_step` com o texto que o usuário viu;
- se o Sêneca tiver alterado o próximo passo, `NEXT_STEP_CHANGED` preserva o estado novo;
- iniciar Modo Foco continua materializando uma tarefa somente após clique humano;
- o cron não cria tarefas e não inicia ações;
- recomendação desatualizada não pode apagar ou concluir um passo novo.

## 8. Direção visual

Fonte consultada: UI/UX Pro Max local, commit `b7e3af80f6e331f6fb456667b82b12cade7c9d35`.

Princípios aproveitados:

- progressive disclosure;
- lista com chaves estáveis;
- foco gerenciado no painel lateral;
- controles rotulados;
- atualização dinâmica anunciada com `aria-live="polite"`;
- validação em 390, 768, 1024 e 1440 px.

A recomendação genérica de azul/verde foi rejeitada porque conflita com a marca existente. Preservar:

- tema escuro atual;
- dourado Praxis apenas para ação e prioridade;
- superfícies discretas já definidas em `docs/DESIGN.md`;
- Lucide para ícones;
- sem novas fontes, gradientes, glows ou sistema visual paralelo.

Regras de densidade:

- uma ação visual dominante na primeira dobra;
- linhas com alvo mínimo de 44 px;
- no máximo dois níveis tipográficos por linha;
- nenhuma rolagem horizontal;
- nenhuma coluna que apareça ou desapareça durante interação;
- estado, prioridade e bloqueio não dependem apenas de cor.

## 9. Fases de implementação

## Fase 0 — Contrato e API de orientação diária

**Objetivo:** criar armazenamento e leitura seguros sem alterar a UI existente.

**Executor:** uma CLI de código `high`.  
**QA:** A.N.A. revisa contrato, migração, testes e API local/produção.

### Arquivos

- Criar: `api/continuityGuidance.js`
- Criar: `api/continuity-guidance.test.mjs`
- Modificar: `api/server.js`
- Modificar: `api/routes/projects.js`
- Modificar: `api/test-support/helpers.mjs` somente se o helper precisar inicializar o novo schema

### Tarefas

1. Escrever testes RED para criação idempotente da tabela.
2. Escrever testes RED para orientação válida com zero, um, dois e três itens.
3. Escrever testes RED para ranks duplicados, rank fora de 1–3, ação vazia, `reason_code` inválido e `project_slug` inexistente.
4. Escrever teste RED para substituição atômica da orientação do mesmo dia.
5. Escrever teste RED garantindo que orientação de ontem não seja retornada como fresca hoje.
6. Implementar `initContinuityGuidanceSchema(db)`.
7. Implementar validação, upsert e leitura hidratada.
8. Registrar `GET /guidance/today` antes de `GET /:id`.
9. Garantir resposta `200` vazia quando não houver orientação fresca.
10. Rodar toda a suíte da API para provar ausência de regressão em projetos, timeline, foco e race condition.

### Gates

```bash
node --test api/continuity-guidance.test.mjs
npm run test:api
npm run lint
npm run typecheck
npm run build
```

### Ship da fase

A mudança é retrocompatível e deve subir antes da ponte do Sêneca:

```bash
npm run prepush:check
npm run ship:api
```

### Done quando

- schema nasce automaticamente em banco vazio e banco existente;
- endpoint retorna vazio honesto antes da primeira orientação;
- payload inválido não escreve nada;
- orientação de ontem não aparece como atual;
- `projects` e `project_updates` permanecem intactos;
- API local e pública respondem com o mesmo contrato autenticado.

## Fase 1 — Ponte estruturada do Sêneca

**Objetivo:** fazer o cron existente persistir a prioridade diária consumível pela Praxis.

**Executor:** uma CLI de código `high` cria script e testes; A.N.A. aplica e verifica a edição do cron existente.  
**QA:** A.N.A. valida script em banco temporário, payload real, job e leitura pela API.

### Arquivos

- Criar: `scripts/seneca-praxis-guidance-sync.py`
- Criar: `scripts/tests/test_seneca_praxis_guidance_sync.py`
- Modificar externamente, com backup e ferramenta suportada: job `a4d12777cc7b` (`seneca:continuidade-do-dia`)
- Não criar cron novo

### Tarefas

1. Escrever testes RED com SQLite temporário.
2. Cobrir validação completa antes da transação.
3. Cobrir rollback integral.
4. Cobrir upsert da manhã e substituição da tarde.
5. Cobrir ausência de vazamento do payload no stdout.
6. Implementar o script versionado com `PRAXIS_DB` de teste e path de produção por default.
7. Acrescentar ao prompt do job a produção de um payload canônico após a análise.
8. Reforçar no prompt que prioridade é recomendação datada e não alteração de `focus`/`column`.
9. Manter a saída humana do Sêneca curta e coerente com o payload estruturado.
10. Atualizar o job existente via `cronjob_manage` ou `hermes cron edit`, nunca por edição SQLite direta.
11. Ler o job de volta e comparar ID, schedule, delivery, modelo, script e prompt.
12. Executar uma rodada controlada e conferir a API sem expor segredo.

### Gates

```bash
python3 -m unittest discover -s scripts/tests -p 'test_seneca_praxis_guidance_sync.py'
python3 scripts/seneca-praxis-guidance-sync.py < /tmp/guidance-valid.json
```

Depois, leitura autenticada:

```bash
curl -fsS -H "Authorization: Bearer $FORJA_API_KEY" \
  http://127.0.0.1:18556/api/projects/guidance/today
```

### Done quando

- não existe cron novo;
- o mesmo job continua em 07h50 e 13h50 Fortaleza;
- o job escreve de zero a três prioridades em uma única transação;
- manhã e tarde não acumulam itens antigos;
- falha de sync não altera foco, coluna nem tarefas;
- a API mostra data, horário, motivo e ações da execução controlada;
- o texto entregue pelo Sêneca não contradiz a prioridade persistida.

## Fase 2 — Nova tela Frentes

**Objetivo:** substituir Kanban e pins por uma tela compacta de prioridade + nomes das frentes.

**Executor:** uma CLI de código `high`.  
**QA:** A.N.A. revisa especificação, visual, responsividade, teclado, console e produção.

### Arquivos

- Criar: `src/components/projects/ContinuityPriorityPanel.jsx`
- Criar: `src/components/projects/FrontsList.jsx`
- Criar: `src/components/projects/FrontRow.jsx`
- Criar: `e2e/fronts.spec.js`
- Modificar: `src/pages/Projects.jsx`
- Modificar: `src/lib/projects.js`
- Modificar: `src/api/projectsApi.js`
- Modificar: `src/App.jsx`
- Modificar: `src/lib/praxisNav.js`
- Modificar: `src/components/layout/MobileTopBar.jsx`
- Modificar: `e2e/mobile-390.spec.js`
- Remover quando não houver referência: `src/components/projects/ProjectBoard.jsx`
- Remover quando não houver referência: `src/components/projects/ProjectCard.jsx`

### Tarefas

1. Adicionar método `guidanceToday()` ao client.
2. Criar os mapas de grupo, estado e motivo em `src/lib/projects.js`.
3. Criar view model estável para raízes e subfrentes.
4. Criar painel de orientação com estados loading, fresh, empty e error.
5. Garantir que erro da orientação não esconda a lista de frentes.
6. Criar lista vertical agrupada usando IDs estáveis.
7. Mostrar somente os campos permitidos na linha compacta.
8. Conectar clique da prioridade e da linha ao painel lateral existente.
9. Remover `DragDropContext`, `Droppable`, `Draggable`, scroll horizontal e pins da página.
10. Trocar copy e navegação para `Frentes`.
11. Criar `/frentes` e redirect `/projetos` → `/frentes`.
12. Garantir que o endpoint de orientação não entre no cache offline como verdade atual.
13. Cobrir mobile 390 px sem overflow.
14. Cobrir ausência dos textos `Arraste para mudar o estado` e `máx. 2`.
15. Cobrir que `next_step` não aparece na lista antes de abrir uma frente.

### Gates

```bash
npm run lint
npm run typecheck
npm run build
npm run test:api
PRAXIS_E2E_BASE=http://127.0.0.1:4173 \
  PRAXIS_E2E_PASSWORD="$PRAXIS_APP_PASSWORD" \
  npx playwright test e2e/fronts.spec.js --project=mobile-390
```

QA de navegador:

- 390 × 844;
- 768 × 1024;
- 1024 × 768;
- 1365 × 681;
- 1440 × 900;
- `documentElement.scrollWidth <= clientWidth`;
- abrir prioridade;
- abrir frente raiz;
- abrir Animália dentro de GoFluxo;
- fechar painel e confirmar retorno de foco;
- console sem erro crítico.

### Done quando

- João identifica a prioridade 1 sem ler o mapa inteiro;
- todas as frentes canônicas permanecem acessíveis;
- lista padrão não exibe objetivo, fatia ou próximo passo;
- não existe drag nem rolagem horizontal;
- `/projetos` continua funcionando por redirect;
- prioridade ausente ou com erro não vira orientação velha;
- mobile e desktop passam pelos critérios objetivos.

## Fase 3 — Detalhe simples, execução segura e rollout

**Objetivo:** concluir a experiência sob demanda, preservar o fluxo de execução e fechar produção.

**Executor:** uma CLI de código `high`.  
**QA:** A.N.A. faz revisão em duas etapas, smoke autenticado e browser QA completo.

### Arquivos

- Modificar: `src/components/projects/ProjectDetailDialog.jsx`
- Modificar: `src/pages/Projects.jsx`
- Modificar: `api/projects.test.mjs`
- Modificar: `e2e/fronts.spec.js`
- Modificar: `docs/PLANO-PRAXIS-PROJETOS.md`
- Modificar: `docs/COMO-JOAO-USA.md`
- Modificar: `docs/ONDE-ESTAMOS.md`
- Atualizar após ship: contrato `praxis-product-ops/references/praxis-continuidade-contract.md`

### Tarefas

1. Fazer o painel abrir em modo de leitura.
2. Exibir primeiro estado, situação, fatia, próximo passo e bloqueio real.
3. Manter timeline abaixo do contexto operacional.
4. Colocar formulário completo atrás de `Editar estado`.
5. Manter seletor de estado somente dentro do painel.
6. Manter `Modo Foco` somente no detalhe e na prioridade quando a ação corresponder ao próximo passo atual.
7. Fazer `Fiz isso` enviar sempre `expected_step`.
8. Tratar `NEXT_STEP_CHANGED` com refresh e mensagem clara, sem apagar estado novo.
9. Validar que concluir passo não move, pausa nem encerra a frente.
10. Validar que o cron não cria tarefa automaticamente.
11. Executar Stage 1: conformidade integral com este PRD.
12. Executar Stage 2: qualidade, acessibilidade, robustez, manutenção e regressões.
13. Atualizar documentação somente com o que estiver realmente em produção.
14. Commitar, fazer push, ship da API se mudou e deploy frontend canônico.
15. Rodar smoke e browser QA na URL canônica.

### Gates locais

```bash
npm run test:api
npm run lint
npm run typecheck
npm run build
npm run prepush:check
```

### Ship

```bash
npm run ship:api     # somente se api/ mudou nesta fase
npm run deploy:prod
npm run smoke:prod
```

### Gates de produção

- `https://dopraxis.vercel.app/frentes` abre autenticado;
- `https://dopraxis.vercel.app/projetos` redireciona para `/frentes`;
- API pública devolve orientação fresca autenticada;
- prioridade 1 e motivo aparecem corretamente;
- nomes das nove frentes canônicas estão presentes;
- detalhes só aparecem depois do clique;
- alterar estado pelo painel persiste após reload;
- `Fiz isso` registra timeline;
- simulação de `NEXT_STEP_CHANGED` mantém o passo novo;
- rolagem horizontal ausente;
- drag ausente;
- console sem erro crítico;
- working tree limpa;
- `origin/main` contém o commit entregue.

### Done quando

O João consegue abrir Frentes e responder em até cinco segundos:

1. o que vem primeiro;
2. por que vem primeiro;
3. onde abrir para recuperar qualquer outra frente.

## 10. Critérios de aceite globais

### Produto

- [ ] A tela se chama Frentes.
- [ ] RCA, GoFluxo, Faculdade, Praxis, produtos próprios e clientes ativos estão representados.
- [ ] Jota Fit continua dentro da Praxis.
- [ ] Prioridade diária não depende de pins manuais.
- [ ] Prioridade mostra data/hora e motivo.
- [ ] No máximo três ações aparecem no topo.
- [ ] Orientação velha nunca aparece como atual.
- [ ] A lista mostra nomes e estados, não contexto completo.
- [ ] Detalhes aparecem somente sob demanda.
- [ ] Tarefa continua sendo a unidade de execução diária.

### UX

- [ ] Uma ação principal domina a primeira dobra.
- [ ] Nenhum Kanban ou drag permanece.
- [ ] Nenhuma rolagem horizontal em mobile ou desktop.
- [ ] Alvos clicáveis têm pelo menos 44 px.
- [ ] Estado, prioridade e bloqueio não dependem somente de cor.
- [ ] O painel lateral prende o foco e o devolve ao elemento de origem.
- [ ] Loading, erro, vazio e dado fresco são distinguíveis.
- [ ] Não há jargão como `rank`, `source` ou `priority_date` na UI.

### Dados e automação

- [ ] Escrita diária é atômica.
- [ ] Payload inválido não altera o registro anterior.
- [ ] O cron continua sem permissão para alterar campos reservados.
- [ ] Nenhum cron novo é criado.
- [ ] A rodada da tarde substitui a da manhã para a mesma data.
- [ ] O app ignora orientação de outra data.
- [ ] O job humano e o payload estruturado não se contradizem.

### Regressão

- [ ] `project_updates` preservado.
- [ ] `complete-next-step` preservado.
- [ ] `NEXT_STEP_CHANGED` preservado.
- [ ] máximo de dois `focus` legado preservado na API.
- [ ] criação/reuso da tarefa de Modo Foco preservados.
- [ ] concluir tarefa não encerra a frente.
- [ ] `/projetos` preservado por redirect.

## 11. Riscos e mitigação

### Prioridade ficar velha

**Risco:** o cron falha e a tela continua mostrando ontem.  
**Mitigação:** endpoint retorna somente a data de Fortaleza atual; sem fallback silencioso.

### Sêneca produzir prioridade e texto diferentes

**Risco:** DM e app apontam para ações conflitantes.  
**Mitigação:** o mesmo raciocínio produz saída humana e payload; teste controlado compara ambos.

### Migração rodar depois do cron

**Risco:** script tenta escrever antes da tabela existir.  
**Mitigação:** ship obrigatório da Fase 0 antes da Fase 1; script falha fechado e não cria schema por conta própria.

### Orientação parcial

**Risco:** uma prioridade nova e duas antigas.  
**Mitigação:** um registro JSON por dia, validado e substituído em transação única.

### Nova tela virar outro dashboard denso

**Risco:** campos voltam a aparecer na lista por conveniência.  
**Mitigação:** teste E2E afirma ausência de `next_step` antes do clique e limita os campos do `FrontRow`.

### Remoção do drag tirar controle

**Risco:** João não encontra como alterar estado.  
**Mitigação:** seletor fica no detalhe, com rótulo explícito e persistência testada.

### Mudança de rota quebrar links

**Risco:** bookmarks antigos em `/projetos`.  
**Mitigação:** redirect permanente no app com `replace`; smoke das duas rotas.

## 12. Decisões que não precisam ser reabertas durante a execução

1. O nome de produto é **Frentes**.
2. A tabela interna continua `projects`.
3. Não haverá Kanban.
4. Não haverá drag.
5. O contexto completo fica no painel lateral.
6. A prioridade do Sêneca é datada e separada de `focus`.
7. O cron não cria tarefas.
8. Nenhum cron novo será criado.
9. O visual continua no design system atual da Praxis.
10. Cada fase usa uma CLI `high` diferente e só avança após QA da A.N.A.

## 13. Ordem de disparo

- `arrocha fase 0`: contrato e API.
- Após QA aprovado: `arrocha fase 1`: ponte do Sêneca.
- Após QA aprovado: `arrocha fase 2`: nova tela Frentes.
- Após QA aprovado: `arrocha fase 3`: detalhe, execução segura e rollout.

Não iniciar código apenas porque o PRD foi criado. O gatilho de execução continua sendo explícito por fase ou um pedido explícito para executar todas as fases em sequência.
