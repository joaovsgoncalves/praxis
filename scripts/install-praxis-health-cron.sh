#!/usr/bin/env bash
# Cron */5 — watchdog /api/health (alerta só com PRAXIS_ALERT_WEBHOOK_URL após N falhas).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCH="$ROOT/scripts/praxis-health-watchdog.sh"
LOG="${PRAXIS_HEALTH_LOG:-/var/log/praxis-health-watchdog.log}"
MARKER="# praxis-health-watchdog"

chmod +x "$WATCH" 2>/dev/null || true

LINE="*/5 * * * * PRAXIS_BASE=\"https://praxis-jota.vercel.app\" $WATCH >> $LOG 2>&1 $MARKER"

if crontab -l 2>/dev/null | grep -qF "$MARKER"; then
  echo "Cron já instalado ($MARKER)."
  crontab -l | grep -F "$MARKER" || true
  exit 0
fi

( crontab -l 2>/dev/null || true; echo "$LINE" ) | crontab -
echo "Cron instalado:"
crontab -l | grep -F "$MARKER"