# Onda 19 — Smoke E2E

| ID | Task | Status |
|----|------|--------|
| P19-T01 | Tarefa criar → concluir → apagar | **done** |
| P19-T02 | Recorrência diária + `next_occurrence` | **done** |
| P19-T03 | POST captura com fixture WAV | **done** |
| P19-T04 | GET `/capturas` + `pending-count` | **done** |
| P19-T05 | Este doc | **done** |

## Scripts

| Script | Função |
|--------|--------|
| `scripts/smoke-praxis-prod.sh` | Smoke base + chama E2E (default) |
| `scripts/smoke-praxis-e2e.sh` | Ciclo tarefa, recorrência, voz |
| `scripts/fixtures/smoke-capture.wav` | Áudio PT (espeak) para STT |

## Uso

```bash
set -a; source /root/.hermes/secrets/forja-api.env; set +a
PRAXIS_APP_PASSWORD="$PRAXIS_APP_PASSWORD" npm run smoke:prod
```

`PRAXIS_SMOKE_E2E=0` desliga só o bloco E2E.

## Variáveis

| Var | Default |
|-----|---------|
| `PRAXIS_SMOKE_E2E` | `1` |
| `PRAXIS_CAPTURE_TIMEOUT` | `180` |
| `PRAXIS_SMOKE_TZ` | `America/Fortaleza` |

Captura: aceita 200 transcrito ou 422/503 com `capture_id` explícito.