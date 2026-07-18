# Praxis Nutrição — fechamento (fases 0–12)

**Data:** 2026-07-09  
**PRD:** `docs/PLANO-PRAXIS-NUTRICAO-MACROS.md`  
**URL:** https://praxis-jota.vercel.app/nutricao

## Status

| Fase | Conteúdo | Status |
|------|----------|--------|
| 0 | Schema + API + nav placeholder | done |
| 1 | Meta / perfil / sugestão | done |
| 2 | Catálogo alimentos | done |
| 3 | Diário / logs snapshot | done |
| 4 | Barras + card Hoje | done |
| 5 | Recentes / favoritos / stepper / copiar ontem | done |
| 6 | Refeições salvas + from-meal | done |
| 7 | Seed BR + onboarding | done |
| 8 | parse-text + UI Texto (base A.N.A.) | done |
| 9 | Histórico + macros na revisão | done |
| **10** | **Peso + sparkline** | **done** |
| **11** | **Polish + smoke + nota** | **done** |
| **12** | **Barcode + Open Food Facts** | **done** |

## Onde fica no produto

- Sidebar / ferramentas **Nutrição** (`/nutricao`)
- Card **Macros do dia** no **Hoje**
- Bloco **Macros** na **Revisão semanal**
- Aba **Peso** com log diário + tendência SVG leve

## API (resumo)

- `GET/PUT /api/nutrition/profile`, `POST …/suggest`
- `GET/POST/PATCH/DELETE /api/nutrition/foods`
- `GET /api/nutrition/day`, `POST …/day/copy`
- `POST/PATCH/DELETE /api/nutrition/logs`, `POST …/from-meal`, `POST …/from-text`
- `GET/POST/PATCH/DELETE /api/nutrition/meals`
- `POST /api/nutrition/parse-text`, `POST /api/nutrition/seed`
- `GET /api/nutrition/summary`
- `GET/POST/DELETE /api/nutrition/weight`, `GET …/weight/trend`

## Smoke

```bash
# com sessão (smoke prod) ou key local:
BASE=http://127.0.0.1:18556 FORJA_API_KEY=… bash scripts/smoke-praxis-nutrition.sh
# integrado:
npm run smoke:prod   # inclui nutrition se logado
```

## Fora de escopo (proposital)

- Câmera nativa in-app (barcode ainda é colar código; OFF done)
- STT microfone *dentro* da Nutrição (canal A.N.A. Telegram/Web UI)
- Cronometer / micros / wearables
- Foto-IA do prato

## Nota de qualidade (fase 11)

- MacroBars: `role=progressbar`, `aria-valuetext`, `motion-safe` / `motion-reduce`
- Tabs com `role=tablist` / `aria-selected`
- Copy humana, sem jargão de lab
- Um peso por dia; sincroniza `nutrition_profile.weight_kg` com o log mais recente

## Barcode (fase 12)

- `GET /api/nutrition/barcode/:code` — cache local → Open Food Facts
- `POST /api/nutrition/barcode/lookup` — body `{ code, refresh? }`
- Coluna `food_items.barcode`; ids estáveis `off_<ean>`
- UI: botão **Código** no diário (colar EAN; sem câmera nativa ainda)
- User-Agent: `PraxisNutrition/1.0 …` (política OFF)
