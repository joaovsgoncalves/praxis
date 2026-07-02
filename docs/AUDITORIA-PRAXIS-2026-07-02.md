# Auditoria Praxis — 2026-07-02

Auditoria **com evidência medida na VPS + prod** (não só o que está escrito no doc).

**URL canônica:** https://praxis-jota.vercel.app  
**Últimos commits:** `954f8a2` (onda 18), `ad65b60` (fix backup)

---

## Resumo em uma frase

**Tecnicamente está muito bom e pronto pra uso diário.**  
**“10/10 perfeito”** só faria sentido depois de **você** usar no celular um tempo e a voz provar que aguenta na prática.

---

## Notas (duas escalas)

| Escala | Nota | Significado |
|--------|------|-------------|
| **Técnica / operação** (o que dá pra medir agora) | **9,2 / 10** | Build, smoke, login, backup, cron, API no ar |
| **Confiança no dia a dia** (produto + você usando) | **8,7 / 10** | Falta validação humana + voz/STT não entrou no smoke |

A nota **10** no `PRAXIS-NOTA-ATUAL.md` era **otimista** — misturava “plano fechado” com “perfeito na vida real”. Esta auditoria corrige isso.

---

## O que foi testado AGORA (passou)

| Teste | Resultado |
|-------|-----------|
| `npm run prepush:check` (lint + build) | OK |
| `npm run smoke:prod` (login + 8 rotas) | OK |
| `npm run checklist:10` | OK |
| `forja-api` systemd | active |
| Processo API cwd | `apps/forja-do-jota/api` |
| Cron backup 03:15 | instalado |
| `last-backup.json` | presente (~30 KB snapshot) |
| `GET /` e `/captura` e `manifest.webmanifest` | 200 |
| API anônima em `/api/tasks` | 401 |
| Login + sessão em prod | OK |

---

## Notas por área (honestas)

| Área | Nota | Por quê |
|------|------|--------|
| **Cockpit (Hoje, Agora, evitando, PraxIA)** | 9,0 | Rotas e smoke em avoidance; não abri browser 390px nesta auditoria |
| **Hábitos & tarefas** | 8,8 | Recorrência existe; smoke **não** testa spawn da próxima ocorrência |
| **Login & API** | 9,0 | Sessão OK em prod; senha só na VPS |
| **Mobile / PWA** | 8,5 | Nav + manifest 200; **sem** teste manual de instalar PWA nesta rodada |
| **Voz & capturas** | 7,8 | Fila + retry no código; `faster-whisper` no venv **OK** na VPS, mas smoke **não** grava áudio nem STT |
| **Foco & ideias** | 8,0 | Features no app; fora do smoke |
| **Metas, rituais, conquistas** | 8,0 | Nav condicional; uso depende de você preencher |
| **Revisão semanal** | 8,5 | `/api/insights/weekly` OK; não dá pra saber se você fecha todo domingo |
| **Operação (deploy, backup)** | 9,3 | Backup + cron + meta API; **sem** cópia na nuvem; watchdog **não** está no crontab (só backup) |

**Média ponderada (confiança dia a dia): ~8,7**

---

## O que NÃO é 10/10 (gaps reais)

1. **Smoke é fino** — não cobre: POST captura, STT fim-a-fim, recorrência, PraxIA com LLM, fluxo mobile real.
2. **“10 humano”** — 14 dias no celular e revisão semanal **não** foram feitos por mim (só você marca).
3. **Dois URLs Vercel** — `praxis-jota` e `forja-do-jota` respondem 200 (confusão leve, não quebra nada).
4. **Watchdog de health** — script existe; **cron */5 não instalado** (se API cair, ninguém te avisa automaticamente).
5. **Dados reais** — há tarefas pendentes no banco (normal); se a lista estiver inchada, é **conteúdo**, não bug de deploy.

---

## Critérios do plano 0–18 (checklist produto)

| # | Critério | Status auditoria |
|---|----------|------------------|
| 1 | Auth + 401 | ✅ |
| 2 | Cockpit dia | ✅ (API); UI não revisitada no browser |
| 3 | Recorrência | ✅ código; ⚠️ sem teste auto |
| 4 | Voz fila | ✅ código + venv STT; ⚠️ sem teste auto de áudio |
| 5 | Evitando + PraxIA | ✅ smoke GET + confront no código |
| 6 | Mobile + PWA | ✅ rotas; ⚠️ uso real seu |
| 7 | Backup | ✅ |
| 8 | prepush + smoke | ✅ |

**Plano de engenharia: fechado.**  
**Nota “perfeito na vida”: ainda não.**

---

## Veredito

| Pergunta | Resposta |
|----------|----------|
| Posso usar todo dia? | **Sim.** |
| Está 10/10 como marketing? | **Não** — eu colocaria **8,7** até você validar celular + voz + rotina. |
| Está 10/10 como “projeto entregue”? | **Quase** — **9,2** na parte técnica. |

---

## Se quiser subir pra 9,5+ sem firula

1. Usar 2 semanas no celular (PWA ou browser).
2. Uma captura de voz real; se falhar, usar `/capturas` e ver se recupera.
3. (Opcional técnico) Cron do `praxis-health-watchdog.sh` — você disse que não quer extras agora; só listo como gap.

---

*Gerado na auditoria solicitada em 2026-07-02.*