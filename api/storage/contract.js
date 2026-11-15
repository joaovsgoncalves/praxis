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
export function mapStorageError(error) {
  if (error instanceof StorageError) return error;
  if (['SQLITE_CONSTRAINT_PRIMARYKEY', 'SQLITE_CONSTRAINT_UNIQUE', 6].includes(error?.code)) return new StorageError('already_exists');
  if (error?.code === 5) return new StorageError('not_found');
  // Preserve cause internally but never echo provider metadata into HTTP responses.
  return error;
}
