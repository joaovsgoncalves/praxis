# Praxis — sync Google Calendar

**Atualizado:** 2026-07-06 (Lote 7)

## Regras

| Situação | Google Calendar |
|----------|-----------------|
| Tarefa pendente, `date` ≥ hoje, com `time` | Cria/atualiza evento (`popup:30`, `popup:10`) |
| Tarefa **atrasada** (`date` < hoje) | **Não sync**; no boot da API remove evento se existir `calendar_event_id` |
| Concluída / cancelada | Apaga evento |
| Sem `time` | Não sync |

## Snooze

Adiar **15 min** ou **amanhã** atualiza `date`/`time` no SQLite e **reescreve** o evento no Google — comportamento intencional.

Atrasada **sem horário** + snooze 15 min → pode pôr `date = hoje` (cuidado ao tocar Adiar).

## Ops

- Env: `FORJA_CALENDAR_SYNC_ENABLED`, `FORJA_CALENDAR_ID`, `FORJA_CALENDAR_ACCOUNT`
- Boot: `purgeOverdueTasksFromGoogleCalendar()` em `server.js`
- Código: `shouldSyncTaskToCalendar`, `syncTaskToCalendar`

## Órfãos

Evento no Google sem tarefa correspondente → apagar manualmente no Agenda (v1).