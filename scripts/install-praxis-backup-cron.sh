#!/usr/bin/env bash
# Instala cron diário 03:15 (Fortaleza = VPS local) para backup SQLite Praxis.
# Idempotente — não duplica a linha marcada.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SCRIPT="$ROOT/scripts/praxis-backup.sh"
LOG="${PRAXIS_BACKUP_LOG:-/var/log/praxis-forja-backup.log}"
MARKER="# praxis-sqlite-backup"

chmod +x "$BACKUP_SCRIPT" "$ROOT/api/scripts/backup.sh" 2>/dev/null || true

LINE="15 3 * * * PRAXIS_API_DIR=\"${PRAXIS_API_DIR:-/root/.hermes/workspaces/apps/praxis/api}\" $BACKUP_SCRIPT >> $LOG 2>&1 $MARKER"

if crontab -l 2>/dev/null | grep -qF "$MARKER"; then
  echo "Cron já instalado ($MARKER)."
  crontab -l | grep -F "$MARKER" || true
  exit 0
fi

( crontab -l 2>/dev/null || true; echo "$LINE" ) | crontab -
echo "Cron instalado:"
crontab -l | grep -F "$MARKER"