/** Persistence boundary only. Domain rules (XP/recurrence/calendar) stay in services. */
export class StorageError extends Error {
  constructor(code, message = code) { super(message); this.name = 'StorageError'; this.code = code; }
}

export const TASK_DEFAULTS = Object.freeze({
  description: '', date: null, time: null, status: 'pending', priority: 'medium', category: 'personal',
  calendar_event_id: null, recurrence: 'none', recurrence_days: '[]', recurrence_parent_id: null,
  goal_id: null, source: 'manual', duration_minutes: null, completed_date: null, completed_at: null,
  sort_order: null, idea_status: null, source_idea_id: null, day_outcome: null,
  day_outcome_date: null, day_outcome_reason: null,
});
const NUMERIC = new Set(['duration_minutes', 'sort_order']);
export const TASK_FIELDS = Object.freeze(['id', 'title', ...Object.keys(TASK_DEFAULTS), 'created_date', 'updated_date']);
const FIELDS = new Set(TASK_FIELDS);

export function recordId(value) {
  // Preserve source identifiers exactly. No normalization into another valid identifier.
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 1500
      || Buffer.from(value,'utf8').toString('utf8') !== value) {
    throw new StorageError('invalid_record_id');
  }
  return value;
}
function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new StorageError('invalid_record');
}
function values(input) {
  plain(input);
  for (const [key, value] of Object.entries(input)) {
    if (!FIELDS.has(key)) throw new StorageError('unknown_task_field');
    if (key === 'id') { recordId(value); continue; }
    if (key === 'title') {
      if (typeof value !== 'string' || !value.length) throw new StorageError('invalid_task_title');
    } else if (NUMERIC.has(key)) {
      if (value !== null && !Number.isSafeInteger(value)) throw new StorageError('invalid_task_integer');
    } else if (value !== null && typeof value !== 'string') throw new StorageError('invalid_task_value');
  }
  return structuredClone(input);
}
export function newTask(input, now) {
  const clean = values(input);
  recordId(clean.id);
  if (typeof clean.title !== 'string' || !clean.title.length) throw new StorageError('invalid_task_title');
  const stamp = now().toISOString().slice(0, 19).replace('T', ' ');
  return { ...TASK_DEFAULTS, created_date: stamp, updated_date: stamp, ...clean };
}
export function taskPatch(input) {
  const clean = values(input);
  if (Object.hasOwn(clean, 'id')) throw new StorageError('immutable_record_id');
  if (!Object.keys(clean).length) throw new StorageError('empty_patch');
  return clean;
}
export function taskQuery(input = {}) {
  plain(input);
  const allowed = new Set(['date', 'status', 'limit', 'offset']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new StorageError('invalid_task_query');
  const query = { limit: 100, offset: 0, ...input };
  for (const key of ['date', 'status']) if (Object.hasOwn(query, key) && query[key] !== null && typeof query[key] !== 'string') throw new StorageError('invalid_task_query');
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000
      || !Number.isInteger(query.offset) || query.offset < 0 || query.offset > 1000000) throw new StorageError('invalid_task_query');
  return query;
}
/** `goal_id = ?` das tarefas (e hábitos): texto exato, coluna TEXT. */
export function taskGoalKey(value) {
  if (typeof value !== 'string') throw new StorageError('invalid_query');
  return value;
}
/** Lista de ids lida antes na mesma transação (ex.: itens de uma meta a soltar). */
export function taskIdList(value) {
  if (!Array.isArray(value)) throw new StorageError('invalid_query');
  return value.map((id) => recordId(id));
}
// Revisão semanal: colunas na ordem da tabela SQLite (`weekly_reviews` em lib/dbInit.js).
export const REVIEW_FIELDS = Object.freeze(['id', 'week_start', 'highlights', 'blockers', 'learnings', 'next_week_focus', 'overall_score', 'created_date', 'updated_date']);
const REVIEW_TEXT = new Set(['highlights', 'blockers', 'learnings', 'next_week_focus']);
const REVIEW_IMMUTABLE = new Set(['id', 'week_start', 'created_date']);
const SQL_STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// `mondayOf` usa toISOString: anos fora de 0000-9999 saem como ±YYYYYY-MM-DD e a rota antiga aceitava.
const WEEK_START = /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}$/;
export function weekStart(value) {
  if (typeof value !== 'string' || !WEEK_START.test(value)) throw new StorageError('invalid_review_week');
  return value;
}
function reviewValues(input) {
  plain(input);
  for (const [key, value] of Object.entries(input)) {
    if (!REVIEW_FIELDS.includes(key)) throw new StorageError('unknown_review_field');
    if (key === 'id') recordId(value);
    else if (key === 'week_start') weekStart(value);
    else if (REVIEW_TEXT.has(key)) { if (value !== null && typeof value !== 'string') throw new StorageError('invalid_review_value'); }
    // Afinidade INTEGER do SQLite deixa texto não numérico como texto ("abc"): o valor já chega convertido.
    else if (key === 'overall_score') { if (value !== null && typeof value !== 'string' && !Number.isFinite(value)) throw new StorageError('invalid_review_value'); }
    else if (typeof value !== 'string' || !SQL_STAMP.test(value)) throw new StorageError('invalid_review_value');
  }
  return structuredClone(input);
}
/** Mesmos padrões da tabela: textos '', nota 3, carimbos `datetime('now')` (UTC, sem fração). */
export function newReview(input, now) {
  const clean = reviewValues(input);
  recordId(clean.id);
  weekStart(clean.week_start);
  const stamp = now().toISOString().slice(0, 19).replace('T', ' ');
  return Object.fromEntries(REVIEW_FIELDS.map((field) => [field, Object.hasOwn(clean, field) ? clean[field]
    : REVIEW_TEXT.has(field) ? '' : field === 'overall_score' ? 3 : stamp]));
}
export function reviewPatch(input) {
  const clean = reviewValues(input);
  for (const key of Object.keys(clean)) if (REVIEW_IMMUTABLE.has(key)) throw new StorageError('immutable_review_field');
  if (!Object.keys(clean).length) throw new StorageError('empty_patch');
  return clean;
}
/** `limit: null` = sem limite; o serviço traduz o LIMIT do SQLite antes de chegar aqui. */
export function reviewQuery(input = {}) {
  plain(input);
  for (const key of Object.keys(input)) if (key !== 'limit') throw new StorageError('invalid_review_query');
  const limit = Object.hasOwn(input, 'limit') ? input.limit : 12;
  if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 1000)) throw new StorageError('invalid_review_query');
  return { limit };
}

// Compras/desejos: colunas na ordem da tabela `purchase_items` (purchaseList.js).
export const PURCHASE_FIELDS = Object.freeze(['id', 'title', 'notes', 'horizon', 'status', 'price_estimate', 'url', 'sort_order', 'created_date', 'updated_date']);
const PURCHASE_TEXT = new Set(['title', 'notes', 'horizon', 'status', 'price_estimate', 'url']);
const PURCHASE_IMMUTABLE = new Set(['id', 'sort_order', 'created_date']);
function purchaseValues(input) {
  plain(input);
  for (const [key, value] of Object.entries(input)) {
    if (!PURCHASE_FIELDS.includes(key)) throw new StorageError('unknown_purchase_field');
    if (key === 'id') recordId(value);
    else if (key === 'title') { if (typeof value !== 'string') throw new StorageError('invalid_purchase_value'); }
    else if (PURCHASE_TEXT.has(key)) { if (value !== null && typeof value !== 'string') throw new StorageError('invalid_purchase_value'); }
    // Afinidade INTEGER: o valor já chega convertido (número, texto não numérico ou null).
    else if (key === 'sort_order') { if (value !== null && typeof value !== 'string' && !Number.isFinite(value)) throw new StorageError('invalid_purchase_value'); }
    else if (typeof value !== 'string' || !SQL_STAMP.test(value)) throw new StorageError('invalid_purchase_value');
  }
  return structuredClone(input);
}
/** Linha completa: o serviço decide todos os valores (inclusive `sort_order`). */
export function newPurchase(input) {
  const clean = purchaseValues(input);
  for (const field of PURCHASE_FIELDS) if (!Object.hasOwn(clean, field)) throw new StorageError('incomplete_purchase');
  return Object.fromEntries(PURCHASE_FIELDS.map((field) => [field, clean[field]]));
}
export function purchasePatch(input) {
  const clean = purchaseValues(input);
  for (const key of Object.keys(clean)) if (PURCHASE_IMMUTABLE.has(key)) throw new StorageError('immutable_purchase_field');
  if (!Object.keys(clean).length) throw new StorageError('empty_patch');
  return clean;
}
/** `status`: valor exato ou null; `excludePaused` só vale sem status; `horizon`: valor exato ou null. */
export function purchaseQuery(input = {}) {
  plain(input);
  const query = { status: null, excludePaused: false, horizon: null, ...input };
  for (const key of Object.keys(query)) if (!['status', 'excludePaused', 'horizon'].includes(key)) throw new StorageError('invalid_purchase_query');
  if ((query.status !== null && typeof query.status !== 'string') || (query.horizon !== null && typeof query.horizon !== 'string')
      || typeof query.excludePaused !== 'boolean' || (query.excludePaused && query.status !== null)) throw new StorageError('invalid_purchase_query');
  return query;
}

export function mapStorageError(error) {
  if (error instanceof StorageError) return error;
  if (['SQLITE_CONSTRAINT_PRIMARYKEY', 'SQLITE_CONSTRAINT_UNIQUE', 6].includes(error?.code)) return new StorageError('already_exists');
  if (error?.code === 5) return new StorageError('not_found');
  // Preserve cause internally but never echo provider metadata into HTTP responses.
  return error;
}
