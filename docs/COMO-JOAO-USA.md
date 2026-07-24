# Como o João usa o Praxis

Atualizado: 2026-07-24 (alinhado ao nav real + URL que abre)

## URL certa

- **App:** https://dopraxis.vercel.app  
- `dopraxis.app` = marca/canônico; **só usar quando o DNS resolver** (hoje não resolve).  
- Se a tela parecer velha: **Ctrl+F5** (PWA no celular: às vezes precisa remover/recolocar atalho).

## Os 3 comandos do dia

1. **Hoje** — o que fazer agora + ritual/hábitos do dia  
2. **Falar** (botão do meio no celular) — grava áudio; cai na fila de capturas  
3. **Tarefas** — lista completa, atrasadas, semana, editar, excluir

**Revisar** = revisão semanal.  
Ferramentas (Ideias, Foco, Compras, Treinos, Nutrição, Rituais, Histórico, Config…) ficam na **sidebar** / drawer **Menu** — **não** tem hub “Mais”.

## Se “sumiu” algo

1. Confirma **dopraxis.vercel.app** (não bookmark morto).  
2. **Ctrl+F5** / reinstall PWA.  
3. Se a API falhar: login de novo; avisa a A.N.A. com print.  
4. Doc de status velho **não** prova bug — confere código/prod.

## Onde ficaram gráficos

**Histórico** (menu lateral): heatmap, correlações, etc.

## Deploy (só referência)

- Front: push `main` → `npm run deploy:prod` (+ alias `dopraxis.vercel.app`)  
- API (só se mexeu em `api/`): `npm run ship:api` + restart `praxis-api` na VPS  
