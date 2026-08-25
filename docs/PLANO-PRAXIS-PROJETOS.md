# Praxis — Projetos (v1)

Kanban de **produtos vivos**, não de tarefa do dia.

Pedido: `shared/coordenação/outbox/2026-08-25-seneca-to-ana-praxis-kanban-projetos.md`.
Decisão João 2026-08-25: **Foco não é coluna**. É pin (máx. 2). Colunas: Radar / Andando / No ar / Parado.

## Promessa (10s)

1. Quais produtos existem
2. Qual está na mesa (pin Foco) e qual tem fatia em curso (Andando)
3. Qual está parado de propósito
4. Qual fatia cada um carrega agora

## Entidade

Tabela `projects`. Proibido reusar `tasks` ou `goals`. Sem tabela `project_slices` na v1.

| Campo | Uso |
|-------|-----|
| slug, name | identidade |
| tagline | o que o produto faz no mundo (1 linha) |
| column | `radar` \| `andando` \| `no_ar` \| `parado` |
| focus | 0/1, no máximo 2 linhas com 1 |
| current_slice | fatia atual, texto curto |
| last_move_at, last_move_note | último movimento humano |
| notes, shipped_note, blocked_note | detalhe do card |
| prod_url, repo_path | opcional |
| sort_order | ordem estável |

## Seed (criar estes 4, não inventar outros)

| slug | coluna | foco | fatia | URL |
|------|--------|------|-------|-----|
| praxis | andando | sim | Jota Fit sessão academia | https://dopraxis.vercel.app |
| catalogozap | radar | não | (vazio) | https://catalogo-zap.vercel.app |
| encartezap | parado | não | pausa consciente | (vazio ok) |
| carteirazap | radar | não | (vazio) | (vazio ok) |

Animalia, GoFluxo, site pessoal: fora.

## UI

- Rota `/projetos`, secondary nav depois de Jota Fit / antes de Metas
- Copy: **Projetos**. Sem portfolio, roadmap, OKR
- Quadro no padrão real de `TaskBoard`: scroll horizontal no mobile, drag só desktop (`lg+`). Mobile move por seletor no card
- Pin Foco no card. 3º pin: toast, não grava. API 409 `FOCUS_LIMIT`
- Clique abre detalhe: notas da fatia, o que está no ar, o que está travado
- Sem card no Hoje. Sem bottom nav. Sem Image2

## Fora da v1

Git scrape, barras de commit, webhook do cron Sêneca, substituir Metas/Quadro, hub Mais.

## Done

`/projetos` no ar em `dopraxis.vercel.app` com 4 cards, drag persiste, pin máx. 2, testes API, ship `main`.
