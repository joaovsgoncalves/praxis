# Auditoria brutal — Praxis rotinas/hábitos
Data: 2026-07-24 | HEAD: `08d6762` (feat(praxis): hábitos compostos no lugar de rituais)

## Veredito em 5 linhas
1. O commit `08d6762` criou o modelo no banco (`kind='compound'`, `parent_id`), mas deixou a interface e a criação pela metade.
2. No modal "Novo Hábito" (`HabitForm.jsx`), **não existe opção de criar hábito composto** nem de adicionar sub-passos; só é possível criar hábitos simples.
3. Visualmente o app **continua parecendo rituais**: `CompoundHabitsWidget` usa nomenclatura legada (`ritual`), agrupa estritamente por períodos legados ("Manhã", "Tarde", "Noite") e joga hábitos novos sem horário obrigatoriamente na "Manhã".
4. Há código ativo usando rotas legadas (`OpeningRitualCollapsible.jsx` chama `/api/rituals/from-template`), gravando na tabela antiga `rituals` em vez de criar hábitos compostos.
5. Um hábito composto nunca vira `done` no backend se tiver algum passo com "Não rolou" (`skipped`), mantendo o progresso e o status da rotina abertos para sempre.

---

## P0 — quebra uso / confunde João (tem que arrumar)

| # | Onde | Sintoma | Por que dói | Evidência no código | Fix proposto (1–2 frases) |
|---|------|---------|-------------|---------------------|---------------------------|
| 1 | `src/components/habits-tasks/HabitForm.jsx:20-181` | Modal "Novo Hábito" não tem opção de composto nem sub-passos. | Impossível criar uma rotina matinal/noturna pela UI. O João pediu hábitos compostos para substituir rituais, mas a interface só aceita hábito avulso. | `HabitForm.jsx` possui apenas campos de `title`, `description`, `frequency`, `category`, `streak_target`, `target_value`, `preferred_time`. Sem selector de `kind` ou array de `children`. | Adicionar seletor de tipo [Simples \| Composto] no `HabitForm`. Ao selecionar "Composto", exibir gerenciador de sub-passos (título e horário preferido por passo). |
| 2 | `src/components/dashboard/CompoundHabitsWidget.jsx:444-458` | Editar sub-passo do composto abre formulário isolado sem contexto. | Ao clicar no lápis de um sub-passo na rotina, abre o `HabitForm` comum sem vincular ao pai nem permitir reordenar os passos da rotina. | `onEditHabit={(habit) => setEditingHabit(habit)}` dispara o `HabitForm` genérico com `initial={editingHabit}` ignorando o contexto do composto. | Permitir edição rápida de passos (nome/horário) inline ou integrar a edição completa da árvore no formulário do Hábito Composto pai. |
| 3 | `api/routes/habits.js:105` | Hábito composto nunca atinge `day_outcome: 'done'` se um passo for "Não rolou". | Se João faz 3 passos e marca 1 como "Não rolou" (skip consciente), a rotina continua como `open` (incompleta), parecendo que o dia não foi registrado. | `day_outcome: children.length > 0 && completedSteps === children.length ? 'done' : 'open'`. Exige 100% de `completedSteps`, ignorando `skippedSteps`. | Considerar o composto como `done` (ou concluído/endereçado) quando `completedSteps + skippedSteps === children.length`. |
| 4 | `src/components/dashboard/OpeningRitualCollapsible.jsx:30-44` | Banner de Abertura do Dia consome rota antiga `/api/rituals/from-template`. | Ao instalar/usar o ritual de abertura no Dashboard, ele grava na tabela legada `rituals` em vez de criar um hábito composto na tabela `habits`. | `queryFn: () => praxisApi.rituals.list(...)` e `mutationFn: () => praxisApi.rituals.fromTemplate('day_open')`. | Refatorar `OpeningRitualCollapsible` (ou integrar no `CompoundHabitsWidget`) para invocar `POST /api/habits` com `kind='compound'`. |
| 5 | `src/components/dashboard/CompoundHabitsWidget.jsx:332` | Hábito composto recém-criado sem horário fica preso no grupo "🌅 Manhã". | Se o usuário criar uma rotina (ex: "Rotina de Estudo") sem definir o campo legado `time_of_day`, o widget força `morning` por padrão. | `const tod = ritual.time_of_day || 'morning'` agrupa arbitrariamente qualquer composto sem horário na Manhã. | Permitir compostos sem grupo rígido de horário ou agrupar por período derivado dos horários preferidos dos sub-passos. |

---

## P1 — design / naming / consistência

| # | Onde | Sintoma | Por que dói | Evidência no código | Fix proposto (1–2 frases) |
|---|------|---------|-------------|---------------------|---------------------------|
| 1 | `src/components/dashboard/CompoundHabitsWidget.jsx:40,268,331` | Terminologia "ritual" / "rituais" em todo o código do widget. | Inconsistência de modelo mental no código React. A migração foi para "hábitos compostos", mas o componente trata internamente como `ritual`. | `function CompoundHabitItem({ ritual ... })`, `const rituals = compounds.map...`, `id={`compound-habit-${ritual.id}-${habit.id}`}`. | Renomear props e variáveis internas de `ritual` para `compound` ou `compoundHabit`. |
| 2 | `src/pages/HabitsTasks.jsx:759-771` | Hábitos compostos renderizados em widget separado acima da lista de hábitos. | Quebra a premissa de que "composto visualmente = hábito expansível". Hoje é um card separado no topo com título "Outros hábitos" embaixo. | `<CompoundHabitsWidget collapsible compounds={compoundHabits} ... />` fica isolado antes da lista de `flatHabits`. | Integrar os hábitos compostos na própria lista principal de Hábitos como cartões expansíveis ordenáveis junto com os hábitos simples. |
| 3 | `api/routes/habits.js:260` & `listHabitTree:76-79` | Emoji do composto é armazenado em gambiarra na `description`. | Se o composto não veio da migração legada, a API tenta ler o emoji do campo `description`. Se o usuário adicionar uma descrição em texto, o emoji quebra ou vira `🔗`. | `const compoundDescription = kind === 'compound' && !description && emoji ? emoji : description;` e `emoji: legacy?.emoji || habit.description || '🔗'`. | Adicionar suporte limpo ao campo `emoji` no schema da tabela `habits` (ou em metadado JSON no hábito). |
| 4 | `src/pages/Dashboard.jsx:376` | Widget de hábitos compostos posicionado na coluna de "Contexto". | Hábitos compostos são a rotina de execução diária do usuário. Colocá-los abaixo de Nutrição e Wellness na barra lateral reduz sua visibilidade tática. | `<CompoundHabitsWidget compounds={compoundHabits} today={today} />` fica dentro do container `<section className="praxis-dashboard-context...">`. | Mover os compostos para a coluna de "Execução" ou unificá-los com o bloco de Hábitos Essenciais no Hoje. |
| 5 | `src/lib/praxisNav.js` / `App.jsx:102` | Rota `/rituais` redireciona silenciosamente para `/habitos-tarefas?tab=habits`. | O redirect funciona como shim de URL legacy, mas não há indicação na UI nem limpeza completa de menções a "Rituais". | `<Route path="/rituais" element={<Navigate to="/habitos-tarefas?tab=habits" replace />} />`. | Manter apenas o redirect passivo de URLs antigas e garantir zero referências no menu, links e textos do produto. |

---

## P2 — dívida / dead code / polish

| # | Onde | Sintoma | Por que dói | Evidência no código | Fix proposto (1–2 frases) |
|---|------|---------|-------------|---------------------|---------------------------|
| 1 | `src/pages/Rituais.jsx:1-245` | Arquivo de página `Rituais.jsx` continua existindo no projeto sem uso. | Dead code solto na base. Gera confusão em buscas do projeto (`grep`) e manutenção. | O arquivo existe em `src/pages/Rituais.jsx` mas nenhuma rota do `App.jsx` o renderiza (a rota `/rituais` faz `Navigate`). | Deletar o arquivo `src/pages/Rituais.jsx`. |
| 2 | `api/routes/rituals.js:1-181` | Endpoints backend `/api/rituals` continuam ativos no servidor Express. | Manter rotas ativas gravando na tabela legada `rituals` cria caminhos concorrentes de escrita e dívida técnica. | `createRitualsRouter` em `api/routes/rituals.js` exporta `POST /`, `PUT /:id`, `DELETE /:id`, `POST /from-template`. | Remover ou converter `api/routes/rituals.js` para um shim read-only que delega para `habits` com `kind='compound'`. |
| 3 | `src/lib/ritualTemplates.js:1-28` | Arquivo `ritualTemplates.js` com presets antigos. | Mantém definições legadas de templates de rituais com estrutura antiga. | Exporta `RITUAL_TEMPLATES` e IDs `day_open`, `day_close`. | Renomear/refatorar para `compoundHabitTemplates.js` gerando seeds direto para hábitos compostos. |
| 4 | `api/routes/habits.js:405-414` | Deletar um hábito composto desvincula sub-passos deixando-os soltos na lista. | Se o composto for excluído, os sub-passos (`parent_id = NULL`) viram hábitos simples avulsos na lista principal sem aviso. | `UPDATE habits SET parent_id = NULL, position_in_parent = NULL WHERE parent_id = ?`. | Na exclusão de um composto, oferecer opção de arquivar/deletar os sub-passos associados ou emitir aviso claro na UI. |
| 5 | `api/lib/dbInit.js:247-255` | Schema da tabela legada `rituals` ainda é criado em `CREATE TABLE IF NOT EXISTS`. | Mantém a tabela no schema para novas instalações. | `CREATE TABLE IF NOT EXISTS rituals (...)` em `dbInit.js`. | Manter apenas enquanto houver código de migração e planejar o `DROP TABLE rituals` em release futura. |

---

## Fluxo “Novo hábito” — o que falta pro composto

Passo a passo do gap de experiência na UI:

1. **Seletor de Tipo no Topo do Form (`HabitForm.jsx`):**
   - **Atual:** O formulário abre diretamente com campos de hábito simples.
   - **Falta:** Um toggle/tabs visual no topo do modal: **[ Hábito Simples ]** vs **[ Hábito Composto / Rotina ]**.

2. **Configuração da Rotina Pai (Composto):**
   - **Atual:** Inexistente.
   - **Falta:**
     - Título da Rotina (ex: "Rotina Matinal").
     - Emoji identificador (ex: 🌅, 🌙, ⚡).
     - Frequência da rotina (Diária, Dias úteis, Semanal).
     - Categoria de domínio (Wellness, Pessoal, etc.).

3. **Gerenciador Interativo de Sub-passos (Children):**
   - **Atual:** Impossível adicionar ou visualizar passos no cadastro.
   - **Falta:**
     - Bloco "Passos da Rotina" com botão "+ Adicionar passo".
     - Cada passo com input de Título (ex: "Sem celular"), Input de Horário Preferido opcional (ex: "07:00") e botão de exclusão.
     - Ordenação simples (subir/descer) dos passos na lista.

4. **Envio Atômico para a API (`onSubmit`):**
   - **Atual:** Envia apenas objeto flat para `POST /api/habits`.
   - **Falta:** Quando `kind === 'compound'`, enviar o payload completo:
     ```json
     {
       "title": "Rotina Matinal",
       "kind": "compound",
       "emoji": "🌅",
       "category": "wellness",
       "frequency": "daily",
       "children": [
         { "title": "Acordar no horário", "preferred_time": "06:30" },
         { "title": "Sem celular nos primeiros 30min", "preferred_time": "06:35" },
         { "title": "Banho gelado", "preferred_time": "07:00" }
       ]
     }
     ```
   - O endpoint `POST /api/habits` deve criar o hábito pai e seus sub-passos em uma única transação no banco.

---

## O que JÁ está OK (não reabrir)

- **Schema do Banco & Índices:** A tabela `habits` já possui as colunas `kind`, `parent_id` e `position_in_parent` com o índice `idx_habits_parent_position`.
- **Endpoint GET /api/habits (Leitura em Árvore):** A função `listHabitTree` já agrupa hábitos pais com a propriedade `children` devidamente ordenada.
- **Log e Check-in Individual:** Check-in (`done`) e registro de motivo de pulo (`skipped`) por sub-passo via `/api/habit-logs` funcionam perfeitamente.
- **Sheet de "Não rolou" (`SkipHabitSheet`):** Funciona perfeitamente para capturar motivos (tempo, energia, contexto) e notas honestas nos passos.
- **Migração do Banco (`dbInit.js`):** A função `migrateActiveRitualsToCompoundHabits` migrou com sucesso os rituais ativos legados para hábitos compostos no boot.
- **Isolamento de Streaks:** Sub-hábitos mantêm streaks individuais sem interferir negativamente no histórico do usuário.

---

## Ordem de implementação sugerida (lotes pro Claude)

1. **Lote 1 — API & Backend (Criação Atômica & Regras de Outcome):**
   - Atualizar `POST /api/habits` para aceitar `children` como lista de novos sub-hábitos e criá-los atomicamente na transação.
   - Corrigir `listHabitTree` para considerar `day_outcome: 'done'` quando `completed_steps + skipped_steps === total_steps`.
   - Adicionar suporte a `emoji` oficial no hábito composto e remover agrupamento forçado `'morning'`.

2. **Lote 2 — UI: Formulário de Hábito (`HabitForm.jsx`):**
   - Implementar seletor [Simples \| Composto] no `HabitForm.jsx`.
   - Construir o construtor visual de sub-passos (adicionar, remover, ordenar, definir horário por passo).
   - Conectar o modal de criação e edição para manipular compostos e sub-passos de forma limpa.

3. **Lote 3 — UI: Apresentação & Hierarquia Visual (`HabitsTasks.jsx` & `CompoundHabitsWidget`):**
   - Refatorar os hábitos compostos para que fiquem parecidos com cartões de hábitos expansíveis na lista da aba "Hábitos".
   - Limpar terminologia interna (substituir `ritual` por `compound` / `rotina`).
   - Mover/Ajustar a posição do widget no Dashboard (Hoje) para a seção de Execução.

4. **Lote 4 — Limpeza de Dead Code & Depreciação de Rituais:**
   - Deletar o arquivo morto `src/pages/Rituais.jsx`.
   - Reescrever `OpeningRitualCollapsible.jsx` para usar a nova API de hábitos compostos.
   - Desativar/Deprecar `api/routes/rituals.js` e `src/lib/ritualTemplates.js`.
