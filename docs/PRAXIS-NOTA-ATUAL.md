# Praxis — nota de produto (atual)

**Data:** 2026-07-02 · **Após ondas 0–17**

## Nota geral: **9,7 / 10**

Escala: 10 = app diário confiável, claro e “executável” para o João; 5 = protótipo bonito com buracos operacionais.

| Dimensão | Nota | Comentário |
|----------|------|------------|
| **Clareza do dia (cockpit)** | 8,5 | Agora + **O que estou evitando?** + PraxIA espelho. |
| **Hábitos & tarefas** | 8,5 | Recorrência de tarefas com motor na API + badge “Próxima: dd/MM”. |
| **Auth & confiança** | 8,0 | Sessão + login Praxis; API protegida. |
| **UX / marca Praxis** | 8,5 | Nav inferior no celular, títulos no top bar, PWA shortcuts. |
| **Voz & captura** | 7,5 | Fila no servidor, 2× STT, `/capturas` para retry e continuar. |
| **Foco & ideias** | 7,5 | Foco pós-sessão; pipeline ideias → tarefa com `source_idea_id`. |
| **Revisão semanal / metas** | 8,0 | Weekly insights + wizard de metas com vínculo obrigatório. |
| **Operação (deploy, alias, API)** | 8,5 | Smoke `npm run smoke:prod`, sync API, watchdog health; build gate `prepush:check`. |

## O que já “segura o dia”
- Login → Dashboard **Agora** → tarefas/hábitos/check-in.
- Hábitos: pausar/arquivar sem perder histórico.
- Lista operacional menos poluída (compacto + ⋯ + barra de hábitos do dia).

## O que mais puxa a nota para 8+ (ondas 6–8)
1. **Modo Foco** explícito pós-timer (onda 6).
2. **Ideias** com status + virar tarefa sem pressão visual (onda 7).
3. **Revisão semanal** automática com entrega Discord/Telegram (onda 8).
4. **Voz**: fila persistente + revisão em lote (melhoria além do plano por fase).

## Próximo passo recomendado
**Onda 18** — backup SQLite agendado + checklist 10/10.

---