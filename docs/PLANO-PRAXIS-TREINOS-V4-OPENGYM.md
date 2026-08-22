# Plano / PRD — Treinos V4 (absorção openGym → Praxis)

**Data:** 2026-08-22  
**Status:** plano aceito em direção (sem código ainda)  
**Produto:** módulo **Treinos** na Praxis (`/treinos`) — evolução V1–V3, não app paralelo  
**URL canônica:** `https://dopraxis.vercel.app/treinos`  
**Referência visual/funcional:** Reel IG `DcVfUp6Cvs6` · [openGym](https://gitea.com/DuarteSantos/openGym) (AGPL-3.0) · dataset [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT metadata + mídia © Gym visual)  
**Clone local de estudo (VPS):** `/tmp/opengym-src` (shallow; regenerar se sumir)  
**Playbook:** `brains/ana-brain-core/05-playbooks/opengym-reel-absorvido-praxis-treinos.md`  
**Taskflow:** `brains/ana-brain-core/taskflow/tasks/2026-08-22-praxis-treinos-v4-opengym.md`  
**Executor padrão por fase:** **Grok 4.6 high** (CLI headless)  
**Orquestração / verificação / ship:** **A.N.A.**  
**Não-alvo:** instalar openGym como produto; copiar código AGPL pro bundle Praxis; virar SaaS multi-user fitness; laranja “gym app”; tirar V3 execução.

---

## 1. Por que existe

O Reel do openGym não é “mais um tracker”. É o espelho do que a sessão Praxis ainda não entrega completo:

1. **Biblioteca rica** (1324 exercícios + instrução + alvo muscular) em vez de só catálogo manual fino.  
2. **Demo animada (GIF)** no meio da série — reduz dúvida de forma na academia.  
3. **Mapa muscular** legível (volume / recuperação / força) — “o que treinei / o que está fraco”.  
4. **Feedback vivo** (PR na hora, 1RM estimado, prefill inteligente, wake lock).

A Praxis já é o cockpit de vida do João. Treinos V1–V3 deram programa, logbook, elástico, RIR e modo execução. V4 **fecha o gap de produto de academia** sem trocar de app.

**Correção de produto (João 2026-08-22):** mapa de músculos e ~1300 GIFs **não são enfeite**. Entram no PRD como entregáveis de fase, com trilha legal e performance explícitas.

---

## 2. Problema e promessa

| | |
|---|---|
| **Problema** | Sessão executa bem, mas falta catálogo denso, demo visual e insight de músculo. Programa ainda “parece lista”; Histórico não conta a história do corpo. |
| **Promessa** | Abrir Treinos e: achar exercício com demo, montar/rodar sessão com GIF minimizável, ver mapa do que foi treinado, receber PR/1RM sem planilha. |
| **Veredito de sucesso** | João usa `/treinos` na academia com GIF + rest + PR; no sofá olha mapa Balance e sabe o que falta na semana. |

---

## 3. Arquitetura travada

```
exercises-dataset (MIT JSON + paths de mídia)
        │  seed / sync offline de METADATA
        ▼
praxis-api SQLite
  workout_exercises  (+ catalog_external_id, target, secondary, media_*)
  workout_* (programa / sessão / sets)  — já existe
  workout_muscle_stats (cache opcional)  — se preciso
        ▲
        │  cookie praxis_sid / Bearer FORJA_API_KEY
        │
   Frontend /treinos
     Biblioteca · Sessão (GIF+log) · Mapa · Stats
        │
        │  mídia: CDN jsDelivr OU self-host VPS /media/exercises
        ▼
 © Gym visual (attribution obrigatória) — ver §3.1
```

### 3.1 Decisões (não reabrir sem pedido)

1. **Produto = Praxis Treinos.** openGym é referência de UX/comportamento, não fork.  
2. **Licença de código:** openGym = **AGPL-3.0**. Ler e estudar ok. **Proibido** copiar `frontend/src/**` pro repo Praxis. Reimplementar comportamento + testes próprios (MIT-clean no Praxis).  
3. **Dataset metadata = MIT** (`data/exercises.json`): nome, body_part, equipment, target, secondary_muscles, instruction_steps.en (e depois PT se gerarmos). Seed no SQLite.  
4. **Mídia (thumb + GIF) = © Gym visual**, redistribuída no dataset *com permissão deles para o dataset*; **reuse em outro produto** exige licença própria / conformidade com [termos Gym visual](https://gymvisual.com/content/3-terms-and-conditions-of-use).  
   - **Modo A (default V4 MVP, uso pessoal João):** carregar mídia via **CDN jsDelivr** do repo `hasaneyldrm/exercises-dataset` (igual demo openGym mobile) **sem** commit de binários no git Praxis; footer `© Gym visual — gymvisual.com` em toda UI de mídia.  
   - **Modo B (self-host):** script one-shot baixa ~140 MB para volume na VPS (`/var/lib/praxis/exercise-media` ou similar), serve sob auth/rota estática do `praxis-api` ou nginx local; **não** publicar espelho público anônimo se a licença exigir.  
   - **Modo C (licença paga):** se João quiser comercializar Praxis fitness no futuro → licença Gym visual antes de marketing.  
5. **Não commitar ~140 MB de GIF no GitHub.** Paths + `media_id` no DB; binário fora do git.  
6. **Catálogo global + exercícios custom do João.** Custom: sem GIF (placeholder), com `muscle_group` manual.  
7. **Programa do João não some.** Seed **não** apaga exercícios custom nem day_exercises. Link opcional `catalog_external_id` / `source=catalog|custom`.  
8. **Mapa muscular = feature de produto**, não vanity. Três modos (espelho conceitual openGym):  
   - **Balance** — volume relativo (sets de trabalho elegíveis) na janela 7/14/28 dias.  
   - **Fatigue / recovery** — quão “fresco” cada músculo (decay por dias desde último estímulo).  
   - **Strength** — 1RM estimado relativo por músculo (melhor set elegível).  
9. **Warmup / RIR fora da matemática** de PR, 1RM e volume do mapa (só sets `work` / `set_role` não-warmup).  
10. **UI marca Praxis:** preto + dourado (+ verde se já usado). Zero skin laranja fitness. Mobile-first 390px. Sessão = modo execução V3 (números grandes, 1 CTA).  
11. **Nav:** continua secondary **Treinos** (acima Nutrição). Sub-tabs internas: Hoje · Biblioteca · Programa · Mapa · Histórico (nomes PT curtos).  
12. **Uma fase por vez.** Comando: `arrocha treinos v4 fase N` → A.N.A. briefa Grok 4.6 high → A.N.A. verifica → ship se gate ok → só então N+1.  
13. **Sem cron novo** sem OK. Seed/import = script manual ou endpoint admin com Bearer.  
14. **Idioma UI = PT-BR.** Instruções do dataset começam em EN; fase dedicada pode traduzir top-N do programa do João (não 1324 de uma vez).  
15. **Body map SVG:** reimplementar paths próprios ou asset MIT; **não** colar `body-paths.js` do openGym (AGPL).

### 3.2 O que já existe (não reinventar)

| Área | Estado |
|------|--------|
| Programa multi-dia + editor | V1 |
| Sessão ativa + log sets + RIR + band | V1–V2 |
| Prefill last (básico) | V2 |
| Warmup metadata | V2 |
| Rest timer + V3 execução (1 CTA, steppers, chrome off) | V3 `88032c8` |
| `muscle_group` texto livre no exercício | V1 |
| Peso corporal | Nutrição / weight API |
| Auth + deploy Praxis | padrão product-ops |

### 3.3 Fontes de verdade técnica

| O quê | Onde |
|-------|------|
| API workouts | `api/workouts.js` |
| UI sessão | `src/components/workouts/WorkoutSessionView.jsx` |
| UI home treinos | `src/pages/Workouts.jsx` (ou path atual) |
| Testes | `npm run test:workouts` · `e2e/workouts-v1.spec.js` |
| Design | `docs/DESIGN.md` · `references/praxis-treinos-design-visibility.md` |
| openGym estudo | `/tmp/opengym-src/frontend/src/lib/{muscles,onerm,recovery,wakelock,progression,exercises}.js` · `BodyMap.jsx` · `Media.jsx` |
| Dataset | `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json` |
| CDN mídia (padrão jsDelivr) | `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/` e `.../videos/` |

---

## 4. Modelo de dados (alvo)

### 4.1 Extensões em `workout_exercises`

| Coluna | Tipo | Notas |
|--------|------|--------|
| `catalog_external_id` | TEXT NULL | id dataset `"0001"`… |
| `source` | TEXT | `custom` \| `catalog` (default custom para linhas antigas) |
| `body_part` | TEXT | waist, chest, … |
| `target_muscle` | TEXT | abs, pectorals, … (vocab dataset) |
| `secondary_muscles_json` | TEXT | JSON array |
| `media_id` | TEXT | ex. `2gPfomN` |
| `thumb_path` | TEXT | relativo `images/0001-….jpg` |
| `gif_path` | TEXT | relativo `videos/0001-….gif` |
| `attribution` | TEXT | default Gym visual string |
| `instructions_json` | TEXT | `{en:[...], pt:[...]}` steps |
| `equipment_key` | TEXT | normalizado dataset |
| `is_bodyweight_default` | INTEGER 0/1 | seed de bw |

Índices: `(catalog_external_id)`, `(body_part)`, `(target_muscle)`, `(name)`.

**Compat:** linhas atuais do programa do João permanecem `source=custom` sem media; editor pode “vincular ao catálogo” depois.

### 4.2 Sessão / sets (mínimo novo)

- Manter `set_role` / warmup; se faltar flag clara de warmup elegível, normalizar na fase de PR/1RM.  
- Opcional fase S: `is_pr INTEGER` denormalizado no set (ou só compute on write).  
- Opcional: `estimated_1rm_kg` no set work (cache).

### 4.3 Mapa (compute-first; cache se lento)

Endpoint: `GET /api/workouts/muscle-map?mode=balance|fatigue|strength&days=14`  
Payload:

```json
{
  "mode": "balance",
  "days": 14,
  "muscles": [
    { "id": "chest", "label": "Peito", "score": 0.82, "raw": 24, "unit": "sets" }
  ],
  "window": { "from": "…", "to": "…" }
}
```

Vocabulário canônico Praxis (18 músculos, ordem cabeça→pé) — espelho conceitual openGym, labels PT:

`trapezius, deltoids, chest, upper-back, serratus, biceps, triceps, forearm, abs, obliques, lower-back, gluteal, quadriceps, hamstring, adductors, hip-flexors, calves, tibialis`

Alias EN dataset → id canônico documentado em `src/lib/workouts/muscleAlias.js` (reimplementado).

Regras de peso:
- primary target = 1.0  
- cada secondary = 0.4 (cap/documentar)  
- custom só com `muscle_group` → map via body_part fallback  
- excluir warmup e sets incompletos

### 4.4 1RM

Fórmula default **Epley**: `w * (1 + r/30)` com `1 ≤ r ≤ 12`; Brzycki opcional depois.  
Excluir warmup, band-only sem kg se kg=0 e não bw, cardio.

---

## 5. UX (norte)

### 5.1 Biblioteca

- Busca nome + chips body_part + equipment.  
- Grid/list com thumb 180; tap → sheet: GIF, steps, músculos, “Adicionar ao dia”.  
- Empty/custom: ícone dumbbell Praxis.

### 5.2 Sessão

- Acima do log: **Media** (GIF autoplay, tap pause, minimize full/mini persistido `localStorage`).  
- Attribution discreta.  
- Wake lock enquanto `active`.  
- Ao registrar work set que bate PR → toast Sonner success 1×.  
- Rest hero V3 permanece dono do first-fold numérico.

### 5.3 Mapa

- Silhueta frente/costas (toggle).  
- 3 modos em segmented control.  
- Janela 7 / 14 / 28.  
- Lista lateral “mais / menos treinados”.  
- Empty: “Fecha 1 treino com catálogo linkado pra mapa ficar esperto” + CTA Biblioteca.

### 5.4 Fora de escopo V4

- Multi-usuário / invite  
- Passkey self-host  
- 10 idiomas UI  
- Import Strong/Hevy (backlog V5)  
- Push notification nativa do rest (PWA depois)  
- Substituir Nutrição weight UI  

---

## 6. Fases de implementação

**Regra de ouro:** 1 fase = 1 run Grok 4.6 high + verificação A.N.A. + (se gate) commit/push/ship.  
**Não** misturar fase de mídia com fase de mapa no mesmo brief.  
**Branch preferida:** `agent/treinos-v4-fase-N` → A.N.A. merge/ship main após QA.

### Matriz

| Fase | Nome | Entrega | Done-when (prova) | Risco |
|------|------|---------|-------------------|-------|
| **0** | Trilho + legal + scaffold | Doc ops short, feature flag `TREINOS_V4`, checklist mídia A/B, pasta `src/lib/workouts/`, testes vazios/smoke schema plan | PRD linkado; `prepush` verde sem feature; João confirma Modo A ou B mídia | baixo |
| **1** | Schema catálogo | Migrate SQLite colunas §4.1; helpers normalize; testes migrate round-trip | `npm run test:workouts` cobre colunas novas; API antiga não quebra | médio |
| **2** | Seed metadata 1324 | Script `scripts/seed-exercise-catalog.mjs` lê JSON (local cache ou fetch); upsert por `catalog_external_id`; **sem** baixar GIF no git | Contagem ≥1320 no DB; custom do João intactos; dry-run + apply | médio |
| **3** | API catálogo | `GET /exercises` filtros q/body/equipment/source; `GET /exercises/:id`; paginação; auth igual workouts | curl auth 200 + filtros; testes node | baixo |
| **4** | UI Biblioteca | Tab Biblioteca: busca, chips, lista virtualizada se preciso, sheet detalhe (thumb CDN, steps EN) | Browser 390: busca “bench” acha; sheet abre; marca Praxis | médio |
| **5** | Mídia na sessão | Componente `ExerciseMedia`; GIF/thumb na sessão se path existe; mini/full; attribution; lazy | Sessão com ex catalog: GIF carrega; minimize ok; custom sem GIF ok | médio |
| **6** | Sessão S1 polish | Wake lock; PR detect + toast; rest hero parity check | Wake lock request em active; PR toast 1×; warmup ≠ PR; browser real | baixo |
| **7** | Prefill + cascade | Prefill por índice de set work; cascade carga warmup | Mudar A1 propaga A2; work não puxa de warmup | médio |
| **8** | 1RM API + UI | `estimate_1rm` lib + badge no histórico/sheet exercício | Teste unit Epley; UI mostra kg estimado | baixo |
| **9** | Mapa Balance | Alias + agregação volume + SVG próprio + endpoint + tab Mapa modo Balance | Após 1 sessão seed, peito/costas diferem; browser | **alto** |
| **10** | Mapa Fatigue + Strength | Mesmos endpoints modos; decay + 1RM relativo | 3 modos trocam cor; testes score | alto |
| **11** | Heatmap ano | Contrib graph no Histórico (sets/sessões por dia) | Ano corrente pinta dias com treino | médio |
| **12** | Superset + freestyle | `superset_group` no day_exercise; UI par A↔B; sessão freestyle | Programa com par; rest skip entre par | alto |
| **13** | Agent read API | Endpoints read-only documentados p/ A.N.A. (`muscle-map`, `estimate-1rm`, last workouts) | curl + nota skill `praxis-treinos-v4` | baixo |
| **14** | PT instructions top-N | Traduz/saves steps PT só exercícios do programa ativo + top uso | Steps PT no sheet dos do João | médio |
| **15** | Harden + ship full | E2E estendido; smoke treinos; perf GIF; docs ONDE-ESTAMOS | `prepush` + `test:workouts` + browser QA + alias `dopraxis.vercel.app` | médio |

### Fase 0 — detalhe (antes de qualquer migrate)

1. Confirmar **Modo mídia A (CDN)** vs **B (self-host)** com João (default A).  
2. Congelar lista de 18 músculos + labels PT.  
3. Criar `docs/treinos-v4-media-notice.md` (attribution + link termos).  
4. Feature flag front `VITE_TREINOS_V4=1` (ou settings) — default off até fase 4.  
5. Não baixar 140 MB ainda.

### Brief padrão Grok 4.6 high (A.N.A. preenche)

```text
Repo: /root/.hermes/workspaces/apps/praxis
Branch: agent/treinos-v4-fase-N
PRD: docs/PLANO-PRAXIS-TREINOS-V4-OPENGYM.md — SOMENTE Fase N
Referência comportamento (NÃO copiar código AGPL): /tmp/opengym-src/...
Constraints:
- PT-BR UI; marca preto+ouro; mobile 390
- Não commitar binários de mídia
- Não copiar openGym source
- Não quebrar programa/sessões existentes do João
- Testes: npm run test:workouts (+ lint/typecheck/build no prepush)
- Sem push/deploy (A.N.A. shipa)
Done-when: <copiar da matriz da fase>
Entregar: summary, files, testes, riscos
```

### Ship checklist (A.N.A. por fase que mexe prod)

1. Diff review (AGPL leak scan: greps de strings/unique openGym).  
2. `npm run test:workouts` + `npm run prepush:check`.  
3. Merge main (committer João Victor).  
4. Se `api/`: `npm run ship:api` + restart `praxis-api`.  
5. `npm run deploy:prod` + alias `dopraxis.vercel.app`.  
6. Browser QA no path da fase (não só screenshot).  
7. Marcar fase `done` no taskflow + commit doc se status mudar.  
8. Resposta curta ao João: feito · prova · commit · URL · próxima fase.

---

## 7. Critérios de aceite do V4 completo

- [ ] ≥1300 exercícios catalogados no DB (metadata), custom preservados  
- [ ] Biblioteca usável no celular (busca + filtro + sheet)  
- [ ] GIF na sessão para exercício de catálogo; attribution visível; custom sem quebrar  
- [ ] Wake lock + PR toast na sessão  
- [ ] Mapa com ≥1 modo Balance útil após treinos reais  
- [ ] Fatigue + Strength ou explicitamente cortados só com OK do João  
- [ ] 1RM Epley testado  
- [ ] Zero código AGPL no tree (`rg` spot-check)  
- [ ] Zero binários pesados no git  
- [ ] `prepush:check` verde · smoke prod · browser sessão real  

---

## 8. Ordem recomendada de “arrocha”

MVP sensação openGym (João na academia + mapa):

`0 → 1 → 2 → 3 → 4 → 5 → 6 → 8 → 9`  

Depois polir:

`7 → 10 → 11 → 12 → 13 → 14 → 15`

Comando:
- `arrocha treinos v4 fase N` — só essa fase  
- `status treinos v4` — tabela fases done/pending  
- `para v4` — não iniciar próxima  

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Licença Gym visual | Modo A CDN + attribution; doc notice; C se comercial |
| Bundle/perf 1324 | Virtualizar lista; mídia lazy; seed server-side |
| AGPL contamination | Review A.N.A.; proibir paste; reimplement |
| Programa João quebra | Migrate additive; seed upsert só catalog ids |
| Mapa errado (alias) | Testes unit alias + golden exercises (bench→chest) |
| GIF come dados mobile | Prefer mini default em sessão; still frame default opcional setting |
| Grok estoura escopo | Brief “SOMENTE Fase N”; A.N.A. rejeita diff fora |

---

## 10. Referências internas

- V1 ops: skill `praxis-product-ops` → `references/praxis-treinos-v1.md`  
- V2: `references/praxis-treinos-v2-logbook-band.md`  
- V3: `references/praxis-treinos-v3-execucao.md` · `docs/PLANO-PRAXIS-TREINOS-V3-EXECUCAO.md`  
- Design sessão: `references/praxis-treinos-design-visibility.md`  
- Absorção reel: `brains/ana-brain-core/05-playbooks/opengym-reel-absorvido-praxis-treinos.md`  
- Padrão módulo novo: Finanças `docs/PLANO-PRAXIS-FINANCAS.md`  

---

## 11. One-liner

**V4 = Praxis Treinos com cara de openGym onde dói: catálogo 1324 + GIF na série + mapa muscular + PR/1RM — reimplementado clean, mídia com attribution, uma fase Grok high por vez, A.N.A. fiscal e ship.**
