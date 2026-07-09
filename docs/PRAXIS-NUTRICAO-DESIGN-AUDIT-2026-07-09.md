# Praxis Nutrição — auditoria de design

**Data:** 2026-07-09  
**Escopo:** módulo `/nutricao` + card Hoje (`NutritionTodayCard`) + bloco macros na revisão  
**Método:** Impeccable `detect` · Open Design taste/anti-slop · UI/UX Pro Max search · `docs/DESIGN.md` (product register) · revisão de código  
**Não é:** reauditoria do app inteiro (já em `PRAXIS-DESIGN-AUDIT-2026-07-09.md`)

---

## 1 frase

Nutrição **encaixa no Praxis quieto** (card/40, Lucide, barras legíveis, zero gradient-slop no módulo), mas no mobile ainda **parece painel de ferramentas com 6 abas + resumo duplicado** — útil, pouco “diário de 10 segundos”.

---

## Duas notas

| Leitura | Nota | O que mede |
|---------|------|------------|
| **Anti-slop / sistema** | **8,8 / 10** | `impeccable detect` no pasta nutrition = **[]**; sem indigo default, sem emoji-ícone, sem border-l-4, sem glass pesado |
| **Taste / dia a dia mobile** | **7,4 / 10** | 6 tabs scroll, CTAs empilhados, MacroBars 2× no Diário, personalidade = “ferramenta” mais que “ritual de refeição” |

*Detector limpo ≠ gosto resolvido* (Impeccable + taste-skill).

---

## Evidência Impeccable

```bash
npx impeccable@2.1.9 detect src/components/nutrition --fast --json
# → []
```

`detect` em `Dashboard.jsx` (contexto do card no Hoje) ainda aponta **2× pure black** (`bg-black` collapsibles) — residual do app, **não** do módulo nutrition.

## UI/UX Pro Max (uso seletivo)

Query design-system: *fitness nutrition calorie tracker mobile app macros diary dark premium minimal*.

- Upstream sugere **flat mobile + verde fitness + Barlow** → **não aplicar cego**: conflita com Praxis (`DESIGN.md`: Space Grotesk + Inter, primary roxo/ouro, premium quieto).
- Manter: **product register Praxis** · progress bars claras · touch-first · empty states.
- Trazer: densidade mobile, 1 CTA primário por superfície, hierarquia “agora / depois”.

## Taste / anti-slop (Open Design)

| Check | Status Nutrição |
|-------|-----------------|
| Indigo/purple AI gradient hero | OK — não usa |
| Emoji como ícone | OK — Lucide |
| Cards com `border-l-4` accent | OK |
| Cards dentro de cards | Leve — Card resumo + Card total do diário (redundante) |
| Tudo centralizado | OK — left-aligned |
| Soul 20% | **Fraco** — sparkline de peso e cores P/C/G são o único “caráter”; resto é shell genérico Praxis |

---

## Notas por eixo (só Nutrição)

| Eixo | Nota | Evidência |
|------|------|-----------|
| Hierarquia | 7,2 | Hero + MacroBars + tabs + (no diário) total de novo + 3 botões |
| Consistência com Praxis | 8,9 | `PageHero`, `bg-card/40`, `shadow-none`, `tabular-nums`, PT simples |
| Densidade mobile 390 | 6,8 | 6 tabs `min-w-[3.8rem]` + `overflow-x-auto` — scroll horizontal de abas |
| Navegação interna | 7,0 | Funciona; “Alimentos/Refeições/Meta” competem com Diário (ação principal) |
| MacroBars / data viz | 8,4 | P/C/G cores distintas; a11y progressbar + valuetext; over-meta em amber |
| Empty / loading | 7,5 | `PraxisEmptyState` em catálogos/histórico; loading ainda é texto “Carregando…” em vários pontos |
| Touch / a11y | 8,2 | Botões `rounded-full` ~h-9+; tabs com role; MacroBars ok; faltam skeleton e focus ring explícito nas tabs |
| Copy | 8,6 | PT boteco/simples; “Código”/“Texto” claros; onboarding legível |
| Marca / personalidade | 7,0 | Integra ao app; pouco “Nutrição Praxis” próprio além de amber no ícone do Hoje |
| Card no Hoje | 8,3 | Compacto, espelha água; CTAs Comida / Ver diário |

---

## O que está bem (não mexer por impulso)

1. **Registro product** alinhado ao `DESIGN.md` — sem virar landing fitness verde.  
2. **MacroBars** legíveis (full + compact) com reduced-motion.  
3. **Card Hoje** enxuto, flag `nutrition_show_on_today`.  
4. **Fluxos secundários** (Texto, Código, Refeições) sem poluir primary nav do app.  
5. **Sparkline de peso** SVG leve — detalhe com taste.  
6. **Impeccable detect limpo** no módulo.

---

## Gaps (prioridade)

### P0 — mobile / ação principal

| Problema | Onde | Efeito |
|----------|------|--------|
| **6 abas** no mesmo pill | `Nutricao.jsx` TABS | Scroll horizontal; Diário perde protagonismo |
| **Macros 2×** no Diário | card topo da página + card “Total do dia” em `DayDiary` | Ruído e scroll extra |
| **Fila de CTAs** | Texto + Código + Adicionar (+ Item por slot) | Parece toolbar de admin, não “logar em 10s” |

**Direção (sem codar ainda):**

- Tabs **primárias:** Diário · Histórico · Mais (ou Diário / Peso / Mais).  
- Alimentos · Refeições · Meta · Peso → dentro de **Mais** ou sheet “Ferramentas”.  
- No Diário: **1 CTA primário** “Adicionar” abrindo sheet com abas Recentes | Refeições | Texto | Código.  
- Manter **um** resumo de macros no Diário (ou só o do topo, ou só o do DayDiary).

### P1 — polish visual / harden

| Achado | Fix |
|--------|-----|
| Loading = string | Skeleton (`PraxisPage` kit) no day/profile/histórico |
| Tabs sem `aria-controls` / painel | Completar padrão tabs a11y |
| Gordura `bg-violet-500` | OK funcional; se quiser menos “AI chart”, usar token domain/wellness ou teal discreto **só se** bater com palette Praxis |
| Empty do card Hoje sem mini-CTA embutido na frase | Já tem botões abaixo — ok; opcional: 1 linha + 1 botão só |
| `max-w-xl` vs `praxis-page` max-w-6xl em outras abas | Intencional (ferramenta estreita) — documentar; ok |

### P2 — personalidade (taste 20%)

| Ideia | Por quê |
|-------|---------|
| Kicker de refeição com horário “agora” (Café / Almoço…) | Ritual, não CRUD |
| Chip “faltam X kcal · Yg P” no hero | Uma linha de insight > 4 barras repetidas |
| Ícone/slot color token leve (não neon) | Diferencia Nutrição sem quebrar quiet |

**Não fazer:** rebrand verde fitness, gradiente hero, badge-star App Store, fonte Barlow no app inteiro.

---

## Scorecard resumo

```
Sistema / anti-slop .... 8.8
Consistência Praxis ... 8.9
Mobile density ........ 6.8
Hierarquia Diário ..... 7.2
Data viz MacroBars .... 8.4
Taste / alma .......... 7.0
─────────────────────────
Experiência Nutrição .. ~7.5
```

---

## Critérios de aceite se “arrocha polish Nutrição”

- [x] ≤ 4 tabs visíveis sem scroll horizontal em 390px — **Diário · Histórico · Peso · Mais** (ship polish 2026-07-09)  
- [x] Um único bloco de MacroBars no Diário  
- [x] Adicionar = 1 primary CTA → sheet com Texto/Código + recentes/refeições  
- [x] Skeleton em day/histórico (`PraxisListSkeleton`)  
- [x] `impeccable detect src/components/nutrition` continua `[]`  
- [x] Copy e tokens alinhados a `DESIGN.md`

**Polish shipped** com o restante do módulo 0–12.

---

## Fontes

- Impeccable detect (local, read-only)  
- Open Design: `skills/taste-skill` (stub) + `craft/anti-ai-slop.md`  
- UI/UX Pro Max: `ui-ux-design-review/scripts/search.py`  
- `docs/DESIGN.md`, `docs/PRAXIS-DESIGN-AUDIT-2026-07-09.md`, `docs/PRAXIS-NUTRICAO-FECHAMENTO.md`

**Próximo passo (se quiser ship):** `arrocha polish nutrição` (P0 tabs + CTA + dedupe macros) — não misturar com fase 12.
