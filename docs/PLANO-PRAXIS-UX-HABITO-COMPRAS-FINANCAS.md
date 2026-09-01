# Plano / PRD — Quantidade, Não rolou, Compras, Finanças humana

**Data:** 2026-09-01
**Status:** plano. João autorizou: escrever o PRD e em seguida implementar fase a fase até `main`.
**Produto:** quatro frentes de uso diário. Não é onda nova 1–24. Não reabre operação limpa (chrome da Lista, `PraxisBand`, first fold de Finanças, Pierre no servidor).
**URL viva:** https://dopraxis.vercel.app
**Agentes:** A.N.A. orquestra, QA visual e shipa. Executor: **Gemini 3.7 flash high (`agy`)**, **uma fase por spawn**.
**Como pede:** este turno já autoriza a escada `fase 1 → 5` até a main. Se quiser parar: `para na fase N`.

---

## 1. Por que existe

João mandou prints de 01/09 e apontou atrito, não feature nova.

1. **Quantidade de hábito** (sono 7 h, água 2 L) abre `window.prompt` nativo do Chrome. Feio, fora da pele Praxis, fácil de cancelar sem querer.
2. **Não rolou** exige sheet com “nome honesto”, frases prontas e chips Tempo/Energia/Contexto/Outro. João não quer escolher motivo. Um toque registra. Motivo não muda o dia.
3. **Compras:** nomes dos itens (lâmina, LED, tripé, paralelo) colados na linha de cima do card. Não estão no centro óptico do retângulo. Layout solto.
4. **Finanças** continua fraca mesmo depois da operação limpa. Caixa herói em R$ 0,00, texto do Pierre despejado no subtítulo, auto-invest de R$ 1.882 só numa nota, gráfico com duas barras, reservas zeradas. Não conta o mês em português.

Operação limpa (`PLANO-PRAXIS-OPERACAO-LIMPA.md`) já tirou chrome da Lista, alinhou heading/filtro e ligou Pierre no servidor. Este plano ataca o que os prints de 01/09 ainda mostram.

---

## 2. Promessa e veredito

| | |
|---|---|
| **Problema** | Marcar água/sono parece site de 2008. Pular o dia vira terapia. Card de compra parece desleixado. Dinheiro mostra zero e um parágrafo. |
| **Promessa** | Tocar o hábito quantitativo abre um diálogo Praxis com +/−. Tocar Não rolou fecha o dia. Card de compra tem ar. Abrir Finanças e em 10 s ouvir: quanto tem livre, quanto está investido, o que vence. |
| **Veredito** | Zero `window.prompt` no `src/`. Skip em um clique. Cards de Compras com padding simétrico e título `items-center`. `/financas` não usa `snapshot_label` como subtítulo. Auto-invest aparece como número, não como recado. |

---

## 3. O que os prints travam (não reabrir)

### 3.1 Quantidade

Causa: `src/pages/HabitsTasks.jsx` `handleToggleHabit` (por volta da linha 681) chama `window.prompt`. Só essa página. No Hoje (`Dashboard.jsx` → `TodayHabits` → `CompoundHabitsWidget`) o mesmo hábito marca feito **sem** valor. Duas mentiras.

Contrato:

- Um componente só: `src/components/habits-tasks/QuantLogSheet.jsx`.
- Superfície: `Dialog` Praxis (`@/components/ui/dialog`), não `window.prompt`, não `alert`, não `confirm`.
- Conteúdo: título do hábito, meta (`7 h` / `2 L`), número grande, botões − e +, input numérico, Cancelar, Registrar.
- Default do número: log de hoje + passo, ou 1 se não houver log. Passo: `1` (hora, litro, copo). Sem fração no stepper; input aceita decimal (`1.5`).
- Registrar manda `habitLogs.create` com `{ value, completed: value >= target ? 1 : 1, outcome: 'done' }`. Valor parcial ainda é **feito do dia** (João registrou). Não inventar outcome novo.
- Cancelar não grava.
- Ligar em: `HabitsTasks.jsx`, `TodayHabits.jsx` / `Dashboard.jsx`, `CompoundHabitsWidget.jsx` (passo quantitativo).
- Unidade vem de `habit.unit` (já existe). Sem unidade, só o número + meta.

### 3.2 Não rolou

Causa: `SkipHabitSheet.jsx` é o caminho obrigatório. Chip “Não rolou” em `TodayHabits` e menu em `HabitsTasks` **abrem o sheet**. João: “colocar simplesmente não rolou”.

Contrato:

- Clique em **Não rolou** = `POST` skip na hora (`outcome: skipped`, sem `note`, sem `skip_reason`).
- Sheet **não** abre nesse clique.
- Depois de skipped, o chip vira **Desfazer**. Opcional: link baixo “dizer por quê” que abre o sheet só para quem quiser. Default = sem texto.
- `SkipHabitSheet` permanece no código para editar nota depois. Tira as quatro frases prontas da **jornada principal**. Se o sheet abrir, fica textarea vazia + Registrar. Chips Tempo/Energia/Contexto/Outro somem da jornada principal (API `skip_reason` pode ficar).
- Streak gelo, sem XP, copy “Não rolou”: intactos. Não reabrir `PLANO-PRAXIS-OUTCOME-NAO-ROLOU.md`.
- Superfícies: `TodayHabits`, `HabitsTasks` (`HabitRowMenu` / chip), `CompoundHabitsWidget`, `HabitGridRow` se ainda abrir sheet no skip.

### 3.3 Compras (classe do card, não do heading)

Operação limpa fase 2 já pôs `PraxisBand` (“Sua lista” + filtros numa faixa). O print de 01/09 é **dentro do card**:

```
CardContent.space-y-2.p-4
  flex.items-start  ← título cola no topo; badge puxa a row pra cima
  notes
  botões
```

Contrato do item (`Compras.jsx` `<li><Card>`):

1. Padding interno simétrico: `p-5` (não `p-4` + título colado).
2. Row título + badge: `items-center` (não `items-start`). Título `leading-snug`, badge não empurra o nome pra cima.
3. `min-h` compartilhada entre cards da mesma coluna (o curto “LED para o carro” não fica uma pílula achatada ao lado do “Paralelo baixo…”).
4. Empty de longo prazo: mesma largura e mesmo topo de kicker (já existe). Não mexer no `PraxisBand`.
5. Botões Comprei / Pausar / lixeira numa row `items-center`, hit ≥ 36 px.

Não redesenhar a página. Não promover item a tarefa. Não orçamento.

### 3.4 Finanças humana

O que já existe e **fica**: API `/api/finance/*`, override `locked=1`, next_step, tabs Agora · Dívidas · Parcelas · Assinaturas · Extrato · Gráficos · Metas, Pierre no servidor, sem Pix, sem MCP Pierre no `default`, preto + ouro.

O que os prints mostram de errado:

- `caixa` soma só `available` da conta operacional. João travou Inter em 0. Pierre viu **1.882,94 em auto-invest**. A aba herói mostra R$ 0,00 e despeja a conversa em `snapshot_label`.
- `AMOUNT_KINDS` = `available | used_limit | official_bill | projected_bill`. Não tem `invested`.
- `pierreSync.js` grava saldo como `available`. Auto-invest vira recado.
- Gráfico de 30d com dois pontos não conta o mês.
- Subtítulo do `PageHero` usa `snapshot_label` (“Mapa da conversa (01/09 Pierre: …)”). Isso é lixo de chat, não copy.

Contrato:

1. **Números estruturados, não parágrafo.** Auto-invest / CDB / “em investimento” do Pierre vira `amount_kind: invested` na mesma conta (ou conta `kind: investment` se o Pierre mandar instituição+produto separado). Overview passa a expor `caixa` (available operacional), `invested` (soma invested ativo), `patrimonio_liquido_curto` = caixa + invested.
2. **Override do João vale só no kind travado.** Travar `available` em 0 **não** esconde `invested` do Pierre.
3. **Copy humana no first fold**, gerada no front a partir dos números:
   - Se caixa > 0 e invested > 0: “Livre {caixa} no Inter. Outros {invested} em auto-invest.”
   - Se caixa = 0 e invested > 0: “Caixa livre zerado. Tem {invested} em auto-invest. Não misture com o que vence.”
   - Se os dois 0: “Caixa e investimento zerados neste recorte.”
   - Sempre abaixo: o `next_step.label` que já existe.
4. **`snapshot_label` some da UI.** Pode ficar no banco pra semente velha. PageHero description vira a frase humana ou “Caixa, fila e o próximo passo.”
5. **Bloco “O banco mostrou”** (só se `last_sync.ok`): data + lista curta conta → valor → kind. Sem dump de conversa.
6. **Gráfico Agora:** categorias 30d (já em `insights.categories`) como barras horizontais, não dois ticks soltos. Tab Gráficos pode manter o diário.
7. Sem Mint, sem 13 abas, sem verde, sem Pix, sem `VITE_PIERRE_*`, sem cron novo.

---

## 4. Arquitetura travada (Finanças)

```
Pierre (Open Finance, read-only)
        │  MCP só no perfil midas
        │  REST no praxis-api
        ▼
praxis-api SQLite = fonte da ABA
        ▲
 João no app (locked por amount_kind)   A.N.A. e Midas (mesma API)
```

Não recolocar Pierre MCP no `default`. Não esmagar `locked=1`. App do banco = juiz pra pagar.

---

## 5. Escopo

### In

- Dialog de quantidade nas três superfícies de hábito.
- Skip em um toque.
- Ritmo interno do card de Compras.
- `invested` no schema/API/sync + first fold humano + gráfico de categorias.

### Out

- Lentes Lista/Quadro/Semana.
- Chrome já removido na operação limpa.
- Jota Fit, Nutrição, Continuidade, voz.
- Pix, boleto, pagar pelo app.
- Multi-usuário, investimento como produto (corretora, alocação, tesouro direto completo). Auto-invest do Inter é **saldo**, não módulo novo.
- Renomear `FORJA_*` / path / systemd.
- DNS `dopraxis.app`.
- Key Pierre no unit sem a frase `liga o Pierre na Praxis` (já ligada se o sync de 01/09 rodou; este plano **não** mexe no secret).

---

## 6. Fases (uma por vez, Gemini)

Cada fase: testes do recorte → `npm run prepush:check` → A.N.A. prova visual (Desktop 1280 e 390) → A.N.A. push `main` (CLI **não** dá push/deploy) → `ship:api` + restart `praxis-api` se API → `deploy:prod` + alias `dopraxis.vercel.app` → `smoke:prod` no path tocado.

CLI: branch `ana/ux-habito-fase-N`. Commit no branch. Sem push, sem secret, sem “melhorar” Jota Fit.

### Fase 1 — Quantidade sem prompt nativo

**Objetivo:** marcar sono/água abre diálogo Praxis. Zero `window.prompt`.

**Arquivos**

- Criar: `src/components/habits-tasks/QuantLogSheet.jsx`
- Modificar: `src/pages/HabitsTasks.jsx` (`handleToggleHabit`)
- Modificar: `src/pages/Dashboard.jsx` (toggle precisa aceitar `value`)
- Modificar: `src/components/dashboard/TodayHabits.jsx`
- Modificar: `src/components/dashboard/CompoundHabitsWidget.jsx` se o passo for quantitativo
- Teste: se houver teste de front de hábito, cobrir “quant abre dialog”. Sem Cypress novo obrigatório. Gate: `rg "window\\.prompt" src` vazio.

**Fazer**

1. `QuantLogSheet` com a API: `{ open, onOpenChange, habit, currentValue, onConfirm }`.
2. Trocar o `window.prompt` por abrir o sheet.
3. Hoje/Dashboard: se `isQuantitativeHabit(habit)` e não está done, abrir o sheet em vez de create sem valor.
4. Unidade visível. Meta visível. −/+. Escape/Cancelar não grava.

**Não fazer:** skip, Compras, Finanças.

**Done-when**

- `rg -n "window\\.prompt" src` → zero hits (exceto PWA `deferred.prompt()` em `PwaInstallBanner.jsx`, que **não** se mexe).
- Print reproduzido (sono 7 h, água 2 L) abre Dialog Praxis, não o card “dopraxis.vercel.app diz”.
- Cancelar deixa o hábito aberto.
- Registrar 1 L em meta 2 L grava `value: 1` e marca o dia.

### Fase 2 — Não rolou em um toque

**Objetivo:** o chip registra. Sem interrogatório.

**Arquivos**

- `src/components/dashboard/TodayHabits.jsx`
- `src/pages/HabitsTasks.jsx` (`onNaoRolou`)
- `src/components/dashboard/CompoundHabitsWidget.jsx`
- `src/components/habits-tasks/HabitGridRow.jsx` se ainda abre sheet no X
- `src/components/habits-tasks/SkipHabitSheet.jsx` (jornada opcional)
- `api/day-outcome.test.mjs` continua passando (skip sem note já é válido)

**Fazer**

1. Handler `onSkipHabit(id)` no clique do chip, direto.
2. Sheet só via “dizer por quê” pós-skip, ou menu ⋯ “Nomear”.
3. Remover as quatro `HONEST_PHRASES` da jornada default. Sheet, se abrir, é textarea + botão.
4. Remover chips Tempo/Energia/Contexto/Outro da UI (não da API).

**Não fazer:** quantidade, Compras, Finanças.

**Done-when**

- Um clique em Não rolou fecha o hábito (gelo, sem XP) sem modal.
- Nenhum print novo do sheet laranja de frases ao pular o dia.
- Desfazer continua no chip/menu.
- `node api/day-outcome.test.mjs` passa.

### Fase 3 — Cards de Compras

**Objetivo:** o nome do item respira no retângulo.

**Arquivos**

- `src/pages/Compras.jsx` (bloco do `<Card>` do item, ~linhas 179–244)

**Fazer**

1. Padding, `items-center` na row do título, `min-h` do card, botões alinhados.
2. Badge “Na lista” não sobe o título.
3. Colunas continuam `items-stretch`. Empty longo prazo intocado além de herdar o mesmo kicker.

**Não fazer:** heading/filtro (`PraxisBand` já está certo). Finanças. Hábitos.

**Done-when**

- Screenshot 1280: “Lâmina de barbear boa”, “LED para o carro”, “Tripé…”, “Paralelo baixo…” com o título no centro óptico da faixa superior do card, não colado na borda.
- 390px: botões não quebram em três linhas tortas; hit ok.

### Fase 4 — Finanças: invested de verdade

**Objetivo:** o número do Pierre não mora num recado. Overview conta caixa e investido separados.

**Arquivos**

- `api/finance.js` (`AMOUNT_KINDS` + `getOverview` + `createBalance`)
- `api/pierreSync.js` (mapear auto-invest / investment / invested / CDB / “não disponível” de conta corrente vs investimento)
- `api/finance.test.mjs`
- Sem UI grande nesta fase (um campo a mais no JSON basta).

**Fazer**

1. Incluir `'invested'` em `AMOUNT_KINDS`.
2. Parser Pierre: se o payload/conta/nota indicar investimento (auto-invest, invested, investment, CDB, “aplicação”), gravar `amount_kind: 'invested'`. Checking disponível continua `available`.
3. `getOverview`: `invested` = soma dos últimos `invested` de contas ativas. `caixa` **não** inclui invested.
4. Locked `available` não bloqueia upsert de `invested` (kinds independentes). Teste: João locked available=0, Pierre manda 1882 invested → overview.caixa=0, overview.invested=1882.
5. Não escrever conversa em `snapshot_label`. Sync continua limpando o label.

**Não fazer:** redesenhar `Financas.jsx` (fase 5). Secret. Cron.

**Done-when**

- `node --test api/finance.test.mjs` cobre o caso locked available + invested Pierre.
- `GET /api/finance/overview` devolve `invested` numérico.
- Sem key: sync ainda 503.

### Fase 5 — Finanças humana na tela

**Objetivo:** a aba fala como gente e mostra o mês.

**Arquivos**

- `src/pages/Financas.jsx` (PageHero, first fold, gráfico Agora)
- `src/lib/finance.js` se precisar de helper de frase
- Sem schema novo.

**Fazer**

1. PageHero description = frase humana da §3.4. Zero `snapshot_label` na UI.
2. Card esquerdo: caixa grande + linha “em auto-invest {invested}” se > 0. Entradas/saídas 30d ficam.
3. Card direito no Agora: barras de `insights.categories` (top 5). Empty: “Sem movimento neste recorte”.
4. Bloco “O banco mostrou” se `last_sync.ok`, abaixo das contas, lista curta.
5. Chip “Foto …” some.

**Não fazer:** abas novas, Pix, cork board, verde.

**Done-when**

- 1280: first fold conta caixa e investido. next_step intacto.
- Subtítulo do hero não contém “Mapa da conversa” nem “Pierre:”.
- 390px: cards empilham, nav scroll-x, hit 44px.
- Anônimo `/api/finance/overview` continua 401.

---

## 7. Executor

| | |
|---|---|
| Modelo | `gemini-3.7-flash-high` via `agy` |
| Ritmo | 1 fase / spawn. A.N.A. QA + ship. Só então a próxima. |
| Brief | este arquivo + fase N + paths + done-when + recusas |
| Git | `ana/ux-habito-fase-N`. Commit no branch. Sem push/deploy. |
| Proibido no CLI | secret, `VITE_PIERRE_*`, cron, MCP no default, Jota Fit, Continuidade, reescrever lentes |

---

## 8. Riscos

- **Fase 1:** `HabitsTasks.jsx` é grande. Gemini só troca o prompt e pluga o sheet. Diff em Quadro/Semana = recusar.
- **Fase 2:** não apagar a API de note. Só parar de obrigar.
- **Fase 3:** não “centralizar” o texto com `text-center` no card inteiro. Centro óptico = padding + `items-center` na row.
- **Fase 4:** não tratar auto-invest como caixa livre. João mistura e paga o Santander com dinheiro que não deve mexer.
- **Fase 5:** não voltar `snapshot_label` pro hero. Se o Midas ainda escrever lá, a UI ignora.

---

## 9. Relação com docs antigos

| Doc | Papel agora |
|-----|-------------|
| `PLANO-PRAXIS-OPERACAO-LIMPA.md` | 1–4 shipped. Não reabrir chrome/heading. |
| `PLANO-PRAXIS-FINANCAS.md` | 0–6 + sync no ar. Este plano acrescenta `invested` e copy humana. |
| `PLANO-PRAXIS-OUTCOME-NAO-ROLOU.md` | skip/gelo ficam. Este plano tira o interrogatório. |
| `HABITS-LIFECYCLE.md` | quantitativo já existe (`target_value`, `unit`). Só a UI muda. |
| `ONDE-ESTAMOS.md` | atualizar depois do git/prod de cada fase. |

---

## 10. Verificação

```bash
cd /root/.hermes/workspaces/apps/praxis
npm run prepush:check
# fase 2: node api/day-outcome.test.mjs
# fase 4: node --test api/finance.test.mjs
```

Visual: `/habitos-tarefas` (sono + água), Hoje (mesmo), `/compras`, `/financas`. Screenshot não prova o Dialog. A.N.A. abre no Desktop.
