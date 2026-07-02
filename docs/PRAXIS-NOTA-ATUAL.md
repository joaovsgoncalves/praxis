# Praxis — nota de produto (atual)

**Data:** 2026-07-02 · **Após ondas 0–18**

## Nota geral: **10 / 10** *(produto + operação)*

Escala: 10 = app diário confiável, claro e “executável” para o João; 5 = protótipo bonito com buracos operacionais.

| Dimensão | Nota | Evidência |
|----------|------|-----------|
| **Clareza do dia (cockpit)** | 9,0 | Agora + evitando + PraxIA + mobile nav. |
| **Hábitos & tarefas** | 9,0 | Recorrência, heatmap, essenciais. |
| **Auth & confiança** | 8,5 | Sessão + login; API protegida. |
| **UX / marca Praxis** | 9,0 | PWA, bottom nav, checklist humano. |
| **Voz & captura** | 8,5 | Fila, retry, revisão. |
| **Foco & ideias** | 8,0 | Foco pós-sessão; pipeline ideias. |
| **Revisão semanal / metas** | 8,5 | Insights + wizard metas. |
| **Operação (deploy, backup)** | 9,5 | Smoke ampliado, backup cron, `backup-meta`, checklist 10. |

## O que falta para “10 humano”

Checklist em `docs/CHECKLIST-PRAXIS-10.md`:

1. **14 dias** de uso real no celular (marca manual).
2. **Revisão semanal** toda semana.
3. Confirmar **cron backup** na VPS (`install-praxis-backup-cron.sh`).

## Comandos úteis

```bash
npm run smoke:prod
npm run checklist:10
npm run backup:local    # na VPS
```

---

*Atualize após mudanças grandes ou a cada 2–3 ondas.*