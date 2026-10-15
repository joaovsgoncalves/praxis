# Plano Praxis Visual Premium

> **Atualização 15/10/2026:** fases 0 a 4 no ar. As fases 5 e 6 abaixo foram substituídas por `docs/PLANO-PRAXIS-EVOLUCAO-2026-10.md` (fases A a E). Vale aquele arquivo.

Data: 2026-10-14. Base: auditoria do Sistema Forja (`workspaces/audits/forja-rea-2026-10-14/`), feita só com leitura.

## Promessa
Deixar a Praxis tão bonita e gostosa de usar quanto o Forja, com identidade própria (preto e ouro, tom honesto, "Não rolou" como decisão). Prioridade: **Kanban, Finanças e Hoje**. O backend só muda onde o visual precisar de dado que ainda não existe.

## Regra clean-room
Usar o Forja como referência de experiência, nunca como fonte de código, texto ou asset. Nenhum arquivo, string, imagem ou constante deles entra no repositório. Cada tela nasce do nosso design system.

## Fora do escopo
Loja de moedas, ranking público, temporadas, avatar e mascote pagos, OneSignal. Notificação push fica para um plano separado.

## Diagnóstico
| Área | Forja | Praxis hoje |
|---|---|---|
| Cards | Camadas, profundidade, brilho, cabeçalho com ícone | Planos, bordas finas, pouca hierarquia |
| Kanban | Colunas largas com ícone, contador, menu, recolher, "Adicionar cartão" no pé, empty state ilustrado | Colunas estreitas, cards de texto corridos, sem ação por coluna |
| Visões de tarefas | Quadro, Lista, Kanban, Linha do tempo, faixa de dias da semana | Lista, Quadro e Semana, pouco distintos |
| Finanças | Carteira 3D com cartões empilhados por banco, saldo grande, ocultar valores, ações rápidas | Excelente em decisão ("Próximo passo"), fraco em visual: lista longa de contas sem cor nem marca |
| Hoje | Hero de progresso, resumo da semana tocável, grid bento (treino, bem-estar, foco) | Hero "Agora" forte, mas o resto é uma coluna longa e densa |
| Mobile | Ilha de navegação flutuante, densidade controlada | Barra fixa comum, telas muito longas |

**Vantagens da Praxis que ficam:** o "Agora" com uma coisa de cada vez, o "Próximo passo" financeiro, o Não rolou honesto e o dado real (Pierre).

## Lacunas de backend (só o que o visual exige)
1. `task_checklist_items` (id, task_id, title, done, sort_order) e endpoints CRUD. Mostra o progresso no card.
2. `finance_accounts.brand_color` e `card_last4`, mais a preferência `finance_hide_values` em `user_settings`.
3. Orçamento por categoria: `finance_budgets` (category, month, limit) e um endpoint de consumo por categoria.
4. `GET /api/insights/week-summary?start=` com feitos/total por dia (hábitos e tarefas) e `GET /api/insights/year-heatmap`.
5. Posição livre no Kanban: reusar `sort_order` por coluna, com PATCH em lote numa transação.

## Fases
Cada fase é um ship completo: código, teste, deploy, alias canônico, QA no navegador (desktop e 390 px). A próxima só começa depois da validação da anterior.

### Fase 0: Fundação visual
- Tokens de profundidade: elevação em 3 níveis, gradiente de superfície, brilho dourado sutil, raio e espaçamento.
- Componentes base: `SurfaceCard`, `SectionHeader` (ícone, título, contador, ação), `EmptyState` ilustrado e `Skeleton`.
- Navegação mobile em ilha flutuante com a aba ativa em ouro.
- **Pronto quando:** os componentes estão no catálogo, 3 telas usam e o 390 px não tem overflow.

### Fase 1: Kanban de verdade
- Colunas Caixa, A fazer, Em andamento e Feito, largas, com ícone, contador, menu e opção de recolher.
- Card rico: barra de prioridade, chip de área, data e hora, progresso do checklist, ações no hover.
- "Adicionar cartão" no pé de cada coluna, inline.
- Arrastar suave com placeholder. No mobile, rolagem horizontal com snap por coluna.
- Backend: checklist (lacuna 1) e ordem livre (lacuna 5).
- **Pronto quando:** dá pra criar, mover, reordenar e marcar o checklist no desktop e no celular, e a ordem persiste depois de recarregar.

### Fase 2: Visões de tarefas e detalhe
- Seletor Lista, Quadro e Linha do tempo com transição.
- Faixa de dias da semana com navegação entre semanas.
- Linha do tempo do dia por hora.
- Painel de detalhe da tarefa (sheet no celular) com checklist, notas e área.
- **Pronto quando:** as três visões mostram o mesmo dado sem divergir e o detalhe edita sem recarregar.

### Fase 3: Carteira de Finanças
- Hero carteira: cartões empilhados por banco com cor da marca, saldo total grande, entrou e saiu do mês.
- Ações rápidas: transação, calendário de vencimentos e ocultar valores (o olho).
- "Contas bancárias" em cards com ícone e cor. O "Próximo passo" continua acima de tudo.
- Backend: lacuna 2.
- **Pronto quando:** a carteira mostra os bancos reais do Pierre, o olho persiste e o mobile não corta nada.

### Fase 4: Movimentações e Organização
- Extrato agrupado por dia, com ícone de categoria, busca e filtros.
- Gráfico por categoria e orçamento com barra de consumo.
- Metas de economia em cards com progresso.
- Backend: lacuna 3.
- **Pronto quando:** os totais batem com `/api/finance/overview` e o orçamento atualiza ao lançar.

### Fase 5: Hoje em bento
- Hero mantém o "Agora" e ganha o anel "faltam N passos para fechar o dia".
- Resumo da semana: 7 dias com feitos/total, e o toque abre as pendências daquele dia.
- Grid bento com Treino, Bem-estar, Foco e Finanças em cards de mesma família.
- Mapa de consistência do ano.
- Backend: lacuna 4.
- **Pronto quando:** os números do resumo batem com a API e o celular cabe em 2 rolagens até o bento.

### Fase 6: Movimento e acabamento
- Microinterações: concluir, mover card, fechar o dia com celebração curta.
- Skeletons em todas as telas novas e transições de rota.
- Modal "Últimas atualizações" depois de cada ship.
- Performance: divisão de código por rota e imagens leves.
- **Pronto quando:** Lighthouse mobile acima de 85 em performance e nenhum flash branco ao navegar.

## Execução
- **Modelo:** Claude Code com Opus 5.5 implementa cada fase. O Gemini 4 Argon ainda não chegou na VPS (o `agy models` lista só o 3.8 Flash). Quando chegar, testamos numa fase e comparamos.
- **QA:** a A.N.A. valida de forma independente, no navegador desktop e em 390 px, com dado real e smoke em produção.
- **Ship:** `prepush:check`, push na `main`, `ship:api` quando a API mudar, `vercel --prod`, alias em `dopraxis.vercel.app`, `smoke:prod`.
- **Ritmo:** uma fase por vez, começando depois do "arrocha fase N" do João.
