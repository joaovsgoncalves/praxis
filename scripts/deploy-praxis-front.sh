#!/usr/bin/env bash
# Build + Vercel prod + aliases canônicos Praxis.
set -euo pipefail
export HOME="${HOME:-/root/.hermes/home}"
cd "$(dirname "$0")/.."
npm run prepush:check
vercel --prod --yes
DEP=$(vercel ls --yes 2>&1 | awk '/● Ready.*Production/ {print $3; exit}')
[[ -n "$DEP" ]] || { echo "FAIL: não achei deploy Production" >&2; exit 1; }
# Canônicos (custom domain só responde depois do DNS/compra)
vercel alias set "$DEP" dopraxis.vercel.app || true
vercel alias set "$DEP" praxis-jota.vercel.app || true
# Legado — mantém vivo até sumir bookmarks antigos
vercel alias set "$DEP" forja-do-jota.vercel.app || true
echo "OK: aliases → $DEP"
echo "Prod interim: https://dopraxis.vercel.app"
echo "Custom (após comprar/DNS): https://dopraxis.app"
