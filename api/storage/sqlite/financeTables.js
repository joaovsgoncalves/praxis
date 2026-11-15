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
  recordId(input.id);
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
    if (key === 'id') throw new StorageError('immutable_record_id');
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
