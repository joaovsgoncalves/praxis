# Praxis Treinos V3 — modo execução (visibilidade + simplicidade)

**Status:** PRD (sem código até `arrocha fase N` / “faz tudo”)  
**Data:** 2026-07-29  
**Pedido João:** evoluir design da parte de treino — **visibilidade** e **simplicidade**; opinião A.N.A. + browser ao vivo → este plano → implement via Codex (high) com A.N.A. QA/ship.  
**Base viva:** `https://dopraxis.vercel.app/treinos` · HEAD referência no commit do PRD  
**Stack atual:** V1 programa/sessão + V2 logbook/`band_level` (+ RIR/warmup/detalhes já no `WorkoutSessionView`) — **evoluir UI de execução, não reescrever API**.  
**Marca:** `docs/DESIGN.md` — premium quieto, preto + ouro; **não** verde fitness / Barlow sports do UI Pro Max genérico.

---

## 1. Problema (3 linhas)

A sessão de treino funciona, mas **parece formulário de produto**, não ferramenta de academia.

- Controles secundários (RIR, elástico, aquecimento, detalhes, dual CTA) competem com **reps/carga + registrar**.
- Números e progresso são **pequenos demais** pra leitura entre séries (mão suada, distância do celular).
- Home de Treinos e chrome do app (sidebar, partículas, hero longo) roubam foco **antes e durante** o treino.

**Não é “deixar bonito”.** É **modo execução**: menos leitura, mais tração série a série.

---

## 2. Promessa

Em ≤2 toques a partir de “Começar treino”, o João vê:

1. **Qual exercício** (nome grande)  
2. **Qual série** (# claro)  
3. **Reps / carga** (números grandes, legíveis)  
4. **Um** botão primário: **Registrar**  
5. Depois: **descanso grande** ou próximo exercício  

Opcional (RIR, elástico, aquecimento, nota, qualidade) **existe**, mas **não ocupa o first fold** da série.

---

## 3. Evidência (auditoria 2026-07-29)

| Fonte | Achado |
|-------|--------|
| Browser prod `/treinos` | Home: hero + descrição + nota longa + lista + ciclo inteiro no mesmo scroll; CTA Começar ok mas first fold “explica demais”. |
| Browser sessão ativa (Legs → Agachamento) | Card denso: FORÇA + meta + nota + Trabalho/Aquecimento + input pequeno + RIR sempre + 5 chips elástico + Detalhes + Registrar ×2 + nav + Finalizar. Sidebar e partículas ainda no layout. Progresso ~invisível. |
| Comps V2 | A = logbook limpo; B = números gigantes; C = coach. Ship V2 puxou A+elástico; **faltou o punch de B na execução**. |
| Código | `WorkoutSessionView.jsx` (~866 linhas) carrega todos os controles no path feliz; `Treinos.jsx` TodayWorkout empilha card + lista + ciclo. |

### Notas sinceras (baseline)

| Camada | Nota |
|--------|------|
| Estrutura/produto | 7,5 |
| Visual premium | 7 |
| Visibilidade no treino | **4,5** |
| Simplicidade na hora H | **4** |

**Meta pós-V3 (sessão):** visibilidade ≥ 8 · simplicidade hora H ≥ 8 · sem regressão de dados V2.

---

## 4. Princípios de design

1. **Execução > planejamento.** Setup (Programa) pode ser denso; sessão tem de ser burra e clara.
2. **Um caminho pra registrar série.** Sem ✓ lateral + botão full duplicado no path feliz.
3. **Números de ginásio.** Reps/kg legíveis a distância; `tabular-nums`; steppers −/+ (e teclado numérico).
4. **Progressive disclosure.** RIR / elástico / aquecimento / nota / qualidade atrás de **Mais** (ou só se o exercício exigir elástico/RIR por config).
5. **Descanso é first-class.** Após série de trabalho: timer grande, −15/+15/pular; não card tímido.
6. **Modo treino.** Sessão ativa = menos chrome app (sem sidebar desktop, sem partículas se fácil, max-width foco).
7. **Copy humana.** Sem jargão coach desnecessário no first fold; ouro só CTA/progresso/nav ativo.
8. **Não quebrar V2.** `band_level`, prefill última, warmup A1/A2, RIR, purpose/skill — dados e API ficam; muda **hierarquia visual**.
9. **Mobile-first 390px.** Touch ≥44px; tabela não estoura (scroll-x ou layout de cards se preciso).
10. **Ship com prova no browser**, não só grep de bundle.

---

## 5. Modelo mental (João na academia)

| Momento | Precisa ver | Não precisa ver |
|---------|-------------|-----------------|
| Abrir Treinos | Dia de hoje + Começar (ou Continuar) | Ciclo inteiro, essay de nota, PageHero longo |
| Série de trabalho | # · reps · kg/elástico · Registrar | RIR, qualidade, nota, toggle aquecimento |
| Descanso | Relógio grande + atalhos | Editar programa |
| Trocar exercício | Chips ou Próximo | Refazer header do app |
| Setup em casa | Aba Programa completa | — (ok ser denso) |

---

## 6. Escopo

### Dentro (V3)

- **Home Treinos / tab Hoje** — destill first fold  
- **Sessão ativa** — hierarquia execução (números, disclosure, 1 CTA, descanso, chrome)  
- **Histórico** — polish leve de legibilidade (só o que ajudar “última vs hoje” na sessão; sem charts)  
- Tokens/classes locais de treino se precisar (`session-number`, rest hero) alinhados a `DESIGN.md`  
- E2E/smoke seletor se quebrar; testes API **só se** tocar backend (esperado: **não**)

### Fora (backlog explícito)

- Gráficos de progressão / PRs / volume semanal  
- GIFs / vídeo de exercício  
- Vincular hábito / tarefa “Bloco de corpo”  
- Redesign completo do **Programa** editor (dialogs, reorder)  
- Tracking type novo / schema novo (salvo bug bloqueante)  
- App nativo / wearables  
- Trocar marca pra “fitness laranja”  
- Reescrever API `workouts.js` do zero  

---

## 7. Direção UI (mini sistema)

**North-star:** híbrido **B (números)** + **A (logbook limpo)** + freio quieto Praxis.

| Elemento | Decisão |
|----------|---------|
| Exercício | Título `text-xl`–`2xl`, meta numa linha, nota colapsável se longa |
| Séries feitas | Rows compactas logbook (manter A) |
| Entrada | Reps (e kg se weight) **h-14+**, texto `text-2xl`+, steppers ±1 / ±2,5 kg |
| CTA | **Um** full-width `Registrar série N` (check icon só se for o mesmo botão) |
| Mais | Sheet/accordion: Aquecimento · RIR · Elástico · Qualidade · Nota |
| Elástico | Auto-expand só se `trackingUsesBand` **e** (último set tinha band **ou** user já abriu Mais) — default colapsado se exercício nunca usou band |
| RIR | Dentro de Mais, exceto se `target_rir_*` definido: chip resumo “alvo RIR 1–2” na meta, input em Mais |
| Rest | Card full destaque: timer `text-4xl` tabular, −15 / +15 / Pular |
| Shell sessão | `max-w-xl` centrado; **ocultar sidebar** no layout quando `activeSessionId` (prop/route flag); partículas off ou opacity 0 na sessão |
| Home | Card único: kicker curto · nome · `N ex · ~min` · **Começar**; nota em “Ver nota”; lista exercícios densa; ciclo em “Ver ciclo” collapsible default fechado |
| Progress | Barra `h-2` + contraste maior; % legível |

**Anti-patterns:** dual register; 5+ chip rows no path feliz; PageHero paragraph longo na sessão; Finalizar com peso visual > Registrar durante o treino (Finalizar = secondary até ter ≥1 série work).

---

## 8. Superfícies e arquivos (provável)

| Área | Arquivos principais |
|------|---------------------|
| Home | `src/pages/Treinos.jsx` (`TodayWorkout`) |
| Sessão | `src/components/workouts/WorkoutSessionView.jsx` |
| Histórico | `src/components/workouts/WorkoutHistory.jsx` (leve) |
| Lib | `src/lib/workouts.js` (helpers UI se precisar; sem schema) |
| Layout | `App.jsx` / shell sidebar — flag “workout session mode” ou rota dedicada |
| Estilo | `src/index.css` só se token de sessão precisar |
| E2E | `e2e/workouts-v1.spec.js` se seletores mudarem |

**API:** sem migration esperada. Se Codex tocar API → justificar e `test:workouts`.

---

## 9. Fases

Ship default João multi-fase UI: **Ship B** = um deploy no fim do lote pedido; ou **arrocha fase N** isolada.

### Fase 0 — Baseline + contrato visual (doc only / 0 mutação prod)

**Done quando:**
- [ ] Este PRD commitado em `main` (ou branch acordada)
- [ ] Checklist de aceite §10 revisável no chat
- [ ] Brief Codex colado (anexo §12) pronto
- [ ] Screenshots baseline opcionais em `docs/design-direction/treinos-v3/` (home + sessão) se João quiser trava visual

**Não:** codar UI.

---

### Fase 1 — Home Treinos destill (P0 home)

**Done quando:**
- [ ] First fold ≈: tabs + card do dia (nome, meta curta, Começar/Continuar) — **sem** nota longa aberta por default
- [ ] Nota do dia: collapsible “Nota” ou 1 linha truncada + expand
- [ ] “Teu ciclo” default **colapsado** (ou abaixo do fold com menos peso)
- [ ] Lista “Exercícios de hoje” mais densa (nome + `4×5–8` + rest curto); chevron decorativo ok
- [ ] PageHero: description enxuta (1 linha) ou kicker só — sem parágrafo de marketing
- [ ] Mobile 390: Começar visível sem scroll absurdo (meta: CTA above fold em viewport típico)
- [ ] `prepush:check` se ship solo; browser proof home

---

### Fase 2 — Sessão: hierarquia + números + 1 CTA (P0 sessão)

**Done quando:**
- [ ] Entrada de série: reps (e kg) com **steppers** e tipografia grande
- [ ] **Um** CTA primário Registrar (full width); sem segundo controle equivalente no path feliz
- [ ] Toggle Trabalho/Aquecimento **não** ocupa row permanente — em Mais ou segmented discreto secundário
- [ ] RIR + elástico + qualidade + nota sob **Mais** (default fechado); elástico auto-open só regra §7
- [ ] Rows de séries feitas permanecem scanáveis (logbook A)
- [ ] Prefill última sessão preservado
- [ ] Warmup labels A1/A2 e work 1,2,3 intactos
- [ ] Browser: registrar 1 série weight_reps e 1 reps+band (se tiver no programa) sem regressão
- [ ] `prepush:check`

---

### Fase 3 — Descanso + modo treino (chrome) (P0 sessão)

**Done quando:**
- [ ] Rest timer visual **hero** (número grande, ações óbvias)
- [ ] Sessão ativa: sidebar desktop **oculta** (ou off-canvas sem roubar coluna)
- [ ] Partículas/atmosphere desligadas ou inertes na sessão (sem regredir reduced-motion global)
- [ ] Progress bar legível (contraste + espessura)
- [ ] Header sessão: back · nome dia · clock — sem ruído extra
- [ ] Finalizar = outline/secondary até haver work set; depois pode subir ênfase
- [ ] Browser sessão + voltar “Continuar” ainda funciona
- [ ] `prepush:check`

---

### Fase 4 — Histórico legível + tight ends (P1)

**Done quando:**
- [ ] Detail dialog: séries com hierarquia clara (work vs aquec.); tipografia um pouco maior
- [ ] Na sessão, linha “Última: …” mais legível (se já existe, reforçar)
- [ ] Empty/error states inalterados em qualidade
- [ ] E2E workouts ajustado se quebrou
- [ ] Ship B se ainda não: `deploy:prod` + alias `dopraxis.vercel.app` + browser proof

---

### Fase 5 — Prova + nota (fechamento)

**Done quando:**
- [ ] `npm run prepush:check`
- [ ] Push `main` (committer canônico João)
- [ ] Front: `npm run deploy:prod` + alias canônico
- [ ] API: **não** precisa ship salvo diff em `api/`
- [ ] Browser: home destill + sessão (números, Mais, rest, sem sidebar)
- [ ] Atualizar `references/praxis-treinos-v3-execucao.md` (ops) + 1 linha em `ONDE-ESTAMOS` se João pedir status
- [ ] Chat: tabela curto feito / URL / commit

---

## 10. Critérios de aceite (produto)

1. João inicia treino e registra série de trabalho **sem abrir “Mais”** no caso kg+reps padrão.  
2. Em 390px, reps/kg são o elemento dominante do card de entrada (maiores que chips).  
3. Não há dois botões “registrar” equivalentes.  
4. Descanso pós-série é impossível de não notar.  
5. Home: Começar/Continuar é a ação óbvia; ciclo não compete.  
6. Zero regressão: abandonar, finalizar parcial (confirm), 409 session resume, prefill band/kg/reps.  
7. Contraste texto ≥ AA nos números principais.  
8. Copy PT simples; sem “cockpit”, “overload”, “accommodation”.  

---

## 11. Riscos e pitfalls

| Risco | Mitigação |
|-------|-----------|
| Codex “redesign genérico fitness” | Brief: DESIGN.md Praxis + anti laranja/Barlow; comps A/B paths |
| Esconder elástico e João não achar | Regra auto-open + label Mais com badge se valor ativo |
| Quebrar e2e seletores | Atualizar `e2e/workouts-v1.spec.js` na mesma fase |
| Ship front sem alias | `deploy:prod` + alias `dopraxis.vercel.app` obrigatório |
| Mexer API sem necessidade | PRD proíbe; review diff |
| Sidebar hide quebra layout mobile | Mobile já usa bottom nav — testar os dois |
| Scope creep Programa editor | Fora; só se bug bloqueia sessão |

---

## 12. Brief Codex (colar na delegação)

```text
Praxis Treinos V3 — modo execução (UI only unless blocked).

Repo: apps/praxis (joaovsgoncalves1-jpg/praxis). Prod: dopraxis.vercel.app.
Read: docs/PLANO-PRAXIS-TREINOS-V3-EXECUCAO.md (source of truth).
Also: docs/DESIGN.md, src/components/workouts/WorkoutSessionView.jsx, src/pages/Treinos.jsx.

Goal: gym execution clarity — big numbers, one primary Register CTA, progressive disclosure (RIR/band/warmup/notes under Mais), hero rest timer, hide app chrome in active session, distill Treinos home first fold.

Do NOT: new API schema, fitness orange rebrand, full Program editor rewrite, progression charts, GIFs.

Phases: implement only the phase(s) named in the task. Prefer minimal diff, keep band_level/RIR/warmup/prefill behavior.

Verify: lint/typecheck/build as in prepush; manual reasoning for 390px session path.
Committer if commit: João Victor <joaovs.goncalves1@gmail.com> — only if asked to commit; else leave diff for A.N.A.
```

**Modelo sugerido:** Codex **gpt-5.6 / high** (UI multi-file). Claude high ok se João preferir polish visual extremo na sessão.

---

## 13. Ordem de execução (A.N.A.)

1. João valida PRD (este doc) — ajustes de gosto/escopo aqui.  
2. `arrocha fase 1` … ou `arrocha fases 1–3 ship B` / `faz o V3`.  
3. A.N.A. grava brief + `delegate` Codex (ou CLI) com fase explícita.  
4. A.N.A. review diff vs §10 + browser.  
5. `prepush:check` → push → `deploy:prod` + alias → prova.  
6. Fase 5 closeout.

**Ship A vs B:** default **B** (um deploy ao fechar o pacote pedido). Ship A só se fase 1 home sozinha for urgência.

---

## 14. MVP recomendado

| Pacote | Fases | Quando |
|--------|-------|--------|
| **MVP execução** | 0 + **1 + 2 + 3** + 5 | O que resolve a dor da auditoria |
| Completo V3 | MVP + **4** | Se quiser histórico no mesmo lote |
| Só home | 0 + 1 + ship | Se quiser fatiar |

---

## 15. Referências

- V1 ops: skill `praxis-product-ops` → `references/praxis-treinos-v1.md`  
- V2 ops: `references/praxis-treinos-v2-logbook-band.md`  
- Plano V2: `docs/PLANO-PRAXIS-TREINOS-V2-LOGBOOK.md`  
- Comps: `docs/design-direction/treinos-v2/`  
- Design global: `docs/DESIGN.md`  
- Destill pattern: lotes 9–10 Hoje (mesma filosofia: Agora first, menos chrome)

---

## 16. Changelog do PRD

| Data | Nota |
|------|------|
| 2026-07-29 | PRD inicial pós-auditoria browser + opinião A.N.A. |
