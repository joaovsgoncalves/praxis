# Plano / PRD — Operação limpa (Hábitos, alinhamento, Finanças)

**Data:** 2026-08-27  
**Status:** plano (sem código ainda)  
**Produto:** limpar a bancada diária da Praxis. Não é onda nova do plano 1–24.  
**URL viva:** https://dopraxis.vercel.app  
**Agentes:** A.N.A. orquestra, faz QA visual e shipa. Executor de código: **Gemini 3.7 high (`agy`)**, **uma fase por spawn**. Finanças vivas correlacionam com o **Midas** (Pierre MCP só no perfil `midas`).  
**Como pede:** `arrocha fase N` · depois `arrocha fase N+1`. Sem “faz tudo” neste PRD.

---

## 1. Por que existe

João mandou prints da bancada e apontou ruído, não feature nova.

1. **Hábitos & Tarefas** está cheia de estado de software (Pendentes, Ativos, Confortável/Compacto) e o seletor de área está **clipado**.
2. **Ideias** e **Compras** (e irmãs) têm o trilho/filtro **topando na linha de cima**, em vez de uma faixa composta.
3. **Finanças** já existe (0–6 no ar), mas a composição perde para o sistema que ele usa de referência. E o número ainda não é vivo: Pierre (fase 7 do PRD antigo) **não** está ligado.

A Praxis já é o lugar de executar. Este plano tira chrome, alinha a família visual e deixa dinheiro **organizado + vivo via Midas**, sem o João virar digitador de saldo.

---

## 2. Promessa e veredito

| | |
|---|---|
| **Problema** | Lista com filtro demais. Área dourada cortada. Trilho desalinhado. Finanças com cara de módulo, não de painel. Saldo ainda é foto/manual. |
| **Promessa** | Abrir Hábitos & Tarefas e só ver o que existe hoje. Abrir Ideias/Compras e a página parecer um recorte só. Abrir Finanças e em 10 s ver o mês, o fluxo e o próximo passo. Falar com o Midas e o painel atualizar. |
| **Veredito** | João não procura “Pendentes” nem “Ativos”. A área inteira cabe e rola. Cards irmãos compartilham topo. `/financas` parece composto. Midas escreve a mesma API. Sem Pix no app. |

---

## 3. O que os prints travam (não reabrir)

### 3.1 Hábitos & Tarefas (`/habitos-tarefas`)

Prints 1 e 2.

**Sai da tela**

- Select **Pendentes** (e Todas / Andamento / Concluídas neste lugar). Chips Hoje · Caixa · Semana · Atrasadas · Todas já recortam o dia. A lista mostra o que está **aberto**.
- Select **Ativos / Pausados / Arquivados / Todos**. Hábito **existe** ou **foi apagado**. Simples.
- Toggle **Confortável / Compacto** na barra e o card **Densidade da lista** em Config. Uma forma só.

**Fica**

- Abas Todos · Tarefas · Hábitos.
- Lentes Lista · Quadro · Semana (não reabrir o PRD de lentes).
- Selecionar + Arquivar em **tarefa** (tarefa arquivada ≠ hábito apagado).
- Quick add, chips de recorte, Não rolou, rituais compostos, `preferred_time`.

**Bug da área (clip dourado)**

A barra mistura três coisas numa row `xl:flex-row` dentro de `praxis-panel` arredondado: abas, densidade, pills Trabalho / GoFluxo / Treino / …. O pill **Todos** dourado é esmagado. Sobra um arco amarelo e um “s”.

Contrato: pills de área ganham **faixa própria**, `overflow-x-auto`, sem `overflow-hidden` no pai clipando o selecionado. Pill ativo inteiro visível.

**Hábito: existe ou some**

- `⋯` do hábito: Editar, Não rolou / desfazer, **Excluir** (AlertDialog que já existe).
- Sem Pausar, sem Arquivar, sem Reativar na UI.
- Lista = `GET /api/habits?status=active`.
- API pode manter `paused` / `archived` no banco. A tela não oferece. Não apagar sozinho o que já está arquivado. No ship da fase 1, listar quantos pausados/arquivados existem (curl). Se houver, João decide. Default: ficam invisíveis.

### 3.2 Alinhamento é classe, não arquivo

Prints 3 (Ideias) e 5 (Compras). João: o trilho **topa na linha de cima**, não está composto. “Não é só nessa parte.”

Causa no código:

- `Ideas.jsx`: `xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start` coloca o aside **na mesma linha do título** “Suas ideias”, enquanto o card da ideia fica abaixo do heading.
- `SectionHeading` (`PraxisPage.jsx`) alinha `sm:items-end` título × trailing. Filtro “Na lista / Todos os prazos” fica colado no topo da faixa.
- Compras: heading + dois selects na mesma row, depois 3 colunas de prazo com alturas soltas.

**Contrato de composição (todas as páginas de produto, não só o print)**

1. **Faixa de título/filtro em largura total.** Heading nunca divide coluna com trilho.
2. **Miolo em grid abaixo.** Lista | trilho, ou 3 prazos, começam no **mesmo topo de card**.
3. Cards irmãos da mesma faixa: `items-stretch` + altura mínima compartilhada. Sem `items-start` jogando o trilho no h1.
4. Empty de coluna (Compras longo prazo) alinha o kicker com as outras colunas. Empty compacto à esquerda, não um retângulo órfão.
5. Nav interna (chips de Finanças, lentes, área) = **uma barra**, scroll horizontal se precisar, sem wrap torto nem clip.

Varredura obrigatória na fase 2 (print = exemplo): `/ideias`, `/compras`, `/habitos-tarefas`, `/financas`, `/metas`, `/revisao-semanal`, `/capturas`. Só marca “sem drift” com evidência.

### 3.3 Finanças: inspiração ≠ clone

Print 4 = sistema que João já usou. Pegar **composição**, recusar pele.

**Pegar**

- First fold em **dois cards da mesma altura**: resultado do mês | fluxo do ano (ou 30d se o ano estiver vazio).
- Nav interna como **uma barra só** (Visão geral / o que a Praxis já tem), não chips que quebram linha.
- Número grande de caixa/mês + gráfico ao lado, alinhados.
- Fonte viva: João fala com o Midas, o painel atualiza. Sem digitação de rotina.

**Recusar**

- Cork board, temporada, “membros participando”.
- 13 itens de nav (Transações, Mensal, Regras, Caixinhas, Alocação, Transferências…).
- Verde fintech. Continua preto + ouro, `PraxisPage`.
- Pix, boleto, pagar pelo app.
- Clonar Mint/Organizze (já travado em `PLANO-PRAXIS-FINANCAS.md`).
- Pierre MCP no perfil `default`. Zero `VITE_PIERRE_*`.

**Já no ar (não refazer)**

Módulo 0–6 shipped (`bf3c0e5` + parcelas). API `/api/finance/*`, seed 12/08, card no Hoje. PRD antigo: `docs/PLANO-PRAXIS-FINANCAS.md`. Ops: skill `praxis-product-ops` → `references/praxis-financas.md`.

Este plano **não** reabre schema 0–6. Fase 3 = composição da aba. Fase 4 = o que o PRD antigo chamava 7 + 9 (Pierre no servidor + contrato Midas).

---

## 4. Arquitetura travada (Finanças)

```
Pierre (Open Finance, read-only)
        │  MCP só no perfil midas
        │  REST no praxis-api (PIERRE_API_KEY no servidor)
        ▼
praxis-api  SQLite = fonte da ABA
        ▲
        │  cookie sessão  ou  Bearer FORJA_API_KEY
   ┌────┴────┐
 João no app   A.N.A. e Midas (mesma API)
```

1. Aba mora na Praxis. Midas **não** ganha dashboard paralelo.
2. João no chat do Midas: “como está o Inter / puxa os bancos / atualiza a Praxis”. Midas lê Pierre e **escreve** `/api/finance/*`. João abre `/financas` e vê.
3. A.N.A. usa a **mesma API**. Não cola chave. Não instala Pierre MCP no `default`.
4. Override `locked=1` / `source=joao` o sync não esmaga.
5. App do banco = juiz pra pagar. Pierre = lanterna. Nubank/PicPay manuais até cobrir.
6. Sem cron novo até o João mandar. Sync = botão na aba + chamada do Midas/A.N.A.
7. Ligar a key no `praxis-api` = **gate explícito** (`liga o Pierre na Praxis`). Sem isso a fase 4 para no 503 honesto.

---

## 5. Escopo

### In

- Simplificar chrome de `/habitos-tarefas`.
- Ciclo de vida de hábito: existe / apagado.
- Consertar seletor de área.
- Kit de composição (heading, trilho, cards irmãos) nas rotas secundárias listadas.
- First fold de `/financas` composto.
- Pierre no servidor + playbook Midas (fase 4, com gate).

### Out

- Reabrir lentes Lista / Quadro / Semana (piso já no ar).
- Densificar Continuidade.
- Jota Fit, Nutrição, voz, captura.
- Multi-usuário, família, investimento, aposta.
- Movimento de dinheiro pelo Praxis.
- Renomear `FORJA_*` / systemd / path `apps/praxis`.
- DNS `dopraxis.app`.

---

## 6. Fases (uma por vez, Gemini)

Cada fase: testes do recorte → `npm run prepush:check` → A.N.A. prova visual (Desktop, 1280 e 390) → push `main` (A.N.A., não o CLI) → `ship:api` + restart `praxis-api` se API → `deploy:prod` + alias `dopraxis.vercel.app` → `smoke:prod` no path tocado.

CLI **não** dá push/deploy. A.N.A. QA independente. Relatório do Gemini ≠ pronto.

### Fase 1 — Hábitos & Tarefas sem chrome

**Objetivo:** a página para de parecer um painel de estados. Área deixa de clipar.

**Arquivos**

- `src/pages/HabitsTasks.jsx` (barra ~861–927, select Pendentes ~1098–1106, select Ativos ~1308–1318, `list_density` ~161–166)
- `src/components/habits-tasks/ListRowMenus.jsx` (Pausar / Arquivar / Reativar)
- `src/pages/Settings.jsx` (card Densidade)
- `src/lib/habits.js` só se o label de archived vazar na UI desta página
- Teste de regressão de lista se existir filtro de status; senão teste API de `GET /habits?status=active` já cobre o default

**Fazer**

1. Remover toggle densidade. Parar de ler `userSettings.list_density` nesta página. Uma forma: o visual **confortável** atual (cards com ar). Campo na API pode ficar; UI não oferece.
2. Remover `<Select>` de status de tarefa. Lista = abertas (`pending` + `in_progress`) no recorte do chip. Concluída some da lista ao marcar. Não criar outro filtro “concluídas”.
3. Remover `<Select>` de status de hábito. Query fixa `status=active`.
4. Tirar Pausar / Arquivar / Reativar do `HabitRowMenu`. Excluir continua com confirmação dupla.
5. Pills de área em faixa **abaixo** das abas Todos/Tarefas/Hábitos, largura total, `praxis-scroll-x`, pill ativo sem corte. Painel pai não usa `overflow-hidden` nessa faixa.
6. Densidade some de Config.

**Não fazer nesta fase:** Quadro/Semana, alinhamento de Ideias/Compras, Finanças.

**Done-when**

- `/habitos-tarefas` sem os textos **Pendentes**, **Ativos**, **Confortável**, **Compacto**, **Arquivados**.
- Área: Trabalho … Bem-estar todos clicáveis; selecionado dourado **inteiro**; scroll se a viewport for estreita.
- Marcar hábito/tarefa continua igual. Lentes intactas.
- Prova visual 1280 e 390. Screenshot do recorte da área **depois** do fix.

### Fase 2 — Composição alinhada (classe)

**Objetivo:** título, filtro e trilho viram uma página, não três blocos grudados no topo.

**Arquivos**

- `src/components/layout/PraxisPage.jsx` (`SectionHeading` + helper novo, nome sugerido `PraxisBand` / `PraxisSplit`)
- `src/pages/Ideas.jsx`
- `src/pages/Compras.jsx`
- Irmãs com o mesmo drift (varredura): `src/pages/Financas.jsx` só o shell se estiver fora do first-fold da fase 3, `Goals`, `WeeklyReview`, `CaptureInbox` / capturas, heading de Hábitos se ainda restar
- `docs/DESIGN.md` (1 parágrafo do contrato, sem ensaio)

**Contrato do helper**

```text
[ heading kicker+título | trailing filtros ]   ← width 100%
[ coluna principal (cards) | trilho (opcional) ]  ← grid abaixo, items-stretch
```

- Trilho **nunca** compartilha a row do `h2`.
- Colunas de Compras: kickers na mesma baseline; empty “Nenhum item aqui ainda” com a mesma largura de coluna, não um chip flutuando.
- `SectionHeading` trailing alinha ao centro óptico do título em desktop (`items-center`), não `items-end` jogando o select no rodapé do kicker.

**Não fazer nesta fase:** redesenhar Finanças first fold (fase 3), Pierre, densidade, lentes.

**Done-when**

- Ideias: card da ideia e card “Revisão desta semana” compartilham o topo da **faixa de conteúdo**. O aside não topa na linha do título.
- Compras: “Sua lista” + filtros numa faixa; as 3 colunas começam juntas abaixo.
- Varredura: tabela no PR do Gemini com rota · drift · fix ou “sem drift”.
- 390px: filtro não empurra o título para fora; trilho vai abaixo da lista, não ao lado esmagado.

### Fase 3 — Finanças composta

**Objetivo:** `/financas` com a hierarquia do sistema de referência, na pele Praxis, nos dados que **já** existem.

**Arquivos**

- `src/pages/Financas.jsx`
- `src/components/finance/*` (extrair first fold se o arquivo passar de ~200 linhas novas)
- `src/lib/finance.js` se precisar de `resultadoDoMes` a partir de overview/insights
- Sem schema novo. Sem `pierreSync.js`.

**First fold (de cima para baixo)**

1. **Linha de decisão** (já existe `next_step`). Uma frase + 1 CTA (`Atualizar saldo` / `Sincronizar` desabilitado honesto se Pierre 503).
2. **Barra de nav única** com os tabs atuais (Agora · Dívidas · Parcelas · Assinaturas · Extrato · Gráficos · Metas). Uma row, scroll-x, sem wrap. Não inventar aba nova.
3. **Dois cards mesma altura**
   - Esquerda: Resultado do mês (caixa / renda vs gastos do overview+insights). Número grande. Sem 12 KPIs.
   - Direita: fluxo 30d ou ano se houver pontos. Empty honesto se extrato vazio (“sem movimento neste recorte”).
4. Abaixo: o miolo da tab ativa (contas, fila de dívida, etc.), já existente.

**Não fazer nesta fase:** ligar Pierre, skill Midas, cron, cork/hero de foto, caixinhas, regras, transferências.

**Done-when**

- Os dois cards do first fold têm a **mesma altura** em 1280.
- Nav é uma barra só, sem a segunda linha torta.
- `next_step` continua no topo.
- 390px: cards empilham (mês, depois fluxo), nav rola na horizontal, hit 44px.
- Anônimo `/api/finance/overview` continua 401.

### Fase 4 — Finanças vivas (Midas + Pierre)

**Objetivo:** o painel deixa de ser foto de agosto. João fala com o Midas; a aba mostra o banco.

**Depende:** João dizer `liga o Pierre na Praxis` **antes** de colocar a key no unit. Sem a frase, o código da fase 4 pode existir (503 + botão), mas o secret **não** entra.

**Arquivos (já previstos no PRD antigo §10–11, §13 fases 7 e 9)**

- `api/pierreSync.js` + `POST /api/finance/sync`
- respeito a `locked=1`
- `api/finance.test.mjs` (sync não esmaga João; Nubank sobrevive)
- skill `praxis-finance-ops` no default (ponteiro: A.N.A. lê/escreve API)
- ponteiro na skill do Midas (`midas-pierre-ops` ou equivalente no perfil `midas`): snapshot → `POST` overview/balances/tx
- `docs/FINANCAS.md` curto pra João

**Contrato Midas**

1. Antes de chutar saldo: `GET /api/finance/overview`.
2. Pierre MCP continua só no `midas`.
3. Depois do Pierre: **escrever** na Praxis, não só falar no Telegram.
4. Se o app do banco divergir: `source=joao` + `locked=1`.
5. A.N.A. não vira Midas (sem aposta/investimento).

**Done-when**

- Sem key: `POST /sync` → 503 `pierre_not_configured`, UI intacta.
- Com key (só após o gate): contas Pierre upsertam; Nubank/PicPay/carro/pai não somem; linha locked intacta.
- Curl Bearer na overview muda depois de um sync de verdade (não seed).
- Midas e A.N.A. atualizam a mesma linha. Prova: um POST Bearer + GET.

---

## 7. Executor (Gemini)

| | |
|---|---|
| Modelo | Gemini 3.7 high via `agy` |
| Ritmo | 1 fase / spawn. A.N.A. QA + ship. Só então a próxima. |
| Brief | este arquivo + fase N + paths + done-when + recusas |
| Git | branch `ana/operacao-limpa-fase-N`. Commit no branch. **Sem push/deploy.** |
| Proibido no CLI | secret, Pierre key, `VITE_PIERRE_*`, cron, MCP no default, “melhorar” Jota Fit/Continuidade |

QA A.N.A. depois de cada fase: diff, `prepush:check`, abrir a rota no Desktop, 390px, só então push + alias.

---

## 8. Como pedir

| Fala | O que acontece |
|------|----------------|
| `arrocha fase 1` | chrome da Lista + área + hábito existe/apagado |
| `arrocha fase 2` | kit de composição + varredura |
| `arrocha fase 3` | first fold de Finanças |
| `arrocha fase 4` | código de sync + contrato Midas. Key só com `liga o Pierre na Praxis` |
| `liga o Pierre na Praxis` | gate do secret no `praxis-api` (backup antes) |

---

## 9. Riscos

- **Fase 1 larga demais no `HabitsTasks.jsx` (1775 linhas).** Gemini deve só remover chrome, não reescrever lentes. Se o diff tocar `TaskBoard` / `TaskWeek` / `taskLenses.js` sem necessidade, A.N.A. recusa o spawn.
- **Arquivar tarefa vs apagar hábito.** Não misturar. Bulk Arquivar de tarefa fica.
- **Hábitos pausados invisíveis.** Listar no ship. Não hard-delete no escuro.
- **Fase 2 virar polish aleatório.** Só o contrato de composição. Sem nova paleta, sem partícula.
- **Fase 3 inflar nav.** 7 tabs já são o teto.
- **Fase 4 sem gate.** Código 503 ok. Key no unit sem a frase do João = não.

---

## 10. Verificação (todas as fases)

```bash
cd /root/.hermes/workspaces/apps/praxis
npm run prepush:check
# se api/: node --test api/finance.test.mjs   # fase 4
# ship: A.N.A. depois do QA visual
```

Visual: `dopraxis.vercel.app/habitos-tarefas`, `/ideias`, `/compras`, `/financas`. Screenshot não prova clique na área nem o clip. A.N.A. abre no Desktop.

---

## 11. Relação com docs antigos

| Doc | Papel agora |
|-----|-------------|
| `PLANO-IMPLEMENTACAO-PRAXIS.md` | ondas 1–24 fechadas. Não reabrir. |
| `PLANO-PRAXIS-HABITOS-TAREFAS-LENTES.md` | lentes ficam. Este plano só tira chrome em volta. |
| `PLANO-PRAXIS-FINANCAS.md` | 0–6 shipped. Este plano consome 7+9 como **fase 4** e adiciona composição (fase 3). |
| `HABITS-LIFECYCLE.md` | API `paused`/`archived` pode ficar. UI desta frente não usa. |
| `ONDE-ESTAMOS.md` | atualizar **depois** do git/prod de cada fase, não antes. |
