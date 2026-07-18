# Praxis — Auditoria de design (2026-07-09)

**Método:** Impeccable (`audit` + `detect`) · UI/UX Pro Max design-system search · código em `src/` · browser login público · git `main` até `c501003`  
**URL:** https://praxis-jota.vercel.app  
**Escopo:** design/UX visual e hierarquia de produto — **não** reauditoria de ondas 1–24 nem API.

---

## 1 frase

O **sistema visual já está maduro e quieto** (kit `PraxisPage`, Lotes 7–8, menu 5, Hoje compacto), mas o **Hoje ainda parece “vários apps empilhados”** e a identidade ainda cheira a **dark SaaS roxo + Inter/Space Grotesk** — forte no uso, pouco distintivo na marca.

---

## Duas notas

| Leitura | Nota | O que mede |
|---------|------|------------|
| **Design system / código** | **8,6 / 10** | Tokens, `PageHero`, empty/skeleton, nav 5, Lote 8 shell, safe-area, touch |
| **Experiência visual no dia a dia** | **7,9 / 10** | Hierarquia do Hoje, scroll mobile, personalidade, anti-slop residual |

*Não é 9,5+ de “produto bonito e óbvio no celular” até o Hoje respirar e a marca sair do padrão genérico dark/AI.*

---

## Notas por eixo (0–10)

| Eixo | Nota | Evidência |
|------|------|-----------|
| **Hierarquia (Hoje)** | 7,8 | `order-1` Agora → atrasadas → captura → HeroDay → tarefas/hábitos → collapsibles (bom). Ainda há **muitos blocos** antes do fim da página (`Dashboard.jsx` + 24 widgets). |
| **Consistência entre abas** | 8,7 | 15+ rotas com `PageHero`/`praxis-page`; `docs/DESIGN.md` + `ONDE-ESTAMOS` marcam polish global fechado. |
| **Anti-slop / detector** | 7,5 | `impeccable detect src/`: **2 warnings** — `border-l-4` em `AvoidanceCockpit.jsx:77`; Inter/Space Grotesk em `index.css`. |
| **Densidade mobile** | 7,8 | `praxis-page--tight` + collapsibles fechados (Corpo/agenda, Sugestões). Empty Agora com **4 CTAs** ainda pesa. |
| **Navegação** | 9,0 | Primary: Hoje · Tarefas · Falar · Revisar · Mais (`praxisNav.js` + `MobileBottomNav`). FAB Falar + badge inbox. |
| **Copy UI** | 8,5 | Sem “cockpit/painel operacional” na UI; “da API” só em comentário de limite de upload. |
| **Tokens / tipografia** | 8,0 | Dark HSL tokens + domain palette ok. Primary roxo ~265° + ouro sidebar. Fontes **muito usadas** no ecossistema AI. |
| **A11y / touch** | 8,2 | `praxis-touch-target` (min 44px), safe-area bottom, labels no login, contraste dark razoável (sem auditoria WCAG formal). |
| **Empty / loading** | 8,5 | `PraxisEmptyState`, skeletons, splash `PraxisLoadingSplash`. |
| **Login / first screen** | 8,4 | Browser: “Praxis / Entrar / Senha” limpo, glass card, martelo gold — funcional e premium-light. |
| **Marca / personalidade** | 7,0 | Premium minimalista alinhado ao DESIGN.md, mas ainda **família Linear/AI dashboard** (roxo + glass + Inter). |

**Média ponderada (design dia a dia): ~7,9**

---

## O que está bem (não mexer por impulso)

1. **Agora primeiro** no Hoje — regra de ouro mantida (`NowBlock` order-1).  
2. **Kit canônico** em `PraxisPage.jsx`: `PageHero`, `StatGrid`/`StatTile`, `SectionHeading`, `PraxisEmptyState`, `PraxisInlinePromo`, skeletons.  
3. **Lote 7 quiet** — menos glow/mesh; glass virou flat quase (`index.css`).  
4. **Lote 8** — promos do Hoje na mesma família (`PraxisInlinePromo` / shell card/40).  
5. **Simplificação 2026-07-08** — menu 5 + extras em Mais/Histórico (`48b9fbc`, `c501003` hero enxuto).  
6. **Mobile nav** com Falar central e safe-area.  
7. **DESIGN.md** curto e acionável (tom, type, anti-slop, regra “todas as abas”).

---

## Gaps reais (prioridade)

### P0 — hierarquia do Hoje (uso real)

| Problema | Onde | Efeito |
|----------|------|--------|
| Página ainda é **stack de produtos** | `Dashboard.jsx` + 24 arquivos em `components/dashboard/` | Scroll longo; sensação de app de demo |
| Empty **Agora** com 4 botões | `NowBlock.jsx` | Compete com a tarefa principal |
| HeroDay **depois** do Agora ainda ocupa ar | `HeroDay.jsx` glass + chips | Segunda “home” visual |
| Nome interno `AvoidanceCockpit` | arquivo + import | OK se UI limpa; confunde em code review |

**Direção:** manter collapsibles fechados; no empty Agora, **2 CTAs** (Voz + Nova tarefa); Foco/Ideias secundários em link. Avaliar HeroDay ainda mais “chip strip” e menos card glass.

### P1 — anti-slop residual

| Achado | Fix sugerido |
|--------|----------------|
| `border-l-4` severidade em Avoidance | Dot / badge / `border-l-2` sutil — Lote 8c anti-side-tab |
| `DayWins` ainda `bg-gradient-to-br` gold/ember | Alinhar shell flat se o widget aparecer em rota ativa |
| Fonts Inter + Space Grotesk | Manter **se** João prefere quiet SaaS; trocar só se quiser “marca própria” (não é P0) |

### P1 — consistência de superfície

| Peça | Status |
|------|--------|
| Maioria das abas | `bg-card/40` + `border-border/80` |
| Login / splash / HeroDay / 404 | ainda `glass-surface` |  
| Sidebar | 1 gradiente residual |

Regra DESIGN.md: **máx. 1 superfície forte por rota**. Hoje já obedece melhor; residual glass ok só em login/splash **ou** só no Agora — não nos dois + Hero.

### P2 — personalidade (opcional)

UI Pro Max aponta dark premium productivity com accent mais “cinema” ou flat touch-first. Praxis já é dark premium, mas **primary roxo + Inter** é o default de 2024–26 AI apps.  
Só vale lote de tipografia/cor se João disser “quero cara de marca”, não “quero mais organizado”.

### P2 — QA visual

- Login prod visto no browser (anônimo).  
- **Sem** sessão autenticada nesta rodada (senha não lida no env do workspace).  
- Playwright `e2e/mobile-390.spec.js` existe — rodar com senha quando for validar lote visual.

---

## Superfície de produto (contexto de design)

| Métrica | Valor |
|---------|-------|
| Páginas `src/pages` | 16 |
| Widgets dashboard | 24 |
| Nav principal | 5 |
| Secundário (Mais) | até 9 (condicional) |
| `impeccable detect` | 2 warnings |

PRD v1 era ~5 telas; design **consegue** esconder complexidade na nav, mas o **Hoje** ainda carrega o peso do monólito.

---

## Alinhamento com DESIGN.md

| Regra | Status |
|-------|--------|
| Simples, sem jargão UI | ✅ |
| Premium minimalista, ouro só XP/nav | ✅ na maior parte |
| `praxis-page` + PageHero em todas abas | ✅ (Share mínimo ok) |
| Anti mono tracking absurdo | ✅ kickers sentence-case Lote 7 |
| Máx. 1 gradiente forte / rota | ⚠️ residual DayWins / sidebar |
| Ajuste geral = todas as abas | ✅ já foi política |

---

## Lotes propostos (só se João pedir código)

| Lote | Nome | Escopo |
|------|------|--------|
| **9a** | Hoje distill | NowBlock empty 2 CTAs; HeroDay mais strip; gaps; sem feature nova |
| **9b** | Anti side-tab + flat residual | Avoidance dots; DayWins shell; opcional glass só login |
| **9c** | QA 390 | `npm run test:e2e:mobile:prod` + print checklist Aceite |

**Não** abrir onda de feature. **Não** reinstalar Impeccable/live na VPS.

---

## Aceite (quando implementar)

- [ ] Empty Agora: no máx. 2 botões primários/outline no primeiro fold  
- [ ] Sem `border-l-4` “AI tab” em cards de lista  
- [ ] Scroll Hoje no 390px: Agora + 1 bloco de trabalho **sem** abrir collapsibles  
- [ ] `impeccable detect src/` ≤ 1 warning (fontes contam se mantidas de propósito)  
- [ ] Smoke/alias: `praxis-jota.vercel.app` com bundle novo  

---

## Fontes desta auditoria

- Código: `src/pages/Dashboard.jsx`, `NowBlock.jsx`, `PraxisPage.jsx`, `praxisNav.js`, `MobileBottomNav.jsx`, `index.css`, `Login.jsx`  
- Docs: `DESIGN.md`, `ONDE-ESTAMOS.md`, `PRAXIS-DESIGN-AUDIT-LOTE-8.md`, skill `praxis-simplificacao-auditoria-joao.md`  
- Tools: `npx impeccable detect src/ --json`; UI Pro Max `--design-system` + `--domain ux/style`  
- Browser: login público praxis-jota (sem área logada)  
- Git: `c501003` (Hoje compacto), `48b9fbc` (simplificação), `45f29c2` (Lote 8)

---

## Veredito

| Pergunta | Resposta |
|----------|----------|
| Design “entregue”? | **Sim** — kit + polish global + menu 5. |
| Design “calmo no celular todo dia”? | **Quase** — falta destilar o Hoje (9a). |
| Parece genérico de IA? | **Leve residual** — 2 tells no detect + paleta roxo/Inter; não é slop gritante. |
| Próximo passo natural | **Usar 7 dias** **ou** “arrocha lote 9a” se o scroll do Hoje ainda irritar. |
