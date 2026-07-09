# Onde estamos — Praxis (para o João)

**Atualizado:** 2026-07-09 · **URL:** https://praxis-jota.vercel.app · **Nutrição fase 9**

---

## Novo (jul/2026) — Nutrição (macros)

- **Fase 9 shipped:** histórico + macros na revisão semanal — commit `63967de`
- **Fase 8:** parse-text / Texto no diário
- **Fase 7–0:** seed, refeições, UX, barras, diário, catálogo, meta
- Próximo opcional: peso (10), polish (11)…
- Docs: `docs/PLANO-PRAXIS-NUTRICAO-MACROS.md`

## Lote 9

- **Hoje mais calmo:** Agora vazio com 2 CTAs; HeroDay strip flat; Avoidance sem side-tab — `docs/PRAXIS-LOTE-9-DISTILL.md`, auditoria `docs/PRAXIS-DESIGN-AUDIT-2026-07-09.md`

## Lote 8

- **Equilíbrio visual** no Hoje: `PraxisInlinePromo`, seção “Sugestões e reflexão” — `docs/PRAXIS-DESIGN-AUDIT-LOTE-8.md`

## Lote 7

- Visual **mais quieto** — `docs/DESIGN.md`, `docs/PRAXIS-LOTE-7-QUIETO.md`
- **Google Calendar:** atrasada não sincroniza — `docs/PRAXIS-CALENDAR-SYNC.md`

---

## Em uma frase

O **plano grande (ondas 1–24)** do produto Praxis está **fechado**. O que rolamos **depois** foi **polish visual global** + **aba Compras** — e o polish das telas agora está **completo em todas as abas principais**.

---

## Três camadas (não misturar)

| Camada | Status | O que é |
|--------|--------|---------|
| **A. Produto core (Sêneca / ondas 1–24)** | **Fechado** | Login, Agora, lista, voz, metas, rituais, mobile, backup, smoke… Ver `docs/PLANO-IMPLEMENTACAO-PRAXIS.md` e `docs/PRAXIS-FECHAMENTO-ONDAS-19-24.md`. |
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
cd apps/forja-do-jota && npm run smoke:prod   # API + front
npm run deploy:prod                          # Vercel + alias praxis-jota
```

Se **Compras** der erro ao salvar: API precisa do módulo `purchase_items` (commit `03de6bd`) — `npm run ship:api` na VPS se ainda não rodou restart.