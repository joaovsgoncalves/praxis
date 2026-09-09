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

## Fechar o ciclo de execução — 2026-08-25

Continuidade não usa coluna `Concluído`. O que conclui no dia é o **próximo passo**, não a frente inteira.

Fluxo canônico:

1. João executa o `next_step`.
2. Clica em **Fiz isso** no Foco agora ou no drawer da frente.
3. A API registra atomicamente `Concluído: <passo>` em `project_updates` com source `conclusao`.
4. `next_step` é limpo; foco e coluna permanecem exatamente como estavam.
5. A UI mostra **Próximo passo pendente de revisão** em vez de manter instrução velha.
6. Sêneca reconhece `[conclusao]` como evidência explícita e nunca ressuscita o passo concluído.
7. No próximo ciclo, Sêneca pode propor a menor continuação seguinte, sem mover a frente.

Endpoint: `POST /api/projects/:id/complete-next-step`.

### Dois ciclos do Sêneca

- **07:50 Fortaleza — `seneca:continuidade-do-dia`**: orienta o dia, atualiza continuidade e propõe próximos passos com limite de escrita já existente.
- **18:30 Fortaleza — `seneca:fechamento-de-progresso`**: estritamente read-only; lê conclusões, tarefas, timeline e evidências reais para devolver um espelho factual do que avançou. Não vira checklist nem plano de amanhã.

Regra de produto: o fechamento deve reduzir distorção de percepção, não aumentar cobrança. Frente quieta por bloqueio ou por escolha de prioridade não vira falha automaticamente.

## Decisão 2026-08-25 — Modo Foco + refresh intradiário

A Continuidade pode iniciar execução, sem virar uma segunda lista de tarefas.

- `Modo foco` transforma o `next_step` atual em uma tarefa normal da Praxis e abre `/foco` com ela vinculada.
- A tarefa recebe `source=project_focus:<slug>` para preservar a origem.
- Se já existir uma tarefa pendente da mesma frente com o mesmo próximo passo, ela é reutilizada em vez de duplicada.
- Ao concluir a tarefa pelo Modo Foco, a Praxis tenta fechar exatamente o `next_step` que originou a sessão e registrar a conclusão na timeline.
- A API protege contra corrida: se o `next_step` mudou enquanto a sessão estava aberta, retorna `NEXT_STEP_CHANGED` e não apaga o estado novo. O Sêneca reconcilia depois pela evidência da tarefa concluída.
- `Fiz isso` continua existindo para avanços feitos fora do timer.

Cadência canônica do Sêneca:

- 07:50 Fortaleza: revisão de continuidade e plano de retomada.
- 13:50 Fortaleza: refresh intradiário para incorporar a manhã e recalcular próximos passos.
- 18:30 Fortaleza: fechamento de progresso read-only, sem reordenar a vida nem criar cobrança nova.

Regra de UX: `Modo foco` aparece no bloco **Foco agora** e no drawer da frente. Não adicionar CTA operacional em todos os cards do mapa; o mapa continua sendo leitura rápida.


## Evolução Frentes v3 — 2026-09-09 (Fases 1, 2 e 3 entregues)

- Nome de produto consolidado como **Frentes** (rota canônica `/frentes`, redirect transparente `/projetos` -> `/frentes`).
- Sem Kanban, sem drag and drop e sem pins manuais como fonte de verdade da ordem.
- **O que vem primeiro**: orientação diária estruturada gerada pelo Sêneca (`continuity_guidance`), com prioridade 1 dominante e até 3 itens com motivo explícito.
- **Suas frentes**: lista vertical compacta organizada em três grupos (Trabalho e compromissos, Formação, Construção própria) mostrando somente nome, tipo, estado curto, indicador de bloqueio e chevron.
- **Detalhe sob demanda (`ProjectDetailDialog`)**:
  - Abre sempre em **modo leitura simples**, nunca como formulário completo.
  - Primeira dobra em linguagem natural: Situação atual, Fatia atual, Próximo passo e Bloqueio real (campos vazios omitidos honestamente).
  - Execução protegida: `Modo Foco` (cria tarefa `source=project_focus:<slug>` apenas sob demanda manual com copy `Criada por Frentes`) e `Fiz isso` (envia `expected_step`, trata `409 NEXT_STEP_CHANGED` sem sobrescrever o passo novo e mantém a frente aberta sem mover/pausar).
  - Botão `Editar estado` revela o formulário completo existente; cancelar restaura o estado sem apagar dados persistidos.
  - Seletor de estado (coluna) existe unicamente dentro do drawer em modo de edição.
  - Linha do tempo (`project_updates`) e registro manual de avanços posicionados abaixo do contexto operacional.
