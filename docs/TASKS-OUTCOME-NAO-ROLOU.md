# Tasks — Outcome do dia (“Não rolou” / “Não hoje”)

Branch: `feat/day-outcome-nao-rolou`  
Scope: Fase 1 (hábitos) + Fase 2 (tarefas). Fora: Fase 3.

## A) Data + API

- [x] `api/server.js` — migrate `habit_logs`: add `outcome`, `skip_reason`; backfill `done` where `completed=1`
- [x] `api/server.js` — unique index `(habit_id, date)` on `habit_logs` if missing
- [x] `api/server.js` — `POST /api/habit-logs` accept `outcome: done|skipped` + optional `skip_reason`; compat `completed:true` → done; enforce completed flags
- [x] `api/server.js` — upsert by `(habit_id, date)` updates outcome/skip_reason
- [x] `api/server.js` — `getStreaks`: done lengthens; skipped freezes; open past due breaks
- [x] `api/server.js` — migrate `tasks`: `day_outcome`, `day_outcome_date`, `day_outcome_reason`
- [x] `api/server.js` — `POST /api/tasks/:id/not-today` → tomorrow date, keep status, record outcome fields, calendar sync

## B) Frontend

- [x] `src/lib/habits.js` — helpers: `isDone`, `isSkipped`, labels, skip reasons
- [x] `src/api/forjaClient.js` — habitLogs create fields; `tasks.notToday(id, body)`
- [x] `src/components/dashboard/TodayHabits.jsx` — triple state open/done/skipped; long-press/⋯; reason chips; amber skip
- [x] `src/pages/Dashboard.jsx` — wire skip/undo mutations (no XP/spark on skip)
- [x] `src/pages/HabitsTasks.jsx` — habit rows triple state + Não rolou; task Não hoje + toast
- [x] `src/components/habits-tasks/ListRowMenus.jsx` — task menu “Não hoje”; habit day-outcome actions as needed
- [x] `src/components/shared/DayProgressBar.jsx` — done vs skipped vs open counts
- [x] Progress copy on HabitsTasks / TodayHabits separate counts where easy

## C) Insights

- [x] `api/lib/avoidanceInsights.js` — skip today closes loop; multi-skip mild nudge
- [x] `api/lib/weeklyInsights.js` — `habits_skipped` / `top_skipped` separate from open misses

## D) Docs

- [x] `docs/HABITS-LIFECYCLE.md` — day outcome section
- [x] `docs/PLANO-PRAXIS-OUTCOME-NAO-ROLOU.md` — mark Fase 1/2 done-when checkboxes

## E) Verify

- [x] Local checks: lint/build or `prepush:check`; node syntax / related tests
- [x] Commit on feature branch (no push)
