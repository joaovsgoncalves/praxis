# Onda 17 — Polish celular

| ID | Task | Status |
|----|------|--------|
| P17-T01 | Barra inferior: Hoje · Tarefas · **Voz** · Foco · Mais | **done** |
| P17-T02 | Top bar mobile com título da rota + safe-area | **done** |
| P17-T03 | FAB voz só desktop; celular usa botão central | **done** |
| P17-T04 | PWA: shortcuts no manifest + banner instalar | **done** |
| P17-T05 | Touch targets + padding acima da nav | **done** |

## Uso no celular

- **Barra fixa** — troca de tela sem abrir o drawer.
- **Voz** — botão central (mic) abre `/captura`.
- **Mais** — abre o menu lateral (metas, ideias, config…).
- **Instalar** — banner no Hoje quando o browser oferecer `beforeinstallprompt`.

`viewport-fit=cover` + `env(safe-area-inset-*)` no layout e na nav.