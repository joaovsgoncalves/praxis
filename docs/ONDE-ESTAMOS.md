# Onde estamos — Praxis (para o João)

**Atualizado:** 2026-08-22 · evidência git/prod  
**URL que abre:** https://dopraxis.vercel.app  
**Repo:** `joaovsgoncalves1-jpg/praxis` · **HEAD:** ver `git log -1` (não este parágrafo)  
**API:** `praxis-api` · `GET /api/health` 200 · porta 18556  

## Treinos V4 (ago/2026)

O módulo Treinos passou a se chamar **Jota Fit**: rota canônica `/jota-fit`; `/treinos` redireciona com replace. Funcionalidade (hoje, sessão, programa, biblioteca, mapa, histórico) e tabelas `workout_*` intactas.

No ar em `/jota-fit`: catálogo 1324 + customs, Biblioteca, GIF CDN (Gym visual), Mapa Balanço/Fadiga/Força, heatmap no Histórico, 1RM, superset, treino livre. Smoke: `scripts/smoke-praxis-treinos.sh`.  

Uso: mapa só fica esperto depois de séries em exercício do catálogo (custom sem alias não pinta).  

---

## Hierarquia de verdade (ler antes do resto)

1. **`git` HEAD + working tree** neste path (`apps/praxis`)  
2. **Prod vivo** — bundle em `dopraxis.vercel.app` + API health/auth  
3. **Skill/ops** `praxis-product-ops`  
4. **Este arquivo / nota** — só narrativa; se a data for velha ou o HEAD não bater, **ignora e verifica 1–2**

Working tree em 2026-07-24: **limpo** e alinhado a `origin/main`.

---

## Em uma frase

O **plano grande (ondas 1–24)** e os módulos extras pedidos (Nutrição, Treinos, Compras, lotes de design, outcomes honestos, marca/motion, fixes de lista/foco) estão **no código e no ar**. Não há onda obrigatória aberta. Evoluir daqui = **dor tua no uso**, não “fechar o combinado”.

---

## Três camadas (não misturar)

| Camada | Status | O que é |
|--------|--------|---------|
| **A. Produto core (ondas 1–24)** | **Fechado** | Auth, Agora, lista, voz/capturas, metas, rituais, mobile/PWA, backup, smoke, recorrência, avoidance… `docs/PLANO-IMPLEMENTACAO-PRAXIS.md` + archive pós-18 |
| **B. Pedidos jul/2026 (pós-plano)** | **Fechado no ar** | Simplificação nav; Compras; Nutrição 0–12; Treinos V1; Lotes 7–10; Não rolou / Não hoje + nome honesto; editar hábito no ritual + `preferred_time`; marca P+seta / favicon / toast / partículas; hero hora + estoico; lista operacional (sem tarefa fantasma); Foco wall-clock + persistência; delete AlertDialog |
| **C. Uso real / opcional** | **Contínuo** | Celular no dia a dia, revisão semanal de verdade, voz tua, copy fina, Playwright 390px, DNS `dopraxis.app`, branch protection, rclone offsite. **Não** bloqueia “entregue” |

---

## O que o código/prod tem agora (além do snapshot antigo de 18/07)

Doc antigo parou em 18/07. **Depois** (principalmente 20–22/07, ~22 commits) entrou e **está no prod**:

| Frente | Evidência curta |
|--------|-----------------|
| **Lista honesta** | `include_overdue` traz abertas (incl. futuras), sem afogar em completed antigo — `c997901` / `858f1fe` |
| **Foco** | ring/viewBox; timer wall-clock; sessão em `localStorage` `praxis:focus:active-v1` + `endsAt` — `d9a7fd4` / `ca7ff9a` |
| **Delete** | `AlertDialog` Praxis no path de excluir tarefa — `d9a7fd4` |
| **Hábitos no ritual** | editar no `RitualWidget` + `preferred_time` — `8a72e13` |
| **Hoje / marca** | obsidian-âmbar; monograma P+seta ouro; favicon legível; partículas em movimento; toast X; hero `HH:mm` + memento mori/hora — `a0776b8`…`5e74d28` |
| **Infra de dados** | migração transparente `forja.db` → `praxis.db`; backup prefere `praxis.db` — `14afca8` / `ac2b5ba` |
| **API/UI** | modularização routes/components; haptics; fallback de voz no browser — `dc70032` |
| **Nutrição / Treinos / Compras** | módulos shipped (barcode OFF, gramas, wishlist, PPL/sessão) — planos em `docs/` + archive |

Nav canônica no código (`src/lib/praxisNav.js`):

- **Primary:** Hoje · Tarefas · Falar · Revisar  
- **Secondary:** Ideias · Modo Foco · Compras · Finanças · Jota Fit · Nutrição · Metas\* · Rituais · Conquistas\* · Histórico · Config  
- **Sem** hub “Mais” e **sem** Fila no menu (`/capturas` existe por rota/banner)

---

## Dívida / aberto (honesto)

- [ ] **DNS `dopraxis.app`** — no projeto Vercel, mas apex **não resolve** publicamente; link do dia a dia = `dopraxis.vercel.app`  
- [ ] **Branch protection** — repo privado free; CI verde no push, merge não trava sozinho  
- [ ] **RCLONE offsite** — opcional; backup local/VPS ok  
- [x] Testes API + CI Node 22 + crons backup/health  
- [x] Alias/prod no HEAD recente (smoke bundle Agora OK em 24/07)

---

## Design global — checklist de shell

Todas as abas de produto usam `praxis-page` + padrões Praxis onde faz sentido (Hoje, Tarefas, Ideias, Compras, Treinos, Nutrição, Metas, Rituais, Histórico, Captura, Capturas, Foco, Conquistas, Config, Revisão).  
`/compartilhar` = PWA share mínimo — ok simples.

Regra: pedido de **design geral** = **todas** as abas, não um print só. Ver `docs/DESIGN.md` + audits em `docs/PRAXIS-DESIGN-AUDIT-*.md`.

---

## O que **não** falta para “fechar o combinado”

Nada do plano original de ondas nem dos módulos/lotes que tu pediu e shipamos.  
**Não** usar este arquivo como backlog inventado.

---

## Próximo só se **você** quiser

Não há P0 de roadmap pendente no repo. Exemplos de direção **se** doer:

1. Uso: 2 semanas no celular + 1 revisão real + 1 voz tua  
2. DNS marca `dopraxis.app`  
3. Ajuste fino de copy/UX na tela que te irritar  
4. Feature **nova** com PRD curto (uma fase por vez) — não reabrir 24 ondas

---

## Como provar que está no ar

```bash
cd apps/praxis
git log -1 --oneline
curl -sS https://dopraxis.vercel.app/api/health
npm run smoke:prod          # completo com senha na VPS
# front novo: npm run deploy:prod  (+ alias dopraxis.vercel.app)
# api: npm run ship:api + restart praxis-api se api/ mudou
```

Nota de produto (técnica vs confiança): `docs/PRAXIS-NOTA-ATUAL.md`.
