# Treinos V4 — Agent Read API (A.N.A. Coaching Reference)

**Data:** 2026-08-22  
**Referência / PRD:** [PLANO-PRAXIS-TREINOS-V4-OPENGYM.md](./PLANO-PRAXIS-TREINOS-V4-OPENGYM.md)  
**Módulo:** Treinos V4 — Fase 13 (Agent Read API)

---

## 1. Visão Geral

A API de leitura do Treinos V4 expõe endpoints read-only de alta fidelidade para consumo da **A.N.A.** (e agentes de coaching). Todos os endpoints são estritamente de consulta (sem mutações, sem escrita) e projetados para retornar dados estruturados e compactos.

### Autenticação

As rotas de Treinos exigem autenticação padrão da Praxis:

- **Bearer Token (Automação / Agente):**
  ```bash
  Authorization: Bearer $PRAXIS_API_KEY
  ```
- **Cookie de Sessão (Browser):**
  ```bash
  Cookie: praxis_sid=<token>
  ```

---

## 2. Matriz de Endpoints Read-Only

| Método | Rota | Query Params | Descrição |
|--------|------|--------------|-----------|
| `GET` | `/api/workouts/agent-snapshot` | `days` (default `14`) | Foto consolidada para coaching: sessão ativa, últimas 5 sessões, balanço muscular e notas |
| `GET` | `/api/workouts/summary` | — | Resumo operacional: programa ativo, dia corrente, sessão ativa e total de treinos |
| `GET` | `/api/workouts/muscle-map` | `mode` (`balance`\|`fatigue`\|`strength`), `days` (default `14`) | Mapa canônico dos 18 músculos com scores normalizados, janela e rankings |
| `GET` | `/api/workouts/heatmap` | `year` (ex: `2026`) | Contribuição diária de treinos no ano (sessões, séries totais e séries de trabalho) |
| `GET` | `/api/workouts/sessions` | `status` (`completed`\|`active`\|`abandoned`), `limit` (default `30`) | Histórico de sessões com contagens de séries e duração |
| `GET` | `/api/workouts/sessions/active` | — | Detalhe completo da sessão ativa em andamento (ou `null`) |
| `GET` | `/api/workouts/sessions/:id` | — | Detalhe completo de uma sessão (exercícios, séries com 1RM, referências) |
| `GET` | `/api/workouts/exercises` | `q`, `body_part`, `equipment`, `target_muscle`, `source`, `limit`, `offset`, `meta` | Catálogo e busca de exercícios com metadados e URLs de mídia |
| `GET` | `/api/workouts/exercises/:id` | — | Detalhes de um exercício específico do catálogo ou customizado |
| `GET` | `/api/workouts/exercises/:id/stats` | — | Estatísticas e recordes: melhor 1RM estimado (Epley), melhor carga, reps e volume |
| `GET` | `/api/workouts/programs` | — | Lista de programas de treino cadastrados |
| `GET` | `/api/workouts/programs/:id` | — | Detalhe de um programa com seus dias e exercícios planejados |

---

## 3. Detalhamento dos Endpoints

### 3.1. Coaching Snapshot (`GET /api/workouts/agent-snapshot`)

Retorna a fotografia de treino mais compacta e informativa para A.N.A. orientar o usuário.

- **Query Parameters:**
  - `days` (opcional, número entre 1 e 365, default `14`): Janela de dias para o cálculo do mapa muscular.

- **Exemplo de Chamada cURL:**
  ```bash
  curl -s -H "Authorization: Bearer $PRAXIS_API_KEY" \
    "http://127.0.0.1:18556/api/workouts/agent-snapshot?days=14"
  ```

- **Formato da Resposta (200 OK):**
  ```json
  {
    "generated_at": "2026-08-22T23:00:00.000Z",
    "active_session": null,
    "last_sessions": [
      {
        "id": "session-uuid",
        "workout_day_name_snapshot": "Pull 1",
        "status": "completed",
        "started_at": "2026-08-22T10:00:00.000Z",
        "completed_at": "2026-08-22T10:45:00.000Z",
        "duration_seconds": 2700,
        "notes": "Treino forte, boa progressão na barra fixa",
        "exercise_count": 5,
        "completed_sets": 15,
        "completed_work_sets": 12,
        "completed_warmup_sets": 3
      }
    ],
    "muscle_map_balance": {
      "mode": "balance",
      "days": 14,
      "muscles": [
        { "id": "trapezius", "label": "Trapézio", "score": 0.2, "raw": 2.4, "unit": "sets" },
        { "id": "deltoids", "label": "Deltoides", "score": 0.65, "raw": 7.8, "unit": "sets" },
        { "id": "chest", "label": "Peitoral", "score": 1.0, "raw": 12.0, "unit": "sets" }
      ],
      "window": { "from": "2026-08-08T23:00:00.000Z", "to": "2026-08-22T23:00:00.000Z" },
      "ranked": {
        "most": ["chest", "upper-back", "deltoids"],
        "least": ["tibialis", "serratus", "calves"]
      }
    },
    "notes": "Treino forte, boa progressão na barra fixa"
  }
  ```

---

### 3.2. Mapa Muscular (`GET /api/workouts/muscle-map`)

Calcula a distribuição anatômica nos 18 músculos canônicos sob três modos matemáticos:
- `balance`: Volume acumulado de séries de trabalho nos últimos N dias (primário 1.0, secundários 0.4).
- `fatigue`: Decaimento exponencial por tempo (`half_life = 7` dias).
- `strength`: Melhor 1RM estimado (fórmula de Epley) por grupamento muscular.

- **Exemplo de Chamada cURL:**
  ```bash
  curl -s -H "Authorization: Bearer $PRAXIS_API_KEY" \
    "http://127.0.0.1:18556/api/workouts/muscle-map?mode=balance&days=14"
  ```

---

### 3.3. Estatísticas e 1RM do Exercício (`GET /api/workouts/exercises/:id/stats`)

Obtém métricas agregadas de força e frequência para um exercício específico.

- **Exemplo de Chamada cURL:**
  ```bash
  curl -s -H "Authorization: Bearer $PRAXIS_API_KEY" \
    "http://127.0.0.1:18556/api/workouts/exercises/exercise-uuid/stats"
  ```

- **Formato da Resposta:**
  ```json
  {
    "exercise_id": "exercise-uuid",
    "best_1rm": 102.5,
    "best_weight": 90,
    "best_reps": 12,
    "last_performed_at": "2026-08-20T18:30:00.000Z",
    "total_work_sets": 24,
    "total_sessions": 8
  }
  ```

---

### 3.4. Heatmap Anual (`GET /api/workouts/heatmap`)

Gera dados agregados de frequência para o grid de contribuições do ano.

- **Exemplo de Chamada cURL:**
  ```bash
  curl -s -H "Authorization: Bearer $PRAXIS_API_KEY" \
    "http://127.0.0.1:18556/api/workouts/heatmap?year=2026"
  ```

---

### 3.5. Histórico e Sessões (`GET /api/workouts/sessions`)

Lista sessões completas com discriminação de séries de trabalho (`work`) vs aquecimento (`warmup`).

- **Exemplo de Chamada cURL:**
  ```bash
  curl -s -H "Authorization: Bearer $PRAXIS_API_KEY" \
    "http://127.0.0.1:18556/api/workouts/sessions?status=completed&limit=5"
  ```

---

## 4. Garantias e Diretrizes para A.N.A.

1. **Read-Only / Idempotência:** Todas as rotas acima são idempotentes e nunca alteram o estado do banco.
2. **Exclusão de Aquecimento:** Todas as agregações de 1RM, volume e mapa muscular excluem estritamente séries com `set_role = "warmup"`.
3. **Vocabulário Muscular Estável:** Os IDs musculares são sempre os 18 canônicos (`trapezius`, `deltoids`, `chest`, `upper-back`, etc.).
