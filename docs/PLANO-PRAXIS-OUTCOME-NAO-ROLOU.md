# Praxis — Fechar o dia com honestidade (“Não rolou”)

**Status:** Fase 1 + Fase 2 implementadas (`feat/day-outcome-nao-rolou`)  
**Data:** 2026-07-16  
**Pedido João:** opção de marcar quando **não conseguiu** realizar tarefa/hábito, em vez de só deixar em branco.  
**URL produto:** https://praxis-jota.vercel.app

---

## 1. Problema (em 3 linhas)

Hoje o app só entende **feito** ou **vazio**.

- **Vazio** mistura três realidades: esqueci o app, ignorei, ou tentei e não rolou.
- O checklist 10/10 já pede *“check ou skip consciente”* (`docs/CHECKLIST-PRAXIS-10.md`) — o produto ainda não entrega o skip.
- Avoidance / revisão contam “sem check” como falha implícita, sem te dar um gesto honesto de fechar o loop.

**Não é sobre punição.** É sobre **fechar o dia sem autoengano**.

---

## 2. Princípios de design

1. **Copy humana, sem drama.** UI diz **Não rolou** / **Não hoje**. Nunca “falhei”, “fracasso”, “miss”.
2. **Hábitos primeiro.** É o gap diário real. Tarefas já têm Arquivar (`cancelled`); o que falta nelas é “não é pra hoje”.
3. **Três estados no dia, não seis status globais.**
   - Aberto (sem registro)
   - Feito
   - Não rolou (registro consciente)
4. **Skip ≠ arquivar.** Arquivar = morreu. Não rolou = **esse dia** fechou sem fazer.
5. **Honestidade recompensada.** Skip consciente fecha o loop e **não finge vitória**; streak **congela** (não some como se tu tivesse sumido do app).
6. **Motivo opcional, 1 toque.** Nunca formulário. Chip opcional: Tempo · Energia · Contexto · Outro.
7. **Zero poluição no Hoje.** O gesto tem de caber no card atual — long-press / swipe / chip — sem segundo modal pesado no path feliz.

---

## 3. Modelo mental (João)

| Situação real | O que fazer na Praxis | O que **não** fazer |
|---|---|---|
| Fiz o hábito / a tarefa | **Feito** | — |
| Hoje não deu, mas o hábito continua | **Não rolou** | Deixar em branco “pra não ver” |
| Tarefa do dia: empurra pra amanhã | **Não hoje** | Arquivar |
| Isso morreu / era ruído | **Arquivar** (já existe) | Marcar feito de mentira |
| Esqueci o app o dia inteiro | (nada) → vira **em aberto / perdido** no fim do dia | — |

---

## 4. Modelo de dados

### 4.1 Hábitos — estender `habit_logs` (não inventar tabela nova)

Hoje:

```text
habit_logs(id, habit_id, date, completed INTEGER, value?, created_date)
```

**Proposta:**

```text
habit_logs
  + outcome TEXT NOT NULL DEFAULT 'done'
      -- 'done' | 'skipped'
  + skip_reason TEXT DEFAULT NULL
      -- 'time' | 'energy' | 'context' | 'other' | NULL
  + note TEXT DEFAULT ''   -- opcional, curto; fase 2 se atrapalhar
```

**Regras de consistência (API):**

| `outcome` | `completed` | significado |
|---|---|---|
| `done` | `1` | Feito |
| `skipped` | `0` | Não rolou (dia fechado) |

- Upsert por `(habit_id, date)` — um log por hábito por dia.
- `POST /api/habit-logs` aceita `outcome` (+ `skip_reason` opcional).
- Legado: logs antigos sem coluna → tratar como `outcome='done'` se `completed=1`, senão ignorar (não viram skip).
- `DELETE` do log = volta a **aberto** (desfaz feito **ou** skip).

**Unique:** garantir índice único `(habit_id, date)` se ainda não existir (hoje o front filtra e apaga; API deve ser idempotente).

### 4.2 Tarefas — **não** poluir `status`

Status globais continuam:

```text
pending | in_progress | completed | cancelled
```

**Proposta leve (fase 2 do módulo):**

```text
tasks
  + day_outcome TEXT DEFAULT NULL
      -- NULL | 'not_today'
  + day_outcome_date TEXT DEFAULT NULL
      -- YYYY-MM-DD do dia em que marcou "não hoje"
  + day_outcome_reason TEXT DEFAULT NULL
      -- mesmos chips (opcional)
```

**Comportamento “Não hoje”:**

1. Se `date` era hoje → `date = amanhã` (local Fortaleza), limpa `time` se quiser (default: **mantém horário** se existir).
2. Grava `day_outcome='not_today'` + `day_outcome_date=hoje` (histórico do gesto).
3. Status **permanece** `pending` / `in_progress`.
4. **Não** mexe em Calendar sync além do update de data já existente.
5. **Não** conta como completed / XP de conclusão.

**Arquivar** continua `cancelled` — sem misturar.

> Alternativa rejeitada: status `skipped` na task. Polui filtros, bulk archive, recurrence spawn e avoidance. Pior trade.

---

## 5. Streak, progresso do dia, insights

### 5.1 Streak de hábito (`getStreaks`)

**Regra canônica:**

- Só `outcome='done'` (`completed=1`) **aumenta** streak.
- Dia com `outcome='skipped'` = **gelo**: não aumenta, **não zera**.
- Dia **devido** sem log (aberto) no passado = **quebra** (como hoje).
- Dia não-devido (freq. weekly etc.) = ignora (já é assim).

Por quê gelo no skip: recompensa marcar a verdade em vez de sumir. Sumir ainda dói. Mentir feito ainda é pior pro sistema (e pro João).

### 5.2 Barra do dia / % hábitos

| Estado | Conta no numerador “feitos”? | Conta no denominador “do dia”? | Visual |
|---|---|---|---|
| Aberto | não | sim | neutro |
| Feito | sim | sim | verde wellness |
| Não rolou | **não** | sim (dia “endereçado”) | âmbar suave |

Métrica extra (UI discreta):

```text
3 feitos · 1 não rolou · 2 abertos
```

Não esconder skip dentro de “feitos”.

### 5.3 Avoidance (`avoidanceInsights`)

Hoje: “sem check ontem e hoje” = item de hábito.

**Novo:**

- Skip **hoje** → **não** entra como “ainda sem check” (loop fechado).
- Skip ontem + aberto hoje → still nudge suave (“ontem pulou · hoje em aberto”).
- 3+ skips no mesmo hábito em 7 dias → item **padrão**, não culpa: *“X pularam 3× — rever frequência ou pausar?”* + ação Pausar / Editar.

### 5.4 Revisão semanal (`weeklyInsights`)

Separar no payload:

```json
"habits_done": 12,
"habits_skipped": 4,
"habits_open_slots": 3,
"habits_completion_pct": 60,
"top_skipped": [{ "title": "...", "skips": 3, "top_reason": "time" }],
"missed_habits": [...]  
```

- `missed` = slots devidos **sem** log (aberto no passado).
- `skipped` = não rolou consciente.
- Copy de rascunho: *“Pulei treino 3× por tempo — encolher janela?”* em vez de só “falha”.

### 5.5 Gamificação

- **Feito** → XP/conquistas como hoje.
- **Não rolou** → **0 XP**, sem toast de vitória, sem confetti.
- Opcional fase 3: micro-toast neutro *“Registrado”* (sem celebrar a falha).

### 5.6 Metas ligadas a hábito (`goalProgress`)

Só `done` conta. Skip não infla progresso.

---

## 6. UX — superfície

### 6.1 Hábito no **Hoje** (path principal)

Card atual = checkbox binário. Vira **estado triplo** sem perder o 1-toque de feito.

**Interação (mobile-first):**

| Gesto | Resultado |
|---|---|
| Tap no checkbox / linha (aberto →) | **Feito** (igual hoje + spark) |
| Tap de novo em Feito | volta a **Aberto** (desfaz) |
| Long-press **ou** botão `⋯` / chip lateral | sheet mínimo: **Não rolou** · (se já skip) **Desfazer** · **Feito** |
| Após **Não rolou** | sheet 1 linha opcional de motivo (pular = ok) |

**Estados visuais da row:**

| Estado | Borda / fundo | Ícone | Título |
|---|---|---|---|
| Aberto | neutro atual | checkbox vazio | normal |
| Feito | wellness suave | check | line-through wellness |
| Não rolou | âmbar muito suave | traço / “–” em círculo | opacidade ~0.75, **sem** line-through de vitória |

Chip à direita se skip com motivo: `Tempo` / `Energia` (11px, muted).

**Importante:** long-press não pode brigar com scroll. Se fricção no teste mobile → fallback **swipe left → Não rolou** (ações reveladas) + tap = feito.

### 6.2 Lista Hábitos (`/habitos-tarefas?tab=habits`)

Mesma máquina de estados. Menu ⋯ do hábito (pause/archive) **separado** do outcome do dia.

### 6.3 Tarefa (fase 2)

Na row de tarefa **pending de hoje / atrasada**:

Menu ⋯ / ações:

1. **Concluir** (já existe)
2. **Não hoje** → empurra data + registra outcome
3. **Arquivar** (já existe)

Empty copy se aplicável: *“Empurrada de ontem”* se `day_outcome_date` = ontem.

### 6.4 Copy canônica (PT boteco, UI)

| Código / API | UI |
|---|---|
| `done` | Feito |
| `skipped` | Não rolou |
| `not_today` | Não hoje |
| `time` | Tempo |
| `energy` | Energia |
| `context` | Contexto |
| `other` | Outro |
| (sem log) | — (aberto) |

Toast skip: **“Não rolou — registrado.”**  
Toast not_today: **“Beleza — fica pra amanhã.”**

Proibido na UI: falhei, miss, failed, skip (anglicismo cru), “você deveria”.

---

## 7. API (contrato)

### Hábitos

```http
POST /api/habit-logs
{
  "habit_id": "...",
  "date": "2026-07-16",
  "outcome": "done" | "skipped",
  "skip_reason": "time" | "energy" | "context" | "other" | null,
  "value": 1.5          // só faz sentido com done + hábito quantitativo
}
```

- `outcome` omitido + `completed: true` → `done` (compat).
- `outcome: "skipped"` força `completed=0`, ignora value pra streak.
- Resposta inclui log normalizado + streaks do hábito se barato.

```http
DELETE /api/habit-logs/:id   # desfaz (aberto de novo)
```

```http
GET /api/habit-logs?date=...  # devolve outcome + skip_reason
```

### Tarefas (fase 2)

```http
POST /api/tasks/:id/not-today
{ "reason": "time" | null }
```

Implementação interna: update date + campos `day_outcome*`. Alternativa: `PATCH` com `action: 'not_today'` — preferir endpoint explícito pra não misturar com update genérico.

---

## 8. Fases de implementação

### Fase 0 — Desenho e aceite (este doc)

- [x] Problema, princípios, modelo, UX, API, anti-padrões
- [ ] João: ok no modelo de streak (gelo no skip) e copy **Não rolou**
- [ ] João: hábitos só (fase 1) vs hábitos+tarefas no mesmo ship

### Fase 1 — Hábitos (P0, ship sozinho)

**Done-when:**

1. [x] Migração SQLite: `outcome`, `skip_reason` em `habit_logs` + backfill `done` onde `completed=1`.
2. [x] API create/list compatível; upsert por dia.
3. [x] `getStreaks` com gelo em skip.
4. [x] UI Hoje + Hábitos: Feito / Não rolou / desfazer.
5. [x] Motivo opcional 4 chips.
6. [x] Day progress / TodayHabits mostram skip âmbar e contagem separada.
7. [x] Avoidance + weeklyInsights separam skipped vs open miss.
8. [ ] `prepush:check` + push + `ship:api` + restart + `deploy:prod` + alias + smoke. *(local check only neste ship; deploy fora de escopo)*
9. [x] Sem XP no skip; sem confetti.

**Fora da fase 1:** notas longas, heatmap redesign, notificação push. (tarefas → fase 2 abaixo)

### Fase 2 — Tarefas “Não hoje”

1. [x] Colunas `day_outcome*`.
2. [x] `POST .../not-today` + UI no menu da task.
3. [x] Banner/lista: não tratar “empurrada” como se fosse cancel (badge “Empurrada de ontem”).
4. [ ] Insights: contagem de not_today na semana (opcional; não feito neste lote).

### Fase 3 — Inteligência leve (só se fase 1 colar no uso)

1. “Esse hábito pulou 4/7 — reduzir pra weekdays?”
2. PraxIA confront usa skip_reason.
3. Heatmap: 3 cores (done / skip / miss).
4. Config: “skip quebra streak” toggle (default = gelo). **Só se João pedir.**

---

## 9. Anti-padrões (não fazer)

- Status `failed` / `missed` como estado primário de tarefa.
- Marcar skip automático à meia-noite em tudo (mata o contraste aberto vs consciente).
- Pedir diário de 200 caracteres pra pular.
- Celebrar skip com confetti/XP.
- Misturar pause de hábito (lifecycle) com skip do dia.
- “Não rolou” = `cancelled` em task.
- Relatório semanal que chama o João de preguiçoso.

---

## 10. Aceite humano (João no celular)

1. Hábito aberto → tap → **Feito** (igual hoje).
2. Long-press / ⋯ → **Não rolou** → some o “dever” sem ficar verde de vitória.
3. Motivo dá pra pular.
4. Desfazer volta a aberto.
5. Streak: sequência de feitos não zera num skip no meio (gelo).
6. No dia seguinte, hábito de novo em aberto (skip não carrega).
7. Revisão / avoiding não tratam skip de hoje como “ainda sem check”.

---

## 11. Arquivos prováveis (quando arrochar)

| Área | Paths |
|---|---|
| Schema / API | `api/server.js` (`habit_logs`, `getStreaks`, POST habit-logs) |
| Insights | `api/lib/avoidanceInsights.js`, `api/lib/weeklyInsights.js` |
| Client | `src/api/forjaClient.js` |
| Helpers | `src/lib/habits.js` (outcome helpers) |
| UI | `src/components/dashboard/TodayHabits.jsx`, `src/pages/HabitsTasks.jsx`, progress bar |
| Docs | este plano; opcional `docs/HABITS-LIFECYCLE.md` § outcome do dia |
| Fase 2 tasks | `api/server.js` tasks, `src/lib/tasks.js`, menus de task |

---

## 12. Nome do módulo (interno)

**Outcome do dia** / código: `day-outcome`  
**UI:** Não rolou (hábitos) · Não hoje (tarefas)

---

## 13. Decisão pedida ao João

1. **Streak no skip = gelo** (recomendado) ou **quebra igual miss**?
2. Ship **só hábitos (fase 1)** primeiro, ou já **não hoje em tarefas** no mesmo lote?
3. Motivo (Tempo/Energia/Contexto/Outro) **já na fase 1** ou só outcome binário primeiro?

Default se “arrocha” sem detalhe: **gelo + fase 1 hábitos + motivos opcionais**.
