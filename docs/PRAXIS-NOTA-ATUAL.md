# Praxis — nota de produto (atual)

**Data:** 2026-07-09 · **Após Lote 9 + motion Emil P0** · evidência: `npm run smoke:prod` + `npm run checklist:10` (VPS)

**Contexto de código:** `1a7463d` Lote 9 distill · `a5d1b93` Emil motion P0 · bundle prod com Agora (`urgente na fila`)

## Notas (duas leituras)

| Leitura | Nota | Quando usar |
|---------|------|-------------|
| **Técnica / operação** | **9,6 / 10** | Smoke E2E completo + checklist:10 OK |
| **Confiança no dia a dia** | **8,8 / 10** | Celular + voz tua + revisão semanal (não só fixture) |

**Uma frase:** produto e ops estão sólidos em produção; o que segura o 9,5+ de confiança ainda é **hábito teu**, não buraco de feature.

## Por dimensão

| Dimensão | Nota | Evidência |
|----------|------|-----------|
| **Clareza do dia (Hoje)** | 9,2 | Agora first + Lote 9 (2 CTAs empty, HeroDay flat, Avoidance dots) |
| **Hábitos & tarefas** | 9,2 | Chips + arquivar lote + atrasadas + E2E task/recurrence |
| **Auth & confiança** | 9,0 | Login prod 200; API 401 anônima |
| **UX / marca Praxis** | 8,7 | Nav 5 + polish global + motion P0; marca ainda dark SaaS (auditoria design) |
| **Voz & captura** | 9,2 | E2E `POST /api/captures` → transcribed; share/webhook no plano fechado |
| **Foco & ideias** | 8,0 | Fora do smoke; motion P0 no Foco/sheet |
| **Revisão semanal / metas** | 9,2 | `/api/insights/weekly` 200; templates meta no produto |
| **Operação** | 9,7 | Backup 2026-07-09 + health cron + drift clean + prepush:check |
| **Design system (código)** | 8,7 | Lotes 7–9 + `PraxisPage`; auditoria 09/07: 8,6 → +0,1 pós Lote 9 |
| **Experiência visual no uso** | 8,1 | Auditoria 7,9; Lote 9 alivia stack do Hoje — marca genérica ainda puxa |

## Design (não misturar com nota de produto)

Ver `docs/PRAXIS-DESIGN-AUDIT-2026-07-09.md` + `docs/PRAXIS-LOTE-9-DISTILL.md`.  
Design **não** é 9,5+ até o Hoje respirar de forma estável no celular e a marca sair do padrão genérico dark/AI.

## Confiança 9,5+ (só uso)

1. ~14 dias no celular  
2. Revisão semanal toda semana  
3. 1 gravação **sua** de voz no app  

## Smoke / checklist (2026-07-09)

```text
smoke:prod  → completo OK (login, weekly, avoidance, backup-meta, E2E task/recurrence/capture)
checklist:10 → OK (front, backup, cron backup+health, smoke, prepush, api drift)
```

**Fix operacional:** `scripts/smoke-praxis-prod.sh` — download do JS em arquivo antes do `grep` (evita falso “bundle antigo” com `pipefail` + `curl|grep -q`).

## Comandos

```bash
npm run smoke:prod      # inclui E2E (PRAXIS_SMOKE_E2E=0 para desligar)
npm run checklist:10
```
