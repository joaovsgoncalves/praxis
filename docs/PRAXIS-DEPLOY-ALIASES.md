# Deploy Praxis (Vercel)

Após `vercel --prod`, **sempre** atualizar aliases canônicos:

```bash
export HOME=/root/.hermes/home
cd /root/.hermes/workspaces/apps/forja-do-jota
DEP=$(vercel ls --yes 2>&1 | awk '/● Ready.*Production/ {print $3; exit}')
vercel alias set "$DEP" praxis-jota.vercel.app
vercel alias set "$DEP" forja-do-jota.vercel.app
```

**Por quê:** `praxis-jota.vercel.app` já ficou preso num deploy **antigo** (projeto `forja-do-jota`, jun/2026) enquanto o código novo ia para `jotaai/praxis` — parecia “regressão” no app.

Verificação rápida:

```bash
curl -sS "https://praxis-jota.vercel.app/" | grep -oE 'assets/index-[^"]+\.js' | head -1
# no JS minificado deve existir texto do Agora, ex.: urgente
```