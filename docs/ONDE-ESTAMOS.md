# Onde estamos — Praxis (para o João)

**Atualizado:** 2026-07-18 · **URL:** https://dopraxis.vercel.app · **Nutrição 0–12 (barcode)**

---

## Novo (jul/2026) — depois do Lote 9

- **Rename Forja → Praxis, drop Base44:** cliente renomeado, UI com polish geral.
- **Lote 10 — Agora first, hábitos honestos:** densidade revisada, "Não rolou" (hábitos) e
  "Não hoje" (tarefas) como saídas honestas de dia, nota livre no skip — ver
  `docs/PLANO-PRAXIS-LOTE-10-DESTILL-NOME-HONESTO.md` e `docs/archive/TASKS-LOTE-10-DESTILL.md`.
- **Auditoria de design 2026-07-16:** hierarquia do Hoje, hábito dual, densidade —
  `docs/PRAXIS-DESIGN-AUDIT-2026-07-16.md` (auditoria vigente; as anteriores foram pro archive).
- **Dívida técnica:** ver seção abaixo.

## Novo (jul/2026) — Nutrição (macros)

- **Fase 12 shipped:** barcode + Open Food Facts (cache local) — commit `2f7f91f`
- **0–11:** diário, peso, histórico, seed, refeições, polish
- Fechamento: `docs/archive/PRAXIS-NUTRICAO-FECHAMENTO.md`
- Docs: `docs/PLANO-PRAXIS-NUTRICAO-MACROS.md`

## Lote 9

- **Hoje mais calmo:** Agora vazio com 2 CTAs; HeroDay strip flat; Avoidance sem side-tab — `docs/archive/PRAXIS-LOTE-9-DISTILL.md`, auditoria `docs/archive/PRAXIS-DESIGN-AUDIT-2026-07-09.md`

## Lote 8

- **Equilíbrio visual** no Hoje: `PraxisInlinePromo`, seção “Sugestões e reflexão” — `docs/archive/PRAXIS-DESIGN-AUDIT-LOTE-8.md`

## Lote 7

- Visual **mais quieto** — `docs/DESIGN.md`, `docs/archive/PRAXIS-LOTE-7-QUIETO.md`
- **Google Calendar:** atrasada não sincroniza — `docs/PRAXIS-CALENDAR-SYNC.md`

---

## Dívida técnica em andamento

Depois de mapear o repositório, identificamos 5 riscos e abrimos uma frente pra
resolver o que dá pra fazer via repo (testes, CI, docs, nota no PRD):

- [x] **Testes automatizados no backend** — `node:test` nativo, cobrindo streaks,
  insights semanais, "o que estou evitando", gamificação e recorrência de tarefas
  (`api/lib/*.test.mjs`, `api/taskRecurrence.test.mjs`). Rodar com `npm run test:api`.
- [x] **CI via GitHub Actions** — `.github/workflows/ci.yml` roda lint + typecheck +
  build (front) e os testes novos (back) em cada PR/push pra `main`. Não mexe em deploy.
- [x] **Consolidação de `docs/`** — histórico fechado (ondas, lotes, auditorias antigas)
  movido pra `docs/archive/`; prompts do Jota Fit (produto diferente) movidos pra
  `docs/jota-fit/`.
- [x] **Nota no PRD sobre gamificação** — `PRD-PRAXIS-v1.md` §9 documentado: XP/níveis/
  badges foram mantidos por escolha consciente, não esquecimento.
- [x] **CI pin = Node da VPS** — workflow em Node **22** (prod `forja-api` = v22.x; era 20).
- [x] **Crons na VPS** — backup SQLite `15 3 * * *` + health watchdog `*/5`; backup de
  2026-07-18 ok. RCLONE offsite ainda opcional.
- [ ] **Branch protection** — repo privado sem GitHub Pro não deixa exigir checks via API;
  CI já roda e fica verde, mas merge não trava sozinho. Avaliar Pro / repo público / regra
  manual se um dia doer.
- [ ] **RCLONE_REMOTE** (opcional) — cópia do backup pra fora da VPS.

---

## Em uma frase

O **plano grande (ondas 1–24)** do produto Praxis está **fechado**. O que rolamos **depois** foi **polish visual global** + **aba Compras** — e o polish das telas agora está **completo em todas as abas principais**.

---

## Três camadas (não misturar)

| Camada | Status | O que é |
|--------|--------|---------|
| **A. Produto core (Sêneca / ondas 1–24)** | **Fechado** | Login, Agora, lista, voz, metas, rituais, mobile, backup, smoke… Ver `docs/PLANO-IMPLEMENTACAO-PRAXIS.md` e `docs/archive/PRAXIS-FECHAMENTO-ONDAS-19-24.md`. |
| **B. Pedidos recentes (jul/2026)** | **Fechado** | Ideias sem tela vazia; sem “cockpit”; design alinhado; **Compras** (curto/médio/longo). |
| **C. Opcional / uso real** | **Contínuo** | Você usar no dia a dia, ajustar copy, Playwright 390px, novas ideias (ex. mais campos em Compras). Não bloqueia “entregue”. |

---

## Design global — checklist

Todas usam `praxis-page` + `PageHero` onde faz sentido:

- [x] Hoje (Dashboard)
- [x] Hábitos & Tarefas
- [x] Ideias
- [x] **Compras** (novo)
- [x] Metas
- [x] Rituais
- [x] Histórico
- [x] Revisar capturas
- [x] Captura por voz
- [x] Modo Foco
- [x] Conquistas
- [x] Configurações
- [x] Revisão semanal
- [ ] Compartilhar (tela mínima PWA) — ok ficar simples

Regra escrita em `docs/DESIGN.md`: ajuste **geral** = **todas** as abas, não só uma.

---

## O que **não** falta para “fechar o combinado”

Nada obrigatório do plano original ou do que você pediu (design geral + lista de compras).

---

## Próximo só se **você** quiser

1. Rodada **Playwright** celular após polish.
2. **Compras:** voz/captura → item na lista; exportar; total R$ por prazo.
3. **Produto novo** (fora do escopo fechado): integrações, bot dedicado Praxis, etc.

---

## Como saber se está no ar

```bash
cd apps/praxis && npm run smoke:prod   # API + front
npm run deploy:prod                          # Vercel + alias praxis-jota
```

Se **Compras** der erro ao salvar: API precisa do módulo `purchase_items` (commit `03de6bd`) — `npm run ship:api` na VPS se ainda não rodou restart.