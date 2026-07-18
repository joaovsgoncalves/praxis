# Praxis — Auditoria de design (equilíbrio e organização)

**Data:** 2026-07-06  
**Método:** Impeccable (critique, layout, distill, quieter)  
**Evidência:** prints João + código em `src/components/dashboard/*`, `Focus.jsx`

---

## Veredito

O desequilíbrio é real. Lote 7 baixou glow global, mas **cada bloco promocional no Hoje ainda é um “mini produto”** (ouro, roxo gradiente, CTA sólido, cards dentro de card). No Modo Foco, um **Card pesado** só para um select quebra o ritmo entre presets e o botão principal.

**Nota por eixo (0–10):** hierarquia 5 · consistência 4 · densidade mobile 5 · anti-slop 6 · alinhamento com DESIGN.md 5.

---

## O que os prints mostram

### Hoje — faixa `order-6` (4 cards empilhados)

| Bloco | Problema |
|-------|----------|
| Abertura do dia | Skin **gold** exclusiva (`border-gold/20 bg-gold/5`) — parece outra marca |
| Primeira meta | Tile roxo 40×40 + chips `rounded-full` — peso médio |
| Revisão semanal | **Gradiente primary + botão default roxo** — maior peso visual da página |
| O que evito | Card gradiente + lista com 3 “skins” de severidade + PraxIA — bloco mais denso |

**Organização:** no mobile, isso vem **depois** da grade tarefas/hábitos/agenda — parece “segunda home” sem título de seção.

### Modo Foco — “Tarefa (opcional)”

- `Card` + `p-6` só para label + `Select` — padding desproporcional.
- Título `h2 text-sm` sem `forja-kicker` / `SectionHeading` usado em “Durações”.
- Card isolado entre grid 2×2 de presets e CTA full-width — **quebra o fluxo vertical**.

---

## Causa raiz (código)

1. **Sem primitivo único** para banners/onboarding (`OpeningRitual`, `SuggestedGoal`, `WeeklyReview`, partes de `Avoidance`).
2. **Lote 7 não passou** nesses 4 componentes + `NowBlock` ainda usa gradiente primary + shadow.
3. **Padrão anti-slop repetido:** ícone em quadrado 10×10 em quase todo promo.
4. **CTAs mistos:** `outline` gold, `secondary` pills, `default` primary, `ghost` — sem regra “um sólido por viewport”.
5. **`AvoidanceCockpit`:** card + itens coloridos + footer PraxIA = cards dentro de card.

Arquivos:

- `OpeningRitualCollapsible.jsx` — gold skin
- `SuggestedGoalCard.jsx` — tile primary
- `WeeklyReviewPrompt.jsx` — gradient + CTA sólido
- `AvoidanceCockpit.jsx` — gradient + nested severity cards
- `Dashboard.jsx` — `order-6` stack sem agrupador
- `Focus.jsx` ~379–396 — card órfão do select
- `NowBlock.jsx` — gradiente (contraste com Lote 7 quiet)

---

## Lote 8 — correções propostas (ordem)

### 8.1 Sistema — `PraxisInlinePromo` (ou estender `PraxisPage`)

- Uma shell: `rounded-2xl border border-border/80 bg-card/50 p-4`
- Ícone **inline** 20px (sem tile), ou tile **único** tamanho em todos
- CTA secundário: `outline` ou `link`; **só Agora / Iniciar foco** podem ser `default`

### 8.2 Hoje — layout

- Agrupar os 4 em **“Sugestões do dia”** (Collapsible, default fechado se ritual completo + sem meta vazia).
- `WeeklyReviewPrompt`: tirar gradiente; botão `outline` + seta.
- `OpeningRitual`: mesma shell que os outros; acento gold só no ícone Sunrise.
- `AvoidanceCockpit`: card flat; itens = uma lista com dot de severidade, não 3 fundos.

### 8.3 Foco

- Tarefa opcional: **uma linha** sob presets (`Label` + `Select` full width, sem Card).
- Ou `SectionHeading` “Vincular tarefa” + select compacto.

### 8.4 Pass global

- `typeset` + `layout` nas rotas: Metas, Hábitos, Captura (mesmo desvio de tiles/gradients).
- Atualizar `DESIGN.md` com regra: **máx. 1 superfície com gradiente por rota** (só Agora com tarefa ativa).

---

## Fora deste lote (registrar)

- `HeroDay` + ember + anéis — equilibrar com quiet (Lote 8b).
- **Água (Lote 8c):** grid 16×250 ml → barra + 8 copos; copy “X de 8 copos” / “Faltam 2 L”.
- Páginas secundárias com `glass-surface` residual.
- Playwright 390px após mudanças no Hoje.

---

## Aceite (João)

- [x] Implementado Lote 8 (2026-07-06): `PraxisInlinePromo`, Hoje agrupado, Foco select compacto.
- [ ] Os 4 blocos do print parecem **mesma família** (borda/padding/CTA).
- [ ] Revisão semanal **não** rouba atenção do Agora.
- [ ] Foco: select **não** parece formulário solto.
- [ ] Scroll Hoje: sensação de **uma** página, não camadas competindo.

---

## Próximo passo

Implementar **8.1 + 8.2 + 8.3** num ship (como Lote 7B), salvo se quiseres só Hoje primeiro.