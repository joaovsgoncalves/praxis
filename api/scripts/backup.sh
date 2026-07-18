#!/usr/bin/env bash
# Praxis — SQLite online backup with daily / weekly / monthly rotation.
#
# Usage:
#   ./backup.sh                            # backup to ./backups
#   BACKUP_DIR=/path/to/dir ./backup.sh    # custom dir
#   FORJA_DB=/path/to/forja.db ./backup.sh # custom db path
#
# Schedule (suggested cron, runs daily at 03:15):
#   15 3 * * * /home/user/praxis/api/scripts/backup.sh >> /var/log/forja-backup.log 2>&1
#
# Optional: push to cloud after backup
#   RCLONE_REMOTE=gdrive:/forja-backups ./backup.sh
#
# Rotation policy:
#   - daily/    : last 7 days
#   - weekly/   : last 4 (Sunday snapshots)
#   - monthly/  : last 12 (1st of each month)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"

FORJA_DB="${FORJA_DB:-$API_DIR/forja.db}"
BACKUP_DIR="${BACKUP_DIR:-$API_DIR/backups}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

if [ ! -f "$FORJA_DB" ]; then
  echo "[forja-backup] Database not found: $FORJA_DB" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "[forja-backup] sqlite3 CLI not installed (apt install sqlite3)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

TS="$(date +%Y%m%d_%H%M%S)"
DAILY_FILE="$BACKUP_DIR/daily/forja-$TS.db"

# Online backup via SQLite — safe with WAL, no read lock for the running API.
sqlite3 "$FORJA_DB" ".backup '$DAILY_FILE'"
gzip -f "$DAILY_FILE"
echo "[forja-backup] daily snapshot: $DAILY_FILE.gz"

# Weekly snapshot on Sundays (date +%u returns 7 on Sunday).
if [ "$(date +%u)" = "7" ]; then
  cp "$DAILY_FILE.gz" "$BACKUP_DIR/weekly/forja-$TS.db.gz"
fi

# Monthly snapshot on the 1st.
if [ "$(date +%d)" = "01" ]; then
  cp "$DAILY_FILE.gz" "$BACKUP_DIR/monthly/forja-$TS.db.gz"
fi

# Rotation — keep last N files in each tier.
keep_last() {
  local dir="$1" keep="$2"
  shopt -s nullglob
  local files=("$dir"/forja-*.db.gz)
  shopt -u nullglob
  if ((${#files[@]} <= keep)); then return 0; fi
  ls -1t "${files[@]}" 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm -f
}
keep_last "$BACKUP_DIR/daily"   7
keep_last "$BACKUP_DIR/weekly"  4
keep_last "$BACKUP_DIR/monthly" 12

BYTES=$(stat -c%s "$DAILY_FILE.gz" 2>/dev/null || echo 0)
DAILY_NAME="forja-${TS}.db.gz"
META_FILE="$BACKUP_DIR/last-backup.json"
# argv após node -e é inconsistente entre versões — gravamos JSON via shell
printf '%s\n' "{\"at\":\"$(date -Iseconds)\",\"daily\":\"$DAILY_NAME\",\"bytes\":${BYTES},\"backup_dir\":\"$BACKUP_DIR\"}" > "$META_FILE"
echo "[praxis-backup] meta: $META_FILE"

# Optional offsite copy via rclone (e.g. RCLONE_REMOTE=gdrive:/forja-backups).
if [ -n "$RCLONE_REMOTE" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --quiet
  echo "[forja-backup] synced to $RCLONE_REMOTE"
fi
