# Hábitos — ciclo de vida (onda 3)

## Status (`habits.status`)

| Valor | UX |
|--------|-----|
| `active` | Lista padrão; check-in no dia quando `isHabitDueOnDate` |
| `paused` | Fora do radar do dia; logs intactos |
| `archived` | Só histórico / filtro; logs intactos |

## API

- `GET /api/habits` — default `status=active`
- `GET /api/habits?status=all|paused|archived`
- `PUT /api/habits/:id` — `{ status: 'paused' | 'active' | 'archived' }`
- `DELETE /api/habits/:id` — hard delete + logs (UI: confirmação dupla)

## Campos novos

- `habits.recurrence_days` — JSON `[0-6]` para `frequency=weekly`
- `habits.target_value` + `habits.unit` — hábito quantitativo (ex. água)
- `habit_logs.value` — valor do dia (upsert por habit_id + date)

## Streak

`getStreaks()` usa apenas logs com **feito** (`outcome='done'` / `completed=1`). Pausar/arquivar não apaga logs.

## Outcome do dia (`habit_logs`)

Três estados por hábito por dia (não confunde com lifecycle pause/archive):

| Estado | Log | `outcome` | `completed` | UI |
|--------|-----|-----------|-------------|-----|
| Aberto | sem log | — | — | neutro |
| Feito | sim | `done` | `1` | wellness + line-through |
| Não rolou | sim | `skipped` | `0` | âmbar suave, sem vitória |

Campos:

- `habit_logs.outcome` — `done` \| `skipped`
- `habit_logs.skip_reason` — opcional `time` \| `energy` \| `context` \| `other`

API:

- `POST /api/habit-logs` — `{ habit_id, date, outcome, skip_reason? }` (compat: `completed: true` → done)
- Upsert por `(habit_id, date)` (índice único)
- `DELETE /api/habit-logs/:id` — volta a **aberto** (desfaz feito ou skip)

Streak:

- **done** → aumenta
- **skipped** → **gelo** (não aumenta, não zera)
- dia devido sem log no passado → quebra

Tarefas (fase 2, separado): `POST /api/tasks/:id/not-today` empurra data; **não** usa `cancelled`.