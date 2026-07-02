#!/usr/bin/env bash
# Build + Vercel prod + aliases canônicos (evita front antigo em praxis-jota).
set -euo pipefail
export HOME="${HOME:-/root/.hermes/home}"
cd "$(dirname "$0")/.."
npm run prepush:check
vercel --prod --yes
DEP=$(vercel ls --yes 2>&1 | awk '/● Ready.*Production/ {print $3; exit}')
[[ -n "$DEP" ]] || { echo "FAIL: não achei deploy Production" >&2; exit 1; }
vercel alias set "$DEP" praxis-jota.vercel.app
vercel alias set "$DEP" forja-do-jota.vercel.app
echo "OK: aliases → $DEP"