# Onda 15 — Voz confiável

| ID | Task | Status |
|----|------|--------|
| P15-T01 | `capture_queue` + áudio persistido antes do STT | **done** |
| P15-T02 | Retry automático (2×) + erro visível + retry manual | **done** |
| P15-T03 | `/capturas` + link em Captura por Voz | **done** |

## API

- `POST /api/captures` — salva áudio em `api/uploads/captures/`, enfileira, STT com até 2 tentativas.
- `GET /api/captures` — inbox (`failed,transcribed,parsed` por padrão).
- `GET /api/captures/pending-count` — badge no front.
- `POST /api/captures/:id/retry` — reprocessa STT no mesmo arquivo.
- `PATCH /api/captures/:id` — `parsed_items` ou `archived`.

`/api/transcribe` legado mantido; o app usa `/api/captures`.

## Fluxo usuário

1. Gravar em `/captura` → áudio sempre salvo no servidor.
2. Se STT falhar → mensagem + **Revisar capturas** (`/capturas`).
3. **Tentar STT de novo** sem regravar.
4. **Continuar revisão** abre `/captura?capture=<id>`.
5. Ao confirmar todos os itens → captura arquivada.