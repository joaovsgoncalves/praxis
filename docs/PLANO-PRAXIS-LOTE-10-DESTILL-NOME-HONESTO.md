# Praxis — Plano completo: nome honesto + lotes 10a–10c

**Data:** 2026-07-16  
**Pedido:** nome livre no “Não rolou” + plano de design da auditoria + **arrocha tudo**  
**Base:** `docs/PRAXIS-DESIGN-AUDIT-2026-07-16.md` · skip note já em `0a741d8`

---

## Objetivo

1. **Nomear falha sem romance** — texto livre ao pular hábito (ex. “eu escolhi o fácil”).  
2. **Destilar o Hoje** — hierarquia, hábitos honestos, densidade de botões no mobile.

---

## Fases / tasks

### Fase 0 — Nome honesto (já shipped parcial)

| ID | Task | Done-when | Status |
|----|------|-----------|--------|
| 0.1 | API `habit_logs.note` no skip | POST aceita `note`/`skip_note` | ✅ `0a741d8` |
| 0.2 | `SkipHabitSheet` com textarea + placeholders honestos | Copy “nomeia sem romance” | ✅ |
| 0.3 | Wire Hoje / Hábitos / RitualWidget | nota visível após skip | ✅ — revalidar no ship |

### Fase 1 — Lote 10a Hierarquia Hoje

| ID | Task | Arquivos |
|----|------|----------|
| 1.1 | **Agora first** — `NowBlock` acima de `HeroDay` | `Dashboard.jsx` |
| 1.2 | HeroDay mais strip (menos “segunda home”) | `HeroDay.jsx` — card flat, sem radial gold forte |

### Fase 2 — Lote 10b Hábitos uma verdade

| ID | Task | Arquivos |
|----|------|----------|
| 2.1 | Remover `.slice(0, 5)` nos essenciais | `Dashboard.jsx` |
| 2.2 | Contagem Hero = todos due today (done só outcome done) | `Dashboard.jsx` |
| 2.3 | Tirar **OpeningRitualCollapsible** do Hoje (evita double manhã; RitualWidget já cobre) | `Dashboard.jsx` |

### Fase 3 — Lote 10c Densidade ações

| ID | Task | Arquivos |
|----|------|----------|
| 3.1 | Task no Hoje: **≤2 botões** — Não hoje + Editar; Foco vira link texto ou ícone secundário | `TodayTasks.jsx` |
| 3.2 | Sheet skip: primário único “Registrar”, chips compactos | `SkipHabitSheet.jsx` polish se preciso |

### Fase 4 — Ship

| ID | Task |
|----|------|
| 4.1 | `npm run prepush:check` |
| 4.2 | commit + push `main` |
| 4.3 | `ship:api` + restart se API; `deploy:prod` + dual alias |
| 4.4 | smoke API note + bundle strings |

---

## Fora deste lote

- 11a Treinos flat / bg-black tokens (próximo se pedir)  
- Rebrand tipografia  
- Fase 3 insights heatmap  

---

## Aceite João

1. Hoje: **Agora** no topo (acima do resumo do dia).  
2. Hero mostra **N/N hábitos due reais** (não só 5).  
3. Não aparece “Abertura do dia” de novo em Sugestões se já tem RitualWidget.  
4. Tarefa: no máximo 2 botões grandes na row.  
5. Não rolou → escreve “eu escolhi o fácil” → aparece na linha.
