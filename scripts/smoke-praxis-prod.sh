#!/usr/bin/env bash
# Smoke produção Praxis — front + API via praxis-jota (rewrites).
# Uso:
#   ./scripts/smoke-praxis-prod.sh
#   PRAXIS_BASE=https://praxis-jota.vercel.app PRAXIS_USER=jota PRAXIS_APP_PASSWORD='...' ./scripts/smoke-praxis-prod.sh
set -euo pipefail

BASE="${PRAXIS_BASE:-https://praxis-jota.vercel.app}"
USER="${PRAXIS_USER:-jota}"
PASS="${PRAXIS_APP_PASSWORD:-${FORJA_APP_PASSWORD:-}}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

code() {
  curl -sS -o /dev/null -w '%{http_code}' "$@"
}

echo "=== Praxis smoke (base=$BASE) ==="

C=$(code "$BASE/")
[[ "$C" == "200" ]] || fail "GET / → $C (esperado 200)"
ok "GET / → 200"

C=$(code "$BASE/api/health")
[[ "$C" == "200" ]] || fail "GET /api/health → $C"
ok "GET /api/health → 200"

C=$(code "$BASE/api/tasks")
[[ "$C" == "401" ]] || fail "GET /api/tasks anônimo → $C (esperado 401)"
ok "GET /api/tasks anônimo → 401"

if [[ -z "$PASS" ]]; then
  echo "SKIP: login + /api/insights/weekly (defina PRAXIS_APP_PASSWORD no ambiente)"
  echo "=== Smoke parcial OK ==="
  exit 0
fi

LOGIN_CODE=$(curl -sS -o /tmp/praxis-smoke-login.json -w '%{http_code}' \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "$(node -e "console.log(JSON.stringify({password:process.argv[1]}))" "$PASS")" \
  "$BASE/api/auth/login")
[[ "$LOGIN_CODE" == "200" ]] || fail "POST /api/auth/login → $LOGIN_CODE ($(cat /tmp/praxis-smoke-login.json))"
ok "POST /api/auth/login → 200"

C=$(code -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/api/tasks?limit=1")
[[ "$C" == "200" ]] || fail "GET /api/tasks autenticado → $C"
ok "GET /api/tasks autenticado → 200"

C=$(code -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/api/insights/weekly")
[[ "$C" == "200" ]] || fail "GET /api/insights/weekly → $C"
ok "GET /api/insights/weekly → 200"

C=$(code -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/api/insights/avoidance")
[[ "$C" == "200" ]] || fail "GET /api/insights/avoidance → $C"
ok "GET /api/insights/avoidance → 200"

C=$(code -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/api/captures/pending-count")
[[ "$C" == "200" ]] || fail "GET /api/captures/pending-count → $C"
ok "GET /api/captures/pending-count → 200"

C=$(code -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/api/ops/backup-meta")
[[ "$C" == "200" ]] || fail "GET /api/ops/backup-meta → $C"
ok "GET /api/ops/backup-meta → 200"

if [[ "${PRAXIS_SMOKE_E2E:-1}" == "1" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  export BASE COOKIE_JAR
  bash "$SCRIPT_DIR/smoke-praxis-e2e.sh"
fi

echo "=== Smoke completo OK ==="