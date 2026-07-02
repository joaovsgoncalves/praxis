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
| P7-T01 | Campo `idea_status`: capturada \| promissora \| virou_tarefa \| arquivada (task category ideias ou tabela) | M | API + UI filtro | **done** |
| P7-T02 | Botão “Transformar em tarefa” (cria task, link `source_idea_id`, marca ideia) | M | Uma ideia → uma tarefa | **done** |
| P7-T03 | Copy: ideia sem mesma pressão visual que tarefa (sem hora/prioridade alta default) | S | Ideas.jsx | **done** |
| P7-T04 | Revisão semanal de ideias (lista promissoras) — pode ser subconjunto Fase 8 | M | Tela ou seção | **done** |

---

## Fase 8 — Revisão semanal automática

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P8-T01 | Endpoint `GET /api/insights/weekly` agregando: tasks done, hábitos falhos, wellness, focus, ideias | L | JSON estável | **done** |
| P8-T02 | Página Revisão: render automático (vitórias, padrão, gargalo, 3 prioridades sugeridas) | L | Não é formulário vazio | **done** |
| P8-T03 | Opcional: cron Hermes domingo usa mesmo endpoint e manda resumo Discord/Telegram | M | `scripts/praxis-weekly-brief.sh` + `FORJA_API_KEY` | **done** |

---

## Fase 9 — Metas guiadas

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P9-T01 | Empty state metas: wizard 3 passos (meta → prazo → 1 hábito OU 1 tarefa) | M | Não salva meta “solta” sem vínculo | **done** |
| P9-T02 | Esconder nav “Metas” se zero metas ativas (feature flag user ou auto) | S | Sidebar condicional | **done** |
| P9-T03 | Card meta mostra progresso via linked tasks/habits | M | Goals.jsx | **done** |

---

## Fase 10 — Rituais e módulos vazios

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P10-T01 | Esconder Rituais no menu se `rituals.active === 0` | S | Sidebar | **done** |
| P10-T02 | Templates iniciais: abertura do dia / fechamento (opcional criar 2 presets) | M | Rituais.jsx | **done** |
| P10-T03 | Revisão semanal escondida até Fase 8 entregar valor | S | Nav condicional | **done** |

---

## Fase 11 — Gamificação discreta

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P11-T01 | XP/level em collapsible ou rodapé Dashboard, não hero | S | Menos competição com Agora | **done** |
| P11-T02 | Achievements: só mostrar se &gt;0 desbloqueados | S | History/gamification | **done** |
| P11-T03 | Evento `forja-level-up` renomear display string only (interno pode ficar) | S | Toast diz Praxis | **done** |

---

## Fase 12 — Mobile e polish

| ID | Task | Esforço | Aceite | Status |
|----|------|---------|--------|--------|
| P12-T01 | Audit viewport: Hábitos & Tarefas + Agora em 390px | M | Sem overflow CTA | **done** |
| P12-T02 | Deep link `/habitos-tarefas?tab=habits` (ou state URL) | S | Share/bookmark | **done** |
| P12-T03 | PWA manifest name/icon Praxis (se já existir, conferir) | S | Install banner correto | **done** |

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

- [x] Endpoints pessoais **401** sem sessão (teste externo) — `npm run smoke:prod`
- [x] Zero “Forja” na UI.
- [x] Hábitos: editar + pausar/arquivar + histórico preservado.
- [x] Dashboard abre com bloco **Agora** acima da dobra.
- [x] Cards com ≤3 ações visíveis; resto em ⋯.
- [x] Ideia → tarefa em 1 clique.
- [x] Revisão semanal mostra dados sem preencher formulário.
- [x] Toda entrega na **`main`** + Vercel `praxis-jota` verificado (`smoke:prod` + build local).

---

## Onda 13 — Confiança operacional

| ID | Task | Status |
|----|------|--------|
| P13-T01 | Smoke prod script | **done** |
| P13-T02 | Sync API produção | **done** |
| P13-T03 | Checklist métricas (acima) | **done** |
| P13-T04 | Health watchdog | **done** |

Ver `docs/ONDA-13-OPERACAO.md`.

---

## Onda 14 — Tarefas recorrentes

| ID | Task | Status |
|----|------|--------|
| P14-T01 | Motor próxima instância na API | **done** |
| P14-T02 | Badge + preview próxima data | **done** |
| P14-T03 | daily / weekly / monthly | **done** |

Ver `docs/ONDA-14-RECORRENCIA.md`.

---

## Onda 15 — Voz confiável

| ID | Task | Status |
|----|------|--------|
| P15-T01 | Fila `capture_queue` + persistência de áudio | **done** |
| P15-T02 | Retry STT 2× + retry manual | **done** |
| P15-T03 | `/capturas` + integração Captura | **done** |

Ver `docs/ONDA-15-VOZ.md`.

---

## Onda 16 — Cockpit evitando + PraxIA

| ID | Task | Status |
|----|------|--------|
| P16-T01 | API avoidance insights | **done** |
| P16-T02 | Dashboard widget | **done** |
| P16-T03 | PraxIA confront | **done** |

Ver `docs/ONDA-16-COCKPIT.md`.

---

## Onda 17 — Polish celular

| ID | Task | Status |
|----|------|--------|
| P17-T01 | Mobile bottom nav | **done** |
| P17-T02 | Top bar + safe area | **done** |
| P17-T03 | FAB desktop only | **done** |
| P17-T04 | PWA shortcuts + install banner | **done** |

Ver `docs/ONDA-17-MOBILE.md`.

---

## Onda 18 — Backup + 10/10

| ID | Task | Status |
|----|------|--------|
| P18-T01 | Backup + meta | **done** |
| P18-T02 | Cron installer | **done** |
| P18-T03 | Smoke + checklist | **done** |

Ver `docs/ONDA-18-OPERACAO.md` e `docs/CHECKLIST-PRAXIS-10.md`.

---

## Pós-18 (evolução)

Plano **ondas 19–24** + fase de uso: `docs/PLANO-PRAXIS-POS-18.md`  
Auditoria base: `docs/AUDITORIA-PRAXIS-2026-07-02.md`  
**Onda 19:** `docs/ONDA-19-SMOKE.md`  
**Onda 20:** `docs/ONDA-20-OPERACAO.md`  
**Onda 21:** `docs/ONDA-21-VOZ-UX.md`  
**Onda 22:** `docs/ONDA-22-LISTA.md`  
**Onda 23:** `docs/ONDA-23-METAS-RITUAIS.md`  
**Onda 24:** `docs/ONDA-24-ENTRADA-RAPIDA.md` · fechamento `docs/PRAXIS-FECHAMENTO-ONDAS-19-24.md`

---

## Registro de ondas (atualizar a cada entrega)

| Data | Onda | Commit | Notas |
|------|------|--------|-------|
| 2026-07-02 | **24** | `b622d1c` | Webhook texto + share PWA |
| 2026-07-02 | **23** | `85c7246` | Metas templates + ritual Hoje + 3 tarefas/semana |
| 2026-07-02 | **22** | `b95bd3c` | Lista: chips, arquivar, atrasadas |
| 2026-07-02 | **21** | `236344f` | UX voz: fases, fila Hoje, erros PT |
| 2026-07-02 | **20** | `66886e2` | Health cron + ship:api + redirect URL |
| 2026-07-02 | **19** | `309a6f1` | Smoke E2E |
| 2026-07-02 | **18** | `ad65b60` | Backup SQLite + checklist |
| 2026-07-02 | **17** | `c717f84` | Nav mobile + PWA |
| 2026-07-02 | **16** | `66a92a0` | Cockpit evitando + PraxIA |
| 2026-07-02 | **15** | `144386b` | Voz fila + retry STT |
| 2026-07-02 | **14** | `593cdec` | Tarefas recorrentes motor + UI |
| 2026-07-02 | **13** | `f514623` | Smoke prod + sync API + health watchdog |
| 2026-07-02 | **12** | `fc5f3cc` | Mobile + deep links + PWA |
| 2026-07-02 | **11** | `50b812b` | Gamificação discreta |
| 2026-07-02 | **10** | `480393a` | Rituais presets + nav condicional |
| 2026-07-02 | **9** | `e96cb02` | Metas wizard + nav condicional |
| 2026-07-02 | **8** | `d2e8623` | Revisão semanal automática |
| 2026-07-02 | **7** | `5a8a1ad` | Ideias — status + virar tarefa |
| 2026-07-02 | **6** | `55b64d1` | Modo Foco — pós-sessão + copy PT |
| 2026-07-02 | **5** | `f74af68` | Hábitos & Tarefas — menos ruído |
| 2026-07-02 | **4** | `02a09fd` | Dashboard Agora — NowBlock + cockpit |
| 2026-07-02 | **3** | `22559a4` | Hábitos — ciclo de vida + quant + frequência |
| 2026-07-02 | **2** | `7d8ab43` | UX Praxis — legado Forja fora da UI |
| 2026-07-02 | **1** | `a5010e8` | Auth sessão + login Praxis |
| 2026-07-02 | — | `0f85de2` | Edição hábitos v1 |

---

*Próximo passo sugerido para João:* dizer **“arrocha onda 1”** (segurança) ou **“onda 2+4”** (copy + Agora) se quiser vitrine visual antes do login.