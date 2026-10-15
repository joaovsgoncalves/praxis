# Plano Praxis: evolução pós-auditoria (out/2026)

Criado em 2026-10-15. **Atualizado em 2026-10-15, 17h50 (Fortaleza): fases A, B e C no ar; próxima é a D.**
Substitui as fases 5 e 6 de `docs/PLANO-PRAXIS-VISUAL-PREMIUM.md` (fases 0 a 4 entregues e no ar).
Fontes: auditoria do Sistema Forja (`audits/forja-rea-2026-10-14/RELATORIO.md`), revisão do Hoje pelo Fable 5.1 (`audits/forja-rea-2026-10-14/REVISAO-HOJE-FABLE-2026-10-15.md`), prints de produção de 15/10 e o feedback do João no mesmo dia.
Escopo: só construção e validação. Uso, piloto e decisões de rotina ficam com o João.

## Estado atual
| Fase | Estado | Commits |
|---|---|---|
| F0 a F4 (plano visual premium) | No ar | ver `PLANO-PRAXIS-VISUAL-PREMIUM.md` |
| Saída de treino e alimentação (fase 8 do Jota Fit) | No ar | `a06f533` |
| **A** acabamento das abas | **No ar** | `d1e89a0`, `a0f05e7`, `ef55a93` |
| **B** Hoje enxuto | **No ar** | `f819f65`, `309985d`, `4974a52`, `f70af44` |
| **C** trilha e bento | **No ar** | `aa54c1b` |
| **D** XP por evento e meta semanal de foco | **Próxima** | |
| E acabamento final | Pendente | |

- `main` = `origin/main` em `f70af44`, árvore limpa. Produção: https://dopraxis.vercel.app (deploy `praxis-5sfo0lnyx`) e API `praxis-api` reiniciada depois do backup de 15/10.
- `smoke:prod` completo verde depois de A, B e do ajuste do Sêneca. 214 testes da API verdes depois da saída de treino e alimentação.
- O banco ainda tem as 16 tabelas de treino e alimentação, sem tela. Backup de antes da saída: `/root/.hermes/backups/praxis/praxis-pre-fase8-20261015.db`.

## Decisões do João (15/10)
- Prioridade é acabamento e clareza, não função nova.
- Tarefa que ficou aberta num dia anterior vira **"Não rolou" automático** (`day_outcome='missed'`, status `cancelled`, sem XP, sem mexer no Google Agenda) quando é:
  - recorrente (`recurrence` != none): a próxima ocorrência é garantida;
  - bloco com hora criado pelo Sêneca (`source='seneca'`): não gera cópia, porque o Sêneca monta o dia seguinte.
  Tarefa manual e tarefa sem hora continuam em "Ficou pra trás". A regra roda na leitura da lista (`include_overdue`), é idempotente e não usa cron.
- **O Sêneca pode mexer em tudo na Praxis**, inclusive `focus`, `column`, `live`, `kind` e `objective` das frentes.
- XP ligado à ação e meta semanal de foco entram. PraxIA com perguntas prontas fica para depois.
- Saem do plano antigo: o card de Treino no bento (vira um link para o Jota Fit) e o mapa do ano no Hoje (fica no Histórico).
- Esforço do executor: Opus 5.5 `high` na Fase B. Confirmar o esforço com o João antes de cada fase.

## Fases
Cada fase entra no ar completa: código, testes focados, QA da A.N.A. no navegador (desktop e 390 px, com cópia do banco real), push, deploy, alias `dopraxis.vercel.app` e smoke. A próxima fase só começa depois da validação da anterior.

### Fase A: acabamento das abas (no ar)
- Padding dos cards corrigido na origem (`src/lib/cardPadding.js` + `ui/card.jsx`): o `sm:` do CardContent deixava o topo em 0 quando o card definia o próprio padding.
- Hábitos e Tarefas no PC: semana larga acima das colunas (xl, Todos + Lista), cabeçalhos alinhados, dia selecionado com pill.
- Frentes: próximo passo e "Travado por" primeiro; "Onde ficou" e "Mexendo agora" depois; objetivo e notas em "Mais contexto"; linha do tempo com os 3 últimos.
- Modo Foco: painel "Nova sessão", timer grande com anel, pós-sessão com "Concluir tarefa".
- Revisar: faixa de números, prioridades numeradas, reflexão recolhível que não perde texto não salvo.
- **Verificado:** nenhum texto a menos de 10 px da borda em 7 abas; topos alinhados em 1440 px; sem rolagem lateral em 390 px; Foco sobrevive a recarregar; zero erro no console.

### Fase B: Hoje enxuto (no ar)
- Agora com relógio (`planNowTasks` em `src/lib/nowTask.js`): o bloco de uma tarefa vai até `hora + duração` (ou a próxima com hora) e só fica pra trás se terminou antes de agora menos 90 min. Linha "Depois: …".
- Faixa do dia (`DayStrip`) com "faltam N" (`computeDayLeft`). Saíram `HeroDay`, `TodayPriorities`, `OverdueTasksBanner`.
- Grupo único "Ficou pra trás", sem data ISO. Linhas compactas no celular, "Não hoje" no menu.
- Check-in recolhido em "Como foi o dia?" com Sheet. Agenda some quando vazia.
- "Não rolou" automático (regra acima), com teste em `api/tasks.missed-recurrence.test.mjs`.
- Revisar: "Ideias na semana" ocupa a linha inteira depois da saída da nutrição.
- **Verificado:** Hoje no celular de 13 para 3,8 telas de rolagem; Agora às 15h = RCA 14:00 com "Depois: Faculdade 18:20"; nenhum `AAAA-MM-DD`; check-in recolhido com 64 px; a "Sair para a faculdade" de 14/10 virou não rolou em produção e a de 15/10 ficou aberta.

### Fase C: Hoje com trilha e bento (no ar)
- **Trilha do dia:** tarefas com hora e eventos da agenda numa lista por horário, com marcador de "agora" e concluídas recolhidas no fim. Novo `DayTrack.jsx` no lugar de `TodayTasks` no Hoje.
- Hábitos no mesmo visual da aba Hábitos (`praxis-board-card` + `AreaRuler`). Abertura expandida antes das 11h, Fechamento depois das 20h. Títulos inteiros em 390 px.
- **Bento 2x2:** Finanças, Check-in, Foco (minutos de hoje) e um link para o Jota Fit. Um número e uma ação por card.
- **Semana em 7 pontos** (feitos/total por dia). O toque abre a semana em Hábitos e Tarefas. O backend expõe `days[]` em `/api/insights/weekly` a partir do laço que `buildWeeklyInsights` já faz, sem endpoint novo.
- Desktop: duas colunas, com "Dia em um olhar" fixa à direita.
- Uma gramática de cabeçalho só (`SectionHeader`), sem `DashboardGroupHeading`; tirar frases que explicam a interface.
- **Pronto quando:** o Hoje continua em até 4 telas de rolagem em 390 px; a soma dos 7 dias bate com os totais da resposta; os quatro cards do bento têm a mesma altura, até 150 px; a trilha ordena por hora e o marcador fica entre o último item passado e o primeiro futuro.
- **Verificado:** 3,2 telas em 390 px, `scrollWidth` 390, bento com 140 px nos quatro cards em 390 e 1440 px, marcador 17:42 entre RCA 14:00 e faculdade 18:20, Abertura expandida às 8h e Fechamento às 21h, toque no dia abre a semana com o dia certo, agenda real (5 eventos, todos espelho de tarefa) sem duplicar. 269 testes, lint, build e `smoke:prod` verdes.
- **Contrato do `days[]`:** conta só hábitos folha; as rotinas-contêiner ficam em `days_routines`, que fecha a conta com `victories`. Drag de reordenar saiu do Hoje (continua em Hábitos e Tarefas). `TodayTasks`, `TodayCalendar` e `TodayFinanceCard` removidos.

### Fase D: XP ligado à ação e meta semanal de foco (próxima)
- **Registro de XP por origem** (tabela de eventos: origem, id, valor). Desmarcar tarefa ou hábito estorna o XP; marcar de novo não duplica. Bug confirmado no código: `PUT /api/tasks/:id` soma +10 toda vez que a tarefa volta a ficar concluída (`api/routes/tasks.js`, `taskXpAwarded`).
- O total e o nível são recalculados a partir do registro. Na migração, o XP atual vira um saldo inicial, sem perder nível.
- **Meta semanal de foco** definida pelo João em Configurações ou no Foco, desligada por padrão. Mostra o feito na semana e uma projeção, sem tom de cobrança e sem número imposto.
- **Pronto quando:** teste de marcar/desmarcar/marcar resulta em +10 uma vez só; XP e nível iguais antes e depois da migração; com a meta desligada, nada aparece; com a meta ligada, o feito bate com as sessões da semana.

### Fase E: acabamento final
- Animação de entrada do Hoje uma vez por sessão (320 ms), confete respeitando movimento reduzido (`src/lib/celebration.js`), barras com `scaleX` em vez de `width`.
- Skeletons na mesma silhueta das telas novas e transição entre rotas.
- Modal "Últimas atualizações" depois de cada publicação.
- Código dividido por rota e imagens leves.
- **Pronto quando:** Lighthouse mobile acima de 85 em performance; nenhum flash branco ao navegar; com movimento reduzido ativo, nenhum confete nem spring.

## Depois (planos separados)
- Notificação push e app offline (service worker, Web Push no servidor próprio).
- PraxIA com perguntas prontas sobre os dados.

## Fora do escopo
Loja de moedas, ranking, temporadas, OneSignal, telas de treino e alimentação, mapa do ano no Hoje. Regra clean-room: nada de código, texto ou asset do Forja.

## Pendências conhecidas
- CI do GitHub desligado manualmente (último run 15/09). O gate é `prepush:check` + testes focados + smoke.
- `deploy-praxis-front.sh` às vezes falha (`exit 134` ou `Not authorized`) depois de o deploy Git ficar pronto. Nesse caso: `vercel ls --yes`, conferir string nova no bundle e `vercel alias set <host> dopraxis.vercel.app`.
- Leitura do Google Agenda na cópia de QA falha (`aes.KeyUnwrap integrity check failed` no `gog`). Em produção o serviço não mostrou esse erro; investigar só se a agenda sumir do app.

## Execução
- Implementação: Claude Code Opus 5.5 (`--model opus`, resolve `claude-opus-5-5`), esforço combinado com o João, uma fase por vez, num `git worktree` em `/root/.hermes/cache/scratch/` quando outro executor estiver na `main`. Contrato em `.agent-context/TASK.md` com o pacote de skills em `.agent-context/skills/`.
- Revisão de design: Fable 5.1 (`--model fable`), só leitura, quando a fase mexer em composição de tela.
- QA independente da A.N.A. antes de cada publicação, com API e prévia numa cópia do banco (`FORJA_CALENDAR_SYNC_ENABLED=0`). O relatório do executor não vale como prova.
- Ship: backup se `api/` mudou, push `main`, `systemctl restart praxis-api` se `api/` mudou, deploy + alias, `smoke:prod`, grep de string nova no bundle de `dopraxis.vercel.app`.
