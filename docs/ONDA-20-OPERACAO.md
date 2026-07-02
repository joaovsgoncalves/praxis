# Onda 20 — Operação à prova de burrice

| ID | Task | Status |
|----|------|--------|
| P20-T01 | Cron health `*/5` + installer | **done** |
| P20-T02 | URL canônica `praxis-jota` (redirect `forja-do-jota`) | **done** |
| P20-T03 | Fluxo pós-mudança API (`ship:api` + drift check) | **done** |
| P20-T04 | Alerta Discord no smoke | **fora** (só se pedir webhook) |

## URL oficial

**Use sempre:** https://praxis-jota.vercel.app  

`forja-do-jota.vercel.app` → redirect **308** para `praxis-jota` (`middleware.js` + `vercel.json`).

## Cron health (VPS)

```bash
./scripts/install-praxis-health-cron.sh
# log: /var/log/praxis-health-watchdog.log
```

Alerta Discord **só** se definir `PRAXIS_ALERT_WEBHOOK_URL` no cron ou no script.

## API: dev vs systemd

| Path | Papel |
|------|--------|
| `apps/forja-do-jota/api` | Onde você edita (Git) |
| `forja-do-jota/api` | `WorkingDirectory` do systemd (pode divergir) |

Depois de mudar `api/`:

```bash
npm run ship:api          # rsync + restart forja-api
npm run check:api-drift   # só compara (checklist)
```

## Checklist

`npm run checklist:10` inclui drift + cron health (warn se ausente).