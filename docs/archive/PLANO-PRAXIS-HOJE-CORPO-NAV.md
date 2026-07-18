# Praxis — Hoje · Corpo/agenda · nav (água · rituais · treinos)

Atualizado: 2026-07-10.  
Pedido João: collapsible **Corpo e agenda** estranho; água melhor em **Nutrição**; **Rituais** sumiu da lateral; futura aba **Treinos** acima de Nutrição. **Só plano até `arrocha fase N`.**

## Diagnóstico (código + print)

| Achado | Onde | Causa |
|--------|------|--------|
| “Corpo e agenda” parece bagunçado | `Dashboard.jsx` collapsible | Empilha **4 coisas diferentes** no mesmo saco: check-in bem-estar + **Google Calendar** (`TodayCalendar`) + rituais do dia + água (localStorage) |
| Agenda com horários | `TodayCalendar` | Sim — eventos do Google Agenda do dia |
| Água no collapsible | `WaterTracker` no Dashboard | Contador local (`water_ml_*`); **não** está no módulo Nutrição |
| Rituais “sumiu” da lateral | `praxisNav.js` | `requiresActiveRituals: true` → some se `activeRitualCount === 0` |
| Rituais no Hoje | `RitualWidget` | Continua **dentro** do collapsible; empty “Nenhum ritual ativo” |
| Treinos | — | **Não existe** rota/nav ainda |

## Promessa

Hoje mais legível: corpo (humor/sono) separado de agenda e de nutrição/água; nav lateral previsível; Treinos como slot futuro sem inventar app de gym agora.

## Out of scope (até pedido)

- App completo de periodização/treino com vídeo
- Reescrever Google Calendar sync
- Mover bem-estar para outra rota
- Voltar hub “Mais ferramentas”

## Decisões de produto (propostas — confirmar no arrocha)

1. **Corpo e agenda** deixa de ser um “lixão”:
   - **Corpo** = Wellness check-in (como está)
   - **Agenda de hoje** = `TodayCalendar` (Google) — card próprio, não escondido no mesmo título ambíguo
   - **Rituais do dia** = link curto + empty CTA “criar ritual” → `/rituais` (ou mini widget enxuto)
   - **Água** = sai do collapsible do Hoje → **Nutrição** (aba Diário ou card no topo)
2. **Rituais na sidebar**: sempre visível (remover `requiresActiveRituals` **ou** mostrar com badge “vazio” — preferência: **sempre no secondary**)
3. **Treinos**: item de nav **acima de Nutrição** (`/treinos`), fase stub + PRD depois

## Fases

| Fase | Nome | Done quando | Ship |
|------|------|-------------|------|
| **0** | Plano + tasks | Este doc + taskflow; João OK | doc only |
| **1** | Hoje: desempilhar “Corpo e agenda” | Collapsible renomeado/split; agenda card legível; menos densidade vertical; desktop/mobile | front |
| **2** | Água → Nutrição | Water no fluxo Nutrição (card ou aba); removido do dump do Hoje; preferência localStorage preservada ou migrada com nota | front (+ API se for backend depois) |
| **3** | Nav Rituais sempre | Rituais aparece na lateral mesmo com 0 ativos; empty state `/rituais` ok | front |
| **4** | Treinos — slot | Secondary `Treinos` **acima** de Nutrição; rota `/treinos` placeholder (PageHero + “em breve” + 3 bullets MVP futuro); **sem** modelo de treino completo | front |
| **5** | PRD Treinos (opcional) | `PLANO-PRAXIS-TREINOS.md` com schema/MVP se João pedir aprofundar | doc |

### Ship multi-fase

- Default **B**: um `deploy:prod` + alias no fim do lote quando “arrocha 1–4”
- **A**: fase isolada se só nav ou só água

## Tasks (checklist execução)

### Fase 1 — layout Hoje

- [ ] P1-T1 Mapear wire mobile/desktop: coluna direita = Nutrição card + Agenda + Corpo (wellness) separados
- [ ] P1-T2 Renomear collapsible **ou** eliminar collapsible único: opções A) dois collapsibles “Corpo” / “Agenda” B) cards sempre abertos enxutos (preferência João no arrocha)
- [ ] P1-T3 `TodayCalendar`: título “Agenda de hoje” + empty state claro se sem Google
- [ ] P1-T4 `RitualWidget`: compactar empty + CTA `/rituais`; não competir com 4 cards altos
- [ ] P1-T5 Smoke visual 390px + desktop xl grid

### Fase 2 — água

- [ ] P2-T1 Inserir `WaterTracker` (ou equivalente) em `Nutricao.jsx` / card diário
- [ ] P2-T2 Remover água do collapsible do `Dashboard`
- [ ] P2-T3 Manter chave localStorage atual **ou** documentar migração se unificar com API depois
- [ ] P2-T4 Copy: “Água do dia” sem jargão

### Fase 3 — nav rituais

- [ ] P3-T1 `secondaryNavItems`: tirar `requiresActiveRituals` (sempre listar Rituais)
- [ ] P3-T2 Ajustar `filterSecondaryNav` / testes manuais com 0 rituais
- [ ] P3-T3 Confirmar Mobile drawer “Menu” mostra Rituais

### Fase 4 — treinos slot

- [ ] P4-T1 Rota `/treinos` + page stub
- [ ] P4-T2 `praxisNav.js`: `{ path: '/treinos', label: 'Treinos' }` **antes** de `/nutricao`
- [ ] P4-T3 MobileTopBar prefix title
- [ ] P4-T4 `App.jsx` route
- [ ] P4-T5 Não implementar CRUD de treino nesta fase

### Fase 5 — PRD (só se pedir)

- [ ] P5-T1 Esboço: treino do dia, histórico, link com macros/água, offline

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Tirar água do Hoje e João não achar | Link “Água em Nutrição” 1 linha no card macros Hoje por 1 release |
| Rituais sempre na nav “polui” | 1 item; já é secondary |
| Treinos stub parecer bug | Copy “em breve · planejado” + não deep-link de produto externo |

## Verificação

```bash
cd apps/praxis && npm run prepush:check
# após ship front
npm run deploy:prod && scripts/praxis-alias-canonical.sh
# manual: Hoje expandir seções, /nutricao água, sidebar Rituais com 0 rituais, /treinos stub
```

## Gatilho de execução

- `arrocha fase 1` … `4` ou `arrocha 1–4 ship B`
- Sem isso: **não codar**
