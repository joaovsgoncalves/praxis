# Onda 14 — Tarefas recorrentes

| ID | Task | Status |
|----|------|--------|
| P14-T01 | Ao concluir tarefa com `recurrence` ≠ none → criar próxima instância (`spawnNextRecurringTask`) | **done** |
| P14-T02 | UI: `TaskRecurrenceBadge` + preview **Próxima: dd/MM** | **done** |
| P14-T03 | Regras daily / weekly / monthly + dias semanais | **done** |

## Comportamento

- **API** (`PUT /api/tasks/:id`): ao passar para `completed`/`done`, calcula próxima data (`api/taskRecurrence.js`), evita duplicata por `recurrence_parent_id` + `date`, responde `next_occurrence: { id, date, created }`.
- **Base da próxima data:** `task.date` → senão `completed_date` → senão hoje.
- **UI:** badge em Hábitos & Tarefas e Tarefas de Hoje; toast ao criar nova ocorrência.

## Teste manual

1. Criar tarefa **diária** com data hoje.
2. Marcar concluída → toast “Próxima ocorrência” + nova tarefa amanhã na lista.
3. Badge mostra **Próxima: dd/MM** antes de concluir.