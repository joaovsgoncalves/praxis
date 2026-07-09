#!/usr/bin/env bash
# Smoke Nutrição (fases 0–11) — roda com cookie jar ou FORJA_API_KEY
# Uso: chamado de smoke-praxis-prod.sh com BASE + COOKIE_JAR exportados
#  ou: BASE=http://127.0.0.1:18556 FORJA_API_KEY=... bash scripts/smoke-praxis-nutrition.sh

set -euo pipefail

BASE="${BASE:-http://127.0.0.1:18556}"
BASE="${BASE%/}"
COOKIE_JAR="${COOKIE_JAR:-}"
AUTH_HEADER=()
if [[ -n "${FORJA_API_KEY:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${FORJA_API_KEY}")
fi

code() {
  local extra=()
  if [[ -n "$COOKIE_JAR" ]]; then
    extra+=(-b "$COOKIE_JAR" -c "$COOKIE_JAR")
  fi
  curl -sS -o /tmp/praxis-nutr-smoke.json -w '%{http_code}' \
    "${extra[@]}" "${AUTH_HEADER[@]}" "$@"
}

fail() { echo "FAIL nutrition: $*" >&2; exit 1; }
ok() { echo "OK nutrition: $*"; }

# anônimo
ANON=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/nutrition/day" || true)
[[ "$ANON" == "401" ]] || fail "GET /api/nutrition/day anônimo → $ANON (esperado 401)"
ok "day anônimo 401"

C=$(code "$BASE/api/nutrition/day")
[[ "$C" == "200" ]] || fail "GET day auth → $C ($(cat /tmp/praxis-nutr-smoke.json 2>/dev/null || true))"
ok "GET day 200"

C=$(code "$BASE/api/nutrition/profile")
[[ "$C" == "200" ]] || fail "GET profile → $C"
ok "GET profile 200"

C=$(code "$BASE/api/nutrition/foods?limit=5")
[[ "$C" == "200" ]] || fail "GET foods → $C"
ok "GET foods 200"

# food id
FOOD_ID=$(python3 -c "import json; d=json.load(open('/tmp/praxis-nutr-smoke.json')); print(d[0]['id'] if d else '')" 2>/dev/null || true)
if [[ -z "$FOOD_ID" ]]; then
  # create one
  C=$(code -H 'Content-Type: application/json' -d '{"name":"[smoke] Ovo","kcal":74,"protein_g":6,"carbs_g":0.5,"fat_g":5,"serving_label":"1 un","serving_grams":50}' -X POST "$BASE/api/nutrition/foods")
  [[ "$C" == "201" || "$C" == "200" ]] || fail "POST food → $C"
  FOOD_ID=$(python3 -c "import json; print(json.load(open('/tmp/praxis-nutr-smoke.json'))['id'])")
  ok "POST food $FOOD_ID"
else
  ok "food id $FOOD_ID"
fi

C=$(code -H 'Content-Type: application/json' -d "{\"food_item_id\":\"$FOOD_ID\",\"meal_slot\":\"lunch\",\"servings\":1}" -X POST "$BASE/api/nutrition/logs")
[[ "$C" == "201" || "$C" == "200" ]] || fail "POST log → $C ($(cat /tmp/praxis-nutr-smoke.json))"
LOG_ID=$(python3 -c "import json; print(json.load(open('/tmp/praxis-nutr-smoke.json'))['id'])")
ok "POST log $LOG_ID"

C=$(code -X DELETE "$BASE/api/nutrition/logs/$LOG_ID")
[[ "$C" == "204" || "$C" == "200" ]] || fail "DELETE log → $C"
ok "DELETE log 204"

C=$(code "$BASE/api/nutrition/summary")
[[ "$C" == "200" ]] || fail "GET summary → $C"
ok "GET summary 200"

C=$(code -H 'Content-Type: application/json' -d '{"text":"1 ovo"}' -X POST "$BASE/api/nutrition/parse-text")
[[ "$C" == "200" ]] || fail "POST parse-text → $C"
ok "POST parse-text 200"

C=$(code -H 'Content-Type: application/json' -d '{"weight_kg":80.5}' -X POST "$BASE/api/nutrition/weight")
[[ "$C" == "201" || "$C" == "200" ]] || fail "POST weight → $C ($(cat /tmp/praxis-nutr-smoke.json))"
W_ID=$(python3 -c "import json; print(json.load(open('/tmp/praxis-nutr-smoke.json'))['id'])")
ok "POST weight $W_ID"

C=$(code "$BASE/api/nutrition/weight/trend?days=30")
[[ "$C" == "200" ]] || fail "GET weight/trend → $C"
ok "GET weight/trend 200"

C=$(code -X DELETE "$BASE/api/nutrition/weight/$W_ID")
[[ "$C" == "204" || "$C" == "200" ]] || fail "DELETE weight → $C"
ok "DELETE weight"

echo "=== Smoke nutrition OK ==="
