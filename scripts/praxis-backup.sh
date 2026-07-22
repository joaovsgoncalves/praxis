#!/usr/bin/env bash
# Wrapper Praxis — backup SQLite no diretório da API em produção.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${PRAXIS_API_DIR:-$ROOT/api}"

# Prefer real apps path; symlink workspaces/praxis → apps/praxis is fine too
if [[ -d /root/.hermes/workspaces/apps/praxis/api ]]; then
  API_DIR="${PRAXIS_API_DIR:-/root/.hermes/workspaces/apps/praxis/api}"
elif [[ -d /root/.hermes/workspaces/praxis/api ]]; then
  API_DIR="${PRAXIS_API_DIR:-/root/.hermes/workspaces/praxis/api}"
fi

# Prefer live praxis.db after migration; keep forja.db as fallback source
if [[ -z "${FORJA_DB:-}" ]]; then
  if [[ -f "$API_DIR/praxis.db" ]]; then
    export FORJA_DB="$API_DIR/praxis.db"
  elif [[ -f "$API_DIR/forja.db" ]]; then
    export FORJA_DB="$API_DIR/forja.db"
  else
    export FORJA_DB="$API_DIR/praxis.db"
  fi
fi

export BACKUP_DIR="${BACKUP_DIR:-$API_DIR/backups}"

exec bash "$API_DIR/scripts/backup.sh"
