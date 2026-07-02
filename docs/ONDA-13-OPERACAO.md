# Onda 13 — Confiança operacional (8,6 → ~8,9)

| ID | Task | Status |
|----|------|--------|
| P13-T01 | `scripts/smoke-praxis-prod.sh` + `npm run smoke:prod` | **done** |
| P13-T02 | `scripts/sync-forja-api-production.sh` + doc | **done** |
| P13-T03 | Checklist métricas no plano principal atualizado | **done** |
| P13-T04 | `scripts/praxis-health-watchdog.sh` | **done** |

## Uso

```bash
# Build local (gate antes de push — evita email Vercel de falha)
npm run build

# Smoke prod (parcial sem senha; completo com PRAXIS_APP_PASSWORD)
npm run smoke:prod

# VPS — alinhar API se unit aponta forja-do-jota/api
./scripts/sync-forja-api-production.sh

# Cron health (opcional webhook Discord)
PRAXIS_BASE=https://praxis-jota.vercel.app ./scripts/praxis-health-watchdog.sh
```

## Falha Vercel (referência)

Deploy **Error** em produção costuma ser `npm run build` falhando no Git push (ex.: CSS inválido em `src/index.css`). O alias `praxis-jota.vercel.app` pode continuar no último deploy **Ready** — verificar com `vercel ls` e `npm run smoke:prod`.