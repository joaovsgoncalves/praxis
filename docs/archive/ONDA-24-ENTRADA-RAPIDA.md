# Onda 24 — Entrada rápida

| ID | Entrega |
|----|---------|
| P24-T01 | `POST /api/webhooks/capture-text` → `capture_queue` (sem STT) |
| P24-T02 | PWA `share_target` → `/compartilhar` → revisão em `/captura` |

## Webhook (Telegram / automação)

1. No VPS: `PRAXIS_CAPTURE_WEBHOOK_SECRET=<token forte>` em `/root/.hermes/secrets/forja-api.env`
2. Reiniciar API: `npm run ship:api`
3. Exemplo:

```bash
curl -sS -X POST "https://praxis-jota.vercel.app/api/webhooks/capture-text" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Ligar pro cliente X amanhã"}'
```

Resposta `201`: `capture_id` — abrir no app `/captura?capture=<id>`.

**Nota:** o bot Telegram em si não está nesta onda; o webhook é o contrato para você plugar n8n, script ou bot depois.

## Compartilhar (Android / Chrome)

1. Instale o PWA **Praxis** (Adicionar à tela inicial).
2. Em qualquer app: **Compartilhar** → **Praxis**.
3. O texto/link cai na fila e abre a tela de organizar tarefas.

Também: `POST /api/captures/text` (sessão logada no app).