# Praxis — Lote 7 (app inteiro mais quieto)

**Gatilho:** “minimalista”, “quieto”, “menos poluído”, “Lote 7”.  
**Taskflow:** `ana-brain-core/taskflow/tasks/2026-07-06-praxis-lote7-quiet-calendar.md`

## Ordem recomendada

| # | Fase | Dono | Ship? |
|---|------|------|-------|
| 1 | Calendar atrasadas | A.N.A. | **sim** (`ship:api`) |
| 2 | Tokens CSS | A.N.A. | com front |
| 3 | Sidebar + agenda | A.N.A. | com front |
| 4 | Dashboard distill | A.N.A. + ok João | com front |
| 5 | prepush + deploy + smoke | A.N.A. | sim |

## Não fazer neste lote

- Reabrir ondas 1–24
- PraxIA nova / Compras features
- Playwright suite inteira (só se Dashboard mudar forte)

Ordem recomendada: **Fase 1–5** num deploy (João escolheu **B**).

**Ship:** `122f688` — API restart + Vercel praxis-jota.