# Praxis — autenticação web (onda 1)

**Atualizado:** 2026-07-02

## Problema

A API em `76.13.227.227:18556` (proxy Vercel `/api/*`) respondia com dados pessoais sem gate. `FORJA_AUTH_REQUIRED` + API key sozinhos não servem para browser: segredo em `VITE_*` vaza no bundle.

## Arquitetura escolhida

```
Browser (praxis-jota.vercel.app)
  → fetch /api/* same-origin (Vercel rewrite → VPS)
  → Cookie HttpOnly praxis_sid (sessão SQLite)
  → Middleware aceita sessão OU Bearer FORJA_API_KEY (A.N.A./crons)
```

### Descartado

| Opção | Motivo |
|-------|--------|
| API key no front (`VITE_FORJA_API_KEY`) | Público no bundle |
| Só `FORJA_AUTH_REQUIRED` sem login | Quebra SPA na Vercel |
| JWT longo no localStorage | XSS rouba token; cookie HttpOnly é melhor |
| OAuth Google agora | Escopo maior; senha única basta para uso pessoal |

## Componentes

| Peça | Caminho |
|------|---------|
| Tabelas | `praxis_users`, `praxis_sessions` |
| Módulo | `api/praxisAuth.js` |
| Rotas públicas | `GET /api/health`, `GET /api/auth/config`, `POST /api/auth/login` |
| Rotas protegidas | Demais `/api/*` → 401 sem sessão ou Bearer |
| Front | `Login.jsx`, `AuthContext`, `forjaClient` com `credentials: 'include'` |

## Variáveis (servidor)

| Env | Uso |
|-----|-----|
| `PRAXIS_WEB_AUTH=1` | Default ligado; `0` só dev local aberto |
| `PRAXIS_APP_PASSWORD` ou `FORJA_APP_PASSWORD` | Senha do usuário `jota` (hash bcrypt no boot) |
| `FORJA_API_KEY` | Automação Hermes (`Authorization: Bearer …`) |
| `PRAXIS_COOKIE_SECURE=0` | Só se testar HTTP direto no IP sem HTTPS |

**Nunca** commitar senha. Configurar em `EnvironmentFile` do systemd (ex.: `/root/.hermes/secrets/forja-api.env`, `chmod 600`).

## Fluxo browser

1. App carrega → `GET /api/auth/me` (cookie)
2. 401 → tela `/login`
3. `POST /api/auth/login` { password } → `Set-Cookie`
4. Demais calls com `credentials: 'include'`
5. Logout → `POST /api/auth/logout` + limpa cookie

## Fluxo automação (A.N.A.)

```bash
curl -H "Authorization: Bearer $FORJA_API_KEY" http://127.0.0.1:18556/api/tasks?limit=1
```

## Checklist pós-deploy (P1-T08)

- [x] `curl https://praxis-jota.vercel.app/api/health` → 200
- [x] `curl https://praxis-jota.vercel.app/api/tasks` → 401
- [x] Login no browser → dashboard carrega
- [ ] `curl` com Bearer → 200 em tasks (requer `FORJA_API_KEY` no env do serviço)
- [x] Rate limit login após abuso → 429

## Rollback

`PRAXIS_WEB_AUTH=0` + restart `forja-api` restaura API aberta (só emergência).