#!/usr/bin/env bash
# Copia api/ do workspace de dev para o cwd do systemd forja-api (quando divergirem).
# Uso na VPS: ./scripts/sync-forja-api-production.sh [--dry-run]
set -euo pipefail

SRC="${PRAXIS_API_SRC:-/root/.hermes/workspaces/apps/forja-do-jota/api}"
DST="${PRAXIS_API_DST:-/root/.hermes/workspaces/forja-do-jota/api}"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

if [[ ! -d "$SRC" ]]; then
  echo "SRC inexistente: $SRC" >&2
  exit 1
fi
if [[ ! -d "$DST" ]]; then
  echo "DST inexistente: $DST" >&2
  exit 1
fi

if [[ "$(realpath "$SRC")" == "$(realpath "$DST")" ]]; then
  echo "SRC e DST são o mesmo path — nada a sincronizar."
  exit 0
fi

RSYNC=(rsync -a --delete --exclude node_modules --exclude '*.db' --exclude '.env')
[[ $DRY -eq 1 ]] && RSYNC+=(--dry-run -v)

echo "Sync API: $SRC → $DST"
"${RSYNC[@]}" "$SRC/" "$DST/"

if [[ $DRY -eq 1 ]]; then
  echo "(dry-run — sem restart)"
  exit 0
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet forja-api 2>/dev/null; then
  echo "Restart forja-api..."
  systemctl restart forja-api
  sleep 1
  curl -sf "http://127.0.0.1:${FORJA_PORT:-18556}/api/health" | head -c 200
  echo ""
fi
echo "Sync concluído."