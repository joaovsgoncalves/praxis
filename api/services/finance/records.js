/**
 * Finanças, domínio 2 (cadastros): despesas fixas, orçamento, assinaturas, parcelas e metas sobre a
 * camada assíncrona, com o comportamento das funções antigas (oráculo em
 * test-support/oracles/finance.bcbadad.js: listFixedExpenses … markFixedPaid, listBudgets/saveBudgets,
 * *Subscription*, *Installment*, *Goal*).
 *
 * - Valores passam pela ligação e afinidade do SQLite (`sqliteRowWithReal`/`boundUpdate`), inclusive
 *   listas achatadas e os erros do driver; `COALESCE(?, coluna)` = nulo mantém a coluna.
 * - Cada operação é UMA transação (a antiga fazia passos soltos: apagar assinatura = soltar
 *   lançamentos + apagar; orçamento já era transação). O estado final é o mesmo.
 * - Orçamento: operações repetidas da mesma categoria no mesmo pedido viram a última (o Firestore não
 *   aceita duas gravações do mesmo documento num commit); o resultado é o mesmo da sequência antiga.
 * - Respostas montadas com leitura depois da gravação, como a antiga (`list…(db).find`, `getFixed`).
 */
import { randomUUID } from 'node:crypto';
import {
  SUB_LANES, SUB_CADENCES, SUB_STATUSES, SOURCES, INST_STATUSES, GOAL_STATUSES, FINANCE_CATEGORIES, OFF_BUDGET_CATEGORIES,
  money, isValidDateString, todayFortaleza,
} from '../../finance.js';
import { bindPositional, sqliteRowWithReal } from '../../storage/sqliteSemantics.js';
import { pick, badRequest, parseMonthDay, parseAmount, uniqueAs, findIn, boundUpdate } from './shared.js';

const T = (name) => [name, 'TEXT'], I = (name) => [name, 'INTEGER'], R = (name) => [name, 'REAL'];
const SUB_INSERT = [T('id'), T('name'), T('lane'), R('amount'), T('cadence'), I('charge_day'), T('account_id'), T('status'), T('next_charge'), T('vendor_hint'), T('source'), I('locked'), T('note'), T('created_at'), T('updated_at')];
const SUB_UPDATE = [T('name'), T('lane'), R('amount'), T('cadence'), I('charge_day'), T('account_id'), T('status'), T('next_charge'), T('vendor_hint'), T('note'), I('locked'), T('updated_at')];
const INST_INSERT = [T('id'), T('title'), T('account_id'), R('monthly'), R('remaining'), I('paid_n'), I('total_n'), T('last_due'), T('status'), T('source'), I('locked'), T('note'), T('created_at'), T('updated_at')];
const INST_UPDATE = [T('title'), T('account_id'), R('monthly'), R('remaining'), I('paid_n'), I('total_n'), T('last_due'), T('status'), T('source'), I('locked'), T('note'), T('updated_at')];
const GOAL_INSERT = [T('id'), T('title'), R('target_amount'), R('current_amount'), T('due_date'), T('debt_id'), T('status'), T('created_at'), T('updated_at')];
const GOAL_UPDATE = [T('title'), R('target_amount'), R('current_amount'), T('due_date'), T('debt_id'), T('status'), T('updated_at')];
const FIXED_INSERT = [T('id'), T('name'), R('amount'), I('due_day'), T('category'), T('lane'), I('active'), T('last_paid_month'), T('note'), T('created_at'), T('updated_at')];
const FIXED_UPDATE = [T('name'), R('amount'), I('due_day'), T('category'), T('lane'), I('active'), T('note'), T('updated_at')];
const FIXED_PAID = [T('last_paid_month'), T('updated_at')];
const BUDGET_ROW = [T('category'), R('monthly_limit'), T('updated_at')];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const finiteOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const monthOf = (ymd) => String(ymd).slice(0, 7);
function parseMonth(value, field = 'month') {
  if (typeof value !== 'string' || !MONTH_RE.test(value)) throw badRequest(`${field}: use YYYY-MM`);
  return value;
}
const subView = (s) => ({ ...s, amount: money(s.amount), locked: Number(s.locked) === 1 });
const instView = (row) => ({ ...row, monthly: money(row.monthly), remaining: money(row.remaining), locked: Number(row.locked) === 1 });
const goalView = (g) => ({
  ...g,
  target_amount: money(g.target_amount),
  current_amount: money(g.current_amount),
  progress: g.target_amount > 0 ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100)) : 0,
});
function fixedView(row, today) {
  const month = monthOf(today);
  return {
    ...row,
    amount: money(row.amount),
    due_day: row.due_day == null ? null : Number(row.due_day),
    active: Number(row.active) === 1,
    last_paid_month: row.last_paid_month || null,
    paid_this_month: row.last_paid_month === month,
  };
}
/** Valida tudo antes de gravar; no PATCH só os campos enviados (cópia de fixedFields). */
function fixedFields(body, existing = null) {
  const out = {};
  if (!existing || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) throw badRequest('name obrigatório');
    out.name = name.slice(0, 120);
  }
  if (!existing || body.amount !== undefined) out.amount = parseAmount(body.amount);
  if (body.due_day !== undefined) {
    out.due_day = body.due_day === null || body.due_day === '' ? null : parseMonthDay(body.due_day, 'due_day');
  }
  if (body.category !== undefined) {
    if (!FINANCE_CATEGORIES.includes(body.category)) throw badRequest('category inválida');
    out.category = body.category;
  }
  if (body.lane !== undefined) {
    if (!SUB_LANES.includes(body.lane)) throw badRequest('lane: use personal ou work');
    out.lane = body.lane;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean' && ![0, 1].includes(body.active)) throw badRequest('active precisa ser booleano');
    out.active = body.active ? 1 : 0;
  }
  if (body.note !== undefined) out.note = String(body.note ?? '').slice(0, 500);
  return out;
}
/** Um `?` por filtro presente, listas achatadas e os mesmos erros de ligação da consulta antiga. */
function boundFilters(entries) {
  const used = entries.filter(([, on]) => on);
  const bound = bindPositional(used.map(([, , value]) => value), used.length);
  const out = Object.fromEntries(entries.map(([column]) => [column, null]));
  used.forEach(([column], index) => { out[column] = bound[index]; });
  return out;
}

export function createFinanceRecordsService({ storage, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.financeFixedExpenses || typeof storage.transaction !== 'function') throw new TypeError('finance records service requires storage');
  const iso = () => now().toISOString();
  const dayOr = (today) => (isValidDateString(today) ? today : todayFortaleza(now()));

  /** Criação simples: reserva, liga a linha e grava; chave repetida = erro do SQLite. */
  async function insertOne(repo, table, columns, values) {
    return uniqueAs(table, storage.transaction(async (tx) => {
      await tx[repo].reserve(1);
      return tx[repo].create(sqliteRowWithReal(columns, values));
    }));
  }
  /** Alteração: lê, decide os campos com a linha atual e grava; null se não existe. */
  async function updateOne(repo, id, decide) {
    return storage.transaction(async (tx) => {
      const existing = await findIn(tx[repo], id);
      if (!existing) return false;
      await tx[repo].patch(id, decide(existing));
      return true;
    });
  }

  // ── Despesas fixas ──
  async function listFixedExpenses({ today } = {}) {
    const day = dayOr(today);
    return (await storage.financeFixedExpenses.list({})).map((row) => fixedView(row, day));
  }
  async function getFixed(id, today) {
    const row = await findIn(storage.financeFixedExpenses, id);
    return row ? fixedView(row, dayOr(today)) : null;
  }
  async function createFixedExpense(body = {}, { today } = {}) {
    const fields = fixedFields(body);
    const id = newId(), stamp = iso();
    await insertOne('financeFixedExpenses', 'finance_fixed_expenses', FIXED_INSERT, [
      id, fields.name, fields.amount, fields.due_day ?? null, fields.category || 'Outros', fields.lane || 'personal', fields.active ?? 1, null, fields.note || '', stamp, stamp,
    ]);
    return getFixed(id, today);
  }
  async function updateFixedExpense(id, body = {}, { today } = {}) {
    const found = await updateOne('financeFixedExpenses', id, (existing) => {
      const next = { ...existing, ...fixedFields(body, existing) };
      return boundUpdate(FIXED_UPDATE, [next.name, next.amount, next.due_day, next.category, next.lane, next.active, next.note || '', iso()], id);
    });
    return found ? getFixed(id, today) : null;
  }
  async function deleteFixedExpense(id) {
    return storage.transaction(async (tx) => {
      const existing = await findIn(tx.financeFixedExpenses, id);
      if (!existing) return null;
      await tx.financeFixedExpenses.remove(id);
      return existing;
    });
  }
  async function markFixedPaid(id, { month, today } = {}) {
    const day = dayOr(today);
    const found = await updateOne('financeFixedExpenses', id, () => {
      const value = month === null ? null : month === undefined ? monthOf(day) : parseMonth(month);
      return boundUpdate(FIXED_PAID, [value, iso()], id);
    });
    return found ? getFixed(id, day) : null;
  }

  // ── Orçamento ──
  async function listBudgets() {
    return (await storage.financeBudgets.list({})).map((b) => ({ ...b, monthly_limit: money(b.monthly_limit) }));
  }
  async function saveBudgets(body) {
    const list = Array.isArray(body) ? body : body && body.budgets !== undefined ? body.budgets : [body];
    if (!Array.isArray(list) || !list.length) throw badRequest('budgets: lista de {category, monthly_limit}');
    const parsed = list.map((item, i) => {
      if (!item || typeof item !== 'object') throw badRequest(`budgets[${i}]: objeto`);
      if (!FINANCE_CATEGORIES.includes(item.category) || OFF_BUDGET_CATEGORIES.includes(item.category) || item.category === 'Receita') {
        throw badRequest(`budgets[${i}].category inválida`);
      }
      if (item.monthly_limit === null) return { category: item.category, limit: null };
      return { category: item.category, limit: parseAmount(item.monthly_limit, `budgets[${i}].monthly_limit`) };
    });
    const stamp = iso();
    const last = new Map(parsed.map(({ category, limit }) => [category, limit]));
    await storage.transaction(async (tx) => {
      for (const [category, limit] of last) {
        if (limit === null) await tx.financeBudgets.remove(category);
        else await tx.financeBudgets.upsert(sqliteRowWithReal(BUDGET_ROW, [category, limit, stamp]));
      }
    });
    return listBudgets();
  }

  // ── Assinaturas ──
  async function listSubscriptions({ lane, status } = {}) {
    const filters = boundFilters([['lane', Boolean(lane && SUB_LANES.includes(lane)), lane], ['status', Boolean(status && status !== 'all'), status]]);
    return (await storage.financeSubscriptions.list(filters)).map(subView);
  }
  async function createSubscription(body) {
    const name = String(body.name || '').trim();
    if (!name) throw badRequest('name required');
    const id = body.id || newId(), stamp = iso();
    await insertOne('financeSubscriptions', 'finance_subscriptions', SUB_INSERT, [
      id, name, pick(body.lane, SUB_LANES, 'personal'), money(body.amount), pick(body.cadence, SUB_CADENCES, 'monthly'),
      finiteOr(body.charge_day, null), body.account_id || null, pick(body.status, SUB_STATUSES, 'active'),
      isValidDateString(body.next_charge) ? body.next_charge : null, String(body.vendor_hint || ''), pick(body.source, SOURCES, 'joao'),
      body.locked ? 1 : 0, String(body.note || ''), stamp, stamp,
    ]);
    return (await listSubscriptions()).find((s) => s.id === id);
  }
  async function updateSubscription(id, body = {}) {
    const found = await updateOne('financeSubscriptions', id, (existing) => boundUpdate(SUB_UPDATE, [
      body.name !== undefined ? String(body.name).trim() : null,
      body.lane !== undefined ? pick(body.lane, SUB_LANES, existing.lane) : existing.lane,
      body.amount !== undefined ? money(body.amount) : existing.amount,
      body.cadence !== undefined ? pick(body.cadence, SUB_CADENCES, existing.cadence) : existing.cadence,
      body.charge_day !== undefined ? finiteOr(body.charge_day, null) : existing.charge_day,
      body.account_id !== undefined ? body.account_id : null,
      body.status !== undefined ? pick(body.status, SUB_STATUSES, existing.status) : existing.status,
      body.next_charge !== undefined ? (isValidDateString(body.next_charge) ? body.next_charge : null) : existing.next_charge,
      body.vendor_hint !== undefined ? String(body.vendor_hint) : null,
      body.note !== undefined ? String(body.note) : null,
      body.locked !== undefined ? (body.locked ? 1 : 0) : existing.locked,
      iso(),
    ], id, ['name', 'account_id', 'vendor_hint', 'note']));
    return found ? (await listSubscriptions()).find((s) => s.id === id) : null;
  }
  /** Solta `subscription_id` dos lançamentos e apaga, no mesmo commit. */
  async function deleteSubscription(id) {
    return storage.transaction(async (tx) => {
      const existing = await findIn(tx.financeSubscriptions, id);
      if (!existing) return null;
      const linked = await tx.financeTransactions.list({ subscription_id: id });
      for (const row of linked) await tx.financeTransactions.patch(row.id, { subscription_id: null });
      await tx.financeSubscriptions.remove(id);
      return subView(existing);
    });
  }

  // ── Parcelas ──
  async function listInstallments({ status } = {}) {
    return (await storage.financeInstallments.list(boundFilters([['status', Boolean(status && status !== 'all'), status]]))).map(instView);
  }
  async function createInstallment(body) {
    const title = String(body.title || '').trim();
    if (!title) throw badRequest('title required');
    const id = body.id || newId(), stamp = iso();
    await insertOne('financeInstallments', 'finance_installments', INST_INSERT, [
      id, title, body.account_id || null, money(body.monthly), money(body.remaining), finiteOr(body.paid_n, 0), finiteOr(body.total_n, 0),
      isValidDateString(body.last_due) ? body.last_due : null, pick(body.status, INST_STATUSES, 'open'), pick(body.source, SOURCES, 'pierre'),
      body.locked ? 1 : 0, String(body.note || ''), stamp, stamp,
    ]);
    return (await listInstallments()).find((row) => row.id === id);
  }
  async function updateInstallment(id, body = {}) {
    const found = await updateOne('financeInstallments', id, (existing) => boundUpdate(INST_UPDATE, [
      body.title !== undefined ? String(body.title).trim() : null,
      body.account_id !== undefined ? body.account_id : null,
      body.monthly !== undefined ? money(body.monthly) : existing.monthly,
      body.remaining !== undefined ? money(body.remaining) : existing.remaining,
      body.paid_n !== undefined ? Number(body.paid_n) : existing.paid_n,
      body.total_n !== undefined ? Number(body.total_n) : existing.total_n,
      body.last_due !== undefined ? (isValidDateString(body.last_due) ? body.last_due : null) : existing.last_due,
      body.status !== undefined ? pick(body.status, INST_STATUSES, existing.status) : existing.status,
      body.source !== undefined ? pick(body.source, SOURCES, existing.source) : existing.source,
      body.locked !== undefined ? (body.locked ? 1 : 0) : existing.locked,
      body.note !== undefined ? String(body.note) : null,
      iso(),
    ], id, ['title', 'account_id', 'note']));
    return found ? (await listInstallments()).find((row) => row.id === id) : null;
  }
  async function deleteInstallment(id) {
    return storage.transaction(async (tx) => {
      const existing = await findIn(tx.financeInstallments, id);
      if (!existing) return null;
      await tx.financeInstallments.remove(id);
      return instView(existing);
    });
  }

  // ── Metas ──
  async function listGoals() {
    return (await storage.financeGoals.list({})).map(goalView);
  }
  async function createGoal(body) {
    const title = String(body.title || '').trim();
    if (!title) throw badRequest('title required');
    const id = body.id || newId(), stamp = iso();
    await insertOne('financeGoals', 'finance_goals', GOAL_INSERT, [
      id, title, money(body.target_amount), money(body.current_amount || 0), isValidDateString(body.due_date) ? body.due_date : null,
      body.debt_id || null, pick(body.status, GOAL_STATUSES, 'active'), stamp, stamp,
    ]);
    return (await listGoals()).find((g) => g.id === id);
  }
  async function updateGoal(id, body = {}) {
    const found = await updateOne('financeGoals', id, (existing) => boundUpdate(GOAL_UPDATE, [
      body.title !== undefined ? String(body.title).trim() : null,
      body.target_amount !== undefined ? money(body.target_amount) : existing.target_amount,
      body.current_amount !== undefined ? money(body.current_amount) : existing.current_amount,
      body.due_date !== undefined ? (isValidDateString(body.due_date) ? body.due_date : null) : existing.due_date,
      body.debt_id !== undefined ? body.debt_id : null,
      body.status !== undefined ? pick(body.status, GOAL_STATUSES, existing.status) : existing.status,
      iso(),
    ], id, ['title', 'debt_id']));
    return found ? (await listGoals()).find((g) => g.id === id) : null;
  }

  return Object.freeze({
    listFixedExpenses, createFixedExpense, updateFixedExpense, deleteFixedExpense, markFixedPaid,
    listBudgets, saveBudgets,
    listSubscriptions, createSubscription, updateSubscription, deleteSubscription,
    listInstallments, createInstallment, updateInstallment, deleteInstallment,
    listGoals, createGoal, updateGoal,
  });
}
