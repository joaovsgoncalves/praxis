# Plano Praxis — simplificação (2026-07-08)

**Status:** concluído 2026-07-08 · **URL:** https://praxis-jota.vercel.app

## Fases

| Fase | Entrega | Done quando |
|------|---------|-------------|
| **1** | Hoje enxuto | Agora + atrasadas + tarefas/hábitos; resto colapsado |
| **2** | Menu 5 + `/mais` | Hoje · Tarefas · Falar · Revisar · Mais |
| **3** | Ruído fora do Hoje | Posts/heatmap/correlações no Histórico; Compras só em Mais |
| **4** | `docs/COMO-JOAO-USA.md` + deps mortas removidas | Build + lint OK |

## Ship

`npm run prepush:check` → `git push origin main` → `npm run deploy:prod` → `ship:api` se `api/` mudou.