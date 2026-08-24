# Praxis — Hábitos e tarefas em 3 lentes

**Status:** em execução. Gemini 3.7 high (`agy`) fecha fases 0–3. A.N.A. semeia hábitos + QA + ship.  
**Data:** 2026-08-24  
**Referência visual:** Sistema Forja (`/productivity` e `/habits`) como **padrão de lentes + catálogo de hábitos**, não como pele.  
**URL viva:** https://dopraxis.vercel.app/habitos-tarefas  
**Código hoje:** `src/pages/HabitsTasks.jsx` (1410 linhas, só lista)

---

## Promessa

A Lista deixa de ser um filtro eterno e vira **bancada de execução** com 3 jeitos de olhar o **mesmo** trabalho:

| Lente | Pergunta que responde |
|-------|------------------------|
| **Lista** | O que está aberto neste recorte? |
| **Quadro** | Onde cada coisa está no fluxo? |
| **Semana** | Quando isso ocupa o relógio? |

Hábitos continuam **consistência**, não cartão de quadro. Tarefa e hábito não se misturam.

Tagline do produto permanece: *Fale. Organize. Execute.*  
Hoje continua sendo a superfície de execução do dia. Esta frente não compete com o Agora.

---

## O que pegar vs o que recusar

### Pegar (padrão)

1. **Três lentes do mesmo dado** (lista / quadro / grade da semana).
2. **Caixa de entrada** = tarefa aberta **sem data**. Captura sem fingir que é de hoje.
3. **Em andamento visível.** `in_progress` já existe na API e some na UI.
4. **Grade semanal com hora + duração.** O modelo já tem `date`, `time`, `duration_minutes`.
5. **Ir para hoje** na semana + criar no slot vazio (já nasce com hora).
6. **Criar rápido na lente atual** (o `QuickTaskInput.jsx` existe e não está ligado).

### Recusar (pele / RPG / SaaS genérico)

- Ferreiro, temporada, ciclo 24/31, “membros participando”.
- Vários quadros, colunas custom, “adicionar coluna”.
- Hero de rolagem com foto comendo o first fold.
- Hábitos virando cartão de Kanban.
- Segunda agenda no lugar do Google no Hoje.
- Inbox = fila de áudio (`/capturas`) ou `/ideias`. São portas diferentes.

### Torção Praxis (pra não parecer clone)

- Nav primary continua **Lista**. Não vira “Tarefas”.
- Abas de objeto ficam: **Todos · Tarefas · Hábitos**.
- Lentes **Lista · Quadro · Semana** só dentro de Tarefas (e em Todos, só no lado de tarefas).
- Começar no Agora / Foco marca `in_progress`.
- **Não hoje** continua existindo (adia data; não inventa coluna).
- Semana mostra hábito com `preferred_time` como **marca fraca**, sem arrastar.
- Dual-write Calendar só quando a tarefa ganha `date` + `time` (já é a regra).

---

## Estado atual (código, 2026-08-24)

| Peça | Situação |
|------|----------|
| Status `pending` / `in_progress` / `completed` / `cancelled` | API ok. UI trata `pending`+`in_progress` como a mesma coisa. Filtro da Lista nem lista `in_progress`. |
| `date` nulo | API ordena `(date IS NULL)`. Escopo **Hoje** da Lista **esconde**. O card do Hoje (`TodayTasks`) **mostra**. Inconsistência real. |
| `time` + `duration_minutes` | Form + Calendar sync. Zero grade. |
| Recorte Lista | chips Hoje / Semana / Atrasadas / Todas |
| Hábitos | compostos, Não rolou, `preferred_time`, editar no widget |
| DnD | só reordenar no Hoje (`@hello-pangea/dnd`). Não muda status. |
| `QuickTaskInput` | arquivo morto |
| Agenda do Hoje | lista de eventos Google. Não é timegrid. |

Não precisa de tabela nova. Precisa de **lente + inbox honesta + status visível**.

---

## Modelo mental (sem schema novo)

```text
tarefa aberta
  sem date            → Caixa (inbox)
  date preenchida
    pending           → A fazer
    in_progress       → Andamento
  completed hoje      → Feito (some da coluna no dia seguinte)
  cancelled           → arquivo (já existe)
```

Regras:

- Tirar a data (voltar pra Caixa) zera `time` e **não** deixa evento zumbi no Calendar (usar o sync que já apaga).
- Arrastar Caixa → A fazer sem data = data de **hoje**.
- Arrastar pra Andamento = `in_progress` e **não** inventa hora.
- Arrastar pra Feito = o mesmo complete de hoje (streak/XP/recorrência intactos).
- Ideias (`category=ideias`) **não** entram no quadro. Continuam em `/ideias`.
- Hábito **nunca** vira coluna.

Chip novo na Lista: **Caixa** (junto de Hoje / Semana / Atrasadas / Todas).

---

## Fases

MVP recomendado: **0 → 3**. Fase 4 só se a semana ficar útil.

| Fase | Done-when | Notas |
|------|-----------|--------|
| **0** | Helpers puros + testes. Mapa coluna, inbox, recorte. Zero UI. | `src/lib/taskLenses.js` + `api/task-lenses.test.mjs` (node --test) |
| **1** | Lista honesta: chip Caixa; criar rápido sem data cai na Caixa; escopo Hoje **não** some com sem-data (alinhar com `TodayTasks`). | pouca UI, maior ROI |
| **2** | Quadro de 4 colunas no mesmo payload. Desktop arrasta. Mobile: menu “Mover para”. | reusa `@hello-pangea/dnd` |
| **3** | Semana 7 dias × horas. Blocos = tarefa com `time`. Slot vazio abre form com data+hora. “Ir para hoje”. | duração default = setting atual |
| **4** | Foco/Agora → `in_progress`. Hábitos com horário viram marca na Semana. | opcional |

Ship **B** (um deploy no fim do MVP) a menos que João peça fase isolada.

### Fase 0 — contrato

**Arquivos**

- Criar: `src/lib/taskLenses.js`
- Criar: `api/task-lenses.test.mjs`
- Modificar: `src/lib/taskListFilters.js` (scope `inbox`)
- Modificar: `src/lib/urlDeepLinks.js` (`lens=list|board|week`)

**API do helper (não negociar nome no meio do código)**

```js
export const TASK_LENSES = ['list', 'board', 'week']
export const BOARD_COLUMNS = ['inbox', 'todo', 'doing', 'done']

export function isInboxTask(task) // open && !date
export function boardColumnForTask(task, today)
export function tasksForBoardColumn(tasks, column, today)
export function moveTaskToColumn(task, column, today)
  // devolve patch { status?, date?, time? }
export function weekRange(today) // segunda→domingo America/Fortaleza
export function taskBlock(task)  // { date, start, end } ou null se sem time
```

**Testes mínimos** (`node --test api/task-lenses.test.mjs`)

1. Aberta sem data → `inbox`.
2. `pending` com data → `todo`.
3. `in_progress` com data → `doing`.
4. `completed` com `completed_date=hoje` → `done`; ontem → fora do quadro.
5. Ideia aberta → fora.
6. `moveTaskToColumn(inbox→todo)` em 24/08 → `{ date: '2026-08-24' }`.
7. `moveTaskToColumn(todo→inbox)` → `{ date: null, time: null }`.
8. `weekRange('2026-08-24')` → 24/08 (seg) … 30/08 (dom).

**Aceite:** `node --test api/task-lenses.test.mjs` verde. Nenhum JSX.

### Fase 1 — Lista + Caixa

**Arquivos**

- `src/lib/taskListFilters.js` — `TASK_SCOPE_CHIPS` ganha `{ id: 'inbox', label: 'Caixa' }`
- `src/pages/HabitsTasks.jsx` — chip; criar rápido
- Ligar `QuickTaskInput` no topo da coluna de tarefas
- `src/components/dashboard/TodayTasks.jsx` — **não** mudar regra sem o helper (os dois importam `isInboxTask` / scope)

**Comportamento**

- Quick add **sem** data → Caixa. Não marca hoje.
- Quick add na lente Semana (fase 3) → data do dia visível, sem hora até clicar slot.
- Empty da Caixa: “Tarefa sem dia. Entra aqui até você datar.”
- Filtro de status ganha **Andamento** (`in_progress`).

**Aceite**

- Criar “foo” pelo input → `GET /api/tasks` tem `foo` com `date` null, `status=pending`.
- Chip Caixa lista só essas.
- Chip Hoje: tarefas **datadas hoje** + **não** mistura Caixa (Hoje do dashboard pode continuar mostrando sem-data; Lista Hoje fica limpa).  
  Decisão travada: **Hoje da Lista = datadas de hoje. Caixa é chip próprio.** Dashboard Hoje pode continuar puxando sem-data no Agora se o NowBlock precisar de matéria. Não unificar à força.

### Fase 2 — Quadro

**Arquivos**

- Criar: `src/components/habits-tasks/TaskBoard.jsx`
- Criar: `src/components/habits-tasks/TaskBoardCard.jsx`
- Modificar: `HabitsTasks.jsx` — switcher **Lista · Quadro · Semana** só com `view=tasks` (e lado tarefas de `view=all` no desktop, se couber sem esmagar hábitos)
- Deep link: `/habitos-tarefas?tab=tasks&lens=board`

**UI**

- 4 colunas fixas: Caixa · A fazer · Andamento · Feito.
- Card: título, prioridade, data/hora se tiver. Sem foto, sem XP.
- Desktop: drag entre colunas → `PUT` com o patch do helper.
- Mobile (< lg): sem drag de coluna; `⋯` → Mover para.
- Contador na cabeça da coluna.
- Empty da coluna: uma linha, sem CTA de marketing.

**Aceite**

- Arrastar (ou mover) Caixa → A fazer data hoje e some da Caixa.
- Completar no quadro dispara o mesmo `updateTask` da Lista (recorrência / toast / XP).
- Refresh mantém a coluna (não é estado só no React).

### Fase 3 — Semana

**Arquivos**

- Criar: `src/components/habits-tasks/TaskWeek.jsx`
- Modificar: `HabitsTasks.jsx` + `urlDeepLinks` (`lens=week`)
- Reusar `duration_minutes` e default de `FORJA_DEFAULT_TASK_DURATION_MINUTES` / setting

**UI**

- Semana começando **segunda**, fuso `America/Fortaleza`.
- Horas 07–21 (igual o print de referência, sem copiar o chrome).
- Linha de agora só no dia civil de hoje.
- Botão **Hoje** (não “Ir para hoje”).
- Clique no vazio → `TaskForm` com `date`+`time` preenchidos.
- Bloco existente → editar. Sem drag de duração no MVP (YAGNI). Mudar hora pelo form.
- Tarefa datada **sem** hora: faixa no topo do dia (“sem hora”), não inventa 08:00.

**Aceite**

- Tarefa 24/08 15:00 60min ocupa 15–16 na segunda.
- Criar no slot 10:00 de terça grava `date`+`time` e, se Calendar ok, dual-write.
- Mobile: scroll horizontal da semana, um dia ~72% da viewport; “Hoje” ancora.

### Fase 4 — gancho (opcional)

- `Focus.jsx` / `NowBlock`: ao iniciar sessão ligada a tarefa, `status=in_progress` se ainda `pending`.
- Semana: ponto/faixa baixa para hábito `preferred_time` due naquele dia. Clique abre o hábito, não o form de tarefa.
- Sem drag de hábito.

---

## Hábitos nesta frente (sem clone)

Não abrir aba nova. Quadro/Kanban é só de **tarefa**. Hábitos continuam check + Não rolou.

Já existe e **não se mexe**:

- Composto **Abertura do dia**: levantar 06:00 · arrumar a cama · água e luz natural · banho/higiene · café/suplementos
- Composto **Fechamento do dia**: jantar/desligar · banho da noite · celular longe + 1 linha de amanhã · luz apagada

### Catálogo a deixar no app (print `/habits` do Sistema Forja)

Lista do print, **sem duplicata** (lá tinha Água 2× e Treino 2×) e **sem virar tarefa**.

| Título na Praxis | Tipo | Categoria | Meta | Por que não some no composto |
|------------------|------|-----------|------|------------------------------|
| Beber 2L de água | simples, diário | rotina | 2 L | Abertura só tem gole de manhã |
| Sem pornografia | simples, diário | pessoal | check = fiquei limpo | evitação; não é passo de rotina |
| Sono de qualidade (7h) | simples, diário | wellness | 7 h | Fechamento é ritual; isto é meta da noite |
| Leitura 10 páginas | simples, diário | estudo | 10 pág | não existe hoje |
| Treino | simples, diário | treino | check | `/treinos` é sessão; isto é o check do dia |
| Cardio 30 min | simples, diário | treino | 30 min | não existe hoje |
| Banho gelado | simples, diário | rotina | check | distinto de “Banho e higiene” |
| Manhã sem celular (1h) | simples, diário | rotina | 1 h | distinto de “celular longe” à noite |
| Planejar o dia | simples, diário | rotina | check | distinto da “1 linha de amanhã” |

Copy de Planejar o dia (description): `Quais são as 3 coisas que tornariam hoje um dia vencedor?`

**Fase H (A.N.A., API, não Gemini):** semear os 9 se o título ainda não existir entre ativos (incluindo filhos). Sem tarefa-clone. Sem cron.

UI de hábitos: tab continua lista + compostos. Fase 4 (opcional) só marca `preferred_time` na Semana. `HabitForm` de composto novo continua dívida antiga.

---

## Fora de escopo

- Multi-quadro, colunas custom, labels tipo Trello.
- Subtarefa de tarefa (passo de hábito composto já cobre rotina).
- Recolor / hero / partículas específicas desta aba.
- Trocar Agenda Google do Hoje.
- Cron novo, systemd, rename `FORJA_*`.
- Copiar copy, ícone, layout pixel a pixel do Sistema Forja.

---

## Arquivos que a implementação deve tocar

```
src/lib/taskLenses.js                         (criar)
src/lib/taskListFilters.js
src/lib/urlDeepLinks.js
src/lib/tasks.js                              (se faltar isInbox)
src/pages/HabitsTasks.jsx
src/components/habits-tasks/QuickTaskInput.jsx
src/components/habits-tasks/TaskBoard.jsx     (criar)
src/components/habits-tasks/TaskBoardCard.jsx (criar)
src/components/habits-tasks/TaskWeek.jsx      (criar)
src/components/dashboard/TodayTasks.jsx       (só se o helper exigir)
src/pages/Focus.jsx                           (fase 4)
api/task-lenses.test.mjs                      (criar)
```

API de tarefas **não precisa** de rota nova nas fases 0–3.

---

## Verificação / ship

Por fase:

```bash
cd /root/.hermes/workspaces/apps/praxis
node --test api/task-lenses.test.mjs   # desde a fase 0
npm run prepush:check
```

Fechamento do MVP (1–3) ou da fase pedida:

```bash
git add … && git commit   # committer canônico
git push origin main
# api/ só mudou teste: sem ship:api / sem restart
npm run deploy:prod         # alias dopraxis.vercel.app
npm run smoke:prod
```

Prova manual no Desktop:

1. `/habitos-tarefas?tab=tasks` — chip Caixa + input rápido.
2. `?lens=board` — 4 colunas, mover uma tarefa, F5.
3. `?lens=week` — bloco com hora + criar no slot + botão Hoje.

---

## Riscos

- **HabitsTasks.jsx já está gordo.** Quadro e Semana nascem em arquivos novos. Não empilhar mais 400 linhas no page.
- **limit 50 / include_overdue.** Quadro e Semana usam o mesmo payload operacional. Semana precisa das abertas da semana: o merge atual já puxa upcoming. Conferir no teste de lista se a semana inteira cabe; se não, só então abrir `limit` ou recorte por range. Não criar endpoint “kanban”.
- **Calendar.** Mover pra Caixa tem que apagar evento. Reusar `syncTaskToCalendar` do PUT atual.
- **Mobile.** Quadro com 4 colunas side-by-side é mentira em 390px. Menu mover, não DnD.

---

## Como executar

- **Fase H:** A.N.A. via API (`POST /api/habits`), idempotente por título.
- **Fases 0–3:** Gemini 3.7 Flash High (`agy-ana`), **uma fase por spawn**, A.N.A. QA e só então a próxima. Sem poll no chat.
- Ship **B** no fim do MVP (0–3). Sem push/deploy no Gemini.

---

## Aprovação

João 2026-08-24: catálogo de hábitos entra no plano **e** no app; Gemini fecha o MVP. Sem esperar `ok fases` de novo.
