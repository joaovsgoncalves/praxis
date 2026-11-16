/**
 * Tabelas de finanças servidas pela camada nova (fase 5). Uma definição vale para os dois motores:
 * colunas na ordem da tabela num banco novo (`initFinanceSchema`), afinidade, colunas de dinheiro e
 * colunas NOT NULL.
 *
 * Firestore: tabela T -> users/{uid}/<camelCase(T)>/{documentId(id)}, documento = linha com os mesmos
 * nomes de coluna + `_row` (ordem de inserção, como o rowid). Dinheiro fica em CENTAVOS INTEIROS no
 * mesmo nome de campo (`moneyToCents`/`centsToMoney`); o repositório devolve o número do SQLite.
 * `finance_settings` é de linha única: documento fixo `users/{uid}/financeSettings/default`.
 */
import { StorageError, recordId } from '../contract.js';
import { moneyToCents } from '../schema.mjs';

export const FINANCE_TABLES = Object.freeze({
  financeSettings: Object.freeze({
    table: 'finance_settings',
    singleton: 'default',
    columns: [['id', 'TEXT'], ['reserved_car', 'REAL'], ['reserved_live', 'REAL'], ['snapshot_label', 'TEXT'], ['updated_at', 'TEXT'], ['hide_values', 'INTEGER'], ['salary_day', 'INTEGER']],
    money: ['reserved_car', 'reserved_live'],
    notNull: ['id'],
  }),
  financeAccounts: Object.freeze({
    table: 'finance_accounts',
    columns: [['id', 'TEXT'], ['name', 'TEXT'], ['kind', 'TEXT'], ['institution', 'TEXT'], ['mask', 'TEXT'], ['pierre_account_id', 'TEXT'], ['is_operational', 'INTEGER'], ['status', 'TEXT'], ['sort_order', 'INTEGER'], ['created_at', 'TEXT'], ['updated_at', 'TEXT'], ['brand_color', 'TEXT'], ['card_last4', 'TEXT'], ['entity', 'TEXT']],
    money: [],
    notNull: ['id', 'name', 'entity'],
  }),
  financeBalances: Object.freeze({
    table: 'finance_balances',
    columns: [['id', 'TEXT'], ['account_id', 'TEXT'], ['as_of', 'TEXT'], ['amount', 'REAL'], ['amount_kind', 'TEXT'], ['source', 'TEXT'], ['locked', 'INTEGER'], ['note', 'TEXT'], ['created_at', 'TEXT']],
    money: ['amount'],
    notNull: ['id', 'account_id', 'as_of', 'amount'],
  }),
});

/**
 * Domínio 2 em diante: tabela genérica. `key` = coluna da chave primária (padrão `id`); `order` =
 * ORDER BY da consulta antiga, termo a termo (`isNull` = `col IS NULL`); `filters` = colunas que a
 * lista aceita filtrar por igualdade. Empate final: ordem de inserção (rowid / `_row`).
 */
const text = (name) => [name, 'TEXT'], int = (name) => [name, 'INTEGER'], real = (name) => [name, 'REAL'];
export const FINANCE_GENERIC_TABLES = Object.freeze({
  financeSubscriptions: Object.freeze({
    table: 'finance_subscriptions',
    columns: [text('id'), text('name'), text('lane'), real('amount'), text('cadence'), int('charge_day'), text('account_id'), text('status'), text('next_charge'), text('vendor_hint'), text('source'), int('locked'), text('note'), text('created_at'), text('updated_at')],
    money: ['amount'], notNull: ['id', 'name'],
    order: [{ col: 'lane' }, { col: 'amount', desc: true }],
    filters: ['lane', 'status'],
  }),
  financeInstallments: Object.freeze({
    table: 'finance_installments',
    columns: [text('id'), text('title'), text('account_id'), real('monthly'), real('remaining'), int('paid_n'), int('total_n'), text('last_due'), text('status'), text('source'), int('locked'), text('note'), text('created_at'), text('updated_at')],
    money: ['monthly', 'remaining'], notNull: ['id', 'title'],
    order: [{ col: 'remaining', desc: true }, { col: 'monthly', desc: true }],
    filters: ['status'],
  }),
  financeGoals: Object.freeze({
    table: 'finance_goals',
    columns: [text('id'), text('title'), real('target_amount'), real('current_amount'), text('due_date'), text('debt_id'), text('status'), text('created_at'), text('updated_at')],
    money: ['target_amount', 'current_amount'], notNull: ['id', 'title'],
    order: [{ col: 'due_date', isNull: true }, { col: 'due_date' }, { col: 'title' }],
    filters: [],
  }),
  financeFixedExpenses: Object.freeze({
    table: 'finance_fixed_expenses',
    columns: [text('id'), text('name'), real('amount'), int('due_day'), text('category'), text('lane'), int('active'), text('last_paid_month'), text('note'), text('created_at'), text('updated_at')],
    money: ['amount'], notNull: ['id', 'name', 'amount'],
    order: [{ col: 'active', desc: true }, { col: 'due_day', isNull: true }, { col: 'due_day' }, { col: 'name' }],
    filters: [],
  }),
  financeBudgets: Object.freeze({
    table: 'finance_budgets',
    key: 'category',
    columns: [text('category'), real('monthly_limit'), text('updated_at')],
    money: ['monthly_limit'], notNull: ['category', 'monthly_limit'],
    order: [{ col: 'category' }],
    filters: [],
  }),
  // Domínio 2: soltar o vínculo da assinatura apagada (`list` por assinatura + `patch`). Domínio 3: criação,
  // unicidade e extrato (`range`, `byPayment`). `unique` = índices UNIQUE parciais do SQLite, na ordem em que
  // ele os confere num banco novo (external_id, intent_key, pierre_tx_id; a chave primária por último);
  // `ignoreEmpty` = o índice também ignora texto vazio. Valor nulo nunca conta.
  financeTransactions: Object.freeze({
    table: 'finance_transactions',
    columns: [text('id'), text('pierre_tx_id'), text('account_id'), text('posted_on'), real('amount'), text('direction'), text('raw_description'), text('merchant'), text('category'), text('subscription_id'), text('debt_id'), text('source'), text('created_at'), text('external_id'), text('matched_tx_id'), text('note'), text('payment_id'), text('intent_key')],
    money: ['amount'], notNull: ['id', 'posted_on', 'amount'],
    order: [],
    filters: ['subscription_id'],
    unique: [{ column: 'external_id', ignoreEmpty: true }, { column: 'intent_key' }, { column: 'pierre_tx_id', ignoreEmpty: true }],
  }),
  // Domínio 3: dívidas (`queue ASC, balance DESC`) e baixas (uma por chave de intenção).
  financeDebts: Object.freeze({
    table: 'finance_debts',
    columns: [text('id'), text('title'), text('account_id'), text('kind'), real('balance'), real('min_payment'), text('apr_label'), int('due_day'), text('due_date'), text('status'), int('queue'), text('source'), int('locked'), text('note'), text('created_at'), text('updated_at')],
    money: ['balance', 'min_payment'], notNull: ['id', 'title'],
    order: [{ col: 'queue' }, { col: 'balance', desc: true }],
    filters: ['status'],
  }),
  // Domínio 4: o que o ingest do banco grava e as leituras compostas consomem.
  financePendingTransactions: Object.freeze({
    table: 'finance_pending_transactions',
    key: 'external_id',
    columns: [text('external_id'), text('institution'), text('account_id'), text('posted_on'), real('amount'), text('raw_description'), text('merchant'), text('category'), text('seen_at')],
    money: ['amount'], notNull: ['external_id', 'institution', 'posted_on', 'amount'],
    order: [{ col: 'posted_on', desc: true }, { col: 'external_id' }],
    filters: [],
  }),
  financeCardStatus: Object.freeze({
    table: 'finance_card_status',
    key: 'account_id',
    columns: [text('account_id'), text('institution'), text('last4'), text('brand'), real('used'), real('limit_total'), real('limit_available'), real('bill_total'), real('bill_minimum'), real('bill_paid'), real('bill_remaining'), text('bill_due'), text('bill_closing'), text('bank_updated_at'), text('updated_at'), text('source'), real('bill_paid_manual')],
    money: ['used', 'limit_total', 'limit_available', 'bill_total', 'bill_minimum', 'bill_paid', 'bill_remaining', 'bill_paid_manual'], notNull: ['account_id', 'institution'],
    order: [{ col: 'bill_due', isNull: true }, { col: 'bill_due' }, { col: 'institution' }],
    filters: [],
  }),
  financeStatementCoverage: Object.freeze({
    table: 'finance_statement_coverage',
    columns: [text('id'), text('account_id'), text('source'), text('covered_from'), text('covered_to'), text('recorded_at')],
    money: [], notNull: ['id', 'account_id', 'source', 'covered_from', 'covered_to', 'recorded_at'],
    order: [{ col: 'covered_from' }],
    filters: ['account_id'],
  }),
  financeSyncLog: Object.freeze({
    table: 'finance_sync_log',
    columns: [text('id'), text('started_at'), text('finished_at'), int('ok'), int('accounts_n'), int('tx_n'), text('error'), text('actor')],
    money: [], notNull: ['id'],
    order: [],
    filters: [],
  }),
  financePayments: Object.freeze({
    table: 'finance_payments',
    columns: [text('id'), text('debt_id'), text('account_id'), real('amount'), text('paid_on'), text('method'), int('confirmed'), text('note'), text('created_at'), text('intent_key')],
    money: ['amount'], notNull: ['id', 'debt_id', 'amount', 'paid_on'],
    order: [],
    filters: [],
    unique: [{ column: 'intent_key' }],
  }),
});

export const keyOf = (def) => def.key ?? 'id';
/** Colunas UNIQUE que valem para este valor (nulo, e vazio onde o índice ignora, não contam). */
export const uniqueColumns = (def, row) => (def.unique ?? []).filter(({ column, ignoreEmpty }) => row[column] !== null && row[column] !== undefined && !(ignoreEmpty && row[column] === ''));
export const orderSql = (def) => def.order.map(({ col, desc, isNull }) => (isNull ? `${col} IS NULL` : `${col} ${desc ? 'DESC' : 'ASC'}`)).join(', ');

export const columnNames = (def) => def.columns.map(([name]) => name);

/** Centavos exatos: o número tem de voltar igual depois de virar centavos (sem fração de centavo). */
export function exactCents(value) {
  if (typeof value !== 'number') throw new StorageError('invalid_money');
  const cents = moneyToCents(value);
  if (cents / 100 !== value && !(cents === 0 && value === 0)) throw new StorageError('fractional_cent_or_overflow');
  return cents;
}

function checkValue(def, name, value) {
  if (value === null) {
    if (def.notNull.includes(name)) throw new StorageError('invalid_finance_value', `invalid_finance_value: ${def.table}.${name} NOT NULL`);
    return;
  }
  if (def.money.includes(name)) { exactCents(value); return; }
  // Valor já com a afinidade do SQLite aplicada: texto ou número finito.
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
    throw new StorageError('invalid_finance_value', `invalid_finance_value: ${def.table}.${name}`);
  }
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new StorageError('invalid_record');
}

/** Linha completa (todas as colunas, nada a mais), já no formato SQLite. */
export function financeRow(def, input) {
  plainObject(input);
  const names = columnNames(def);
  for (const key of Object.keys(input)) if (!names.includes(key)) throw new StorageError('unknown_finance_field', `unknown_finance_field: ${def.table}.${key}`);
  for (const name of names) {
    if (!Object.hasOwn(input, name)) throw new StorageError('incomplete_finance_row', `incomplete_finance_row: ${def.table}.${name}`);
    checkValue(def, name, input[name]);
  }
  recordId(input[def.key ?? 'id']);
  // O documento-sentinela do UNIQUE leva o valor no id: mesmo limite de tamanho nos dois motores.
  for (const { column } of uniqueColumns(def, input)) {
    if (Buffer.byteLength(String(input[column])) > 1400) throw new StorageError('unique_value_too_long', `unique_value_too_long: ${def.table}.${column}`);
  }
  if (def.singleton && input.id !== def.singleton) throw new StorageError('invalid_record_id');
  return Object.fromEntries(names.map((name) => [name, input[name]]));
}

/** Alteração parcial: só colunas conhecidas, sem `id`, pelo menos uma. */
export function financePatch(def, input) {
  plainObject(input);
  const names = columnNames(def);
  const keys = Object.keys(input);
  if (!keys.length) throw new StorageError('empty_patch');
  for (const key of keys) {
    if (key === (def.key ?? 'id')) throw new StorageError('immutable_record_id');
    if ((def.unique ?? []).some((rule) => rule.column === key)) throw new StorageError('immutable_unique_field', `immutable_unique_field: ${def.table}.${key}`);
    if (!names.includes(key)) throw new StorageError('unknown_finance_field', `unknown_finance_field: ${def.table}.${key}`);
    checkValue(def, key, input[key]);
  }
  return structuredClone(input);
}

/** Texto exato ou null (filtro de igualdade). */
export function optionalText(value, code) {
  if (value !== null && typeof value !== 'string') throw new StorageError(code);
  return value;
}
