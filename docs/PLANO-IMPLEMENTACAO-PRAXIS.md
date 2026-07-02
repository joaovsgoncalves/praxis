# Plano de implementação — Praxis (pós-review Sêneca)

**Criado:** 2026-07-02  
**Dono:** João Victor  
**Executor:** A.N.A. (implementação por ondas na `main`)  
**Fonte:** Review Sêneca + alinhamento produto (subtração, cockpit “agora”, segurança)  
**URL canônica:** https://praxis-jota.vercel.app  
**Repo:** `forja-do-jota` → branch **`main`** (obrigatório push após cada onda entregável)

---

## Como executar (regra operacional)

1. Uma **onda** = 1–N tasks com mesmo tema; cada onda termina com: lint/build, smoke API se backend, **commit + push `main`**, deploy Vercel se só front (ou restart `forja-api` se `api/server.js`).
2. Marcar status neste arquivo: `todo` → `doing` → `done`.
3. Não abrir onda nova de “módulo” antes de fechar P0 segurança (Fase 1).
4. Critério norte do produto: **abrir → ver o agora → executar → registrar vitória → fechar**.

---

## Legenda

| Campo | Significado |
|-------|-------------|
| **ID** | Referência fixa (ex.: `P1-T03`) |
| **Esforço** | S = &lt;2h, M = meio dia, L = 1–2 dias |
| **Bloqueia** | IDs que precisam estar `done` antes |

---

## Fase 0 — Já entregue

| ID | Task | Status |
|----|------|--------|
| P0-T00 | Editar hábito (lápis, PUT, sem duplicar, confirmação excluir hábito/tarefa aberta) | **done** (`0f85de2`) |

---

## Fase 1 — Segurança e dados pessoais (P0)

**Objetivo:** API pública deixa de expor dados sem gate. Browser Vercel continua funcionando.

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P1-T01 | Documentar arquitetura alvo: login no SPA + sessão (cookie httpOnly ou JWT curto) + API valida sessão; A.N.A./cron continuam com `Bearer` server-side | S | `docs/PRAXIS-AUTH-ARCHITECTURE.md` com diagrama e opções descartadas | **done** |
| P1-T02 | Tabela `sessions` (ou `users` + `sessions`): user único João, senha hash (bcrypt), session token, expiry | M | Migration SQLite segura + backup antes | **done** |
| P1-T03 | Endpoints `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | M | Login retorna cookie; logout invalida sessão | **done** |
| P1-T04 | Middleware API: rotas `/api/*` (exceto health + login) exigem sessão válida **ou** `Authorization: Bearer` (FORJA_API_KEY para automação) | M | `curl` sem credencial → 401 em tasks/habits/wellness/calendar | **done** |
| P1-T05 | Front: tela/login gate mínima (senha), `forjaClient` envia cookie/`credentials: include` | M | Vercel: usuário não logado não vê dados | **done** |
| P1-T06 | Vercel: garantir que rewrite `/api` preserva cookies (same-site); testar login em produção | S | Login em `praxis-jota.vercel.app` OK | **done** |
| P1-T07 | Rate limit básico em login (express-rate-limit) | S | Brute force mitigado | **done** |
| P1-T08 | Checklist pós-deploy: endpoints sensíveis 401 anônimo; health 200; Hermes scripts com key ainda funcionam | S | Checklist marcado no doc auth | **done** |

**Bloqueia:** todas as fases de produto abaixo (recomendado).

---

## Fase 2 — Identidade / matar legado na UX

**Objetivo:** Zero “Forja/A.N.A.” visível ao usuário; tom Praxis.

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P2-T01 | Grep UX: strings user-facing `Forja`, `A.N.A`, `forja` em `src/pages`, `src/components`, `index.html` | S | Lista de arquivos no PR/commit | **done** (`docs/P2-UX-STRINGS-AUDIT.md`) |
| P2-T02 | Substituir copy (Ideas, Focus, VoiceCapture, empty states, tooltips) → Praxis / assistente de planejamento / captura por voz | S | Nenhuma string “Forja” em UI | **done** |
| P2-T03 | Modo Foco: “Deep Work” → “Foco profundo”; botão “Iniciar foco de {n} min” | S | Focus.jsx atualizado | **done** |
| P2-T04 | Gamificação: “5 pro próximo” → “Faltam 5 XP” (ou equivalente discreto) | S | Sidebar/Dashboard | **done** |
| P2-T05 | Revisar títulos de página e meta (`document.title` / rotas) | S | Aba do browser só “Praxis” | **done** |

*Não renomear:* `FORJA_*` env, `forja-api.service`, `forjaClient.js`, classes CSS `forja-*` (interno).

---

## Fase 3 — Hábitos: ciclo de vida completo

**Objetivo:** Editar + pausar + arquivar; histórico preservado; frequências reais.

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P3-T01 | Schema: `habits.status` já existe — definir semântica `active` \| `paused` \| `archived` | S | Doc no código + API | **done** (`src/lib/habits.js`, `docs/HABITS-LIFECYCLE.md`) |
| P3-T02 | `GET /api/habits`: default `active`; query `?status=all` para histórico admin | S | Pausados não aparecem no “hoje” | **done** |
| P3-T03 | UI: ações Pausar / Retomar / Arquivar no form ou menu ⋯ (sem delete como única saída) | M | Confirmação só em excluir definitivo | **done** |
| P3-T04 | Delete hábito: hard delete com confirmação **dupla** citando perda de logs | M | Duplo `confirm` | **done** |
| P3-T05 | Frequência: labels + `weekly` + dias (`recurrence_days`) | L | `isHabitDueOnDate` | **done** |
| P3-T06 | Hábitos quantitativos: `target_value` + `unit` + log `value` | L | MVP prompt + progresso | **done** |
| P3-T07 | Lista hábitos: filtro “Ativos / Pausados / Arquivados” | M | Hábitos & Tarefas | **done** |
| P3-T08 | Garantir `habit_logs` intactos em pause/archive; streak recalcula ao retomar | M | Sem DELETE em pause/archive | **done** |

**Depende:** P0-T00 done. P1 recomendado antes de expor mais dados.

---

## Fase 4 — Dashboard “Agora” (bússola)

**Objetivo:** Topo responde “o que faço agora?” em &lt;3s.

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P4-T01 | Componente `NowBlock`: próxima tarefa pendente com `time` hoje, ou primeira P0 sem hora | M | Uma tarefa destacada | **done** |
| P4-T02 | Ações: Começar foco (link Focus + tarefa), Concluir, Adiar (+15min / amanhã) | M | Adiar persiste na API | **done** |
| P4-T03 | Frase fixa: “Se só fizer uma coisa agora, faça isso.” | S | Copy no bloco | **done** |
| P4-T04 | Reordenar Dashboard: 1 Agora → 2 Hoje → 3 Hábitos essenciais → 4 Check-in → 5 Agenda → 6 XP/resumo | M | Ordem visual no JSX | **done** |
| P4-T05 | “Hábitos essenciais”: máx. 3–5 ativos (sort_order ou pin) | M | Config simples ou top N | **done** (top 5) |
| P4-T06 | Esconder/rebaixar heatmap/XP se bloco Agora vazio (estado vazio útil) | S | Empty state com CTA voz/tarefa | **done** |

---

## Fase 5 — Hábitos & Tarefas: menos ruído

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P5-T01 | Card compacto: sempre visível checkbox + título + horário/prioridade/categoria | M | Layout mobile OK | **done** |
| P5-T02 | Menu ⋯: subir, descer, editar, excluir | M | Mesmas ações, menos botões | **done** |
| P5-T03 | Modo compacto toggle (densidade) persistido em `user settings` | M | Settings ou ícone na página | **done** (`list_density`) |
| P5-T04 | Barra progresso hábitos do dia (já existe parcial no header — unificar) | S | Uma barra clara na seção hábitos | **done** |
| P5-T05 | Botão “Limpar ruído”: cancelar pendentes antigas selecionadas com confirmação em lote | L | Opcional; não apagar sem confirm | **done** |

---

## Fase 6 — Modo Foco

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P6-T01 | Pós-sessão: modal “Concluir tarefa?” + “Só registrar tempo” (já parcial no produto) | M | Fluxo explícito pós-timer | **done** |
| P6-T02 | Legenda “Foco por tarefa — últimos 30 dias” | S | Focus.jsx | **done** |
| P6-T03 | Preset Pomodoro com label em PT no botão principal | S | Fase 2 overlap | **done** |

---

## Fase 7 — Ideias (capturar → revisar → executar)

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P7-T01 | Campo `idea_status`: capturada \| promissora \| virou_tarefa \| arquivada (task category ideias ou tabela) | M | API + UI filtro | todo |
| P7-T02 | Botão “Transformar em tarefa” (cria task, link `source_idea_id`, marca ideia) | M | Uma ideia → uma tarefa | todo |
| P7-T03 | Copy: ideia sem mesma pressão visual que tarefa (sem hora/prioridade alta default) | S | Ideas.jsx | todo |
| P7-T04 | Revisão semanal de ideias (lista promissoras) — pode ser subconjunto Fase 8 | M | Tela ou seção | todo |

---

## Fase 8 — Revisão semanal automática

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P8-T01 | Endpoint `GET /api/insights/weekly` agregando: tasks done, hábitos falhos, wellness, focus, ideias | L | JSON estável | todo |
| P8-T02 | Página Revisão: render automático (vitórias, padrão, gargalo, 3 prioridades sugeridas) | L | Não é formulário vazio | todo |
| P8-T03 | Opcional: cron Hermes domingo usa mesmo endpoint e manda resumo Discord/Telegram | M | Read-only script | todo |

---

## Fase 9 — Metas guiadas

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P9-T01 | Empty state metas: wizard 3 passos (meta → prazo → 1 hábito OU 1 tarefa) | M | Não salva meta “solta” sem vínculo | todo |
| P9-T02 | Esconder nav “Metas” se zero metas ativas (feature flag user ou auto) | S | Sidebar condicional | todo |
| P9-T03 | Card meta mostra progresso via linked tasks/habits | M | Goals.jsx | todo |

---

## Fase 10 — Rituais e módulos vazios

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P10-T01 | Esconder Rituais no menu se `rituals.active === 0` | S | Sidebar | todo |
| P10-T02 | Templates iniciais: abertura do dia / fechamento (opcional criar 2 presets) | M | Rituais.jsx | todo |
| P10-T03 | Revisão semanal escondida até Fase 8 entregar valor | S | Nav condicional | todo |

---

## Fase 11 — Gamificação discreta

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P11-T01 | XP/level em collapsible ou rodapé Dashboard, não hero | S | Menos competição com Agora | todo |
| P11-T02 | Achievements: só mostrar se &gt;0 desbloqueados | S | History/gamification | todo |
| P11-T03 | Evento `forja-level-up` renomear display string only (interno pode ficar) | S | Toast diz Praxis | todo |

---

## Fase 12 — Mobile e polish

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P12-T01 | Audit viewport: Hábitos & Tarefas + Agora em 390px | M | Sem overflow CTA | todo |
| P12-T02 | Deep link `/habitos-tarefas?tab=habits` (ou state URL) | S | Share/bookmark | todo |
| P12-T03 | PWA manifest name/icon Praxis (se já existir, conferir) | S | Install banner correto | todo |

---

## Ordem de execução recomendada (ondas A.N.A.)

| Onda | IDs | Meta |
|------|-----|------|
| **1** | P1-T01 … P1-T08 | API privada + login |
| **2** | P2-T01 … P2-T05 | Legado Forja fora da UX |
| **3** | P3-T01 … P3-T04 | Hábitos pausar/arquivar |
| **4** | P4-T01 … P4-T06 | Dashboard Agora |
| **5** | P5-T01 … P5-T04 | Cards ⋯ + compacto |
| **6** | P6-T01 … P6-T03 + P7-T01 … P7-T03 | Foco + ideias |
| **7** | P8-T01 … P8-T02 | Revisão semanal auto |
| **8** | P9 + P10 + P11 | Podar nav + metas + XP |
| **9** | P3-T05 … P3-T08, P5-T05, P12 | Frequências avançadas + mobile |

---

## Métricas de “pronto” (8.7/10 alvo Sêneca)

- [ ] Endpoints pessoais **401** sem sessão (teste externo).
- [x] Zero “Forja” na UI.
- [ ] Hábitos: editar + pausar/arquivar + histórico preservado.
- [ ] Dashboard abre com bloco **Agora** acima da dobra.
- [ ] Cards com ≤3 ações visíveis; resto em ⋯.
- [ ] Ideia → tarefa em 1 clique.
- [ ] Revisão semanal mostra dados sem preencher formulário.
- [ ] Toda entrega na **`main`** + Vercel `praxis-jota` verificado.

---

## Registro de ondas (atualizar a cada entrega)

| Data | Onda | Commit | Notas |
|------|------|--------|-------|
| 2026-07-02 | **6** | (este commit) | Modo Foco — pós-sessão + copy PT |
| 2026-07-02 | **5** | `f74af68` | Hábitos & Tarefas — menos ruído |
| 2026-07-02 | **4** | `02a09fd` | Dashboard Agora — NowBlock + cockpit |
| 2026-07-02 | **3** | `22559a4` | Hábitos — ciclo de vida + quant + frequência |
| 2026-07-02 | **2** | `7d8ab43` | UX Praxis — legado Forja fora da UI |
| 2026-07-02 | **1** | `a5010e8` | Auth sessão + login Praxis |
| 2026-07-02 | — | `0f85de2` | Edição hábitos v1 |

---

*Próximo passo sugerido para João:* dizer **“arrocha onda 1”** (segurança) ou **“onda 2+4”** (copy + Agora) se quiser vitrine visual antes do login.