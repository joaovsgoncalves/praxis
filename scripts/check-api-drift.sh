#!/usr/bin/env bash
# Alerta se api/ do repo diverge do path que o systemd declara (sem sync automático).
set -euo pipefail

SRC="${PRAXIS_API_SRC:-/root/.hermes/workspaces/apps/forja-do-jota/api}"
DST="${PRAXIS_API_DST:-/root/.hermes/workspaces/forja-do-jota/api}"

if [[ "$(realpath "$SRC" 2>/dev/null)" == "$(realpath "$DST" 2>/dev/null)" ]]; then
  echo "api-drift: OK (mesmo diretório)"
  exit 0
fi

for f in server.js package.json; do
  if [[ ! -f "$SRC/$f" || ! -f "$DST/$f" ]]; then
    echo "api-drift: WARN arquivo ausente $f"
    exit 1
  fi
  if ! cmp -s "$SRC/$f" "$DST/$f"; then
    echo "api-drift: DIFF $f — rode: npm run ship:api"
    exit 1
  fi
done
echo "api-drift: OK (server.js e package.json iguais)"