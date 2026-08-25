# Plano Jota Fit 2.0 — convergência dentro da Praxis

**Fase:** 0 (auditoria). Sem implementação.
**Data:** 2026-08-25
**Repos auditados:**
- Praxis Treinos: `/root/.hermes/workspaces/apps/praxis` (`main`, HEAD `d952c6b` no momento da auditoria)
- Jota Fit legado: `/root/.hermes/workspaces/apps/jota-fit` (`main`, HEAD `e63c3f4`)
**Fonte de dados viva:** SQLite de produção `apps/praxis/api/praxis.db` (cwd de `praxis-api`)
**Este documento substitui** `PRD-JOTA-FIT-EVOLUCAO.md` (2026-05-06, Base44 + RPG/SaaS). Aquele PRD descreve o produto antigo. Não é o norte do 2.0.

---

## 0. Decisão travada

Hoje o Jota Fit é o módulo fitness nativo da Praxis, usado pelo João.

Não é um app paralelo. Não é iframe. Não é segundo banco. Não é port do Base44.

```
Praxis
├── Hoje / Tarefas / ...
└── Jota Fit          ← hoje ainda rotulado "Treinos" em /treinos
    ├── Hoje
    ├── Treino (sessão)
    ├── Programa
    ├── Biblioteca
    ├── Progresso     ← ainda não existe como aba
    └── Corpo         ← ainda não existe como aba (mapa sim)
```

Futuro (não agora):

```
              Jota Fit Core (domínio + API)
             /                             \
Praxis / Jota Fit                    Jota Fit standalone
uso do João                          alunos / personal
```

North star pessoal: João treina do início ao fim no Jota Fit dentro da Praxis e prefere isso a qualquer outro tracker. Alunos, SaaS, IA coach, ranking e gamificação ficam depois do product gate (10 treinos no 2.0).

---

## 1. Auditoria factual — Praxis Treinos (coração)

### 1.1 Onde vive

| Superfície | Evidência |
|---|---|
| Nav secondary | `src/lib/praxisNav.js`: `{ path: "/treinos", label: "Treinos" }` acima de Nutrição |
| Rota | `src/App.jsx`: `<Route path="/treinos" element={<Treinos />} />` |
| Título mobile | `src/components/layout/MobileTopBar.jsx`: prefix `/treinos` → "Treinos" |
| Página | `src/pages/Treinos.jsx` |
| Sessão | `src/components/workouts/WorkoutSessionView.jsx` (chrome de shell desliga via `useWorkoutSessionMode`) |
| API | `api/workouts.js` + `api/lib/workoutV4Core.js` |
| Cliente | `src/api/praxisClient.js` (`praxisApi.workouts.*`). Há um `workoutsApi.js` paralelo, incompleto. A UI usa o objeto em `praxisClient`. |
| URL prod | `https://dopraxis.vercel.app/treinos` |

Abas internas atuais: **Hoje · Biblioteca · Mapa · Programa · Histórico**.

"Treino" não é aba: a sessão substitui a página inteira.

### 1.2 Modelo persistido (canônico)

Sete tabelas. Nenhuma tem `user_id`, `athlete_id` ou `email`. Single-user implícito (o João).

| Tabela | Papel | Linhas vivas |
|---|---|---|
| `workout_exercises` | catálogo + custom | 1365 (1324 `source=catalog`, 41 `custom`) |
| `workout_programs` | ciclo | 1 ativo: **Push Pull Legs — Skills híbridas** |
| `workout_days` | dias do ciclo | 5 (todos `training`, sem dia de descanso no ciclo) |
| `workout_day_exercises` | exercício programado | 35 |
| `workout_sessions` | sessão | 14 (7 `completed`, 7 `abandoned`; todas `kind=program`) |
| `workout_session_exercises` | snapshot na sessão | 109 |
| `workout_session_sets` | logbook | 94 (87 `work`, 7 `warmup`; 4 com `is_pr=1`) |

Dias do programa ativo:

| pos | nome | min |
|---|---|---|
| 0 | Pull 1 — Principal (barra + costas) | 90 |
| 1 | Legs — Principal | 75 |
| 2 | Push 2 — Secundário (straight-arm) | 60 |
| 3 | Pull 2 — Secundário (front lever) | 70 |
| 4 | Push 1 — Principal (OAHS + tuck PU) | 85 |

Última sessão **completa** no banco: 2026-08-24, Legs — Principal.

Peso corporal vive fora do domínio de treino: `body_weight_logs` (1 registro). Não há tabela de circunferências.

Não existe tabela `jotafit_*`. Não existe `workout_personal_records`. PR é coluna no set (`is_pr`, `pr_type`) + 1RM Epley derivado.

### 1.3 Capacidades no código (não no PRD)

| Capacidade | Estado |
|---|---|
| Programa multi-dia + editor | KEEP. V1. |
| Começar / continuar / abandonar / finalizar | KEEP. |
| Começar qualquer dia do ciclo | KEEP (preferência João). |
| Treino livre (`kind=freestyle`) | API existe. Botão na UI existe. Cliente `sessions.start()` só serializa `workout_day_id`. Risco de 404. Não é F1. |
| Séries kg/reps, elástico, RIR, warmup/work, qualidade | KEEP. V2. |
| Prefill último treino | KEEP. V4 fase 7 no código. |
| Timer de descanso pós-série | KEEP. Persistido na sessão. |
| Wake lock | KEEP. |
| PR toast + 1RM Epley | KEEP. Warmup excluído. |
| GIF/thumb CDN + attribution Gym visual | KEEP. 1324 com `gif_path`. |
| Biblioteca busca/filtro/sheet | KEEP. |
| Mapa Balance / Fatigue / Strength | KEEP. |
| Heatmap no Histórico | KEEP. |
| Superset (`superset_group`) | KEEP no schema/API. |
| Adicionar exercício na sessão | PARCIAL. Picker na UI. `sessions.addExercise` some no overwrite do `praxisClient`. |
| Substituição (trocar exercício da série) | AUSENTE. Não portar o SubstituteModal. F4. |
| Agent snapshot / heatmap no client | PARCIAL. API existe. Spread `workoutsApiModule` em `praxisClient.js:175` é sobrescrito pelo objeto `workouts` em `:350`. Heatmap na UI cai em fallback. Dívida F4, não F1. |
| Ownership multi-user | AUSENTE. Documentar para F8. |
| Progresso por exercício (hoje / anterior / melhor) | PARCIAL. Stats de exercício e 1RM existem. Sem tela "Progresso". |
| Medidas corporais | AUSENTE no módulo. Peso está em Nutrição. |
| Check-in / XP / ranking | AUSENTE (e não deve entrar). |

### 1.4 V4 openGym

PRD `docs/PLANO-PRAXIS-TREINOS-V4-OPENGYM.md` declara fases **0–15 no main**.

No código, a feature flag `VITE_TREINOS_V4` existe (`src/lib/workoutV4/featureFlags.js`) mas **não gateia a UI**. Biblioteca, mapa, mídia, heatmap e 1RM estão ligados em `Treinos.jsx`.

Tratar V4 como **já absorvido no coração**. Jota Fit 2.0 não reabre o catálogo.

### 1.5 Arquivos do módulo hoje

Página: `src/pages/Treinos.jsx`

Componentes: `src/components/workouts/`
`ExerciseDetailSheet.jsx`, `ExerciseMedia.jsx`, `ExercisePickerDialog.jsx`, `WorkoutDayDialog.jsx`, `WorkoutExerciseConfigDialog.jsx`, `WorkoutHeatmap.jsx`, `WorkoutHistory.jsx`, `WorkoutLibrary.jsx`, `WorkoutMuscleMap.jsx`, `WorkoutProgramDialog.jsx`, `WorkoutProgramEditor.jsx`, `WorkoutSessionView.jsx`

Domínio front: `src/lib/workoutV4/` (muscles, map, heatmap, wakeLock, prefill, oneRm, superset, pr, media, names, featureFlags)

API: `api/workouts.js`, `api/lib/workoutV4Core.js`

Testes: `api/workouts.test.mjs`, `api/workoutV4Core.test.mjs`, `e2e/workouts-v1.spec.js`, `e2e/workouts-v4.spec.js`

Não criar `src/modules/jota-fit/` nesta fase. Só quando uma área for realmente reescrita (F3+).

---

## 2. Auditoria factual — Jota Fit legado (biblioteca de conceitos)

Stack: React + Vite + **Base44** (`@/api/base44Client`) + camada `@/services`. Dual layout aluno/admin. Acoplamento forte: entities Base44, `student_email` como ownership, Google auth, XP no header.

Contagem: **29 páginas**, **97 componentes**. App.jsx roteia 16 rotas autenticadas + landing/planos/onboarding. Seis páginas órfãs (existem no disco, sem rota): `FeedPage`, `StudentWorkoutsPage`, `StudentMissionsPage`, `NotificacoesPage`, `StudentSkillsPage`, `TrilhasPage`. `HomeDashboard` não é rota: é filho do check-in.

Há **dois sistemas de treino** no legado: o núcleo vivo (Routine → sessão → SetLog) e o RPG (Workout + WorkoutAssignment + HP/boss). Onboarding ainda cria `WorkoutAssignment`. Não portar nenhum dos dois como arquitetura. Praxis já é o núcleo.

### 2.1 Rotas reais (`src/App.jsx`)

Aluno: `/` check-in, `/biblioteca`, `/rotina`, `/jornada` (skills), `/progresso`, `/perfil`, `/minha-semana`, `/carga-semana`, `/treino/:routineId`, `/registrar-atividade`

Admin: `/admin`, `/admin/students`, `/admin/students/:studentEmail`, `/admin/workouts`, `/admin/skills`, `/admin/missions`, `/admin/challenges`, `/admin/painel`, `/admin/ranking`

Público: `/landing`, `/planos`, `/onboarding`

Nav aluno: Home · Rotina · Semana · Progresso · Perfil. XP / nível / streak no topo.

### 2.2 Conceitos vs valor para o 2.0

| Conceito | Onde | Valor real |
|---|---|---|
| Rotina por dia da semana + PPL híbrido | `MinhaRotina`, `pplHybridService`, `pplHybridTemplates.js` | Conceito já coberto pelo programa Praxis (PPL skills híbridas). Não portar o instalador. |
| Execução de treino | `ExecutarTreino` + `components/treino/*` | Lições de UX (números, timer, PR, banda, substituto). Motor = Praxis. |
| Biblioteca | `BibliotecaPage` | Inferior ao catálogo V4 da Praxis. |
| Progresso + medidas | `ProgressoPage` (peso, % gordura, bíceps, peito, cintura, coxa, PRs, gráficos) | Ideia boa. Dados Base44, não Praxis. |
| Carga da semana | `CargaSemana` + `trainingLoad.js` | Heurística por nome da rotina + atividades híbridas. Praxis já tem mapa muscular de verdade (volume/fadiga/1RM). |
| Check-in | `CheckinPage` | XP. Não é fitness-core. |
| Skills / jornada | `SkillsTreePage` (fundação, puxada, empurrada, HSPU, front lever, planche…) | Domínio calistenia real no futuro. Hoje misturado com boss/XP. |
| Missões, desafios, ranking, feed | admin + páginas aluno | Gamificação. Fora. |
| Painel do Jota / alunos / notas | `PainelJota`, `StudentDetailPage`, `consultantService` | Produto personal. F8–F9. |
| Recomendações | `recommendationService`, `RecommendationCard` | Determinísticas fracas. F6 no máximo. |
| AIJotaButton | componente aluno | IA cedo. Proibido até F10. |
| Planos / billing | `PlanosPage` | SaaS. Proibido agora. |

### 2.3 Tipos de domínio já nomeados (`src/services/types.js`)

O legado já descreveu um modelo neutro (JSDoc): `Exercise`, `Routine`, `RoutineExercise`, `WorkoutSession`, `SetLog`, `ExercisePersonalRecord`, `BodyMeasurement`, `Checkin`, `ConsultantNote`, `StudentProfile`.

Mapeamento útil para F2 (nomes, não tabelas novas):

| Legado | Praxis canônico |
|---|---|
| Exercise | `workout_exercises` |
| Routine | `workout_programs` + `workout_days` (ciclo, não weekday solto) |
| RoutineExercise | `workout_day_exercises` |
| WorkoutSession | `workout_sessions` |
| SetLog | `workout_session_sets` |
| ExercisePersonalRecord | derivado dos sets (`is_pr`) |
| BodyMeasurement | AUSENTE (peso em `body_weight_logs`) |
| StudentProfile / studentEmail | AUSENTE. F8: `athlete_id` |

Não copiar as tabelas Base44. Copiar só o vocabulário que ainda falta (Athlete, BodyMeasurement, Skill como domínio fitness).

---

## 3. Matriz KEEP · MERGE · REBUILD · LATER · KILL

Classificação contra o north star pessoal. "Praxis" = Treinos V1–V4 no ar. "Legado" = jota-fit Base44.

| Capacidade | Praxis | Legado | Decisão | Nota |
|---|---|---|---|---|
| Executar treino | forte | existe | **KEEP** Praxis | Coração. F4 refina, não troca. |
| Séries / logbook | forte | existe | **KEEP** Praxis | |
| Carga / reps / elástico / RIR / warmup | forte | existe | **KEEP** Praxis | |
| Prefill | forte | existe | **KEEP** Praxis | |
| Timer descanso | forte | existe | **KEEP** Praxis | |
| Wake lock | existe | ? | **KEEP** Praxis | |
| PR | forte (no set) | entidade própria | **MERGE** depois | Consolidar na leitura. Sem tabela nova agora. |
| 1RM | forte | parcial | **KEEP** Praxis | Epley testado. |
| Biblioteca | 1324 + GIF | menor, Base44 | **KEEP** Praxis | |
| Mapa muscular | forte (3 modos) | carga semanal heurística | **KEEP** Praxis | Legado MERGE só se a pergunta "carga da semana" sobrar depois do mapa. |
| Programa / editor | forte | rotina weekday | **KEEP** Praxis | Programa ativo já é PPL skills híbridas. |
| Treino livre | API+botão, client frágil | registrar atividade | **REBUILD** F4 | Consertar contrato `start`, não portar. |
| Substituição na sessão | só add (client frágil) | SubstituteModal | **REBUILD** F4 | Hoje não troca; só adiciona. Client `addExercise` morto pelo overwrite. |
| Histórico de sessões | existe | existe | **KEEP** Praxis | 7 completas + 7 abandonadas. |
| Progresso por exercício | stats API parcial | tela Progresso | **REBUILD** F5 | Tela nova em cima dos sets Praxis. |
| Consistência (sessões/semana) | heatmap | gráficos | **REBUILD** F5 | |
| Peso | Nutrição `body_weight_logs` | medidas | **MERGE** F5/F6 | Uma fonte. Não duplicar. |
| Circunferências | ausente | BodyMeasurement | **LATER** F6 | Só se o João usar. |
| Check-in diário | ausente | forte (XP) | **KILL** agora | Só volta se responder dor/sono/disposição (F6), sem XP. |
| Skills calistenia | ausente como árvore | árvore + boss | **LATER** F6 | Domínio fitness (Handstand, HSPU, FL, Planche). Sem RPG. |
| Missões / desafios | ausente | existe | **KILL** | |
| XP / streak / ranking / feed | Praxis tem XP de tarefas, não de treino | forte | **KILL** no fitness | |
| Alunos / coach / assignment | ausente | forte | **LATER** F8 | `athlete_id` + ProgramAssignment. |
| Painel personal / ConsultantNote | ausente | existe | **LATER** F9 | |
| Recomendações | mapa já fala fadiga | heurística | **LATER** F6 | Determinísticas. |
| IA coach | agent-snapshot leitura | AIJotaButton | **LATER** F10 | Só leitura/análise. |
| Landing / planos / billing | Praxis tem landing própria | PlanosPage | **KILL** no fitness | |
| Auth Base44 | n/a | Google | **KILL** | Praxis auth atual. |
| Banco paralelo `jotafit_*` | n/a | n/a | **KILL** | |
| iframe / app separado agora | n/a | app vivo | **KILL** como tracker do João | Legado fica arquivado até F12. Não treinar lá. |
| Instalador PPL do legado | n/a | `pplHybridService` | **KILL** | Programa Praxis já cobre. |

Resumo: o 2.0 **não integra os dois apps**. Praxis Treinos vira Jota Fit. O legado é desmontado por peça, na ordem F5–F9, nunca de uma vez.

---

## 4. Arquitetura alvo (dentro da Praxis)

### 4.1 Camadas

```
Praxis shell (auth, nav, layout, deploy)
        │
        ▼
 /jota-fit  (módulo nativo, mesma SPA)
        │
        ▼
 domínio fitness  (funções puras: 1RM, PR, mapa, prefill)
        │
        ▼
 persistência atual  (SQLite workout_* via praxis-api)
```

Regras:

1. Praxis continua dona de autenticação, navegação, infra.
2. Regras de treino não vazam para tarefas/hábitos/nutrição. Peso pode ser *lido* de Nutrição; circunferência, se nascer, nasce no módulo Jota Fit.
3. Uma fonte de verdade: `workout_*`. Proibido `jotafit_sessions` enquanto `workout_sessions` existir.
4. Separação de pasta `src/modules/jota-fit/` só quando F3+ mexer de verdade na área. F1 não move arquivos.
5. Standalone futuro consome a mesma API. Não desenhar multi-tenant agora. Documentar o buraco: **antes de alunos, programas/sessões precisam de `athlete_id`**.

### 4.2 Contratos de domínio (F2, só documentar agora)

| Entidade | Persistência hoje | Contrato mental |
|---|---|---|
| Exercise | `workout_exercises` | id, name, name_pt, source, muscles, equipment, media, tracking |
| Program | `workout_programs` | id, name, is_active, current_day_id |
| WorkoutDay | `workout_days` | id, program_id, name, day_type, position |
| ProgramExercise | `workout_day_exercises` | targets, rest, RIR, superset_group |
| Session | `workout_sessions` | kind program\|freestyle, status, snapshots |
| SessionExercise | `workout_session_exercises` | snapshot do exercício |
| Set | `workout_session_sets` | weight, reps, band, role, rir, is_pr |
| PersonalRecord | derivado | não criar tabela em F1/F2 |
| MuscleLoad | `/api/workouts/muscle-map` | balance / fatigue / strength |
| Athlete | **não existe** | F8 |

F2 é documentação + talvez extrair funções já existentes para um `domain/` sem mudar schema. Sem DDD de teatro.

---

## 5. Estratégia de migração (histórico do João)

**Não migrar Base44 para o SQLite da Praxis.**

O histórico que importa já está em `praxis.db`:

- 7 sessões completas
- 94 sets
- programa PPL skills com 35 exercícios programados
- catálogo 1324 + 41 custom

O Jota Fit legado pode ter sessões antigas no Base44. Elas **não** entram no 2.0 na F1. Se no F7 o João sentir buraco de histórico pré-jul/2026, aí sim um import pontual (F6), com mapeamento explícito `student_email → João` e sem duplicar sets.

Regra: a partir da F1, o tracker do João é só Praxis `/jota-fit`. Legado deixa de receber treino. F12 arquiva.

Backup: o cron SQLite da Praxis (`scripts/praxis-backup.sh`) já cobre `workout_*`. F1 não mexe nisso.

Rollback de dados: F1 não altera schema. Rollback = reverter rotas/labels.

---

## 6. Direção visual (proposta, não F1)

F1 **não redesenha**. Só identidade no shell.

Direção para F3/F4 (quando João pedir):

- Marca Praxis: preto + dourado. Sem laranja "maromba" do legado (`Flame` + `rgba(249,115,22)`).
- Mobile-first 390px. Pouco texto. Números grandes.
- Sessão = modo execução (lição V3): exercício atual, série N de M, carga, reps, um CTA Registrar. RIR/elástico/GIF atrás de "Mais".
- Shell some na sessão (`workoutSessionMode` já faz isso).
- IA interna alvo (F3), 5 itens só:
  - Hoje
  - Programa
  - Biblioteca
  - Progresso
  - Corpo (mapa + peso; medidas se F6)
- Mapa deixa de ser aba irmã de Hoje. Vai para Corpo (ou Progresso, se Corpo ficar fino demais). Decidir na F3, não agora.
- Histórico deixa de ser aba top-level. Vira seção de Progresso.

Não avaliar F3 por screenshot. Critério: abrir → treinar → registrar → descansar → avançar → terminar.

---

## 7. Fase 1 — Jota Fit nasce na Praxis (entregas pequenas)

Objetivo: identidade e fronteira. Zero feature nova. Zero schema. Zero pasta `modules/`.

DoD:

- [ ] Nav mostra **Jota Fit** (não "Treinos")
- [ ] Rota canônica `/jota-fit`
- [ ] `/treinos` redireciona para `/jota-fit`
- [ ] Fluxo atual (hoje, sessão, programa, biblioteca, mapa, histórico) igual
- [ ] Histórico / programas / sessões intactos (mesmo `workout_*`)
- [ ] Smoke treinos e E2E apontam para a rota nova **e** aceitam o redirect
- [ ] Nenhum banco novo

### Entrega 1.1 — rota canônica

Arquivos:
- `src/App.jsx`: `<Route path="/jota-fit" element={<Treinos />} />` + `<Route path="/treinos" element={<Navigate to="/jota-fit" replace />} />`

Prova: abrir `/jota-fit` renderiza a página atual. `/treinos` 302/replace.

### Entrega 1.2 — nav e título

Arquivos:
- `src/lib/praxisNav.js`: path `/jota-fit`, label `Jota Fit`
- `src/components/layout/MobileTopBar.jsx`: prefix `/jota-fit`, title `Jota Fit` (manter `/treinos` no matcher só se o redirect ainda não tiver rodado; preferir um prefix só)

Não promover para primary nav. Continua secondary, acima de Nutrição.

### Entrega 1.3 — copy da página, sem redesign

Arquivo: `src/pages/Treinos.jsx`
- Hero title `Jota Fit` (hoje: kicker "Corpo", title "Treinos")
- `aria-label` das tabs: "Seções do Jota Fit"
- Não mudar as 5 tabs. Não criar Hoje/Progresso/Corpo ainda.

Não renomear o arquivo `Treinos.jsx` na F1 (diff cosmética). Rename na F3 se a página virar shell do módulo.

### Entrega 1.4 — testes e smoke

Arquivos:
- `e2e/workouts-v1.spec.js`, `e2e/workouts-v4.spec.js`, `e2e/mobile-390.spec.js`: `goto('/jota-fit')` (ou visitar `/treinos` e assert URL final `/jota-fit`)
- `scripts/smoke-praxis-treinos.sh`: continua na **API** `/api/workouts/*` (não muda)

`npm run test:workouts` não deve quebrar (API igual).

### Entrega 1.5 — docs operacionais

- Uma linha em `docs/ONDE-ESTAMOS.md`: Treinos passou a se chamar Jota Fit, rota `/jota-fit`, redirect `/treinos`.
- Este arquivo permanece a fonte da convergência.

Fora da F1: pasta `src/modules/jota-fit/`, F2 schema, F3 tabs, conserto do treino livre, tela Progresso.

Estimativa: 1 run de CLI (Codex / Grok 4.6 high / Gemini 3.7) + QA A.N.A. + `prepush:check` + push + `deploy:prod` + alias `dopraxis.vercel.app`. Sem `ship:api` (API não muda).

---

## 8. Mapa de arquivos afetados (F1)

| Arquivo | Mudança |
|---|---|
| `src/App.jsx` | rota `/jota-fit` + redirect `/treinos` |
| `src/lib/praxisNav.js` | path + label |
| `src/components/layout/MobileTopBar.jsx` | título |
| `src/pages/Treinos.jsx` | title/kicker/aria, sem layout novo |
| `src/pages/Landing.jsx` | eyebrow da vitrine: `Treinos` → `Jota Fit` (copy curta, sem redesign) |
| `e2e/workouts-v1.spec.js` | path |
| `e2e/workouts-v4.spec.js` | path |
| `e2e/mobile-390.spec.js` | path |
| `docs/ONDE-ESTAMOS.md` | 1 parágrafo |
| `docs/PLANO-JOTA-FIT-2-CONVERGENCIA.md` | este arquivo (já F0) |

Não tocar: `api/workouts.js`, schema, `praxisClient.js`, sessão, biblioteca.

Grep residual depois do ship: `label: "Treinos"`, `title: 'Treinos'`, `path: "/treinos"` (só o redirect deve restar).

---

## 9. Riscos e rollback

| Risco | Mitigação |
|---|---|
| João (e PWA) com `/treinos` gravado | Redirect replace. Manter até F12. |
| E2E/smoke quebram no path | Atualizar na mesma PR da rota. |
| Tentação de "já que estamos, redesenha" | F1 recusa UI nova. |
| Tentação de portar Base44 | Matriz KILL. Recusar PR que copie pages/admin. |
| Segundo banco | Recusar qualquer `jotafit_` table. |
| Treino livre / addExercise / heatmap no client | `praxisClient` sobrescreve `workoutsApiModule`. F4. Não consertar de passagem na F1. |
| 7/14 sessões abandonadas | Sinal de atrito da sessão (F4), não da identidade. |
| Flag V4 morta | Ignorar. V4 já está on. Não religar flag. |
| PRD antigo RPG (`PRD-JOTA-FIT-EVOLUCAO.md`) | Marcado superado aqui. Não executar. |
| Legado jota-fit.vercel.app ainda no ar | João para de usar como tracker. Arquivo só em F12. |

Rollback F1:

```bash
git revert <sha-f1>
# ou restaurar path /treinos e label Treinos
```

Zero migrate para desfazer. Dados intactos.

---

## 10. Ordem depois da F1 (não executar agora)

```
F0  este documento
F1  identidade /jota-fit
F2  documentar domínio (sem multi-tenant)
F3  UX 2.0 (5 abas)
F4  execução definitiva (inclui treino livre + substituição)
F5  Progresso que serve para treinar
F6  reabsorver MERGE (medidas, carga se ainda faltar, skills fitness)
F7  10 treinos só no 2.0 → JOTA-FIT-USER-ZERO-FEEDBACK.md
    PRODUCT GATE
F8  Athlete / Coach / ProgramAssignment
F9  Painel personal
F10 IA de leitura
F11 standalone
F12 arquivar Base44 + LEGACY-JOTA-FIT-MIGRATION.md
```

Bloqueios explícitos até o gate: SaaS, iframe, segundo tracker, gamificação, IA de escrita em programa, port completo.

---

## 11. Critério de sucesso pessoal (lembrado)

Antes de alunos, o João precisa poder dizer: treina no Jota Fit porque é bom, não porque foi ele que fez.

Prova: 10 treinos completos, nenhum tracker paralelo, histórico confiável, execução rápida, progresso legível, biblioteca boa, programa fácil de editar, mobile excelente, zero dado duplicado Praxis vs Jota Fit.

Hoje: 7 completas no Praxis. O gate F7 ainda não começou.

---

## 12. Próximo passo

F0 fechada neste arquivo.

Implementação **só F1**, depois de OK do João. Sem F3/F4 no mesmo lote.
