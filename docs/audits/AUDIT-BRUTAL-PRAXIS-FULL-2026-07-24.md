# Auditoria brutal — Praxis FULL
**Data:** 2026-07-24 · **HEAD:** `ca7ff9a` · **Auditor:** Antigravity (Gemini 3.6 high)  
**Repo:** `/root/.hermes/workspaces/apps/praxis`  

---

## Veredito (10 linhas)

O **Praxis** está em um estado surpreendentemente avançado e operacional no core de produto (autenticação segura por cookie HttpOnly, execução do dia com NowBlock, histórico, foco wall-clock, nutrição com diário de macros e treinos no modelo logbook). O plano principal de ondas (1–24) e as extensões recentes foram postas no ar com sucesso. No entanto, o produto sofre de **fissuras de arquitetura e inconsistências de acabamento visual** causadas pelo acúmulo de transições não concluídas. A principal ferida aberta é a convivência de **código dual entre Rituais legados e Hábitos Compostos**, onde componentes do Dashboard ainda invocam endpoints mortos de rituais. Além disso, há um "estrangulamento" visual injustificado nas telas de Treinos e Nutrição (`max-w-xl` no desktop), scrollbars nativas cinzas que quebram o tema Obsidian/Gold no Windows, jargão proibido ("Cockpit") no código, timers de descanso de treino que zeram ao recarregar a página e falhas de resiliência no scanner de código de barras. O aplicativo está pronto para uso diário, mas exige um saneamento brutal de dívida técnica e alinhamento do design system para atingir o padrão premium e impecável esperado.

---

## P0 — quebra uso / confunde / mentira na UI

| # | Área | Onde (path:linha) | Sintoma | Dor | Evidência | Fix (1–2 frases) |
|---|------|-------------------|---------|-----|-----------|------------------|
| 1 | Hoje / Abertura | [OpeningRitualCollapsible.jsx](file:///root/.hermes/workspaces/apps/praxis/src/components/dashboard/OpeningRitualCollapsible.jsx#L32) | Widget de Abertura do Dia busca e cria itens na API antiga `/api/rituals` (tabela `rituals`). | Usuário interage com a Abertura no Hoje, mas os itens criados não sincronizam com os Hábitos Compostos da aba Hábitos. | `praxisApi.rituals.list({ date: today })` na L32 e `fromTemplate('day_open')` na L42 chamam rotas legadas de rituais. | Refatorar `OpeningRitualCollapsible` para operar sobre `habits` com `kind === 'compound'` e descontinuar a API de rituais. |
| 2 | Nutrição / Barcode | [BarcodeScannerModal.jsx](file:///root/.hermes/workspaces/apps/praxis/src/components/nutrition/BarcodeScannerModal.jsx#L54) | Leitor de código de barras falha na busca externa e descarta o código escaneado. | Ao escanear um alimento brasileiro não cadastrado na OpenFoodFacts, o usuário vê erro genérico e perde o código numérico, precisando redigitar do zero. | Tratamento de erro reseta a modal sem injetar o código numérico escaneado no formulário `FoodFormModal`. | Na falha de lookup, pré-preencher automaticamente o campo de código de barras no formulário manual de criação de alimento. |
| 3 | Treinos / Descanso | [WorkoutSessionView.jsx](file:///root/.hermes/workspaces/apps/praxis/src/components/workouts/WorkoutSessionView.jsx#L122) | Timer de descanso do treino é mantido 100% em estado React volátil (`useState`). | Se o usuário mudar de aplicativo ou a página recarregar durante o descanso entre séries, o cronômetro zera e perde o tempo restante. | Estado `restSecondsLeft` não é persistido em `localStorage` nem recalculado via timestamp de término (`restEndsAt`). | Persistir `restEndsAt` em `localStorage` (`praxis:workout:rest-ends-at`) e calcular tempo restante por relógio de parede. |
| 4 | Falar / Captura Voz | [VoiceCapture.jsx](file:///root/.hermes/workspaces/apps/praxis/src/pages/VoiceCapture.jsx#L180) | Falha no upload de áudio limpa os chunks e perde o texto reconhecido pelo browser. | Gravação longa em conexão instável falha no upload e o usuário perde a transcrição local sem chance de copiar o texto falado. | `VoiceCapture.jsx` zera `audioChunks` e estados locais ao capturar exceção de rede antes de expor o fallback. | Salvar o texto reconhecido via Web Speech API no estado local em caso de falha de upload, permitindo copiar o texto bruto. |
| 5 | API / Cache Stale | [praxisClient.js](file:///root/.hermes/workspaces/apps/praxis/src/api/praxisClient.js#L103) | Requisições GET com erro de rede retornam cache antigo com `__stale: true` de forma silenciosa. | O usuário vê dados antigos após falha de conexão sem nenhum aviso visual de que a informação está desatualizada. | `praxisClient.js:106` anexa `__stale: true`, mas a maioria das telas (ex: `Goals.jsx`, `Compras.jsx`) ignora essa flag. | Padronizar a leitura de `__stale` no React Query e exibir o `OfflineBanner` no topo de qualquer página que servir dados desatualizados. |
| 6 | Modo Foco / Pausa | [Focus.jsx](file:///root/.hermes/workspaces/apps/praxis/src/pages/Focus.jsx#L150) | Pausar a sessão de foco altera `isPaused: true` mas mantém o `endsAt` original no `localStorage`. | Ao pausar o timer por 10 min e recarregar a aba, a sessão calcula o tempo esgotado porque usou o `endsAt` antigo. | Evento de pause não limpa `endsAt` e não congela o `timeLeft` no payload do `localStorage`. | No evento de pause, congelar `timeLeft` e setar `endsAt = null`; no resume, recalcular `endsAt = Date.now() + timeLeft * 1000`. |

---

## P1 — design / naming / consistência cross-aba

| # | Área | Onde (path:linha) | Sintoma | Dor | Evidência | Fix (1–2 frases) |
|---|------|-------------------|---------|-----|-----------|------------------|
| 1 | Hoje / Design System | [AvoidanceCockpit.jsx](file:///root/.hermes/workspaces/apps/praxis/src/components/dashboard/AvoidanceCockpit.jsx#L18) | Componente e arquivo nomeados como `AvoidanceCockpit`. | Violação direta do diretrio formal em `docs/DESIGN.md` ("Sem jargão: cockpit, painel operacional"). | Export `export default function AvoidanceCockpit` e import em `Dashboard.jsx:17`. | Renomear o arquivo e componente para `AvoidanceWidget.jsx` ou `OQueEstouEvitandoCard.jsx`. |
| 2 | Treinos & Nutrição | [Treinos.jsx](file:///root/.hermes/workspaces/apps/praxis/src/pages/Treinos.jsx#L109), [Nutricao.jsx](file:///root/.hermes/workspaces/apps/praxis/src/pages/Nutricao.jsx#L100) | Container com `max-w-xl` (576px) em telas desktop. | Em telas grandes, ir para Treinos ou Nutrição causa encolhimento abruto da página, criando uma coluna estreita e squished. | `Treinos.jsx:109` e `Nutricao.jsx:100` usam `max-w-xl` enquanto `Dashboard.jsx` usa `max-w-6xl`. | Remover `max-w-xl` e padronizar todas as telas de produto com o container `.praxis-page` (`max-w-6xl` / `max-w-5xl`). |
| 3 | Hábitos Compostos | [CompoundHabitsWidget.jsx](file:///root/.hermes/workspaces/apps/praxis/src/components/dashboard/CompoundHabitsWidget.jsx#L268) | Código de Hábitos Compostos usa internamente o nome `rituals` nas variáveis. | Confusão mental e inconsistência de domínio entre o conceito unificado (Compostos) e a entidade legada (Rituais). | `const rituals = compounds.map(...)` na L268 e `grouped[tod].map(ritual => ...)` na L395. | Refatorar os nomes de variáveis internas de `ritual/rituals` para `compound/compounds` ou `routine/routines`. |
| 4 | Navegação | [praxisNav.js](file:///root/.hermes/workspaces/apps/praxis/src/lib/praxisNav.js#L10) | Divergência na ordem e agrupamento de links entre Sidebar desktop e MobileNav. | Usuário decora a posição de um item no computador (ex: Compras) e ele está em posição diferente no celular. | `praxisNav.js` define uma ordem, mas `Sidebar.jsx` reordena manualmente os itens em grupos separados. | Fazer a `Sidebar.jsx` e a `MobileNav.jsx` renderizarem estritamente a lista unificada exposta por `praxisNav.js`. |
| 5 | Design System / Craft | [select.jsx](file:///root/.hermes/workspaces/apps/praxis/src/components/ui/select.jsx#L20), [index.css](file:///root/.hermes/workspaces/apps/praxis/src/index.css#L1) | Scrollbars cinzas nativas do Windows visíveis em menus Select e trilhos de treino. | Elementos retangulares de SO desktop quebram a estética dark obsidian e gold do aplicativo. | Ausência de estilização global `scrollbar-width: thin` e classe `.praxis-hide-scrollbar` nos viewports de Select. | Aplicar regras globais de scrollbar escura no `index.css` e `.praxis-hide-scrollbar` nos rails horizontais de chips. |
| 6 | Empty States | [History.jsx](file:///root/.hermes/workspaces/apps/praxis/src/pages/History.jsx#L65), [Achievements.jsx](file:///root/.hermes/workspaces/apps/praxis/src/pages/Achievements.jsx#L80) | Empty states renderizados com cartões simples ad-hoc sem ícones ou tipografia padronizada. | Sensação de descontinuidade de design / "cara de IA" entre as abas principais e as abas de apoio. | `History.jsx:65` renderiza apenas um `<p>` simples dentro de um `Card` sem estrutura de `PraxisEmptyState`. | Substituir todas as estruturas de tela vazia ad-hoc pelo componente unificado `PraxisEmptyState`. |

---

## P2 — dívida / dead code / polish

| # | Área | Onde (path:linha) | Sintoma | Dor | Evidência | Fix (1–2 frases) |
|---|------|-------------------|---------|-----|-----------|------------------|
| 1 | Dead Code / UI | [Rituais.jsx](file:///root/.hermes/workspaces/apps/praxis/src/pages/Rituais.jsx#L1) | Arquivo `src/pages/Rituais.jsx` (12.9 KB) completamente inacessível. | Código morto acumulando poeira e aumentando o tamanho do bundle. | `App.jsx:102` redireciona `/rituais` para `/habitos-tarefas?tab=habits`; nenhum arquivo importa `Rituais.jsx`. | Excluir o arquivo `src/pages/Rituais.jsx`. |
| 2 | Dead Code / API | [rituals.js](file:///root/.hermes/workspaces/apps/praxis/api/routes/rituals.js#L1) | Rota de API backend `api/routes/rituals.js` mantendo CRUD para a tabela `rituals`. | Manutenção de código e tabelas duplicadas no SQLite (`rituals` vs `habits` com `kind=compound`). | Endpoint `/api/rituals` ativo no `server.js:22` sem utilidade no modelo mental de Hábitos Compostos. | Deprecar e remover `api/routes/rituals.js` após refatorar o widget de abertura do Hoje. |
| 3 | Infra / Database | [api/forja.db](file:///root/.hermes/workspaces/apps/praxis/api/forja.db) | Arquivos legados de banco de dados (`forja.db`, `forja.db-wal`, `forja.db-shm`) presentes na pasta `api/`. | Sujeira no repositório local e risco de scripts conectarem no banco antigo. | `forja.db` ocupa 475 KB na pasta `api/` mesmo após migração transparente para `praxis.db`. | Adicionar `forja.db*` ao `.gitignore` e deletar os arquivos legados de dev. |
| 4 | Performance | [CompoundHabitsWidget.jsx](file:///root/.hermes/workspaces/apps/praxis/src/components/dashboard/CompoundHabitsWidget.jsx#L264) | Query de hábitos compostos executa polling a cada 30 segundos (`refetchInterval: 30000`). | Consumo desnecessário de bateria e requisições HTTP redundantes com o app em segundo plano. | `refetchInterval: 30000` na chamada `useQuery`. | Remover `refetchInterval` e confiar na invalidação por mutação do React Query. |
| 5 | Performance | [VoiceCapture.jsx](file:///root/.hermes/workspaces/apps/praxis/src/pages/VoiceCapture.jsx#L54) | Polling de capturas pendentes (`staleTime: 20_000`) rodando continuamente na tela de voz. | Requisições repetidas ao backend enquanto a tela está ociosa. | `useQuery` de `pendingCount` atualiza a cada 20s. | Aumentar `staleTime` para `60_000` e invalidar a query explicitamente após criar/processar uma captura. |
| 6 | Polish / Feedback | [praxisLevelUp.js](file:///root/.hermes/workspaces/apps/praxis/src/lib/praxisLevelUp.js#L12) | Toasts de ganho de nível (Level Up) usam o Sonner genérico sem estilo da marca Praxis. | Oportunidade perdida de criar um momento gratificante e visualmente marcante ao evoluir de nível. | `toast('Level Up! ...')` sem customização de borda ouro ou partículas. | Envolver as notificações de Level Up em um `toast.custom` estilizado com o visual Obsidian/Gold Ember. |

---

## Por módulo (checklist)

### 1. Hoje / Dashboard
- [x] **OK:** `NowBlock` com decisão rápida do dia, snooze (+15m, amanhã) e ação direta de conclusão funcional.
- [x] **OK:** `HeroDay` com hora em tempo real (`HH:mm`), saudação dinâmica e resumo de progresso limpo.
- [x] **OK:** Banners táticos de tarefas atrasadas (`OverdueTasksBanner`) e capturas pendentes (`CapturePendingBanner`).
- [ ] **PODRE:** `AvoidanceCockpit` utiliza o jargão proibido "cockpit" (viola `docs/DESIGN.md`).
- [ ] **PODRE:** `OpeningRitualCollapsible` consome a API legada `/api/rituals` em vez da estrutura de Hábitos Compostos.
- [ ] **PODRE:** Polling agressivo de 30s no `CompoundHabitsWidget` sobrecarrega a rede.

### 2. Tarefas / Hábitos
- [x] **OK:** Filtros por escopo (Hoje, Atrasadas, Futuras, Todas) perfeitamente integrados com URL deep links (`?tab=tasks&scope=overdue`).
- [x] **OK:** Suporte a justificativa de "Não rolou" / "Não hoje" armazenando motivos e notas no log do hábito.
- [x] **OK:** Diálogos de limpeza de ruído (`NoiseCleanupDialog`) e arquivamento em massa (`TaskBulkArchiveDialog`).
- [ ] **PODRE:** Código do formulário e de filtros ainda carrega nomes técnicos residuais.
- [ ] **PODRE:** Visual de scrollbar cinza nativa do Windows em menus dropdown de filtro de frequência.

### 3. Falar / Capturas
- [x] **OK:** Gravador de voz com timer visual, contagem de bytes e botão flutuante global (`VoiceCaptureButton`).
- [x] **OK:** Suporte a transcrição via Web Speech API nativa do navegador como fallback.
- [x] **OK:** Fila de capturas pendentes com status de parse por IA.
- [ ] **PODRE:** Em erros de envio de áudio, a UI descarta a transcrição feita pelo navegador sem permitir ao usuário copiar o texto.
- [ ] **PODRE:** Falta de indicador de progresso mais claro durante a etapa de parse por IA quando a conexão está lenta.

### 4. Revisão Semanal
- [x] **OK:** Navegação por semanas (semana atual, anteriores e futuras) calculando datas de segunda a domingo.
- [x] **OK:** Agregação automática de métricas da semana (tarefas concluídas, dias de nutrição logados e hábitos cumpridos).
- [x] **OK:** Gerador de tarefas para a próxima semana a partir dos focos anotados.
- [ ] **PODRE:** Ausência de salvamento de rascunho em `localStorage` (se a página atualizar antes de clicar em Salvar, perde as anotações).
- [ ] **PODRE:** Emojis de avaliação (`SCORE_OPTIONS`) sofrem quebra de linha em telas mobile estreitas (390px).

### 5. Treinos
- [x] **OK:** Estrutura completa de programa (PPL, ABC, etc.), dias e exercícios com alvos de séries, reps e descanso.
- [x] **OK:** Modo de sessão ativa (`WorkoutSessionView`) com registro de peso/reps em tempo real e historórico de cargas anteriores.
- [x] **OK:** Suporte a substituição de exercícios e badges de equipamentos (elástico, halter, barra, máquina).
- [ ] **PODRE:** Container restrito a `max-w-xl` (576px), ficando estrangulado e visualmente inconsistente no desktop.
- [ ] **PODRE:** Cronômetro de descanso entre séries zera se o aplicativo for minimizado ou a página for atualizada.

### 6. Nutrição
- [x] **OK:** Diário alimentar diário com separação por refeições (Café, Almoço, Lanche, Jantar).
- [x] **OK:** Barras de macros (Proteínas, Carbos, Gorduras) com cálculo automático de gramas e calorias.
- [x] **OK:** Registro de peso corporal e metas personalizadas de calorias.
- [ ] **PODRE:** Container restrito a `max-w-xl` no desktop, criando um efeito sanfona ao navegar entre abas.
- [ ] **PODRE:** Leitor de código de barras descarta o código escaneado se o produto não for encontrado na API externa.

### 7. Metas, Foco, Compras, Ideias, Histórico, Config, Conquistas
- [x] **OK:** Modo Foco com cronômetro Pomodoro, persistência wall-clock em `localStorage` e vinculação de tarefa.
- [x] **OK:** Lista de compras com separação de pendentes/comprados e wishlist.
- [x] **OK:** Aba Ideias com promoção direta de ideia para tarefa ativa.
- [ ] **PODRE:** Histórico e Conquistas utilizam telas de empty state inconsistentes (sem a shell do `PraxisEmptyState`).
- [ ] **PODRE:** Pausar o timer de foco pode causar descompasso de tempo ao reabrir a aba se o `endsAt` não for limpo no `localStorage`.

### 8. Nav mobile + sidebar + deep links
- [x] **OK:** MobileNav fixo no rodapé com resposta tátil (haptics) e alvos de toque adequados (≥44px).
- [x] **OK:** Suporte completo a deep links com preservação de query params na navegação.
- [ ] **PODRE:** Divergência na ordem dos itens entre `praxisNav.js` e o menu da `Sidebar.jsx` no desktop.
- [ ] **PODRE:** Existência de rotas redirecionadas (`/rituais` e `/mais`) mantendo links legados.

### 9. Auth / Login / Landing copy e estados
- [x] **OK:** Autenticação robusta por cookie HttpOnly via middleware de sessão SQLite.
- [x] **OK:** Tela de login limpa com alternância de visibilidade de senha.
- [x] **OK:** Landing page direta apresentando a proposta de valor do produto.
- [ ] **PODRE:** Mensagem de erro na tela de login exibe a string de exceção técnica bruta em caso de falha de rede.

### 10. API inconsistências, rotas mortas, auth edge cases
- [x] **OK:** Autenticação unificada suportando sessão no browser e `Bearer FORJA_API_KEY` para scripts automatizados.
- [x] **OK:** Rotas modulares organizadas em `api/routes/*.js`.
- [ ] **PODRE:** Rota de API `api/routes/rituals.js` mantida no servidor sem necessidade após a unificação dos Hábitos Compostos.
- [ ] **PODRE:** Falta de notificação na UI quando requisições GET falham e retornam dados stale do cache offline.

### 11. Design system DESIGN.md vs real
- [x] **OK:** Paleta de cores fiável ao token Obsidian Dark (`#09090B`) e Gold Ember (`#F59E0B`).
- [x] **OK:** Tipografia com Space Grotesk nos títulos (`.forja-title`) e Inter no corpo.
- [ ] **PODRE:** Uso do termo jargão "Cockpit" em `AvoidanceCockpit.jsx` contrariando as regras anti-slop do `docs/DESIGN.md`.
- [ ] **PODRE:** Scrollbars cinzas nativas do sistema operacional expostas em Selects dropdown e carrosséis horizontais.

---

## Lotes sugeridos pro implementador (Claude/Codex)

### Lote 1 — Saneamento de Rituais & Abertura (Fix P0 & Dead Code)
- **Escopo:** 
  1. Migrar `OpeningRitualCollapsible.jsx` para ler e criar `habits` onde `kind === 'compound'`.
  2. Deletar `src/pages/Rituais.jsx`.
  3. Descontinuar a rota `api/routes/rituals.js` e remover seu registro no `api/server.js`.
  4. Renomear as variáveis internas `rituals` em `CompoundHabitsWidget.jsx` para `compounds`.
- **Done-when:** Widget de Abertura no Hoje sincroniza 100% com os compostos da aba Hábitos e não existe nenhuma chamada para `/api/rituals`.

### Lote 2 — Ajuste de Jargão & Design System Shell Unificado (Fix P1)
- **Escopo:**
  1. Renomear `AvoidanceCockpit.jsx` para `AvoidanceWidget.jsx` e remover todas as menções à palavra "cockpit".
  2. Alterar o container principal de `Treinos.jsx` e `Nutricao.jsx` de `max-w-xl` para `.praxis-page` (`max-w-6xl` / `max-w-5xl`), tornando a navegação entre abas fluida no desktop.
  3. Adicionar estilos de scrollbar fina e escura no `index.css` e aplicar `.praxis-hide-scrollbar` nosSelects e rails de treino.
- **Done-when:** Nenhuma ocorrência da palavra "cockpit" na UI/código de exibição e todas as páginas ocupam a mesma largura de layout no desktop.

### Lote 3 — Resiliência de Estado: Treinos & Foco (Fix P0)
- **Escopo:**
  1. Implementar persistência do timer de descanso em `WorkoutSessionView.jsx` salvando `restEndsAt` em `localStorage` (`praxis:workout:rest-ends-at`).
  2. Ajustar a lógica de pausa do timer de foco em `Focus.jsx` para congelar `timeLeft` e setar `endsAt = null` no `localStorage` durante a pausa, recalculando `endsAt` ao retomar.
- **Done-when:** Recarregar a página durante o descanso do treino mantém o cronômetro correto e pausar o foco não consome o tempo configurado.

### Lote 4 — UX de Nutrição & Barcode (Fix P0/P1)
- **Escopo:**
  1. Alterar `BarcodeScannerModal.jsx` para, em caso de falha de busca na API externa, abrir o `FoodFormModal` pré-preenchendo o campo de código de barras escaneado.
  2. Ajustar o alinhamento das abas de nutrição (`PRIMARY_TABS`) para evitar estouro em telas mobile de 390px.
- **Done-when:** Escanear um código de barras desconhecido abre o formulário de cadastro com o código numérico pronto para salvar.

### Lote 5 — Voz / Capturas & Resiliência de Erro (Fix P0/P1)
- **Escopo:**
  1. Em `VoiceCapture.jsx`, presenvar o texto capturado pelo Web Speech API no estado em caso de erro de upload de áudio, exibindo um campo para o usuário copiar a transcrição.
  2. Padronizar as mensagens de erro de rede na autenticação/login para exibir textos amigáveis em vez de exceções JS brutas.
- **Done-when:** Falhas de conexão ao gravar voz não fazem o usuário perder o que falou.

### Lote 6 — Padronização de Empty States & Navegação (Fix P1/P2)
- **Escopo:**
  1. Refatorar as telas de vazios em `History.jsx`, `Achievements.jsx` e `Ideas.jsx` para utilizarem a estrutura unificada `PraxisEmptyState`.
  2. Sincronizar a exibição dos itens da `Sidebar.jsx` e `MobileNav.jsx` usando a mesma fonte da verdade (`praxisNav.js`).
- **Done-when:** Todas as abas sem dados apresentam a mesma linguagem visual com ícone, título, descrição e botão de ação.

### Lote 7 — Limpeza de Banco de Dados & Performance (Fix P2)
- **Escopo:**
  1. Remover os arquivos `forja.db*` da pasta `api/` e adicionar a regra no `.gitignore`.
  2. Remover `refetchInterval: 30000` de `CompoundHabitsWidget.jsx` e ajustar os `staleTime` das queries para evitar polling desnecessário.
- **Done-when:** O repositório está limpo de bancos legados e a aba fica em repouso sem disparar requisições HTTP a cada 30s.

---

## Não reabrir (já OK)

1. **Autenticação e Sessão Web**: Cookie HttpOnly `praxis_sid`, fluxo de login/logout, suporte a Bearer token para automações (Hermes) e proteção de rotas ativas na Vercel/VPS.
2. **NowBlock & Decisão do Dia**: Pick de tarefas prioritárias no Hoje com opções de conclusão, snooze (+15m, amanhã) e adição rápida.
3. **Foco Wall-Clock**: Timer de foco principal resiste a atualizações de página usando timestamp de término real no `localStorage`.
4. **Logbook de Treinos**: Registro de séries com histórico da sessão anterior, exercícios personalizados e marcação de concluído por série.
5. **Cálculo de Macros e Metas de Nutrição**: Diário alimentar com cálculo em tempo real de Proteínas, Carbos e Gorduras e meta calórica diária.
