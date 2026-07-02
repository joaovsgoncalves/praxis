#!/usr/bin/env bash
# Smoke E2E Praxis (onda 19) — requer login (COOKIE_JAR + BASE).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${BASE:?BASE required}"
: "${COOKIE_JAR:?COOKIE_JAR required}"

SMOKE_PREFIX="${SMOKE_PREFIX:-[smoke-praxis]}"
FIXTURE="${SCRIPT_DIR}/fixtures/smoke-capture.wav"
TZ_LOCAL="${PRAXIS_SMOKE_TZ:-America/Fortaleza}"
TODAY="$(TZ="$TZ_LOCAL" date +%Y-%m-%d)"
TOMORROW="$(TZ="$TZ_LOCAL" date -d "$TODAY + 1 day" +%Y-%m-%d 2>/dev/null || TZ="$TZ_LOCAL" date -v+1d +%Y-%m-%d 2>/dev/null || node -e "const d=new Date(process.argv[1]+'T12:00:00');d.setDate(d.getDate()+1);console.log(d.toISOString().slice(0,10))" "$TODAY")"

fail() { echo "FAIL E2E: $*" >&2; exit 1; }
ok() { echo "OK E2E: $*"; }

curl_json() {
  local method="$1" url="$2" data="${3:-}"
  local tmp
  tmp="$(mktemp)"
  local code
  if [[ -n "$data" ]]; then
    code=$(curl -sS -o "$tmp" -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -X "$method" -H 'Content-Type: application/json' -d "$data" "$url")
  else
    code=$(curl -sS -o "$tmp" -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -X "$method" "$url")
  fi
  echo "$code" "$tmp"
}

cleanup_smoke_tasks() {
  local pair
  pair=$(curl_json GET "$BASE/api/tasks?limit=200")
  local code="${pair%% *}"
  local body="${pair#* }"
  [[ "$code" == "200" ]] || fail "cleanup list tasks → $code"
  node -e "
    const fs=require('fs');
    const prefix=process.argv[1];
    const base=process.argv[2];
    const jar=process.argv[3];
    const tasks=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));
    const ids=(Array.isArray(tasks)?tasks:[]).filter(t=>String(t.title||'').includes(prefix)).map(t=>t.id);
    for (const id of ids) {
      const {execSync}=require('child_process');
      execSync('curl -sS -o /dev/null -b '+JSON.stringify(jar)+' -c '+JSON.stringify(jar)+' -X DELETE '+JSON.stringify(base+'/api/tasks/'+id),{stdio:'inherit'});
    }
    if (ids.length) console.log('cleaned', ids.length);
  " "$SMOKE_PREFIX" "$BASE" "$COOKIE_JAR" "$body"
}

echo "=== Praxis smoke E2E (prefix=$SMOKE_PREFIX) ==="

cleanup_smoke_tasks

# --- P19-T01: criar → concluir → apagar ---
TITLE="${SMOKE_PREFIX} ciclo simples"
CREATE_BODY=$(node -e "console.log(JSON.stringify({title:process.argv[1],date:process.argv[2],status:'pending',category:'pessoal',priority:'low',source:'smoke'}))" "$TITLE" "$TODAY")
pair=$(curl_json POST "$BASE/api/tasks" "$CREATE_BODY")
code="${pair%% *}"; body="${pair#* }"
[[ "$code" == "201" ]] || fail "POST task → $code ($body)"
TASK_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).id)" "$body")
ok "POST task → 201 ($TASK_ID)"

pair=$(curl_json PUT "$BASE/api/tasks/$TASK_ID" '{"status":"completed"}')
code="${pair%% *}"; body="${pair#* }"
[[ "$code" == "200" ]] || fail "PUT complete → $code"
ok "PUT task completed → 200"

pair=$(curl_json DELETE "$BASE/api/tasks/$TASK_ID")
code="${pair%% *}"
[[ "$code" == "200" ]] || fail "DELETE task → $code"
ok "DELETE task → 200"

# --- P19-T02: recorrência diária → próxima ocorrência ---
REC_TITLE="${SMOKE_PREFIX} recorrência diária"
REC_BODY=$(node -e "console.log(JSON.stringify({title:process.argv[1],date:process.argv[2],status:'pending',recurrence:'daily',category:'pessoal',priority:'low',source:'smoke'}))" "$REC_TITLE" "$TODAY")
pair=$(curl_json POST "$BASE/api/tasks" "$REC_BODY")
code="${pair%% *}"; body="${pair#* }"
[[ "$code" == "201" ]] || fail "POST recurring task → $code"
REC_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).id)" "$body")
ok "POST recurring task → 201"

pair=$(curl_json PUT "$BASE/api/tasks/$REC_ID" '{"status":"completed"}')
code="${pair%% *}"; body="${pair#* }"
[[ "$code" == "200" ]] || fail "PUT complete recurring → $code"
node -e "
  const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
  const next=j.next_occurrence;
  const expect=process.argv[2];
  if (!next || !next.id || !next.date) { console.error('missing next_occurrence', j); process.exit(1); }
  if (next.date !== expect) { console.error('next date', next.date, 'expected', expect); process.exit(1); }
  require('fs').writeFileSync('/tmp/praxis-smoke-next-id.txt', next.id);
" "$body" "$TOMORROW"
NEXT_ID="$(cat /tmp/praxis-smoke-next-id.txt)"
rm -f /tmp/praxis-smoke-next-id.txt
ok "next_occurrence → $TOMORROW ($NEXT_ID)"

pair=$(curl_json DELETE "$BASE/api/tasks/$NEXT_ID"); code="${pair%% *}"; [[ "$code" == "200" ]] || fail "DELETE child"
pair=$(curl_json DELETE "$BASE/api/tasks/$REC_ID"); code="${pair%% *}"; [[ "$code" == "200" ]] || fail "DELETE parent"
ok "recurrence cleanup → OK"

# --- P19-T03/T04: captura áudio fixture ---
[[ -f "$FIXTURE" ]] || fail "fixture ausente: $FIXTURE"
CAP_TMP="$(mktemp)"
CAP_CODE=$(curl -sS -o "$CAP_TMP" -w '%{http_code}' --max-time "${PRAXIS_CAPTURE_TIMEOUT:-180}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -F "audio=@${FIXTURE};type=audio/wav" \
  "$BASE/api/captures")
node -e "
  const fs=require('fs');
  const code=process.argv[1];
  const raw=fs.readFileSync(process.argv[2],'utf8');
  let j; try { j=JSON.parse(raw); } catch { console.error('invalid JSON', code, raw.slice(0,200)); process.exit(1); }
  const okTrans = code === '200' && (j.ok === true || j.success === true) && (j.text || j.capture_id);
  const okFail = (code === '422' || code === '503') && j.capture_id && (j.exhausted || j.error);
  if (!okTrans && !okFail) {
    console.error('capture unexpected', code, j);
    process.exit(1);
  }
  fs.writeFileSync('/tmp/praxis-smoke-cap-id.txt', String(j.capture_id || j.id || ''));
  console.log(okTrans ? 'transcribed' : 'failed-explicit');
" "$CAP_CODE" "$CAP_TMP"
CAP_STATUS=$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log((j.ok||j.success)?'transcribed':'failed');" "$CAP_TMP")
CAP_ID=$(cat /tmp/praxis-smoke-cap-id.txt 2>/dev/null || true)
rm -f /tmp/praxis-smoke-cap-id.txt
ok "POST /api/captures → $CAP_CODE ($CAP_STATUS)"

if [[ -n "$CAP_ID" ]]; then
  curl -sS -o /dev/null -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X PATCH -H 'Content-Type: application/json' \
    -d '{"status":"archived"}' \
    "$BASE/api/captures/$CAP_ID" || true
fi

pair=$(curl_json GET "$BASE/api/captures?limit=5")
code="${pair%% *}"; body="${pair#* }"
[[ "$code" == "200" ]] || fail "GET /api/captures → $code"
node -e "const a=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(!Array.isArray(a)) process.exit(1);" "$body"
ok "GET /api/captures → 200 (array)"

pair=$(curl_json GET "$BASE/api/captures/pending-count")
code="${pair%% *}"; body="${pair#* }"
[[ "$code" == "200" ]] || fail "GET pending-count → $code"
node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(typeof j.count!=='number') process.exit(1);" "$body"
ok "GET /api/captures/pending-count → 200"

cleanup_smoke_tasks

echo "=== Smoke E2E OK ==="