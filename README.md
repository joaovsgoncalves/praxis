# Praxis

> **Fale. Organize. Execute.**

Praxis é o cockpit diário pessoal para transformar intenção em execução. Tarefas, hábitos, foco, revisão e captura por áudio — tudo num lugar só, com **PraxIA** como copiloto.

## Stack

- **Frontend:** React 18 + Vite + Tailwind + shadcn/ui + TanStack Query
- **Backend:** Express + better-sqlite3 (SQLite WAL) + Multer
- **Deploy:** Vercel (front) + VPS Tailscale (API)
- **Integrações:** Google Calendar, captura de voz por áudio

## Desenvolvimento local

```bash
# Frontend
npm install
npm run dev

# API (porta 18556)
cd api
npm install
node server.js
```

## Estrutura

```
/              → frontend React (Vercel)
/api           → backend Express (VPS)
/src/pages     → páginas do app
/src/components→ UI compartilhada
```

## PRD e evolução

- Conceito atual: [`PRD-PRAXIS-v1.md`](./PRD-PRAXIS-v1.md)
- Histórico legado: `docs/archive/` (não usar como fonte de verdade)

## Domínio e repo

| O quê | Valor |
|-------|--------|
| Repo | https://github.com/joaovsgoncalves1-jpg/praxis |
| Projeto Vercel | `praxis` (team `jotaai`) |
| Canônico (produto) | https://dopraxis.app *(DNS após compra)* |
| Funciona agora | https://dopraxis.vercel.app |
| Interim legado | https://praxis-jota.vercel.app |

API em produção via proxy `/api` → VPS.
