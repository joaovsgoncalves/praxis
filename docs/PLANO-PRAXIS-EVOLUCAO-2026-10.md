# Plano Praxis: evolução pós-auditoria (out/2026)

Data: 2026-10-15. Substitui as fases 5 e 6 de `docs/PLANO-PRAXIS-VISUAL-PREMIUM.md` (fases 0 a 4 entregues e no ar).
Fontes: auditoria do Sistema Forja (`audits/forja-rea-2026-10-14/RELATORIO.md`), revisão do Hoje pelo Fable 5.1 (`audits/forja-rea-2026-10-14/REVISAO-HOJE-FABLE-2026-10-15.md`), prints de produção de 15/10 e o feedback do João no mesmo dia.
Escopo: só construção e validação. Uso, piloto e decisões de rotina ficam com o João.

## Já no ar
- F0 fundação visual, F1 Kanban, F2 visões de tarefas, F3 carteira de Finanças, F4 movimentações e despesas fixas.
- Finanças com dado do banco (Pluggy via Midas).
- Em paralelo, fora deste plano: treino e alimentação saem do código da Praxis (fase 8 do Jota Fit). Os dados continuam no banco.

## Decisões do João (15/10)
- Prioridade é acabamento e clareza, não função nova.
- Tarefa recorrente com horário que já passou num dia anterior vira **"não rolou" automático**. Não conta como atrasada.
- XP ligado à ação e meta semanal de foco entram. PraxIA com perguntas prontas fica para depois.
- Saem do plano antigo: o card de Treino no bento (vira um link para o Jota Fit) e o mapa do ano no Hoje (fica no Histórico).

## Fases
Cada fase entra no ar completa: código, testes focados, QA da A.N.A. no navegador (desktop e 390 px, com dado real), push, deploy, alias `dopraxis.vercel.app` e smoke. A próxima fase só começa depois da validação da anterior.

### Fase A: acabamento das abas (em andamento)
- Respiro dos cards: textos sem encostar na borda (Finanças, Ideias e família de cards).
- Hábitos e Tarefas no PC: semana larga acima das colunas, topos alinhados.
- Frentes: ao abrir uma frente, nome, estado e próximo passo vêm primeiro; contexto e linha do tempo ficam em segundo plano.
- Modo Foco e Revisar com acabamento: hierarquia, timer, resumo escaneável e reflexão secundária.
- Microinterações discretas por tela, respeitando a preferência de movimento reduzido.
- **Pronto quando:** nenhum texto a menos de 12 px da borda do card nas abas tocadas; topos de Hábitos e Tarefas alinhados em 1440 px; nenhuma tela com rolagem lateral em 390 px; salvar, excluir e registrar avanço continuam funcionando.

### Fase B: Hoje enxuto (corrige a decisão de manhã)
- **Agora com relógio:** pega a tarefa com hora mais próxima dentro de uma janela que começa 90 min antes de agora. Abaixo dele, uma linha "Depois: …".
- **Recorrente vencida vira "não rolou":** uma instância recorrente de dia anterior com horário e ainda aberta é fechada como não rolou (`day_outcome`) sem dar XP, e a próxima ocorrência é garantida. Roda sob demanda e é idempotente (na leitura da lista do dia), sem cron novo.
- **Uma menção de atraso:** sai o banner vermelho, o contador duplicado e a data em ISO. Entra um grupo "Ficou pra trás" com "desde ontem" ou "desde seg 12/10".
- **Linha compacta de tarefa no celular:** título, hora, área e duração. "Não hoje" vai para o menu e o deslize.
- **Faixa do dia** no lugar do hero grande: data, hora, saudação e "faltam N pra fechar o dia". Fechado = feito, não rolou ou não hoje.
- Saem do Hoje: Prioridades (vira o "Depois"), "Foco 0/100m", chip de sequência sem rótulo e agenda vazia.
- Check-in de bem-estar recolhido numa linha que abre um painel.
- **Pronto quando:** testes de `nowTask` com relógio fixo (16:10 → tarefa das 14:00; 06:50 → tarefa das 07:15); teste da recorrente (a de ontem às 18:40 não aparece como atrasada e vira não rolou no Histórico; rodar duas vezes não duplica nada); nenhum texto `AAAA-MM-DD` no Hoje; "faltam N" bate com os contadores de Tarefas e Hábitos; check-in recolhido com até 88 px.

### Fase C: Hoje com trilha e bento
- **Trilha do dia:** tarefas com hora e eventos da agenda numa lista por horário, com marcador de "agora" e concluídas recolhidas no fim.
- Hábitos no mesmo visual da aba Hábitos. Abertura expandida antes das 11h, Fechamento depois das 20h. Títulos inteiros em 390 px.
- **Bento 2x2:** Finanças, Check-in, Foco (minutos de hoje) e um link para o Jota Fit. Um número e uma ação por card.
- **Semana em 7 pontos** (feitos/total por dia). O toque abre a semana em Hábitos e Tarefas. O backend expõe `days[]` em `/api/insights/weekly`, sem endpoint novo.
- Desktop: duas colunas, com a "Dia em um olhar" fixa à direita.
- **Pronto quando:** o Hoje cabe em até 5 telas de rolagem em 390 px (hoje são 13); a soma dos 7 dias bate com os totais da resposta; os quatro cards do bento têm a mesma altura, até 150 px.

### Fase D: XP ligado à ação e meta semanal de foco
- **Registro de XP por origem** (tabela de eventos: origem, id, valor). Desmarcar tarefa ou hábito estorna o XP; marcar de novo não duplica. Hoje, marcar, desmarcar e marcar de novo dá +10 a cada vez.
- O total e o nível são recalculados a partir do registro. Na migração, o XP atual vira um saldo inicial, sem perder nível.
- **Meta semanal de foco** definida pelo João em Configurações ou no Foco, desligada por padrão. Mostra o feito na semana e uma projeção, sem tom de cobrança e sem número imposto.
- **Pronto quando:** teste de marcar/desmarcar/marcar resulta em +10 uma vez só; XP e nível iguais antes e depois da migração; com a meta desligada, nada aparece; com a meta ligada, o feito bate com as sessões da semana.

### Fase E: acabamento final
- Animação de entrada do Hoje uma vez por sessão (320 ms), confete respeitando movimento reduzido, barras com `scaleX` em vez de `width`.
- Skeletons na mesma silhueta das telas novas e transição entre rotas.
- Modal "Últimas atualizações" depois de cada publicação.
- Código dividido por rota e imagens leves.
- **Pronto quando:** Lighthouse mobile acima de 85 em performance; nenhum flash branco ao navegar; com movimento reduzido ativo, nenhum confete nem spring.

## Depois (planos separados)
- Notificação push e app offline (service worker, Web Push no servidor próprio).
- PraxIA com perguntas prontas sobre os dados.

## Fora do escopo
Loja de moedas, ranking, temporadas, OneSignal, telas de treino e alimentação, mapa do ano no Hoje. Regra clean-room: nada de código, texto ou asset do Forja.

## Execução
- Implementação: Claude Code Opus em esforço alto, uma fase por vez, num worktree isolado quando outro executor estiver na `main`.
- Revisão de design: Fable 5.1, só leitura, quando a fase mexer em composição de tela.
- QA independente da A.N.A. antes de cada publicação. O relatório do executor não vale como prova.
