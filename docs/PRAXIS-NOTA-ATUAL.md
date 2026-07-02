# Praxis — nota de produto (atual)

**Data:** 2026-07-02 · **Após ondas 0–18** · ver auditoria `docs/AUDITORIA-PRAXIS-2026-07-02.md`

## Notas (duas leituras)

| Leitura | Nota | Quando usar |
|---------|------|-------------|
| **Técnica / operação** | **9,2 / 10** | Build, smoke, backup, API, deploy |
| **Confiança no dia a dia** | **8,7 / 10** | Você usando no celular + voz na prática |

Escala: 10 = app diário confiável para o João; 5 = protótipo bonito com buracos.

## Por dimensão (auditoria 2026-07-02)

| Dimensão | Nota | Evidência |
|----------|------|-----------|
| **Clareza do dia (cockpit)** | 9,0 | Agora + evitando + PraxIA; smoke avoidance |
| **Hábitos & tarefas** | 8,8 | Recorrência; smoke não testa próxima ocorrência |
| **Auth & confiança** | 9,0 | Login prod OK; API 401 anônima |
| **UX / marca Praxis** | 8,5 | PWA/manifest 200; uso mobile = você |
| **Voz & captura** | 7,8 | Fila + venv STT OK na VPS; sem smoke de áudio |
| **Foco & ideias** | 8,0 | No app; fora do smoke |
| **Revisão semanal / metas** | 8,5 | weekly OK; hábito semanal = você |
| **Operação** | 9,3 | Cron backup, meta API; watchdog cron não instalado |

## O que falta pra “9,5+ confiança” (só uso)

1. **~14 dias** no celular (marca no calendário).
2. **Revisão semanal** toda semana.
3. **1 teste de voz** real (gravar → ver texto ou `/capturas`).

## Comandos

```bash
npm run smoke:prod
npm run checklist:10
```

---

*Não usar “10/10” como nota única até os três itens de uso acima.*