/**
 * Peças comuns dos serviços de finanças sobre a camada assíncrona. Regras copiadas das funções
 * privadas de finance.js (oráculo em test-support/oracles/finance.bcbadad.js), sem mudar finance.js.
 */
import { recordId, StorageError } from '../../storage/contract.js';
import { bindPositional, sqliteRowWithReal } from '../../storage/sqliteSemantics.js';
import { money } from '../../finance.js';

export function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
export function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}
export function parseMonthDay(value, field) {
  if (typeof value === 'string' && value.trim() !== '') value = Number(value);
  if (!Number.isInteger(value) || value < 1 || value > 31) throw badRequest(`${field} precisa ser um dia de 1 a 31`);
  return value;
}
export function parseAmount(value, field = 'amount') {
  if (typeof value === 'string' && value.trim() !== '') value = Number(value.replace(',', '.'));
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw badRequest(`${field} precisa ser número >= 0`);
  return money(value);
}
/** O erro do SQLite para chave repetida: a primária tem código próprio, os índices UNIQUE outro. */
export function sqliteUniqueError(table, column) {
  const error = new Error(`UNIQUE constraint failed: ${table}.${column}`);
  error.name = 'SqliteError';
  error.code = column === 'id' ? 'SQLITE_CONSTRAINT_PRIMARYKEY' : 'SQLITE_CONSTRAINT_UNIQUE';
  return error;
}
/** Chave repetida: o mesmo erro (mensagem e código) que o SQLite dava na rota antiga. */
export async function uniqueAs(table, promise, column = 'id') {
  try { return await promise; } catch (error) { if (error?.code === 'already_exists') throw sqliteUniqueError(table, column); throw error; }
}
export function intentConflict(message) {
  const err = new Error(message);
  err.status = 409;
  err.code = 'intent_conflict';
  return err;
}
/** Um `?` por filtro presente, listas achatadas e os mesmos erros de ligação da consulta antiga. */
export function boundFilters(entries) {
  const used = entries.filter(([, on]) => on);
  const bound = bindPositional(used.map(([, , value]) => value), used.length);
  const out = Object.fromEntries(entries.map(([column]) => [column, null]));
  used.forEach(([column], index) => { out[column] = bound[index]; });
  return out;
}
export function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}
/** Id que nenhum registro pode ter (inválido para guardar) = registro inexistente. */
export async function orMissing(promise, missing = null) {
  try { return await promise; } catch (error) { if (error?.code === 'invalid_record_id') return missing; throw error; }
}
export function storableId(value) {
  try { recordId(value); return true; } catch { return false; }
}
/**
 * Dentro da transação um erro de operação marca a transação como falha mesmo capturado; o id que não
 * pode existir é decidido antes de consultar.
 */
export async function findIn(repo, id) {
  return storableId(id) ? repo.get(id) : null;
}
/**
 * `UPDATE ... SET a = ?, b = ? WHERE id = ?`: liga TODOS os parâmetros como o driver (listas achatadas
 * contam), aplica a afinidade e confere que o `?` do WHERE continuou sendo o id. `coalesce` = colunas
 * `COALESCE(?, coluna)`: nulo não muda a coluna.
 */
export function boundUpdate(columns, values, id, coalesce = []) {
  const row = sqliteRowWithReal([...columns, ['__where', 'TEXT']], [...values, id]);
  if (row.__where !== id) throw new StorageError('sqlite_coercion_unsupported', 'sqlite_coercion_unsupported: parâmetro deslocado no UPDATE');
  delete row.__where;
  for (const column of coalesce) if (row[column] === null) delete row[column];
  return row;
}
