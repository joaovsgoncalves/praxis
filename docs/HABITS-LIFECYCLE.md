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

`getStreaks()` usa apenas `habit_logs` com `completed=1`. Pausar/arquivar não apaga logs.