#!/usr/bin/env bash
# Wrapper Praxis — backup SQLite no diretório da API em produção.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${PRAXIS_API_DIR:-$ROOT/api}"

# Produção systemd costuma usar outro cwd
if [[ -f /root/.hermes/workspaces/forja-do-jota/api/forja.db ]]; then
  API_DIR="${PRAXIS_API_DIR:-/root/.hermes/workspaces/forja-do-jota/api}"
fi
if [[ -f "$ROOT/../forja-do-jota/api/forja.db" ]]; then
  API_DIR="$(cd "$ROOT/../forja-do-jota/api" && pwd)"
fi

export FORJA_DB="${FORJA_DB:-$API_DIR/forja.db}"
export BACKUP_DIR="${BACKUP_DIR:-$API_DIR/backups}"

exec bash "$API_DIR/scripts/backup.sh"