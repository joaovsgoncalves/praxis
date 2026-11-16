/**
 * Finanças, domínio 3: dívidas, baixas e lançamentos sobre a camada assíncrona, com o comportamento das
 * funções antigas (oráculo em test-support/oracles/finance.bcbadad.js: listDebts, createDebt, updateDebt,
 * payDebt, createTransaction, createTransactionOnce, updateTransaction, listTransactions).
 *
 * - Valores passam pela ligação e afinidade do SQLite (`sqliteRowWithReal`/`boundUpdate`), inclusive listas
 *   achatadas e os erros do driver; `COALESCE(?, coluna)` = nulo mantém a coluna.
 * - Baixa de dívida (`payDebt`) = UMA transação: dívida, baixa, lançamento ligado por `payment_id`, metas e
 *   configuração entram juntos ou não entram. Todas as leituras (dívida, chave de intenção, conta, metas,
 *   configuração, reservas de ordem) vêm antes da primeira escrita; nada externo entra na transação.
 * - Chave de intenção: mesma chave e mesmo pedido = o primeiro resultado com `replayed: true` sem gravar;
 *   outro pedido = 409 `intent_conflict`. A unicidade vale também sob concorrência (índice UNIQUE no SQLite,
 *   documento-sentinela no Firestore, mesma transação).
 * - Chave repetida (id, external_id, intent_key, pierre_tx_id) volta como o erro do SQLite, com a mesma
 *   precedência dele quando mais de uma colide.
 * - Diferença intencional (anotada no relatório): a meta ligada à dívida recebe `current_amount` em centavos
 *   exatos (`money`) e fica `done` quando a soma EM CENTAVOS alcança o alvo. A antiga gravava o ponto
 *   flutuante cru e comparava cru: 3.44 + 0.01 + 2.41 = 5.859999999999999 < 5.86 deixava a meta `active`
 *   (em ~13% das metas fechadas em duas baixas). Nunca desfaz um `done` que a antiga daria.
 */
import { randomUUID } from 'node:crypto';
import {
  DEBT_KINDS, DEBT_STATUSES, APR_LABELS, SOURCES, TX_DIRECTIONS, FINANCE_CATEGORIES,
  money, isValidDateString, todayFortaleza, parseEntity, parseIntentKey,
} from '../../finance.js';
import { bindPositional, sqliteLimit, sqliteRowWithReal } from '../../storage/sqliteSemantics.js';
import { createSettingsPlanner } from './core.js';
import {
  pick, badRequest, uniqueAs, findIn, boundUpdate, boundFilters, intentConflict, sqliteUniqueError, addDays,
} from './shared.js';

const T = (name) => [name, 'TEXT'], I = (name) => [name, 'INTEGER'], R = (name) => [name, 'REAL'];
const DEBT_INSERT = [T('id'), T('title'), T('account_id'), T('kind'), R('balance'), R('min_payment'), T('apr_label'), I('due_day'), T('due_date'), T('status'), I('queue'), T('source'), I('locked'), T('note'), T('created_at'), T('updated_at')];
const DEBT_UPDATE = [T('title'), T('account_id'), T('kind'), R('balance'), R('min_payment'), T('apr_label'), I('due_day'), T('due_date'), T('status'), I('queue'), T('source'), I('locked'), T('note'), T('updated_at')];
// Na ordem dos `?` do INSERT da antiga (a ordem decide qual erro de ligação aparece primeiro).
const PAYMENT_INSERT = [T('id'), T('debt_id'), T('account_id'), R('amount'), T('paid_on'), T('method'), T('note'), T('created_at'), T('intent_key')];
const TX_INSERT = [T('id'), T('pierre_tx_id'), T('external_id'), T('account_id'), T('posted_on'), R('amount'), T('direction'), T('raw_description'), T('merchant'), T('category'), T('subscription_id'), T('debt_id'), T('source'), T('note'), T('created_at'), T('payment_id'), T('intent_key')];
const TX_UPDATE = [T('merchant'), T('category'), T('subscription_id'), T('debt_id'), T('raw_description'), T('note')];

const debtView = (d) => ({
  ...d,
  balance: money(d.balance),
  min_payment: d.min_payment == null ? null : money(d.min_payment),
  locked: Number(d.locked) === 1,
});

export function createFinanceLedgerService({ storage, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.financeDebts || typeof storage.transaction !== 'function') throw new TypeError('finance ledger service requires storage');
  const iso = () => now().toISOString();
  const { planSettings, applySettings } = createSettingsPlanner({ now });

  // ── Dívidas ──
  async function listDebts({ status } = {}) {
    return (await storage.financeDebts.list(boundFilters([['status', Boolean(status && status !== 'all'), status]]))).map(debtView);
  }
  async function createDebt(body) {
    const title = String(body.title || '').trim();
    if (!title) throw badRequest('title required');
    const id = body.id || newId(), stamp = iso();
    const row = sqliteRowWithReal(DEBT_INSERT, [
      id, title, body.account_id || null, pick(body.kind, DEBT_KINDS, 'card'), money(body.balance),
      body.min_payment === undefined || body.min_payment === null ? null : money(body.min_payment),
      pick(body.apr_label, APR_LABELS, 'none'), Number.isFinite(Number(body.due_day)) ? Number(body.due_day) : null,
      isValidDateString(body.due_date) ? body.due_date : null, pick(body.status, DEBT_STATUSES, 'open'),
      Number.isFinite(Number(body.queue)) ? Number(body.queue) : 50, pick(body.source, SOURCES, 'joao'),
      body.locked ? 1 : 0, String(body.note || ''), stamp, stamp,
    ]);
    await uniqueAs('finance_debts', storage.transaction(async (tx) => {
      await tx.financeDebts.reserve(1);
      return tx.financeDebts.create(row);
    }));
    return (await listDebts({ status: 'all' })).find((d) => d.id === id);
  }
  async function updateDebt(id, body = {}) {
    const found = await storage.transaction(async (tx) => {
      const existing = await findIn(tx.financeDebts, id);
      if (!existing) return false;
      await tx.financeDebts.patch(id, boundUpdate(DEBT_UPDATE, [
        body.title !== undefined ? String(body.title).trim() : null,
        body.account_id !== undefined ? body.account_id : null,
        body.kind !== undefined ? pick(body.kind, DEBT_KINDS, existing.kind) : existing.kind,
        body.balance !== undefined ? money(body.balance) : existing.balance,
        body.min_payment !== undefined ? (body.min_payment === null ? null : money(body.min_payment)) : existing.min_payment,
        body.apr_label !== undefined ? pick(body.apr_label, APR_LABELS, existing.apr_label) : existing.apr_label,
        body.due_day !== undefined ? (Number.isFinite(Number(body.due_day)) ? Number(body.due_day) : null) : existing.due_day,
        body.due_date !== undefined ? (isValidDateString(body.due_date) ? body.due_date : null) : existing.due_date,
        body.status !== undefined ? pick(body.status, DEBT_STATUSES, existing.status) : existing.status,
        body.queue !== undefined ? Number(body.queue) : existing.queue,
        body.source !== undefined ? pick(body.source, SOURCES, existing.source) : existing.source,
        body.locked !== undefined ? (body.locked ? 1 : 0) : existing.locked,
        body.note !== undefined ? String(body.note) : null,
        iso(),
      ], id, ['title', 'account_id', 'note']));
      return true;
    });
    return found ? (await listDebts({ status: 'all' })).find((d) => d.id === id) : null;
  }

  // ── Lançamentos ──
  /** Parte pura de `createTransaction`: valida o valor e monta os parâmetros na ordem do INSERT antigo. */
  function transactionDraft(body) {
    const postedOn = isValidDateString(body.posted_on) ? body.posted_on : todayFortaleza(now());
    const raw = typeof body.amount === 'string' ? body.amount.trim().replace(',', '.') : body.amount;
    if (raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw))) throw badRequest('amount precisa ser número');
    const signed = money(raw);
    const id = body.id || newId();
    const direction = pick(body.direction, TX_DIRECTIONS, signed < 0 ? 'outflow' : 'inflow');
    let amount = signed;
    if (direction === 'outflow') amount = -Math.abs(signed);
    else if (direction === 'inflow') amount = Math.abs(signed);
    const category = FINANCE_CATEGORIES.includes(body.category) ? body.category : 'Outros';
    return {
      lookup: body.account_id ? String(body.account_id) : null,
      values: [
        id, body.pierre_tx_id || null, body.external_id || null, body.account_id || null, postedOn, amount, direction,
        String(body.raw_description || '').slice(0, 300), String(body.merchant || '').trim().slice(0, 120), category,
        body.subscription_id || null, body.debt_id || null, pick(body.source, SOURCES, 'joao'), String(body.note || '').slice(0, 500),
        iso(), body.payment_id || null, body.intent_key || null,
      ],
    };
  }
  /**
   * Leituras de `createTransaction` (conta, colisão de chave, reserva de ordem) e a linha pronta para gravar.
   * Chamar antes de qualquer escrita da transação; quem chama grava com `tx.financeTransactions.create(row)`.
   * `attempted.row` guarda a linha para dizer qual coluna colidiu quando o erro de chave repetida for
   * remapeado (o armazenamento troca o erro do SQLite por `already_exists`).
   */
  async function prepareTransaction(tx, body, attempted) {
    const draft = transactionDraft(body);
    if (draft.lookup !== null && !(await findIn(tx.financeAccounts, draft.lookup))) throw badRequest('account_id não existe');
    const row = { ...sqliteRowWithReal(TX_INSERT, draft.values), matched_tx_id: null };
    attempted.row = row;
    const column = await tx.financeTransactions.clash(row);
    if (column) throw sqliteUniqueError('finance_transactions', column);
    await tx.financeTransactions.reserve(1);
    return row;
  }
  /** Corrida perdida no commit (outro pedido gravou a mesma chave): diz qual coluna colidiu, como o SQLite. */
  async function asSqliteUnique(promise, attempted) {
    try { return await promise; } catch (error) {
      if (error?.code !== 'already_exists' || !attempted.row) throw error;
      throw sqliteUniqueError('finance_transactions', (await storage.financeTransactions.clash(attempted.row)) ?? 'id');
    }
  }

  /**
   * `createTransactionOnce`: sem chave, cria sempre; com chave, a mesma intenção devolve o primeiro
   * lançamento (`replayed`) e outro valor com a mesma chave é 409.
   */
  async function createTransactionOnce(body = {}) {
    const intentKey = parseIntentKey(body.intent_key);
    const attempted = { row: null };
    const outcome = await asSqliteUnique(storage.transaction(async (tx) => {
      if (intentKey) {
        const first = await tx.financeTransactions.findUnique('intent_key', intentKey);
        if (first) {
          const sent = Number(typeof body.amount === 'string' ? body.amount.trim().replace(',', '.') : body.amount);
          if (Number.isFinite(sent) && Math.abs(Math.abs(sent) - Math.abs(Number(first.amount))) >= 0.005) {
            throw intentConflict('essa intenção já registrou outro lançamento');
          }
          return { id: first.id, replayed: true };
        }
      }
      const row = await prepareTransaction(tx, { ...body, intent_key: intentKey }, attempted);
      await tx.financeTransactions.create(row);
      return { id: row.id, replayed: false };
    }), attempted);
    return { row: await storage.financeTransactions.get(outcome.id), replayed: outcome.replayed };
  }

  async function updateTransaction(id, body = {}) {
    const found = await storage.transaction(async (tx) => {
      const existing = await findIn(tx.financeTransactions, id);
      if (!existing) return false;
      await tx.financeTransactions.patch(id, boundUpdate(TX_UPDATE, [
        body.merchant !== undefined ? String(body.merchant).trim().slice(0, 120) : null,
        body.category !== undefined && FINANCE_CATEGORIES.includes(body.category) ? body.category : existing.category,
        body.subscription_id !== undefined ? body.subscription_id : null,
        body.debt_id !== undefined ? body.debt_id : null,
        body.raw_description !== undefined ? String(body.raw_description) : null,
        body.note !== undefined ? String(body.note).slice(0, 500) : null,
      ], id, ['merchant', 'subscription_id', 'debt_id', 'raw_description', 'note']));
      return true;
    });
    return found ? storage.financeTransactions.get(id) : null;
  }

  /** Extrato: lançamento manual já confirmado pelo banco não aparece de novo. */
  async function listTransactions({ from, to, account_id, category, q, limit, entity } = {}) {
    const ent = parseEntity(entity, 'all');
    const today = todayFortaleza(now());
    const start = isValidDateString(from) ? from : addDays(today, -30);
    const end = isValidDateString(to) ? to : today;
    const params = [start, end];
    if (account_id) params.push(account_id);
    if (category) params.push(category);
    const like = q ? `%${q}%` : null;
    if (q) params.push(like, like);
    params.push(Math.min(Number(limit) || 200, 1000));
    // Mesma ligação da consulta antiga: um `?` por parâmetro, listas achatadas, mesmos erros.
    const bound = bindPositional(params, params.length);
    let next = 2;
    const take = (on) => (on ? bound[next++] : null);
    const accountBound = take(Boolean(account_id)), categoryBound = take(Boolean(category));
    const likeBound = take(Boolean(q));
    if (q) next += 1;
    return storage.financeTransactions.range({
      from: bound[0], to: bound[1], accountId: accountBound, category: categoryBound, like: likeBound, entity: ent, limit: sqliteLimit(bound[next]),
    });
  }

  // ── Baixa de dívida ──
  /**
   * `payDebt`: null se a dívida não existe. Com chave de intenção, o reenvio devolve a primeira baixa com
   * `replayed: true` sem gravar nada; a mesma chave com outra dívida ou valor é 409.
   */
  async function payDebt(id, body = {}) {
    const intentKey = parseIntentKey(body.intent_key);
    const attempted = { row: null };
    const result = await asSqliteUnique(storage.transaction(async (tx) => {
      const debt = await findIn(tx.financeDebts, id);
      if (!debt) return null;
      if (intentKey) {
        const first = await tx.financePayments.findUnique('intent_key', intentKey);
        if (first) {
          const sameAmount = body.amount === undefined || body.amount === null || Math.abs(money(body.amount) - money(first.amount)) < 0.005;
          if (first.debt_id !== id || !sameAmount) throw intentConflict('essa intenção já registrou outra baixa');
          return { paymentId: first.id, replayed: true };
        }
      }
      const amount = money(body.amount ?? debt.balance);
      if (amount <= 0) throw badRequest('amount must be positive');
      const paidOn = isValidDateString(body.paid_on) ? body.paid_on : todayFortaleza(now());
      const nextBalance = money(Math.max(0, Number(debt.balance) - amount));
      const nextStatus = nextBalance <= 0.009 ? 'clean' : debt.status;
      const stamp = iso();

      // Mesma ordem de erros da antiga: ligação da baixa, depois a conta e a ligação do lançamento.
      const paymentId = newId();
      const payment = {
        ...sqliteRowWithReal(PAYMENT_INSERT, [paymentId, id, body.account_id || null, amount, paidOn, String(body.method || 'pix'), String(body.note || ''), stamp, intentKey]),
        confirmed: 1,
      };
      await tx.financePayments.reserve(1);
      const ledger = await prepareTransaction(tx, {
        account_id: body.account_id || null, posted_on: paidOn, amount: -Math.abs(amount), direction: 'outflow', merchant: debt.title,
        // fatura de cartão só muda o dinheiro de lugar: as compras já contam no cartão
        category: debt.kind === 'card' ? 'Pagamento de fatura' : 'Dívidas', debt_id: id, payment_id: paymentId, source: 'joao',
        raw_description: `Pagamento ${debt.title}`,
      }, attempted);
      const goals = (await tx.financeGoals.list({})).filter((goal) => goal.debt_id === id && goal.status === 'active');
      const settings = planSettings(await tx.financeSettings.get(), id === 'debt-carro' && nextStatus === 'clean'
        ? { reserved_car: 0, snapshot_label: '' } : { snapshot_label: '' });

      await tx.financeDebts.patch(id, { balance: nextBalance, status: nextStatus, updated_at: stamp });
      await tx.financePayments.create(payment);
      await tx.financeTransactions.create(ledger);
      for (const goal of goals) {
        // MIN(target, current + ?) e CASE WHEN current + ? >= target do UPDATE antigo; nulo contamina como no SQL.
        const sum = goal.current_amount === null ? null : goal.current_amount + amount;
        const target = goal.target_amount;
        const current = sum === null || target === null ? null : money(Math.min(target, sum));
        const done = sum !== null && target !== null && money(sum) >= target;
        await tx.financeGoals.patch(goal.id, { current_amount: current, status: done ? 'done' : goal.status, updated_at: stamp });
      }
      await applySettings(tx, settings);
      return { paymentId, replayed: false };
    }), attempted);
    if (!result) return null;
    return {
      debt: (await listDebts({ status: 'all' })).find((d) => d.id === id),
      payment: await storage.financePayments.get(result.paymentId),
      transaction: (await storage.financeTransactions.byPayment(result.paymentId)) || null,
      replayed: result.replayed,
    };
  }

  return Object.freeze({ listDebts, createDebt, updateDebt, payDebt, listTransactions, createTransactionOnce, updateTransaction });
}
