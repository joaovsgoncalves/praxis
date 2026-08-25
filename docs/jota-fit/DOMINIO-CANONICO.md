# Jota Fit — domínio canônico

**Fase:** 2 (só documento). Sem mudança de runtime, schema ou API.  
**Data:** 2026-08-25  
**Fonte viva:** `api/workouts.js` (`initWorkoutSchema` + rotas).  
**Plano:** [PLANO-JOTA-FIT-2-CONVERGENCIA.md](../PLANO-JOTA-FIT-2-CONVERGENCIA.md) seções 4 e 5.

Este arquivo nomeia o domínio fitness do João **em cima das tabelas que já existem**. Não descreve um modelo futuro. Não inventa tabela.

**Agora o módulo é single-user.** João é o único atleta. Nenhuma `workout_*` tem `user_id` ou `athlete_id`. `athlete_id` só na F8 — não implementar agora.

---

## 1. Mapa entidade → tabela (e o que é derivado)

Sete tabelas persistidas. Duas entidades de leitura sem tabela. Athlete não existe.

| Entidade | Persistência hoje | Papel |
|---|---|---|
| **Exercise** | `workout_exercises` | Catálogo + custom. Nome, músculos, tracking, mídia. |
| **Program** | `workout_programs` | Ciclo ativo (hoje: um programa). |
| **WorkoutDay** | `workout_days` | Dia do ciclo (`training` ou `rest`). |
| **ProgramExercise** | `workout_day_exercises` | Exercício planejado no dia: alvos, rest, RIR, superset. |
| **Session** | `workout_sessions` | Execução. `kind` program \| freestyle. `status` active \| completed \| abandoned. Snapshots do nome do programa/dia. |
| **SessionExercise** | `workout_session_exercises` | Snapshot do exercício na sessão (não aponta ao vivo para o editor). |
| **Set** | `workout_session_sets` | Logbook: carga, reps, banda, papel, RIR, qualidade, PR. |
| **PersonalRecord** | **derivado** | Não há tabela. Vive em `workout_session_sets.is_pr` / `pr_type`. 1RM Epley também é derivado na leitura. |
| **MuscleLoad** | **derivado** | Não há tabela. Contrato: `GET /api/workouts/muscle-map`. |
| **Athlete** | **não existe** | F8. |

Não existe tabela `jotafit_*`. Não existe `workout_personal_records`.

---

## 2. Campos que importam para treinar

Não é dump de colunas. Só o que muda a sessão, o mapa ou o progresso.

### Exercise (`workout_exercises`)

| Campo | Por quê |
|---|---|
| `id`, `name`, `name_pt` | Identidade. Catálogo usa `name_pt` na UI (`display_name`). |
| `source` (`catalog` \| `custom`) | Catálogo vs exercício do João. |
| `tracking_type` | O que a série pede: `reps`, `weight_reps`, `duration`, `distance`, `distance_duration`. |
| `target_muscle`, `body_part`, `muscle_group`, `secondary_muscles_json` | Pintam o mapa. Custom sem alias muscular não pinta. |
| `equipment` / `equipment_key` | Filtro da biblioteca. |
| `gif_path`, `thumb_path`, `attribution` | Mídia CDN. |
| `is_bodyweight_default` | Calistenia: carga default 0. |
| `status` | Soft-delete (`active`). |

### Program (`workout_programs`)

| Campo | Por quê |
|---|---|
| `id`, `name` | Ciclo. |
| `is_active` | Um ativo de facto. |
| `current_day_id` | Dia corrente do ciclo (João pode começar qualquer dia). |

### WorkoutDay (`workout_days`)

| Campo | Por quê |
|---|---|
| `id`, `program_id`, `name` | Dia nomeado (ex.: Pull 1). |
| `day_type` | `training` \| `rest`. |
| `position` | Ordem no ciclo. |
| `estimated_duration_minutes` | Expectativa, não cronômetro. |

### ProgramExercise (`workout_day_exercises`)

| Campo | Por quê |
|---|---|
| `exercise_id`, `position` | O que entra no dia e em que ordem. |
| `target_sets`, `rep_min`, `rep_max`, `target_duration_seconds` | Alvo da série. |
| `rest_seconds` | Descanso planejado. |
| `purpose` | `skill` \| `strength` \| `hypertrophy` \| `preparation`. |
| `target_rir_min`, `target_rir_max` | Faixa de RIR. |
| `superset_group` | Agrupa exercícios na sessão. |

### Session (`workout_sessions`)

| Campo | Por quê |
|---|---|
| `kind` | `program` (do dia) ou `freestyle`. |
| `status` | `active` / `completed` / `abandoned`. |
| `workout_program_id`, `workout_day_id` | Origem (nullable em freestyle). |
| `program_name_snapshot`, `workout_day_name_snapshot` | Histórico sobrevive a rename/delete do programa. |
| `started_at`, `completed_at`, `duration_seconds` | Tempo real. |

Nenhuma coluna de dono. Sessão = do João, implícito.

### SessionExercise (`workout_session_exercises`)

Snapshot do ProgramExercise + `exercise_name_snapshot` e `tracking_type`. A sessão não relê o editor: o que estava planejado no start fica congelado. `exercise_id` liga ao catálogo para stats, PR e mapa.

### Set (`workout_session_sets`)

| Campo | Por quê |
|---|---|
| `weight_kg`, `reps`, `duration_seconds`, `distance_m` | Resultado. Qual vale depende do `tracking_type`. |
| `band_level` | Elástico: `none` \| `light` \| `medium` \| `heavy` \| `extra_heavy`. |
| `set_role` | `warmup` \| `work`. Warmup **não** conta PR, 1RM nem mapa. Null histórico = work. |
| `rir`, `technical_quality` | Esforço e qualidade (`clean` \| `acceptable` \| `broke`). |
| `is_pr`, `pr_type` | Marca de recorde nesta série. `pr_type`: `weight` \| `reps` \| `duration` \| `distance`. |
| `set_number`, `completed_at` | Ordem e quando. |

**PersonalRecord** não é entidade persistida. Detectado em `POST /api/workouts/sessions/:id/sets` (`detectPersonalRecord`) e gravado nas colunas do set. Relê-lo = filtrar `is_pr = 1` (warmup já excluído na escrita).

**1RM** também é derivado: Epley `weight * (1 + reps/30)` em `estimate1rm` / `bestEstimated1rm`. Não há coluna de 1RM.

**MuscleLoad** é agregado de sets `work` de sessões `completed`, cruzados com músculos do Exercise. Três modos no endpoint, não no banco: `balance` (volume na janela), `fatigue` (decaimento), `strength` (melhor 1RM por músculo).

---

## 3. Fronteira: domínio fitness vs persistência Praxis

```
Praxis shell (auth, nav, layout, deploy)
        │
        ▼
 /jota-fit  (módulo nativo, mesma SPA)
        │
        ▼
 domínio fitness  (1RM, PR, mapa, prefill — funções puras)
        │
        ▼
 persistência atual  (SQLite workout_* via praxis-api)
```

1. **Domínio fitness** = regras de treino: o que é uma série de trabalho, o que é PR, como pintar um músculo, como estimar 1RM. Hoje isso vive em `api/lib/workoutV4Core.js` e `src/lib/workoutV4/`. Não vaza para tarefas, hábitos ou nutrição.
2. **Persistência** = sete tabelas `workout_*` + rotas `/api/workouts/*`. Dona do I/O. Schema em `initWorkoutSchema`. Uma fonte de verdade.
3. **Praxis** continua dona de autenticação, navegação e infra. O módulo fitness não tem tenant, não tem auth própria, não tem segundo banco.
4. Peso corporal **pode ser lido** de Nutrição (`body_weight_logs`). Não duplicar. Circunferência, se nascer, nasce no Jota Fit (F6), não em Nutrição.
5. F2 **não** extrai pasta `src/modules/jota-fit/`, **não** cria classes DDD, **não** move código. Separação de pasta só quando F3+ reescrever de verdade.

Contrato mental (não schema novo):

| Entidade | Contrato |
|---|---|
| Exercise | id, name, name_pt, source, muscles, equipment, media, tracking |
| Program | id, name, is_active, current_day_id |
| WorkoutDay | id, program_id, name, day_type, position |
| ProgramExercise | targets, rest, RIR, superset_group |
| Session | kind program\|freestyle, status, snapshots |
| SessionExercise | snapshot do exercício |
| Set | weight, reps, band, role, rir, is_pr |
| PersonalRecord | derivado de `is_pr` / `pr_type` |
| MuscleLoad | `/api/workouts/muscle-map` |
| Athlete | F8 |

---

## 4. Buraco F8 — ownership

Hoje: **single-user**. João é o único usuário. Nenhuma `workout_*` tem `user_id` nem `athlete_id`. Programas, dias, sessões e sets não têm dono na linha.

**Antes de alunos**, programas e sessões pessoais precisam de `athlete_id` / `user_id`. Sem isso não há multi-atleta honesto: o segundo usuário veria (ou pior, escreveria) o ciclo do João.

Isso é buraco documentado, **não implementação**. F8: Athlete / Coach / ProgramAssignment. Não desenhar multi-tenant agora. Não adicionar coluna nesta fase.

---

## 5. O que **não** criar (F1/F2)

| Proibido | Por quê |
|---|---|
| Tabela `jotafit_sessions` (ou qualquer `jotafit_*`) | `workout_sessions` já é a sessão. Segundo banco = dado duplicado. |
| Tabela de PR (`workout_personal_records` ou equivalente) | PersonalRecord é derivado de `workout_session_sets.is_pr` / `pr_type`. |
| Multi-tenant / `athlete_id` agora | Single-user. Coluna só na F8, quando houver aluno de verdade. |
| Port das entidades Base44 | Legado é vocabulário, não schema. Praxis já é o núcleo. |
| Pasta `src/modules/jota-fit/` nesta fase | F3+ se reescrever área. |

---

## 6. Contratos de leitura já existentes

Auth padrão Praxis (cookie `praxis_sid` ou `Authorization: Bearer`). Sem mutação. Warmup excluído de 1RM, volume e mapa.

| Método | Rota | O que devolve |
|---|---|---|
| `GET` | `/api/workouts/summary` | Programa ativo, dia corrente, sessão ativa, total de sessões `completed`. Tela Hoje. |
| `GET` | `/api/workouts/muscle-map` | `mode=balance\|fatigue\|strength`, `days` (default 14). 18 músculos canônicos + rankings. **MuscleLoad**. |
| `GET` | `/api/workouts/heatmap` | `year`. Por dia: sessões, sets, work_sets. Histórico. |
| `GET` | `/api/workouts/exercises/:id/stats` | `best_1rm` (Epley), `best_weight`, `best_reps`, `last_performed_at`, totais de work sets e sessões. |
| `GET` | `/api/workouts/agent-snapshot` | `days` (default 14). Sessão ativa, últimas 5 completas, `muscle_map_balance`, notas. Leitura para agente. |

Detalhe de payload: [treinos-v4-agent-api.md](../treinos-v4-agent-api.md). Mutações (start/finish/sets/programa) existem e **não mudam** nesta fase.

---

## 7. Corpo — peso e medidas

| Dado | Onde | Status |
|---|---|---|
| Peso corporal | `body_weight_logs` (módulo **Nutrição**, `api/nutrition.js`) | Vive fora do domínio de treino. Campos: `date`, `weight_kg`, `note`. Não duplicar no Jota Fit. |
| Circunferências (bíceps, peito, cintura, coxa, …) | — | **Ausentes.** Sem tabela. Legado Base44 tinha BodyMeasurement; não portar agora. F6 só se o João usar. |

Jota Fit 2.0 lê peso de Nutrição quando precisar (Progresso / Corpo). Não cria `jotafit_body_*`.

---

## Relação com F0/F1 e o que vem depois

- F0: este mapa nasceu no plano de convergência.
- F1: identidade `/jota-fit`. Mesmas tabelas.
- **F2 (este arquivo):** vocabulário canônico. Runtime intacto.
- F5: tela Progresso em cima destes contratos (`stats`, heatmap, sets).
- F6: circunferências se fizerem falta; peso continua Nutrição.
- F8: `athlete_id`. Não antes.

Histórico que importa já está em `praxis.db` (`workout_*`). Não migrar Base44 na F2.
