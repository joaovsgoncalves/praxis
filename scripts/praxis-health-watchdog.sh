#!/usr/bin/env bash
# Watchdog: alerta se /api/health falhar N vezes seguidas.
# Uso cron (ex. */5 * * * *):
#   PRAXIS_BASE=https://dopraxis.vercel.app ./scripts/praxis-health-watchdog.sh
# Opcional Discord webhook:
#   PRAXIS_ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/...
set -euo pipefail

BASE="${PRAXIS_BASE:-https://dopraxis.vercel.app}"
STATE="${PRAXIS_HEALTH_STATE:-/tmp/praxis-health-failures.count}"
MAX_FAILS="${PRAXIS_HEALTH_MAX_FAILS:-3}"

check() {
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${BASE}/api/health" || echo "000")
  [[ "$code" == "200" ]]
}

if check; then
  echo 0 > "$STATE"
  exit 0
fi

FAILS=0
[[ -f "$STATE" ]] && FAILS=$(cat "$STATE" 2>/dev/null || echo 0)
FAILS=$((FAILS + 1))
echo "$FAILS" > "$STATE"

MSG="Praxis health FAIL (${FAILS}/${MAX_FAILS}): ${BASE}/api/health"
echo "$MSG" >&2

if [[ "$FAILS" -ge "$MAX_FAILS" && -n "${PRAXIS_ALERT_WEBHOOK_URL:-}" ]]; then
  payload=$(node -e "console.log(JSON.stringify({content: process.argv[1]}))" "$MSG")
  curl -sS -X POST -H 'Content-Type: application/json' -d "$payload" "$PRAXIS_ALERT_WEBHOOK_URL" >/dev/null || true
  echo 0 > "$STATE"
fi

exit 1