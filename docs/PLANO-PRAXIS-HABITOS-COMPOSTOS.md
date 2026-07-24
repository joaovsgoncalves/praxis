# Praxis — Hábitos compostos (substituir “Rituais”)

**Status:** plano só — **não implementar** até João aprovar fases.  
**Data:** 2026-07-24  
**Motivo:** área Rituais estranha; hábitos “dentro” de ritual na aba Hábitos; modelo mental do João = rotina matinal/noturna com **sub-hábitos**.

## Modelo mental (João)

| Conceito | Exemplo |
|----------|---------|
| **Hábito composto** | Rotina matinal |
| **Sub-hábitos** | acordar no horário · sem celular · banho gelado · higiene · café/suplementos |
| **Hábito simples** | Beber água (avulso) |

Ritual como entidade/nav separada **some** da cabeça do produto. O valor (sequência de passos no dia) **fica** como composto.

## Estado atual (código)

- `workout`-unrelated: `rituals` API + `RitualWidget` no Hoje + aba Hábitos mostra rituais com hábitos dentro + nav **Rituais**
- Hábitos atômicos; ritual = container ordenado (`habits_order`)
- Templates `day_open` / `day_close`
- Não rolou / skip / preferred_time já amarrados ao hábito **dentro** do ritual

## Modelo alvo

```text
habit
  kind: simple | compound
  parent_id: null | id do composto
  (composto) children ordenados = sub-hábitos
```

- **Hoje:** card “Rotina matinal” expansível com checks dos passos (+ Não rolou por passo).
- **Aba Hábitos:** lista de compostos + simples; **sem** seção “Rituais”.
- **Nav:** remover item Rituais (rota `/rituais` redirect ou some).
- Streak: composto pode ter regra “mínimo N passos” ou streak só nos passos (decidir na fase 0).

## Migração (dados)

1. Cada ritual ativo → 1 hábito `kind=compound` (nome/emoji/período).
2. Hábitos do ritual → `parent_id` = composto, ordem = `habits_order`.
3. API rituals: deprecated read-only 1 release **ou** shim que monta compostos.
4. Templates abertura/fechamento → seed de compostos, não “Instalar ritual”.

## Fases (quando arrochar código = **CLI orquestrado**)

| Fase | Done-when | Notas |
|------|-----------|--------|
| **0** | Decisões: streak do composto? partial conta? UI collapse default? | 1 página no chat/doc |
| **1** | Schema `kind` + `parent_id` + migrate rituals→compostos | API + testes |
| **2** | Hoje: widget composto no lugar de RitualWidget | UX principal |
| **3** | Aba Hábitos: lista unificada; editar passos | |
| **4** | Nav: tira Rituais; redirect; copy PT | |
| **5** | Ship + smoke; apagar dead code templates ritual se seguro | |

## Fora do escopo inicial

- Renomear tudo “ritual” no histórico de commits
- Redesign total de tarefas
- Gamificação nova só por composto

## Scrollbars (lote paralelo — craft)

Prints João: scrollbar Windows clara no Select “Todos os dias” e trilho em chips de treino.

**Fix (este ship craft):**  
- `.praxis-app` scrollbars finas/escuras  
- `.praxis-hide-scrollbar` em rails horizontais  
- Select viewport: não travar altura no trigger; hide scrollbar nativa  

## Aprovação

João diz **ok fases** / ajusta fase 0 → A.N.A. orquestra Codex CLI.  
**Não** implementar modelo composto neste commit de scrollbar.
