#!/usr/bin/env bash
# Após mudanças em api/ — sync para cwd do systemd + restart + health local.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "$ROOT/scripts/sync-forja-api-production.sh"
echo "ship:api OK"