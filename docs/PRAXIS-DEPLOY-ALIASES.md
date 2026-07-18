# Deploy Praxis (Vercel)

**Projeto Vercel:** `jotaai/praxis`  
**Repo GitHub:** `joaovsgoncalves1-jpg/praxis`  
**Domínio canônico (produto):** `https://dopraxis.app`  
**URL que funciona hoje (sem DNS ainda):** `https://dopraxis.vercel.app`  
**Legado (ainda aponta pro mesmo deploy):** `praxis-jota.vercel.app`, `forja-do-jota.vercel.app`

Após `vercel --prod`, **sempre** atualizar aliases:

```bash
export HOME=/root/.hermes/home
cd /root/.hermes/workspaces/apps/praxis
DEP=$(vercel ls --yes 2>&1 | awk '/● Ready.*Production/ {print $3; exit}')
vercel alias set "$DEP" dopraxis.vercel.app
vercel alias set "$DEP" praxis-jota.vercel.app
vercel alias set "$DEP" forja-do-jota.vercel.app
```

Ou: `npm run deploy:prod` / `scripts/deploy-praxis-front.sh`.

## Custom domain `dopraxis.app`

Já está **adicionado no projeto** Vercel (`dopraxis.app` + `www` → apex).  
Enquanto o domínio **não estiver comprado + DNS apontando pra Vercel**, o browser em `https://dopraxis.app` **não** abre o app.

Quando comprar (Cloudflare / Porkbun / etc.):

1. Na Vercel: Domain → `dopraxis.app` → copiar registros pedidos (A/CNAME).
2. No registrar: colar DNS.
3. Esperar propagar; validar:
   ```bash
   curl -sS "https://dopraxis.app/" | grep -oE 'assets/index-[^"]+\.js' | head -1
   ```

## Verificação rápida (hoje)

```bash
curl -sS "https://dopraxis.vercel.app/" | grep -oE 'assets/index-[^"]+\.js' | head -1
# no JS minificado deve existir texto do Agora, ex.: urgente
```
