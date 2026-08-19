# Plano / PRD — Finanças dentro da Praxis

**Data:** 2026-08-12  
**Status:** plano (sem código ainda)  
**Produto:** módulo **Finanças** na Praxis (não app paralelo, não vira o Midas)  
**URL canônica (quando existir):** `https://dopraxis.vercel.app/financas`  
**Agentes:** A.N.A. orquestra/shipa. Midas e A.N.A. **leem e escrevem** a mesma API. Pierre (Open Finance) é fonte **read-only** no servidor.  
**Não-alvo:** clonar Mint/Organizze; pagar Pix pelo app; colocar chave Pierre no frontend.

---

## 1. Por que existe

João precisa **ver o mês inteiro num lugar só** — caixa, dívida, assinatura, extrato, gráfico e meta — sem recontar no chat e sem abrir 6 apps de banco.

A conversa de 12/08 (Santander 814, saldo Inter, carro dia 23, corte de assinaturas, bola de neve MP/Nubank) mostrou o problema real:

1. o número vive espalhado (app + Pierre + memória do chat);
2. Pierre **não é juiz** (Nubank/PicPay fora; fatura oficial = app);
3. pagar duas vezes é o risco nº 1;
4. o próximo passo tem que ser **um**, não uma planilha.

A Praxis já é o cockpit de execução. Finanças entra como **ferramenta na sidebar**, no mesmo login, com a mesma cara.

---

## 2. Problema e promessa

| | |
|---|---|
| **Problema** | Caixa, fatura, assinatura e “o que pagar agora” ficam no chat. Midas vê o banco; João não vê um painel. |
| **Promessa** | Abrir `/financas` e em 10 s saber: quanto tem, o que vence, o que sangra todo mês, o monstro da vez, o próximo passo único. |
| **Veredito de sucesso** | João usa a aba no celular pra decidir pagamento (não pra “olhar gráfico”). Midas atualiza a foto sem o João virar pombo-correio. |

---

## 3. Arquitetura travada

```
Pierre (Open Finance, read-only)
        │
        │  PIERRE_API_KEY só no servidor / secret
        ▼
praxis-api  ── SQLite (fonte da ABA)
        ▲
        │  Bearer FORJA_API_KEY  ou  cookie praxis_sid
        │
   ┌────┴────┐
   │         │
 A.N.A.    Midas     João no app (corrige o que Pierre errou)
```

### Decisões (não reabrir sem pedido)

1. **A aba mora na Praxis.** Midas não ganha outro dashboard paralelo. O desenho antigo em `midas-brain-core/dashboard/README.md` vira **esta** tela.
2. **Fonte da aba = SQLite da Praxis.** Pierre alimenta. João corrige. App do banco vence Pierre quando o valor não é oficial.
3. **Pierre não entra no browser.** Zero `VITE_PIERRE_*`. Sync = `POST /api/finance/sync` no `praxis-api`.
4. **A.N.A. e Midas têm o mesmo acesso à aba** via `FORJA_API_KEY`. Não precisa Pierre MCP no perfil `default`. MCP Pierre continua no perfil `midas` (dieta MCP). A.N.A. sincroniza pelo backend da Praxis ou REST Pierre no servidor, nunca colando chave no chat.
5. **Override do João ganha** no campo marcado. Sync posterior **não esmaga** campo com `locked=1` / `source=joao`.
6. **Read-only de dinheiro.** App e agentes **não** disparam Pix, boleto, pagamento, alteração de limite.
7. **Nav = secondary.** `/financas` na sidebar, depois de Compras. **Não** no primary Hoje · Lista · Falar · Revisar.
8. **Nubank e PicPay** começam manuais (Pierre não cobre). Carro, pai, óculos, tio = manuais.
9. **Fatura a pagar ≠ limite usado.** UI rotula: `oficial` / `projeção` / `exposição` / `João`.
10. **Sem cron novo** até João mandar. Sync sob botão na aba + chamada de agente.

---

## 4. Foto de domínio (conversa 12/08)

Números abaixo são **semente da conversa**, não saldo vivo. A aba sobe com eles datados; o primeiro sync/correção atualiza.

### Caixa (na hora)

- Inter operacional: **R$ 1.103,62**
- Tio esperado: **R$ 250** (antes do dia 23)
- Carro vence **23**: **R$ 1.270**
- Viver até o 23: ~**R$ 600**
- Folga sem o tio: **não fecha** (faltam ~166 pro carro)

### Já saiu da urgência nesta rodada

Santander jul+ago · PicPay · mínimos Inter e C6 · contador/IR

### Dívidas que restam (fila)

| O quê | ~Valor | Tipo | Fila |
|-------|--------|------|------|
| Mercado Pago | 3.782 | cartão bloqueado, juro alto | 1º monstro |
| Nubank | 3.227 | cartão bloqueado, juro alto | 2º |
| Inter resto | 2.162 | mínimo já pago | 3º |
| C6 resto | 1.371 | mínimo já pago | 3º |
| Carro | 1.270 | parcela, vence 23 | **antes de tudo** quando o tio cair |
| Pai consórcio | 1.000/mês | recorrente, pode esperar | depois |
| Pai celular | 400/mês | pode esperar | depois |

Cartões abertos ≈ **R$ 10.543**. + carro do mês ≈ **11.813**. + celular do pai (8×400) ≈ **15.013**. Consórcio não soma como estoque.

### Assinaturas vivas (confirmadas pelo João)

**Trabalho (~221–235)**  
ChatGPT ~100 · WhatsApp Business 54,90 · Uazapi ~30–44 · Google Workspace ~36

**Pessoal (~188)**  
Meli+ ~75 (manter) · iCloud 66,90 · TIM ~46

**Total ~410–425/mês**

**Fora da mensalidade:** Kiwify parou · Grok/Claude/Notion/Eleven/Selfit/1Password cancelados · Bot Conversa = parcela residual · Jim = prestador (barbearia), não “assinatura de app” · Jocelular ~100 no MP ainda a cravar

### Regras de bolso desta fase (viram política na aba)

- Não pixar de novo o que já saiu.
- Pagamento de fatura **não** aparece como saldo na conta do cartão.
- Avalanche: extra vai no monstro mais caro (MP → Nubank). Não espalhar R$ 200 em cada um.
- Zero compra nova em MP / Nubank / PicPay / Santander. C6 e Inter quase congelados.
- Sem parcelamento de fatura tipo 15% a.m.
- Pierre = lanterna. App = juiz pra pagar.

---

## 5. Princípios de produto

1. **Próximo passo único no topo.** Não um dashboard de 12 KPIs.
2. **Visual primeiro.** Números grandes, fila, barras. Tabela densa só no extrato.
3. **Trabalho ≠ pessoal.** Assinatura e (depois) gasto separados.
4. **Fonte visível em todo número.** `João` / `Pierre` / `oficial` / `projeção`.
5. **Copy humana.** Nada de “cockpit”, “preset”, “exposure”, “50 da API”.
6. **Não poluir o Hoje.** 1 card fino: caixa + 1 vencimento + link “Finanças”.
7. **Marca Praxis.** Preto + dourado, `PraxisPage`, `StatTile`, empty kit. Sem verde fintech.
8. **Ship por fase.** Cada fase fecha com teste + `prepush:check` + push + `ship:api` se API + `deploy:prod` + alias `dopraxis.vercel.app`.

---

## 6. Escopo

### In scope (aba “completa” = estas 6 superfícies)

1. **Caixa** — contas, saldo, o que está reservado (carro / viver), folga.
2. **Dívidas** — fila, juro relativo, mínimo vs resto, status (limpo / mínimo pago / monstro / espera).
3. **Assinaturas** — trabalho vs pessoal, mensal, cancelar/manter, próximo cobro.
4. **Extrato** — lançamentos (Pierre + manual), filtro conta/cartão/período/categoria, busca.
5. **Gráficos** — 30d / mês: saídas, categorias, cartão vs débito, tendência simples.
6. **Metas** — alvo (quitar MP, reserva, óculos → MP), progresso, vínculo com dívida.

### Out of scope (proposital)

- Pix, boleto, TED, pagar fatura pelo Praxis.
- Open Finance no cliente (browser).
- Investimento / corretora / BB PJ como motor do MVP.
- Apostas (isso é Midas-only no chat).
- Multi-usuário / família.
- Cron de sync sem ordem explícita.
- Dump de extrato no Telegram.
- Reativar Pierre MCP no perfil `default`.
- Renomear `FORJA_*` / systemd.

---

## 7. UX alvo

Layout `PraxisPage` + `praxis-page`. Mobile 390px first. Números `tabular-nums`.

### 7.1 First fold (`/financas`)

1. **Linha de decisão** (não um hero poético)  
   Ex.: `Inter 1.103 · falta 166 pro carro · não pague MP agora`  
   1 CTA contextual: `Marcar carro pago` / `Atualizar saldo` / `Sincronizar bancos`.
2. **4 tiles**  
   Caixa · Dívidas abertas · Assinaturas/mês · Próximo vencimento (data + valor).
3. **Chips de aba:** Agora · Dívidas · Assinaturas · Extrato · Gráficos · Metas.

### 7.2 Agora

- Contas com saldo (Inter em destaque).
- Reserva mental: carro / viver / livre (editável).
- Alerta se caixa < reserva.
- “Última sync” + fonte.

### 7.3 Dívidas

- Lista por fila (sort `priority`).
- Cada card: nome, valor, status, vence, mínimo, resto, juro (alto/médio/baixo), fonte.
- Barra do total (MP+Nubank+Inter+C6).
- Ação: `Paguei` (pede valor + data + de qual conta) → baixa a dívida e lança no extrato **sem** mover dinheiro de verdade.
- Não esconder Nubank porque o Pierre não vê.

### 7.4 Assinaturas

- Dois blocos: Trabalho / Pessoal.
- Linha: nome, valor, cartão, dia, status (ativa / cancelada / parcela / serviço).
- Total de cada bloco + geral.
- Jim / barbeiro = tipo `service`, não mistura com ChatGPT.
- Cancelada continua visível 1 ciclo (“eco”) e some depois.

### 7.5 Extrato

- Lista reversa, agrupada por dia.
- Filtros: 7d / 30d / mês · conta · cartão · categoria · busca.
- Badge `interno` em transferência entre contas (não conta como gasto).
- Toque = detalhe + “isso é assinatura?” / “isso é dívida?”.

### 7.6 Gráficos

- Pizza ou barras horizontais: top categorias 30d.
- Linha: saídas por dia (30d).
- Comparar cartão vs conta.
- Sem 3D, sem 8 cores aleatórias. Ouro + neutros + 1 alerta.

### 7.7 Metas

- Lista simples: título, alvo R$, atual, prazo, vínculo (`debt_id` opcional).
- Progresso em barra.
- Seed: `Quitar Mercado Pago` · `Carro em dia` · `Óculos → MP`.

### 7.8 Hoje (`/`)

Card único, sempre aberto, abaixo do bloco de corpo (não acima do Agora de tarefas):

- `Caixa R$ X` · `Vence: carro 23 · 1.270`
- Link texto `Abrir Finanças`
- Sem gráfico no Hoje.

### 7.9 Empty / erro / stale

- Sem Pierre key no servidor: empty honesto + “cole o sync quando a chave estiver no `praxis-api`”.
- Sync falhou: toast Sonner + última foto boa.
- Número não oficial: chip `confere no app`.

---

## 8. Modelo de dados (SQLite)

Padrão Compras/Nutrição: `api/finance.js` + `initFinanceSchema(db)` no boot de `api/server.js`.

Ids = uuid texto. Datas = `YYYY-MM-DD`. Dinheiro = real em BRL. Timezone de negócio = `America/Fortaleza`.

### 8.1 `finance_accounts`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| name | text | “Inter”, “C6”, “Mercado Pago” |
| kind | text | `checking` `prepaid` `credit` `cash` `other` |
| institution | text | inter / c6 / mp / santander / nubank / picpay / manual |
| mask | text | final 4, opcional |
| pierre_account_id | text | nullable |
| is_operational | int | 1 = caixa do dia (Inter) |
| status | text | `active` / `archived` |
| sort_order | int | |
| created_at / updated_at | text | |

### 8.2 `finance_balances`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| account_id | text FK | |
| as_of | text | data |
| amount | real | saldo conta **ou** exposição do cartão |
| amount_kind | text | `available` `used_limit` `official_bill` `projected_bill` |
| source | text | `pierre` `joao` `agent` `seed` |
| locked | int | 1 = sync não sobrescreve |
| note | text | |
| created_at | text | |

Último `as_of` + `amount_kind` por conta = o que a UI mostra.

### 8.3 `finance_debts`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| title | text | “Mercado Pago”, “Carro” |
| account_id | text | nullable |
| kind | text | `card` `loan` `installment` `family` `other` |
| balance | real | |
| min_payment | real | nullable |
| apr_label | text | `high` `medium` `low` `none` |
| due_day | int | nullable |
| due_date | text | próximo vencimento conhecido |
| status | text | `open` `min_paid` `clean` `waiting` `blocked` |
| queue | int | 1 = primeiro |
| source / locked / note | | igual balances |
| created_at / updated_at | text | |

Pagamento: não apaga de cara. Cria `finance_payments` e baixa `balance`.

### 8.4 `finance_payments`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| debt_id | text FK | |
| account_id | text | de onde saiu (caixa) |
| amount | real | |
| paid_on | text | |
| method | text | `pix` `boleto` `debit` `other` |
| confirmed | int | 1 = João viu cair |
| note | text | |
| created_at | text | |

### 8.5 `finance_subscriptions`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| name | text | |
| lane | text | `work` `personal` |
| amount | real | |
| cadence | text | `monthly` `yearly` `installment` `service` |
| charge_day | int | |
| account_id | text | cartão/conta |
| status | text | `active` `keep` `cancel` `cancelled` `installment` |
| next_charge | text | |
| vendor_hint | text | “JIM.COM * JOSE” |
| source / locked / note | | |
| created_at / updated_at | text | |

### 8.6 `finance_transactions`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| pierre_tx_id | text | unique nullable |
| account_id | text | |
| posted_on | text | |
| amount | real | sinal: saída negativa |
| direction | text | `inflow` `outflow` `internal` |
| raw_description | text | |
| merchant | text | |
| category | text | ver §8.9 |
| subscription_id / debt_id | text | nullable |
| source | text | `pierre` `joao` `agent` `seed` |
| created_at | text | |

### 8.7 `finance_goals`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| title | text | |
| target_amount | real | |
| current_amount | real | |
| due_date | text | |
| debt_id | text | nullable |
| status | text | `active` `done` `paused` |
| created_at / updated_at | text | |

**Não** reusar `goals` da Praxis (execução de vida). Meta financeira é outra tabela.

### 8.8 `finance_sync_log`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | text PK | |
| started_at / finished_at | text | |
| ok | int | |
| accounts_n / tx_n | int | |
| error | text | sem segredo |
| actor | text | `joao` `ana` `midas` `system` |

### 8.9 Categorias iniciais

Moradia · Alimentação · Mercado · Transporte · Saúde · Educação · Fitness · Assinaturas · Impostos · Dívidas · Lazer · Trabalho · Família · Reserva · Transferência · Receita · Outros

Transferência interna **não** entra em gráfico de gasto.

---

## 9. API

Montar em `api/routes/finance.js` + `app.use('/api/finance', …)` em `api/server.js`.  
Auth igual ao resto: cookie sessão **ou** `Authorization: Bearer FORJA_API_KEY`.

| Método | Path | Função |
|--------|------|--------|
| GET | `/api/finance/overview` | first fold: caixa, total dívidas, assinaturas/mês, próximo vencimento, next_step, last_sync |
| GET/POST | `/api/finance/accounts` | lista / cria |
| PATCH | `/api/finance/accounts/:id` | |
| GET/POST | `/api/finance/balances` | query `account_id` |
| GET/POST/PATCH | `/api/finance/debts` | |
| POST | `/api/finance/debts/:id/pay` | body `{amount, paid_on, account_id, method, note}` |
| GET/POST/PATCH/DELETE | `/api/finance/subscriptions` | query `lane` · DELETE `/:id` some da lista |
| GET/POST/PATCH/DELETE | `/api/finance/installments` | compras parceladas; **não** entra em `cards_total` |
| GET | `/api/finance/transactions` | `from,to,account_id,category,q,limit` |
| POST/PATCH | `/api/finance/transactions` | correção manual |
| GET | `/api/finance/insights` | totais 7d/30d, por categoria, por instituição |
| GET/POST/PATCH | `/api/finance/goals` | |
| POST | `/api/finance/sync` | puxa Pierre no servidor; não bloqueia se key ausente (503 claro) |
| GET | `/api/finance/sync/last` | último log |

Envelope: **array direto** nas listas (padrão tasks/purchases). Overview e insights = objeto.

Validação: valor finito, data `YYYY-MM-DD`, enums fechados. 400 com `{error}` curto.

---

## 10. Sync Pierre (servidor)

Arquivo: `api/pierreSync.js`.

1. Lê `PIERRE_API_KEY` de env / `/root/.hermes/secrets/` **já usado pelo Midas**. Nunca loga a key.
2. REST (não MCP) em `https://www.pierre.finance/tools/api/…`:
   - `get-accounts` → upsert `finance_accounts`
   - `get-balance` → `finance_balances` `available` (só BANK)
   - `get-bill` / bill summary → `official_bill` só se flag oficial/exata; senão `projected_bill`
   - `get-transactions` janela 30d → upsert por `pierre_tx_id`
   - `get-installments` → atualiza residual das dívidas de cartão **sem** inventar Nubank
3. **Não toca** linha com `locked=1` ou `source=joao`.
4. Instituições fora do Pierre (Nubank, PicPay, carro, pai) ficam como estão.
5. Timeout curto, erro vira `finance_sync_log.ok=0`.
6. Se a key não existir: 503 `{error:'pierre_not_configured'}` e a aba segue com seed/manual.

**Gate de secret:** só ligar a key no `praxis-api` com backup + OK explícito do João (regra SOUL). Até lá, a aba vive de seed + correção manual + POST de agente.

---

## 11. Contrato dos agentes

Skill nova (depois do ship da fase 0–2): `praxis-finance-ops` no perfil default **e** um ponteiro na skill `midas-pierre-ops`.

Quando João falar de dinheiro no chat:

1. Ler `GET /api/finance/overview` **antes** de chutar saldo.
2. Se o app do banco divergir: `PATCH` com `source=joao` + `locked=1`.
3. Snapshot semanal do Midas: depois do Pierre, **escrever** overview na Praxis (não só falar no Telegram).
4. A.N.A. **não** vira Midas: não aconselha investimento/aposta; orquestra a aba e o ship.
5. Proibido colar extrato cru no Telegram.

---

## 12. Seed da conversa (fase 1)

Script `api/financeSeed.js` (idempotente, só se tabelas vazias **ou** `?force=1` de agente):

- Contas: Inter (operational), C6, Mercado Pago, Santander, Nubank, PicPay, Carro, Pai.
- Balance Inter `1103.62` em `2026-08-12` source=`seed`.
- Dívidas da tabela §4.
- Assinaturas confirmadas §4.
- Meta: Quitar MP 3782 · Carro em dia 1270 · reserva 0.
- `finance_sync_log` seed com nota “foto da conversa 2026-08-12”.

UI mostra chip `foto 12/08` até a primeira correção ou sync.

---

## 13. Fases (arrocha uma por vez)

Cada fase: teste API → `prepush:check` → push `main` → `ship:api` + restart `praxis-api` se API → `deploy:prod` + alias `dopraxis.vercel.app` → smoke do path novo.

### Fase 0 — Esqueleto

- `initFinanceSchema` + testes de migrate
- rotas vazias que 401 anônimo e 200 autenticado
- nav `/financas` + página stub `PraxisPage` (“Finanças”)
- `praxisApi.finance.*` no client
- feature visível (sem flag escondida; João é single-user)

**Done-when:** `/financas` abre logado; anônimo 401 em `/api/finance/overview`.

### Fase 1 — Caixa + seed

- accounts + balances + overview.caixa
- seed da conversa
- UI Agora: tiles + contas + reservas (carro/viver/livre)

**Done-when:** overview mostra Inter 1.103,62 e “falta ~166 pro carro” com o seed.

### Fase 2 — Dívidas + pagamento registrado

- CRUD dívidas + `POST …/pay`
- UI fila + `Paguei`
- next_step no overview (carro se due ≤ 7d e caixa < valor; senão monstro #1)

**Done-when:** marcar pagamento de teste baixa balance e aparece no extrato interno.

### Fase 3 — Assinaturas

- CRUD + lane work/personal
- UI dois blocos + totais
- seed das 7 ativas

**Done-when:** totais ~221–235 trabalho e ~188 pessoal com o seed.

### Fase 4 — Extrato

- transactions list/filter/create
- UI 30d + busca
- marcar tx como assinatura/dívida

**Done-when:** filtro 30d + categoria funciona; transferência interna não soma gasto.

### Fase 5 — Gráficos

- `GET /api/finance/insights`
- barras categoria + linha 30d
- vazio honesto se não houver tx

**Done-when:** insights batem com a soma do extrato (teste).

### Fase 6 — Metas financeiras

- CRUD goals
- UI progresso
- seed 3 metas

**Done-when:** pagar dívida vinculada atualiza `current_amount` da meta.

### Fase 7 — Sync Pierre no servidor

- `pierreSync.js` + `POST /sync`
- botão na aba
- respeito a `locked`
- secret **só** com OK do João

**Done-when:** com key: contas Pierre upsertam sem apagar Nubank. sem key: 503 claro, UI intacta.

### Fase 8 — Card no Hoje + polish

- card fino no Dashboard
- empty/erro/stale
- 390px, hit 44px, Sonner, copy

**Done-when:** Hoje mostra caixa sem roubar o Agora de tarefas.

### Fase 9 — Contrato Midas/A.N.A.

- skill `praxis-finance-ops`
- playbook Midas: snapshot → POST overview
- 1 página `docs/FINANCAS.md` pra João (como usar, o que é fonte)

**Done-when:** Midas e A.N.A. atualizam a mesma linha por API (prova com curl Bearer).

### Fase 10 — Smoke + fechamento

- `api/finance.test.mjs` (padrão nutrition/purchases)
- `scripts/smoke-praxis-finance.sh`
- atualizar `ONDE-ESTAMOS.md` **depois** do git/prod (não antes)
- sem cron

**Done-when:** `npm run test:api` cobre finance; smoke prod autenticado no overview.

---

## 14. Arquivos a criar / tocar

**Criar**

- `api/finance.js` — schema + queries
- `api/financeSeed.js`
- `api/pierreSync.js`
- `api/routes/finance.js`
- `api/finance.test.mjs`
- `src/api/financeApi.js`
- `src/pages/Financas.jsx`
- `src/components/finance/*` (OverviewHero, DebtQueue, SubscriptionLane, TxList, InsightCharts, FinanceGoalList, TodayFinanceCard)
- `src/lib/finance.js` — labels, fila, nextStep
- `scripts/smoke-praxis-finance.sh`
- `docs/FINANCAS.md` (fase 9)

**Tocar**

- `api/server.js` — init + mount
- `src/api/praxisClient.js` — `finance` module + offline cache `/api/finance/overview`
- `src/lib/praxisNav.js` — item Finanças (ícone `Wallet`) depois de Compras
- `src/components/layout/MobileTopBar.jsx` — título
- `src/App.jsx` — rota
- `src/pages/Dashboard.jsx` — card (fase 8)
- `package.json` — script test se precisar

**Não tocar**

- atlas-brain, OpenClaw, systemd novo, cron novo, `VITE_*` com secret, goals de vida.

---

## 15. Testes (mínimo por fase)

Padrão `api/test-support/helpers.mjs` (`:memory:` + `buildRouteCtx`).

- overview com seed: caixa Inter, next_step contém carro
- pay debt: balance desce, payment existe, tx negativa na conta
- subscription lane totals
- insights ignoram `direction=internal`
- sync: linha `locked=1` intacta; conta Nubank sobrevive
- GET anônimo 401

UI: browser real na fase 8 (botão Paguei, filtro extrato, chip de aba). Screenshot não basta.

---

## 16. Segurança

- PIERRE_API_KEY só em arquivo 0600 / env do `praxis-api`. Nunca Git, nunca chat, nunca `VITE_`.
- Resposta de API: sem CPF, sem agência completa, sem número de cartão. `mask` = 4 dígitos.
- Sync log sem payload cru.
- Backup SQLite **antes** da primeira migrate em prod (`scripts/praxis-backup.sh`).
- Ligar a key no unit = gate explícito do João (não “já que o Midas tem”).

---

## 17. Design / orquestração

UI multi-arquivo (página + 6 componentes + nav + Hoje) = **Codex/Grok CLI**, não patch solo da A.N.A.

Antes da fase 0 de UI (quando for construir a tela de verdade):

- `shared/JOTA_DESIGN_TASTE.md` + `shared/DELEGATION_BRIEF.md`
- direção visual: first fold da aba (não 6 telas)
- crítico independente antes de “pronto”

API/schema/testes: A.N.A. pode orquestrar CLI no mesmo fluxo.

---

## 18. Como pedir

| Fala | O que acontece |
|------|----------------|
| `arrocha fase N` | só essa fase + ship |
| `arrocha 0–6` | aba completa **sem** Pierre no servidor |
| `arrocha 0–10` | módulo inteiro; fase 7 pára no gate da key se não houver OK |
| `liga o Pierre na Praxis` | só então env no `praxis-api` + fase 7 |

0–6 já entrega as 6 superfícies com a foto da conversa + correção manual. Isso é a aba **válida e organizada**. Pierre deixa de ser planilha mental e vira refresh.

---

## 19. Fora deste PRD

- Educar o João de novo sobre o Santander 814 (já resolvido na conversa).
- Cancelar assinatura por ele.
- Decidir se o tio manda os 250.
- Qualquer movimento de dinheiro.
