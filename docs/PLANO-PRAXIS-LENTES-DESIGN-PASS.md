# Praxis — passe de design: lentes (Quadro / Semana)

**Status:** D1 no Gemini 3.7 high (`agent/lentes-d1-quadro`). Norte B+C travado. Sem ship até QA visual.  
**Data:** 2026-08-24  
**Superfície:** `/habitos-tarefas` nas lentes Quadro e Semana (Lista só o que vazar da mesma linguagem).  
**Image2-dir:** obrigatório. 3 comps abaixo.

## Problema (print real)

- Quadro ao lado de hábitos virou cartão em letra em pé. Patch de overflow já subiu (`96e43c6`). Isso é piso, não o passe.
- Quadro ainda parece Trello escuro: 4 caixas iguais, empty dashed, grip + checkbox + menu competindo.
- Semana funciona melhor, mas bloco trunca, dois no mesmo horário se empilham, “Sem hora” come o first fold.
- PageHero + stats + chips + input + switcher = chrome demais antes do trabalho.

## Promessa deste passe

Quadro e Semana com cara do **Hoje** (Praxis quieto): hierarquia, ouro só no ativo, cartão que se lê em 1 segundo. Sem pele do Sistema Forja. Sem hero de temporada.

## Fora

- Ferreiro, ciclo, temporada, foto de cortiça
- Multi-quadro / coluna custom
- Redesign do Hoje, Treinos, Finanças
- Partículas mais fortes
- Trocar Space Grotesk / Inter / tokens `--domain-*`

## Decisão (João)

**B + C.** Quadro denso de 4 colunas. Semana como calendário de verdade (bloco com hora e título, overlap deslocado, “sem hora” em chip).  
Não fundir Andamento em Agora (isso era o A).

Nortes:

- `docs/design-direction/lentes-2026-08-24/north-star-quadro.png`
- `docs/design-direction/lentes-2026-08-24/north-star-semana.png`

## Três direções (comps)

| | Eixo | O que muda na UI |
|-|------|------------------|
| **A** | Editorial / ar | Quadro vira 3 faixas largas (Caixa · Agora · Feito). Cartão horizontal, 2 linhas de título, meta em uma fileira. Semana com mais ar, “Sem hora” vira chip no topo do dia, não um poço. |
| **B** | Product-first / denso | 4 colunas full-width, cartão compacto tipo Linear: título + 1 linha de hora/prioridade. Empty sem dashed box. Semana: blocos com hora visível, overlap desloca, não cobre. |
| **C** | Semana-rei | Semana é a tela. Quadro vira trilho baixo ou some do first fold. Hoje destacado, linha de agora forte, criar no slot óbvio. Quadro só se clicar. |

## Fases (depois da escolha)

| Fase | Done-when |
|------|-----------|
| **D0** | João escolhe. Comp vira `docs/design-direction/lentes-2026-08-24/north-star.png`. |
| **D1** | Quadro: cartão + colunas + empty + switcher. Browser 1440 e 390. Zero letra em pé. |
| **D2** | Semana: bloco, overlap, Sem hora, botão Hoje. |
| **D3** | Chrome da página: hero/stats somem ou encolhem nessas lentes. Ship B. |

Executor: João nomeia na hora (Codex / Gemini 3.7 / Grok 4.6 high / OpenCode Go). A.N.A. brief + QA + ship.

## Aceite visual

- Título do cartão lê em 1s, 2 linhas no máximo
- Quadro nunca divide espaço com hábitos
- Empty não parece placeholder de template
- Semana: hora do bloco visível; dois no mesmo slot não se comem
- Ouro só no switcher ativo / hoje / prioridade alta
- PT-BR, sem jargão
