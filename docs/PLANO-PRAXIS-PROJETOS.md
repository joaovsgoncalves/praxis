# Praxis — Projetos v2: continuidade

Data: 2026-08-25

## Problema que esta tela resolve

A aba não é portfólio, roadmap nem lista de tarefas. Ela existe para responder em poucos segundos:

1. Onde cada frente ficou?
2. O que está na mesa agora?
3. Qual é o próximo passo executável?
4. Existe algum bloqueio real?
5. O que já avançou ao longo do tempo?

A regra central é: **projeto guarda continuidade; tarefa guarda execução do dia**.

## Escopo canônico

A tabela `projects` pode representar frentes de tipos diferentes:

- `produto`: Praxis, CatálogoZap, CarteiraZap, EncarteZap, site pessoal;
- `cliente`: Animália;
- `trabalho`: RCA, GoFluxo;
- `estudo`: Faculdade.

Jota Fit não vira card separado enquanto for a experiência de treino canônica dentro da Praxis.

## Kanban

Colunas:

- `andando`: existe uma fatia real em curso;
- `radar`: existe, mas não é prioridade de execução agora;
- `aguardando`: depende de algo externo ou de uma decisão;
- `pausado`: pausa consciente.

`No ar` não é coluna. É propriedade (`live`) porque uma frente pode estar no ar e continuar sendo desenvolvida.

`Foco` continua sendo pin independente, máximo 2. **Só João muda foco e coluna.**

## Estado de continuidade

Cada frente guarda:

- `objective`: por que existe;
- `status_summary`: onde ficou de verdade;
- `current_slice`: fatia em curso;
- `next_step`: uma ação executável;
- `blocked_note`: impedimento real, se houver;
- `shipped_note`: capacidades/entregas já existentes;
- `last_reviewed_at`: última revisão de continuidade;
- `last_move_at` / `last_move_note`: mudança de coluna;
- `kind` e `live`.

O card mostra principalmente **Agora** e **Próximo**. O detalhe abre em drawer lateral.

## Linha do tempo

Tabela `project_updates` registra movimentos importantes sem sobrescrever a história.

Campos:

- `project_id`
- `date`
- `summary`
- `source`
- `created_by`
- `created_at`

Mudança de coluna registra evento automaticamente. João pode registrar avanço manual. Sêneca pode registrar avanço pela ponte estreita quando houver evidência real.

## Sêneca

Sêneca é o mantenedor de continuidade, não o executor geral.

Ele pode:

- ler `projects` e tarefas da Praxis;
- ler sinais de Git e evidências específicas de GoFluxo/Animália;
- atualizar `status_summary`, `current_slice`, `next_step`, `blocked_note` e `last_reviewed_at`;
- adicionar `project_updates` quando houve avanço real;
- escolher até 3 ações executáveis para o dia.

Ele não pode:

- mudar `focus` ou `column`;
- mudar `live`, `kind` ou `objective`;
- criar tarefas automaticamente;
- executar CRM, campanha, deploy, código, dinheiro ou ação comercial como parte do cron de continuidade.

A ponte permitida é `/root/.hermes/scripts/seneca-praxis-project-sync.py`, que rejeita campos reservados.

O contexto read-only é coletado por `/root/.hermes/scripts/seneca-continuity-context.py`.

## Prioridade diária

O cron do Sêneca escolhe ações executáveis, não projetos abstratos. Ordem de desempate:

1. obrigação com prazo/horário ou necessidade básica que não pode escorregar;
2. RCA que protege renda, cliente ou fechamento;
3. faculdade com prazo real;
4. entrega de cliente/GoFluxo já assumida;
5. produto próprio em andamento;
6. exploração/feature nova.

Tarefa bloqueada por evento externo não deve ocupar o Top 3 como se fosse executável.

## Critério de sucesso

A tela está funcionando quando João consegue abrir `/projetos` depois de horas ou dias longe de uma frente e retomar sem perguntar “onde eu parei?”.

## UX pass — 2026-08-25

Objetivo: a tela precisa responder em poucos segundos duas perguntas diferentes sem misturá-las: **o que fazer agora?** e **onde cada frente ficou?**

Decisões aplicadas:
- A experiência passa a se chamar **Continuidade**; a rota `/projetos` permanece por compatibilidade.
- **Foco agora** ganha hierarquia própria e mostra só a ação mais importante das até 2 frentes fixadas pelo João.
- O quadro vira **Mapa das frentes**: serve para localização de estado, não para contar a história inteira.
- Cards do quadro foram podados para: nome, tipo, `No ar` quando aplicável, fatia atual em uma linha, próximo passo em até duas linhas e data de revisão.
- Tagline, texto redundante de coluna, badge `Foco` e link de produção saem do card para reduzir carga visual.
- Colunas vazias ficam escondidas no estado normal. Durante drag no desktop, todas reaparecem para preservar a possibilidade de mover para uma coluna vazia. No mobile, o seletor de estado continua disponível no card.
- O drawer agora também permite alterar explicitamente o estado da frente no quadro, então coluna vazia escondida nunca bloqueia operação.
- Regra de UX: o card deve ser entendido em aproximadamente 3 segundos; contexto completo fica no drawer.
