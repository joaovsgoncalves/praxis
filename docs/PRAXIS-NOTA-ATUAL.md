# Praxis — nota de produto (atual)

**Data:** 2026-07-02 · **Após onda 23** · `docs/ONDA-23-METAS-RITUAIS.md`

## Notas (duas leituras)

| Leitura | Nota | Quando usar |
|---------|------|-------------|
| **Técnica / operação** | **9,5 / 10** | Smoke E2E + ops onda 20 |
| **Confiança no dia a dia** | **8,7 / 10** | Você no celular + voz sua (não só fixture) |

## Por dimensão

| Dimensão | Nota | Evidência |
|----------|------|-----------|
| **Clareza do dia (cockpit)** | 9,0 | Agora + evitando + PraxIA |
| **Hábitos & tarefas** | 9,2 | Chips + arquivar em lote + atrasadas |
| **Auth & confiança** | 9,0 | Login prod; API 401 anônima |
| **UX / marca Praxis** | 8,5 | PWA; uso mobile = você |
| **Voz & captura** | 9,0 | Fases UX + fila no Hoje + revisar capturas |
| **Foco & ideias** | 8,0 | Fora do smoke |
| **Revisão semanal / metas** | 9,2 | 3 tarefas da semana + templates meta |
| **Operação** | 9,6 | Backup + health cron + drift check |

## Confiança 9,5+ (só uso)

1. ~14 dias no celular  
2. Revisão semanal toda semana  
3. 1 gravação **sua** de voz no app  

## Comandos

```bash
npm run smoke:prod      # inclui E2E (PRAXIS_SMOKE_E2E=0 para desligar)
npm run checklist:10
```