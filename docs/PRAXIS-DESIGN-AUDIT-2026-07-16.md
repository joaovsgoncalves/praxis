# Praxis — Auditoria de design completa (2026-07-16)

**Método:** Impeccable `detect` · UI/UX Pro Max design-system + UX/style · código `src/` · `docs/DESIGN.md` · auditorias 09/07 + Lotes 7–9 · frentes paralelas (Hoje · Listas/Hábitos · Módulos) · estado pós **Não rolou / nota honesta / rituais**  
**URL:** https://praxis-jota.vercel.app  
**Git HEAD na auditoria:** `0a741d8` (main)  
**Escopo:** design/UX visual, hierarquia, densidade, drift entre abas — **não** reauditoria de ondas 1–24 nem performance API.

---

## 1 frase

O **kit visual ainda é sólido** (PageHero, quiet Lotes 7–9, nav 4+ferramentas), mas o **dia a dia ficou mais denso de novo**: Hoje com **Hero antes do Agora**, hábitos **duplicados** (rituais × lista × slice dos 5), e ações novas (**Não rolou / Não hoje / Nomear**) ainda sem um único padrão de densidade no mobile.

---

## Duas notas

| Leitura | Nota | O que mede |
|---------|------|------------|
| **Design system / código** | **8,3 / 10** | Tokens, `PraxisPage`, empty kit, Lote 9 dots, reduced-motion no CSS — ainda bem acima de SaaS genérico solto |
| **Experiência visual no uso real** | **7,4 / 10** | Hierarquia do Hoje, dual ritual/hábitos, botões por linha, drift Treinos/Nutrição |

*Caiu ~0,5 vs auditoria 09/07 na “experiência no uso”* — não porque o polish sumiu, e sim porque **features novas + ordem do Hoje** empurraram densidade sem um lote de destilação.

---

## Notas por eixo (0–10)

| Eixo | Nota | Evidência |
|------|------|-----------|
| **Hierarquia (Hoje)** | **6,8** | `Dashboard.jsx`: **HeroDay → Agora → banners → grid**. Regra histórica “Agora first” **não está no código atual**. |
| **Consistência entre abas** | 8,2 | Maioria com `praxis-page` + `PageHero`; Treinos ainda `bg-gradient-to-br from-primary/…`. |
| **Anti-slop / detector** | 7,0 | `impeccable detect src/`: **26 warnings** — 24× `pure-black-white` (`bg-black/…`), 1× fontes Inter/Space Grotesk (proposital), 1× `layout-transition`. |
| **Densidade mobile** | 6,9 | Linhas de tarefa no Hoje: **Não hoje + Editar + Foco**; hábitos: botão + sheet; rituais: **Não rolou** por passo. Touch ok, mas **3 ações por row** compete no 390px. |
| **Navegação** | 8,8 | Primary: Hoje · Tarefas · Falar · Revisar. Secondary sem **Fila de capturas** (removido 16/07). Rota `/capturas` ainda existe via Falar/banner. |
| **Copy UI** | 8,6 | “Não rolou / Não hoje / nomeia sem romance” alinhado ao tom. Resto sem “cockpit”. |
| **Tokens / tipografia** | 8,0 | Domain HSL ok. Inter + Space Grotesk = família AI-default (aceito no DESIGN.md quiet). |
| **A11y / touch** | 8,0 | `praxis-touch-target`, safe-area, labels; sem WCAG formal. |
| **Empty / loading** | 8,4 | `PraxisEmptyState` na maior parte; residual texto cru em MealsCatalog / Settings. |
| **Marca / personalidade** | 7,0 | Continua dark SaaS roxo+ouro; feature “nome honesto” **aumenta personalidade de produto**, não de visual. |
| **Hábitos no dia a dia** | **6,5** | Progress “0 feitos · 8 abertos” no topo vs **só rituais** na lista (print João). `essentialHabits.slice(0,5)` no Hoje **corta** hábitos. Dual `RitualWidget` + `OpeningRitualCollapsible`. |

**Média ponderada (uso diário): ~7,4**

---

## O que está bem (não reabrir)

1. **Kit canônico** `PraxisPage` / StatTile / Empty / InlinePromo.  
2. **Lote 9** — empty Agora com 2 CTAs + links texto; Avoidance com **dot** (não side-tab).  
3. **Nav enxuta** + Fila fora do menu.  
4. **Skip com nota honesta** — produto certo; visual só precisa **destilar entrada**.  
5. **Glass** concentrado em login/splash/404 (regra Lote 9).  
6. **`prefers-reduced-motion`** presente em `index.css` + alguns componentes.  
7. **Nutrição** já tem auditoria própria e preferência gramas.

---

## Gaps reais (prioridade)

### P0 — hierarquia do Hoje (regressão)

| Problema | Onde | Efeito |
|----------|------|--------|
| **HeroDay acima do Agora** | `Dashboard.jsx` ~251–271 | Usuário vê strip de progresso **antes** da decisão do dia |
| Stack ainda monólito | 24 widgets em `components/dashboard/` | Scroll longo no mobile |
| Agora **e** Hero com superfície “forte” | `NowBlock` gradient gold + HeroDay | Viola “máx. 1 superfície forte / rota” |

**Direção:** Agora first de novo; HeroDay vira **strip flat sob o Agora** (ou colapsa no Hero quando há tarefa no Agora). Sem feature nova.

### P0 — hábitos: uma verdade no dia

| Problema | Onde | Efeito |
|----------|------|--------|
| Progresso “8 abertos” vs UI só rituais | `HabitsTasks.jsx` + `RitualWidget` | João não acha ação na lista plana |
| Hoje só **5** hábitos essenciais | `essentialHabits.slice(0, 5)` | Mentira visual no HeroDay vs vida real |
| Ritual **2×** no Hoje | `RitualWidget` + `OpeningRitualCollapsible` | Mesma manhã em dois lugares |
| Skip no ritual vs lista | `RitualWidget` / `TodayHabits` / sheet | 3 skins para o mesmo outcome |

**Direção (escolher 1 e fechar):**  
- **A (recomendada):** rituais = **única** superfície de check dos hábitos do dia no Hoje; lista plana só “fora de ritual”; Hero conta **todos** due today.  
- **B:** lista plana unificada; rituais viram agrupador visual sem duplicar check.

### P1 — densidade de ação (mobile)

| Problema | Fix de classe |
|----------|----------------|
| Task row: Não hoje + Editar + Foco | **1 primário** (Não hoje **ou** Foco) + ⋯ |
| Hábito: Não rolou sempre + menu | Chip **Não rolou** só se aberto; skip done = só badge + Nomear se quiser editar nota |
| Sheet skip com chips + textarea + 2–3 botões | Manter texto livre; chips em **uma** linha scroll; primário único “Registrar” |

### P1 — drift de módulo

| Módulo | Achado | Fix |
|--------|--------|-----|
| **Treinos** | Cards `bg-gradient-to-br from-primary/…` | Shell flat `bg-card/40` como resto |
| **Nutrição** | Já 0–12; tabs ok ≤4+Mais | Só polish residual empty texto cru |
| **Ideias / Settings / HabitsTasks** | `bg-black/20` → 24 warns detect | Trocar por `bg-background/40` ou `bg-white/[0.03]` (classe token) |
| **Landing** | Gradients/marketing ok | Fora do app autenticado — **não** misturar lote |

### P1 — anti-slop residual

| Achado | Fix |
|--------|-----|
| 24× pure black | Token de superfície muted (1 patch classe / grep) |
| Inter + Space Grotesk | **Manter** até João pedir marca |
| DayWins / progress gradients | Progress bar ok; cards gradient → flat se aparecerem ativos |

### P2 — personalidade / motion

- Marca ainda Linear/AI — só lote se pedir “cara própria”.  
- `transition-all` em shadcn (`tabs`, `toast`, `accordion`) — Emil P0 residual, não bloqueia.  
- Personalidade **já sobe** com copy de skip honesto — não precisa neon.

---

## Superfície de produto (agora)

| Métrica | Valor |
|---------|-------|
| Páginas `src/pages` | 18 |
| Widgets dashboard | 24 |
| Primary nav | 4 |
| Secondary | ~9 (sem Fila) |
| `impeccable detect` | **26** warnings (maioria pure-black) |
| Features design-sensitive recentes | Não rolou · nota · Não hoje · rituais |

---

## Alinhamento com DESIGN.md

| Regra | Status |
|-------|--------|
| Simples, sem jargão UI | ✅ |
| Premium quiet, ouro só XP/nav | ⚠️ Agora/Hero gold forte |
| `praxis-page` + PageHero | ✅ maior parte |
| Máx. 1 superfície forte / rota | ❌ Hoje |
| Ajuste geral = todas as abas | ✅ política; lote novo deve respeitar |
| Empty/skeleton kit | ✅ |

---

## Lotes propostos (só sob “arrocha”)

| Lote | Nome | Escopo | Done-when |
|------|------|--------|-----------|
| **10a** | Hoje hierarquia | Agora **acima** do HeroDay; Hero strip flat; 1 superfície gold | Scroll 390: Agora no first fold |
| **10b** | Hábitos uma verdade | Contagem due real; sem slice 5 mentiroso; Hoje sem double Opening+Ritual **ou** Opening só se não houver Ritual | Print ritual = mesmo número do progress |
| **10c** | Densidade ações | Task: máx 2 botões visíveis; hábito: 1 chip Não rolou; sheet skip limpo | Row não quebra em 3 colunas no 390 |
| **11a** | Token black + Treinos flat | grep `bg-black` → token; Treinos sem gradient hero card | detect pure-black ≤ 3 |
| **11b** | QA 390 + smoke visual | Playwright + Ctrl+F5 checklist | e2e mobile prod green |

**Não** abrir rebrand tipografia/cor sem pedido.  
**Não** feature nova no meio do lote de destilação.

---

## Melhorar primeiro (recomendação)

1. **10a** — Agora de volta no topo (maior impacto / menor risco).  
2. **10b** — parar de mentir no contador de hábitos e reduzir dual ritual.  
3. **10c** — destilar botões (senão “Não rolou” continua “sumido” no ruído).

---

## Aceite (quando implementar)

- [ ] Hoje 390px: **Agora** acima de HeroDay  
- [ ] Número “hábitos de hoje” = due reais (rituais + fora), sem `.slice(0,5)` escondido  
- [ ] Uma superfície gold dominante no Hoje  
- [ ] Row tarefa: ≤2 botões visíveis + menu  
- [ ] `impeccable detect` pure-black **muito** reduzido  
- [ ] Smoke + alias `praxis-jota`  

---

## Fontes

- Código: `Dashboard.jsx`, `NowBlock.jsx`, `HeroDay.jsx`, `RitualWidget.jsx`, `HabitsTasks.jsx`, `TodayTasks.jsx`, `TodayHabits.jsx`, `SkipHabitSheet.jsx`, `Treinos.jsx`, `Nutricao.jsx`, `praxisNav.js`, `index.css`, `PraxisPage.jsx`  
- Docs: `DESIGN.md`, `PRAXIS-DESIGN-AUDIT-2026-07-09.md`, Lotes 7–9, `PRAXIS-NOTA-ATUAL.md`  
- Tools: `npx impeccable@2.1.9 detect src/ --fast --json` (26) · UI Pro Max design-system/ux/style  
- Contexto usuário: print rituais sem botão; pedido nota honesta; Fila removida  

---

## Veredito

| Pergunta | Resposta |
|----------|----------|
| Design “entregue” como sistema? | **Sim** — kit + quiet ainda valem. |
| Design “calmo todo dia no celular”? | **Não ainda** — hierarquia Hoje + dual hábitos + densidade de ação. |
| Tem muita coisa pra melhorar? | **Sim, mas em 3 lotes**, não rebrand. |
| Próximo passo natural | **Arrocha 10a** (Agora first) → **10b** → **10c**; ou “deixa quieto” e só usa o app. |
