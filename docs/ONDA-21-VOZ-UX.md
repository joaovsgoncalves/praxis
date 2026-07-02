# Onda 21 — Voz que não te deixa na mão

| ID | Task | Status |
|----|------|--------|
| P21-T01 | Estados claros na captura (gravar / enviar / transcrever / organizar) | **done** |
| P21-T02 | Banner + toast no Hoje; badge no nav mobile | **done** |
| P21-T03 | `/capturas`: retry + “por que falhou” | **done** |
| P21-T04 | Limite tamanho/duração antes do upload | **done** |

## UX

- **Captura:** fases com copy PT (`voiceCaptureLimits`, `captureErrorMessage`).
- **Hoje:** `CapturePendingBanner` poll 15s + toast quando fila cresce.
- **Mobile:** bolinha no botão Voz quando `pending-count` > 0.

## Nota esperada

Voz **~9,0** no uso (confiança ainda depende da sua gravação real).