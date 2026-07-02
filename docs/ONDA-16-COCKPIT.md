# Onda 16 — Cockpit “evitando” + PraxIA leve

| ID | Task | Status |
|----|------|--------|
| P16-T01 | `GET /api/insights/avoidance` — sinais determinísticos | **done** |
| P16-T02 | Widget **O que estou evitando?** no Dashboard | **done** |
| P16-T03 | `POST /api/praxia/confront` — espelho (regras + LLM opcional) | **done** |

## Sinais no radar

- Tarefas **atrasadas** (data &lt; hoje)
- Tarefas **sem data** há 7+ dias
- Hábitos **devidos ontem e hoje** sem check
- Ideias **capturada/promissora** paradas
- Capturas de voz **failed**
- Muitas pendências hoje + **pouco foco**
- **Bem-estar** não registrado com carga no dia

## PraxIA

Botão **PraxIA — espelhar padrão** no widget. Sem `OPENAI_API_KEY`, resposta 100% por regras. Com chave, até 5 frases em JSON (`FORJA_PRAXIA_MODEL` opcional).

PraxIA **não decide** — só confronta padrões; links levam à ação (tarefas, hábitos, foco, capturas).