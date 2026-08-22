#!/usr/bin/env bash
# Smoke Treinos V4 (read-only) — chamado de smoke-praxis-prod.sh com BASE + COOKIE_JAR
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:18556}"
BASE="${BASE%/}"
COOKIE_JAR="${COOKIE_JAR:-}"
OUT=/tmp/praxis-treinos-smoke.json

code() {
  local extra=()
  if [[ -n "$COOKIE_JAR" ]]; then
    extra+=(-b "$COOKIE_JAR" -c "$COOKIE_JAR")
  fi
  if [[ -n "${FORJA_API_KEY:-}" ]]; then
    extra+=(-H "Authorization: Bearer ${FORJA_API_KEY}")
  fi
  curl -sS -o "$OUT" -w '%{http_code}' "${extra[@]}" "$@"
}

fail() { echo "FAIL treinos: $*" >&2; exit 1; }
ok() { echo "OK treinos: $*"; }

ANON=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/workouts/exercises?limit=1" || true)
[[ "$ANON" == "401" ]] || fail "GET /api/workouts/exercises anônimo → $ANON (esperado 401)"
ok "exercises anônimo 401"

C=$(code "$BASE/api/workouts/exercises?source=catalog&limit=3&meta=1")
[[ "$C" == "200" ]] || fail "GET catalog → $C ($(head -c 180 "$OUT" 2>/dev/null || true))"
python3 - "$OUT" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
items = d.get("items") if isinstance(d, dict) else d
total = d.get("total") if isinstance(d, dict) else len(items or [])
if not items:
    raise SystemExit("catalog vazio")
print(f"catalog_total={total} page={len(items)}")
if isinstance(total, int) and total < 1300:
    raise SystemExit(f"catalog total {total} < 1300")
PY
ok "GET catalog 200 (>=1300)"

C=$(code "$BASE/api/workouts/muscle-map?mode=balance&days=14")
[[ "$C" == "200" ]] || fail "GET muscle-map → $C"
python3 - "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
ms = d.get("muscles") or []
if len(ms) != 18:
    raise SystemExit(f"muscles={len(ms)} esperado 18")
if d.get("mode") != "balance":
    raise SystemExit(f"mode={d.get('mode')}")
PY
ok "GET muscle-map balance 18 músculos"

C=$(code "$BASE/api/workouts/heatmap?year=2026")
[[ "$C" == "200" ]] || fail "GET heatmap → $C"
ok "GET heatmap 200"

C=$(code "$BASE/api/workouts/agent-snapshot?days=14")
[[ "$C" == "200" ]] || fail "GET agent-snapshot → $C"
python3 - "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for k in ("generated_at", "last_sessions", "muscle_map_balance"):
    if k not in d:
        raise SystemExit(f"snapshot sem {k}")
PY
ok "GET agent-snapshot 200"

echo "=== Smoke treinos V4 OK ==="
