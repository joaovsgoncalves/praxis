# Praxis — Poda do sistema de decisão

**Status:** Fase 0 feita na API em 2026-08-24. Fase 1 ainda não.  
**Data:** 2026-08-24  
**Norte:** a Praxis deixa de registrar tudo e reduz o que o João precisa pensar.  
**Fora:** Fase 4 das lentes (Foco→andamento, marcas na Semana). Auto-progresso de meta sem vínculo. Apagar a tabela `rituals`. Feature nova.

---

## Promessa

Depois da poda, o dia mostra **duas rotinas + poucos hábitos que valem acompanhar**. Metas vencidas deixam de mentir. Trabalho GoFluxo deixa de parecer vida pessoal.

## Estado vivo (API, 2026-08-24)

| Peça | Agora |
|------|--------|
| Hábitos de topo | 11 (2 compostos + 9 simples) |
| Passos | 9 (contam como 20 linhas se somar pai+filho) |
| Abertura | já existe: levantar, cama, água/luz, banho, café |
| Fechamento | já existe: jantar, banho noite, celular longe, luz |
| Órfãos da manhã | `Manhã sem celular (1h)`, `Planejar o dia` |
| Vaidade | `Banho gelado` |
| Cardio + Treino | os dois `daily` |
| Rituais | 2 ativos, espelho dos compostos. UI usa composto. Não mexer. |
| Pendentes | 12. Animália e Breno em `pessoal`. |
| Goals ativos | 4. Três com deadline hoje e `manual_progress = 0`. |

## Alvo depois da Fase 0

**Rotinas (já existem)**

- Abertura: levantar · cama · água/luz · banho · café · **manhã sem celular**
- Fechamento: inalterado

**Hábitos independentes**

- Sono ≥ 7h
- Treino
- Cardio (3x/semana, não todo dia)
- Água 2L
- Leitura
- Sem pornografia (`since`)

**Arquivados (log fica)**

- Planejar o dia
- Banho gelado

---

## Fases

MVP: **só Fase 0**. Fase 1 só se o João quiser insight de energia honesto. Sem fase automática.

### Fase 0 — Poda de dado (API, sem deploy)

Backup → arquivar 2 hábitos → puxar celular pra Abertura → cardio 3x → sentar 3 goals → vincular Animália.

**Done quando**

- Backup em `/root/.hermes/backups/praxis/db/`
- Ativos de topo = 8 (2 compostos + 6 simples). O 9 do rascunho contava o celular duas vezes.
- Abertura tem 6 passos, o último é `Manhã sem celular (1h)`
- `Planejar o dia` e `Banho gelado` = `archived`
- Cardio = `weekly` + dias `[1,3,5]` (seg/qua/sex)
- 3 goals de 24/08 sem deadline mentiroso
- Tarefa Animália com `goal_id` da meta Animália
- `GET` prova os números acima

### Fase 1 — Categoria GoFluxo (código mínimo + dado)

Sem bucket honesto, Animália/Breno não têm pra onde ir. `farmacia` mistura com RCA.

**Done quando**

- `gofluxo` existe em `CATEGORIES` com label **GoFluxo**
- parse de voz e select de captura conhecem a chave
- 4 tarefas recategorizadas (lista abaixo)
- Badge aparece em `dopraxis.vercel.app`
- RCA (`farmacia`) intacto

### Fora desta frente

- Fase 4 das lentes
- UI de “revisar meta no deadline”
- Calcular progresso sem `goal_id`
- Mexer em rituais / dual-write
- Wipe de tarefas
- Criar hábito composto novo no form (dívida antiga)

---

## IDs vivos (não inventar)

### Hábitos

| id | título | ação Fase 0 |
|----|--------|-------------|
| `af504399-2284-4ed3-913e-395215897e1b` | Abertura do dia | receber o 6º passo |
| `8818b9d9-b1a0-499c-9104-e1579f0afcf1` | Manhã sem celular (1h) | virar filho da Abertura |
| `2b472ae3-c4a1-4362-8dcd-3441a19e47e0` | Planejar o dia | `archived` |
| `4f85e94f-923d-41f3-8c2a-1d0d431cabc8` | Banho gelado | `archived` |
| `3f075f47-bc7f-4051-8045-b5cf68f5d61b` | Cardio 30 min | `weekly` + `[1,3,5]` |
| `05c255e3-dea5-4076-b1b6-80cc31108e5f` | Treino | não mexer |

Passos atuais da Abertura (manter todos, senão o sync **arquiva**):

1. `6c342fe3-4acd-4a45-9ce3-c1a332a4fb31` Levantar às 06:00  
2. `36334ac6-4a51-4baa-9ec3-712938fa2784` Arrumar a cama  
3. `5989c0a7-fa61-4706-936b-e43579db5d5b` Água e luz natural  
4. `bd06e292-f59f-4388-a597-883ee675e807` Banho e higiene pessoal  
5. `b5a00bbf-7cce-491a-b469-6ebc5979c913` Café da manhã e suplementos  

### Goals

| id | título | ação Fase 0 |
|----|--------|-------------|
| `d48a24f3-7da8-4e4d-b652-849246e97e09` | Fechar bem a entrega da Animália | `deadline=2026-08-31`, vincular tarefa |
| `26ac60fa-25c4-402a-8b5c-a51626ab6199` | Entender a vaga de propagandista | `deadline=null`, `manual_progress=40`, nota de currículo enviado |
| `6c3d0863-f008-442c-a3ef-9ab6f02ba2e5` | Estabilizar a base: mobilidade + dívidas | `deadline=null` (não é meta de um dia) |
| `b3002766-2611-400c-a375-eb975920ed13` | Viajar para a Lituânia | não mexer |
| `6f03630d-c0a0-446d-9ad9-345f1064b452` | Radar | já `paused` |

### Tarefas (Fase 1)

| id | título | de → para |
|----|--------|-----------|
| `3d48493b-b8f4-435f-a046-3c3ebbff82be` | Animália — um bloco só… | `pessoal` → `gofluxo` |
| `47245185-d5bd-45a3-a658-f7d773cc3c37` | Falar com o Breno: parceria + R$1.300… | `pessoal` → `gofluxo` |
| `7b6a607a-8498-46fb-ac89-aaf0d1009a8d` | Comprar a passagem da quinta 27 | `pessoal` → `gofluxo` |
| `f8f8de61-12d9-452d-b339-832df102cb7c` | Viagem: conferir horário da passagem e sair | `pessoal` → `gofluxo` |

Ficam `pessoal`: cartinhas. Ficam `farmacia`: RCA.

---

## Tasks

### Fase 0

**P0-T01 — Backup**

```bash
python3 - <<'PY'
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
src = Path("/root/.hermes/workspaces/apps/praxis/api/praxis.db")
dst = Path("/root/.hermes/backups/praxis/db") / f"pre-poda-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.db"
dst.parent.mkdir(parents=True, exist_ok=True)
src_conn = sqlite3.connect(src)
dst_conn = sqlite3.connect(dst)
src_conn.backup(dst_conn)
dst_conn.close(); src_conn.close()
print(dst)
PY
```

Prova: arquivo existe e `PRAGMA quick_check` = `ok`.

**P0-T02 — Arquivar Planejar o dia e Banho gelado**

```bash
curl -sS -X PUT -H "Authorization: Bearer $FORJA_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"archived"}' \
  http://127.0.0.1:18556/api/habits/2b472ae3-c4a1-4362-8dcd-3441a19e47e0
curl -sS -X PUT -H "Authorization: Bearer $FORJA_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"archived"}' \
  http://127.0.0.1:18556/api/habits/4f85e94f-923d-41f3-8c2a-1d0d431cabc8
```

**P0-T03 — Celular entra na Abertura**

`PUT /api/habits/af504399-2284-4ed3-913e-395215897e1b` com `children` = os 5 ids atuais **nesta ordem** + `{ "id": "8818b9d9-b1a0-499c-9104-e1579f0afcf1" }`.  
Não omitir nenhum dos 5. Sync arquiva filho que sumir da lista.

**P0-T04 — Cardio 3x**

```bash
curl -sS -X PUT -H "Authorization: Bearer $FORJA_API_KEY" -H "Content-Type: application/json" \
  -d '{"frequency":"weekly","recurrence_days":[1,3,5]}' \
  http://127.0.0.1:18556/api/habits/3f075f47-bc7f-4051-8045-b5cf68f5d61b
```

**P0-T05 — Goals honestos**

- Animália: `PUT` `{ "deadline": "2026-08-31" }`
- Vaga: `PUT` `{ "deadline": null, "manual_progress": 40, "description": "<texto atual + linha: 2026-08-24 currículo e perguntas enviados; esperando retorno.>" }`
- Base: `PUT` `{ "deadline": null }`

**P0-T06 — Vincular tarefa Animália**

`PUT /api/tasks/3d48493b-b8f4-435f-a046-3c3ebbff82be` `{ "goal_id": "d48a24f3-7da8-4e4d-b652-849246e97e09" }`

**P0-T07 — Prova**

`GET /api/habits?status=active` → 9 de topo; Abertura `children.length === 6`; Cardio weekly; os dois arquivados ausentes.  
`GET /api/goals` → nenhum dos três com deadline `2026-08-24`.  
`GET /api/tasks/3d48493b-b8f4-435f-a046-3c3ebbff82be` → `goal_id` preenchido.

### Fase 1

**P1-T01** — `src/lib/categories.jsx`: chave `gofluxo`, label `GoFluxo`, cor distinta de `farmacia` e `pessoal`.  
**P1-T02** — `api/routes/parseVoice.js`: incluir `gofluxo` no set, aliases `gofluxo|animalia|breno|parceria`, prompt do parser.  
**P1-T03** — `src/pages/VoiceCapture.jsx`: item `GoFluxo` no select hardcoded.  
**P1-T04** — recategorizar as 4 tarefas da tabela.  
**P1-T05** — `prepush:check` → push → `deploy:prod` + alias `dopraxis.vercel.app` → badge visível. Sem `ship:api` se só o parse mudou? Parse é API: `ship:api` + restart `praxis-api`.

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| `PUT children` sem os 5 passos atuais | Lista explícita acima. Conferir GET antes. |
| Cardio 3x sem o João escolher os dias | Default seg/qua/sex. Ele muda se quiser. |
| `gofluxo` sem label | Não recategorizar na Fase 0. Badge some. |
| Dual ritual + composto | Ignorar. UI já lê composto. |

## Ship

- Fase 0: zero git. Só API + backup.  
- Fase 1: committer `João Victor <joaovs.goncalves1@gmail.com>` + push `main` + `ship:api` + restart + `deploy:prod` + alias.

Executor: A.N.A. nesta sessão. Não é UI multi-arquivo de produto novo.
