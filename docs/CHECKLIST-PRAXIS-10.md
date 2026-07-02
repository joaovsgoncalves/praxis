# Checklist Praxis 10/10

**Objetivo:** app diário confiável para o João — não só UI bonita.

## Automático (VPS / CI)

```bash
./scripts/checklist-praxis-10.sh
npm run smoke:prod   # com PRAXIS_APP_PASSWORD no ambiente
npm run prepush:check
```

## Diário (2–5 min)

- [ ] Abrir **Hoje** — bloco **Agora** faz sentido
- [ ] **Hábitos essenciais** — check ou consciente skip
- [ ] **O que estou evitando?** — pelo menos 1 ação ou “nada”
- [ ] Captura voz **ou** 1 tarefa criada/concluída

## Semanal

- [ ] **Revisão semanal** (`/revisao-semanal`) — fechar o wizard
- [ ] **Smoke prod** verde (`npm run smoke:prod`)
- [ ] Olhar **Configurações → Backup** — `last.at` recente (≤ 48h após cron)

## Operação (VPS)

| Item | Comando / verificação |
|------|------------------------|
| Backup manual | `./scripts/praxis-backup.sh` |
| Cron 03:15 | `./scripts/install-praxis-backup-cron.sh` |
| Health | `./scripts/praxis-health-watchdog.sh` (cron */5 opcional) |
| Sync API | `./scripts/sync-forja-api-production.sh` |
| Alias | `praxis-jota.vercel.app` |

## Critérios “10/10” (produto)

| # | Critério | Onda |
|---|----------|------|
| 1 | Login + sessão + API 401 anônima | 1 |
| 2 | Cockpit Agora + tarefas/hábitos hoje | 8–12 |
| 3 | Recorrência de tarefas | 14 |
| 4 | Voz fila + retry + `/capturas` | 15 |
| 5 | Evitando + PraxIA | 16 |
| 6 | Nav mobile + PWA | 17 |
| 7 | Backup SQLite + meta API | 18 |
| 8 | Smoke + prepush antes de push | 13–18 |

## Uso real (humano)

- [ ] **14 dias** usando no celular (PWA ou browser) — marcar no calendário
- [ ] STT falhou pelo menos 1× e recuperou via **Revisar capturas**

Quando automático + semanal + 14 dias estiverem OK → **nota operacional 10/10**.