/**
 * Domínios da fase 3 da migração. SÓ a fase 3 edita este arquivo.
 * Formato de cada item: veja storage/domains/index.js.
 *
 * Contrato (normalização dos argumentos) de cada domínio de rotina. As linhas trafegam como o SQLite
 * as guarda: colunas na ordem da tabela, valores já com a afinidade da coluna aplicada pelo serviço.
 */
import { StorageError, recordId } from '../contract.js';
import { sqliteFocusSessions } from '../sqlite/focusSessions.js';
import { sqliteWellnessChecks } from '../sqlite/wellnessChecks.js';
import { firestoreFocusSessions } from '../firestore/focusSessions.js';
import { firestoreWellnessChecks } from '../firestore/wellnessChecks.js';

function plain(value, code = 'invalid_record') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new StorageError(code);
}

/**
 * Valor que uma coluna SQLite pode guardar, pela afinidade: TEXT só texto (número vira texto ao
 * gravar); INTEGER e REAL guardam número ou texto não convertido. `notNull` = NOT NULL da tabela.
 */
function columnValue(value, affinity, notNull = false) {
  if (value === null) return !notNull;
  if (typeof value === 'string') return true;
  return affinity !== 'TEXT' && typeof value === 'number' && Number.isFinite(value);
}

/** Validador de linha completa e de alteração a partir das colunas [nome, afinidade, NOT NULL?]. */
function rowContract(columns, immutable) {
  const byName = new Map(columns.map(([name, affinity, notNull]) => [name, { affinity, notNull: Boolean(notNull) }]));
  const fields = Object.freeze(columns.map(([name]) => name));
  function check(input) {
    plain(input);
    for (const [key, value] of Object.entries(input)) {
      const column = byName.get(key);
      if (!column) throw new StorageError('unknown_field');
      if (key === 'id') recordId(value);
      else if (!columnValue(value, column.affinity, column.notNull)) throw new StorageError('invalid_value');
    }
    return structuredClone(input);
  }
  return {
    fields,
    row(input) {
      const clean = check(input);
      for (const field of fields) if (!Object.hasOwn(clean, field)) throw new StorageError('incomplete_row');
      return Object.fromEntries(fields.map((field) => [field, clean[field]]));
    },
    patch(input) {
      const clean = check(input);
      for (const key of Object.keys(clean)) if (immutable.has(key)) throw new StorageError('immutable_field');
      if (!Object.keys(clean).length) throw new StorageError('empty_patch');
      return clean;
    },
  };
}

function listQuery(defaultLimit) {
  return (input = {}) => {
    plain(input, 'invalid_query');
    const query = { date: null, limit: defaultLimit, ...input };
    for (const key of Object.keys(query)) if (!['date', 'limit'].includes(key)) throw new StorageError('invalid_query');
    if ((query.date !== null && typeof query.date !== 'string') || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000) throw new StorageError('invalid_query');
    return query;
  };
}
function textKey(value) {
  if (typeof value !== 'string') throw new StorageError('invalid_query');
  return value;
}

// ---- Foco: tabela `focus_sessions` (lib/dbInit.js), coleção users/{uid}/focusSessions ----
export const FOCUS_COLUMNS = Object.freeze([['id', 'TEXT', true], ['task_id', 'TEXT'], ['task_title', 'TEXT'], ['date', 'TEXT'], ['duration_seconds', 'INTEGER'], ['created_date', 'TEXT']]);
const focusRows = rowContract(FOCUS_COLUMNS, new Set(['id']));
export const FOCUS_FIELDS = focusRows.fields;

/** `since`: texto comparado com `created_date` como o SQLite (bytes). `limit` do GROUP BY. */
function statsQuery(input) {
  plain(input, 'invalid_query');
  const query = { limit: 20, ...input };
  for (const key of Object.keys(query)) if (!['since', 'limit'].includes(key)) throw new StorageError('invalid_query');
  if (typeof query.since !== 'string' || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000) throw new StorageError('invalid_query');
  return query;
}

// ---- Bem-estar: tabela `wellness_checks`, coleção users/{uid}/wellnessChecks ----
export const WELLNESS_COLUMNS = Object.freeze([['id', 'TEXT', true], ['date', 'TEXT', true], ['sleep_hours', 'REAL'], ['sleep_quality', 'INTEGER'], ['mood', 'INTEGER'], ['productivity', 'INTEGER'], ['note', 'TEXT'], ['created_date', 'TEXT']]);
const wellnessRows = rowContract(WELLNESS_COLUMNS, new Set(['id', 'date', 'created_date']));
export const WELLNESS_FIELDS = wellnessRows.fields;

export const DOMAINS = [
  {
    name: 'focusSessions',
    spec: () => ({
      get: ['read', (id) => [recordId(id)]],
      list: ['read', (query) => [listQuery(50)(query)]],
      stats: ['read', (query) => [statsQuery(query)]],
      // Firestore lê a sequência (ordem de inserção) antes de gravar: mesma regra nos dois motores.
      create: ['readwrite', (row) => [focusRows.row(row)]],
    }),
    sqlite: sqliteFocusSessions,
    firestore: (userDoc, transaction, client) => firestoreFocusSessions(userDoc, transaction, client),
  },
  {
    name: 'wellnessChecks',
    spec: () => ({
      get: ['read', (id) => [recordId(id)]],
      list: ['read', (query) => [listQuery(30)(query)]],
      findByDate: ['read', (date) => [textKey(date)]],
      create: ['readwrite', (row) => [wellnessRows.row(row)]],
      patch: ['write', (id, fields) => [recordId(id), wellnessRows.patch(fields)]],
    }),
    sqlite: sqliteWellnessChecks,
    firestore: (userDoc, transaction, client) => firestoreWellnessChecks(userDoc, transaction, client),
  },
];
