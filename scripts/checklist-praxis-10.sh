#!/usr/bin/env bash
# Checklist automatizado rumo a 10/10 — roda na VPS ou CI com credenciais opcionais.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${PRAXIS_BASE:-https://praxis-jota.vercel.app}"
PASS="${PRAXIS_APP_PASSWORD:-${FORJA_APP_PASSWORD:-}}"

fail=0
check() { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }
bad() { echo "  ✗ $*"; fail=1; }

echo "=== Checklist Praxis 10/10 (auto) ==="

echo "[1] Front + health"
code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/") || code=000
[[ "$code" == "200" ]] && check "GET / → 200" || bad "GET / → $code"

code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/health") || code=000
[[ "$code" == "200" ]] && check "/api/health → 200" || bad "/api/health → $code"

echo "[2] Backup local (VPS)"
API_DIR="${PRAXIS_API_DIR:-/root/.hermes/workspaces/apps/forja-do-jota/api}"
if [[ -f "$API_DIR/backups/last-backup.json" ]]; then
  check "last-backup.json presente"
  cat "$API_DIR/backups/last-backup.json"
else
  warn "Sem last-backup.json — rode: ./scripts/praxis-backup.sh"
fi

if crontab -l 2>/dev/null | grep -q praxis-sqlite-backup; then
  check "cron backup instalado"
else
  warn "cron backup ausente — ./scripts/install-praxis-backup-cron.sh"
fi

echo "[3] Smoke prod"
if [[ -n "$PASS" ]]; then
  PRAXIS_BASE="$BASE" PRAXIS_APP_PASSWORD="$PASS" bash "$ROOT/scripts/smoke-praxis-prod.sh" && check "smoke completo" || bad "smoke falhou"
else
  warn "smoke parcial (sem PRAXIS_APP_PASSWORD)"
  PRAXIS_BASE="$BASE" bash "$ROOT/scripts/smoke-praxis-prod.sh" || bad "smoke parcial falhou"
fi

echo "[4] Build gate"
(cd "$ROOT" && npm run prepush:check >/dev/null 2>&1) && check "prepush:check" || bad "prepush:check"

if [[ $fail -eq 0 ]]; then
  echo "=== Checklist auto: OK ==="
  exit 0
fi
echo "=== Checklist auto: pendências ==="
exit 1