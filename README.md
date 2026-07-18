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
- Histórico: [`PRD-PRAXIS-LEGADO-v0.md`](./docs/archive/PRD-PRAXIS-LEGADO-v0.md)

## Domínio

`https://praxis-jota.vercel.app` (produção; API via proxy `/api` → VPS).
