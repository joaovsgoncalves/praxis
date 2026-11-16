/**
 * Domínios da fase 3 da migração. SÓ a fase 3 edita este arquivo.
 * Formato de cada item: veja storage/domains/index.js.
 *
 * Contrato (normalização dos argumentos) de cada domínio de rotina. As linhas trafegam como o SQLite
 * as guarda: colunas na ordem da tabela, valores já com a afinidade da coluna aplicada pelo serviço.
 */
import { StorageError, recordId, taskGoalKey, taskIdList } from '../contract.js';
import { sqliteFocusSessions } from '../sqlite/focusSessions.js';
import { sqliteWellnessChecks } from '../sqlite/wellnessChecks.js';
import { firestoreFocusSessions } from '../firestore/focusSessions.js';
import { firestoreWellnessChecks } from '../firestore/wellnessChecks.js';
import { sqliteGoals } from '../sqlite/goals.js';
import { sqliteHabits } from '../sqlite/habits.js';
import { firestoreGoals } from '../firestore/goals.js';
import { firestoreHabits } from '../firestore/habits.js';
import { sqliteXpEvents, sqliteGamification, sqliteAchievements, sqliteAchievementFacts, sqliteHabitLogs, sqliteRituals } from '../sqlite/xp.js';
import { firestoreXpEvents, firestoreGamification, firestoreAchievements, firestoreAchievementFacts, firestoreHabitLogs, firestoreRituals } from '../firestore/xp.js';

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

/**
 * Ficha de ordem de inserção (`_row` no Firestore) reservada por `nextRow()` antes das escritas, para
 * criar linhas de duas tabelas na mesma transação (o Firestore exige ler tudo antes de gravar).
 * SQLite: `null` (o rowid é implícito). Firestore: inteiro positivo.
 */
function rowToken(value) {
  if (value !== null && !(Number.isSafeInteger(value) && value > 0)) throw new StorageError('invalid_row_token');
  return value;
}
/** `goal_id = ?` e lista de ids a soltar: mesma regra das tarefas (storage/contract.js). */
const goalKey = taskGoalKey, idList = taskIdList;
const sqlStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

// ---- Metas: tabela `goals`, coleção users/{uid}/goals ----
export const GOAL_COLUMNS = Object.freeze([['id', 'TEXT', true], ['title', 'TEXT', true], ['description', 'TEXT'], ['deadline', 'TEXT'], ['timeframe', 'TEXT'], ['category', 'TEXT'], ['status', 'TEXT'], ['manual_progress', 'INTEGER'], ['created_date', 'TEXT']]);
const goalRows = rowContract(GOAL_COLUMNS, new Set(['id', 'created_date']));
export const GOAL_FIELDS = goalRows.fields;

// ---- Hábitos: tabela `habits`, coleção users/{uid}/habits (fase 3, domínio 4 completa o resto) ----
export const HABIT_COLUMNS = Object.freeze([['id', 'TEXT', true], ['title', 'TEXT', true], ['description', 'TEXT'], ['frequency', 'TEXT'], ['category', 'TEXT'], ['streak_target', 'INTEGER'], ['goal_id', 'TEXT'], ['source', 'TEXT'], ['status', 'TEXT'], ['sort_order', 'INTEGER'], ['kind', 'TEXT'], ['parent_id', 'TEXT'], ['position_in_parent', 'INTEGER'], ['emoji', 'TEXT'], ['tracking_mode', 'TEXT'], ['since_date', 'TEXT'], ['quick_increment', 'REAL'], ['created_date', 'TEXT'], ['recurrence_days', 'TEXT'], ['target_value', 'REAL'], ['unit', 'TEXT'], ['preferred_time', 'TEXT']]);
const habitRows = rowContract(HABIT_COLUMNS, new Set(['id', 'created_date']));
export const HABIT_FIELDS = habitRows.fields;
/** DEFAULT de cada coluna da tabela `habits` (lib/dbInit.js); `created_date` = `datetime('now')`. */
export const HABIT_DEFAULTS = Object.freeze({
  description: '', frequency: 'daily', category: 'pessoal', streak_target: 30, goal_id: null, source: 'manual', status: 'active',
  sort_order: null, kind: 'simple', parent_id: null, position_in_parent: null, emoji: '', tracking_mode: 'check', since_date: '',
  quick_increment: null, recurrence_days: '[]', target_value: null, unit: '', preferred_time: '',
});
/** Linha completa de hábito como o INSERT com colunas omitidas gravaria. */
export function habitRow(values, now = new Date()) {
  const row = { ...HABIT_DEFAULTS, created_date: sqlStamp(now), ...values };
  return Object.fromEntries(HABIT_FIELDS.map((field) => [field, row[field] ?? null]));
}

// ---- XP: tabelas `xp_events`, `gamification` (linha única 'main'), `achievements` ----
export const XP_EVENT_COLUMNS = Object.freeze([['id', 'TEXT', true], ['source_type', 'TEXT', true], ['source_id', 'TEXT', true], ['amount', 'INTEGER', true], ['reason', 'TEXT'], ['created_date', 'TEXT'], ['reversed_date', 'TEXT']]);
const xpEventRows = rowContract(XP_EVENT_COLUMNS, new Set(['id', 'source_type', 'source_id', 'amount', 'created_date']));
export const XP_EVENT_FIELDS = xpEventRows.fields;
/** Id fixo do documento de `gamification` (tabela de linha única): users/{uid}/gamification/main. */
export const GAMIFICATION_ID = 'main';
export const GAMIFICATION_COLUMNS = Object.freeze([['id', 'TEXT', true], ['xp_total', 'INTEGER'], ['level', 'INTEGER'], ['updated_date', 'TEXT']]);
const gamificationRows = rowContract(GAMIFICATION_COLUMNS, new Set(['id']));
export const GAMIFICATION_FIELDS = gamificationRows.fields;
export const ACHIEVEMENT_COLUMNS = Object.freeze([['id', 'TEXT', true], ['name', 'TEXT', true], ['description', 'TEXT'], ['emoji', 'TEXT'], ['xp_reward', 'INTEGER'], ['unlocked_date', 'TEXT']]);
const achievementRows = rowContract(ACHIEVEMENT_COLUMNS, new Set(['id', 'name', 'description', 'emoji', 'xp_reward']));
export const ACHIEVEMENT_FIELDS = achievementRows.fields;
// ---- Registros de hábito e rituais (fase 3, domínio 4 completa): tabelas `habit_logs`, `rituals` ----
export const HABIT_LOG_COLUMNS = Object.freeze([['id', 'TEXT', true], ['habit_id', 'TEXT', true], ['date', 'TEXT', true], ['completed', 'INTEGER'], ['created_date', 'TEXT'], ['value', 'REAL'], ['outcome', 'TEXT'], ['skip_reason', 'TEXT'], ['note', 'TEXT']]);
const habitLogRows = rowContract(HABIT_LOG_COLUMNS, new Set(['id', 'habit_id', 'date', 'created_date']));
export const HABIT_LOG_FIELDS = habitLogRows.fields;
export const RITUAL_COLUMNS = Object.freeze([['id', 'TEXT', true], ['name', 'TEXT', true], ['emoji', 'TEXT'], ['time_of_day', 'TEXT'], ['habits_order', 'TEXT'], ['status', 'TEXT'], ['created_date', 'TEXT']]);
const ritualRows = rowContract(RITUAL_COLUMNS, new Set(['id', 'created_date']));
export const RITUAL_FIELDS = ritualRows.fields;
/** [[id, posição], ...] para `reorder`: id válido e posição inteira. */
function positionEntries(entries) {
  if (!Array.isArray(entries)) throw new StorageError('invalid_query');
  return entries.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || !Number.isSafeInteger(entry[1])) throw new StorageError('invalid_query');
    return [recordId(entry[0]), entry[1]];
  });
}
/** Consulta de `habits`: `status` exato ou null (todos). */
function habitListQuery(input = {}) {
  plain(input, 'invalid_query');
  for (const key of Object.keys(input)) if (key !== 'status') throw new StorageError('invalid_query');
  const status = input.status ?? null;
  if (status !== null && typeof status !== 'string') throw new StorageError('invalid_query');
  return { status };
}
/** Filtros de `habit_logs`: cada um texto ou null (nulo = não filtra), como `if (date) ...` da antiga. */
function logListQuery(input = {}) {
  plain(input, 'invalid_query');
  const query = { date: null, from: null, to: null, habit_id: null, ...input };
  for (const [key, value] of Object.entries(query)) {
    if (!['date', 'from', 'to', 'habit_id'].includes(key) || (value !== null && typeof value !== 'string')) throw new StorageError('invalid_query');
  }
  return query;
}
function sourceKey(type, id) {
  if (typeof type !== 'string' || typeof id !== 'string') throw new StorageError('invalid_query');
  return [type, id];
}

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
  {
    name: 'goals',
    spec: () => ({
      get: ['read', (id) => [recordId(id)]],
      list: ['read', () => []],
      nextRow: ['read', () => []],
      create: ['readwrite', (row) => [goalRows.row(row)]],
      createAt: ['write', (row, token) => [goalRows.row(row), rowToken(token)]],
      patch: ['write', (id, fields) => [recordId(id), goalRows.patch(fields)]],
      remove: ['write', (id) => [recordId(id)]],
    }),
    sqlite: sqliteGoals,
    firestore: (userDoc, transaction, client) => firestoreGoals(userDoc, transaction, client),
  },
  {
    name: 'habits',
    spec: () => ({
      get: ['read', (id) => [recordId(id)]],
      maxSort: ['read', () => []],
      idsByGoal: ['read', (goalId) => [goalKey(goalId)]],
      nextRow: ['read', () => []],
      create: ['readwrite', (row) => [habitRows.row(row)]],
      createAt: ['write', (row, token) => [habitRows.row(row), rowToken(token)]],
      clearGoal: ['write', (ids) => [idList(ids)]],
      // Rotas de hábitos (domínio 4): lista `sort_order IS NULL, sort_order, created_date DESC`.
      list: ['read', (query) => [habitListQuery(query)]],
      patch: ['write', (id, fields) => [recordId(id), habitRows.patch(fields)]],
      remove: ['write', (id) => [recordId(id)]],
      idsByParent: ['read', (parentId) => [textKey(parentId)]],
      maxPosition: ['read', (parentId) => [textKey(parentId)]],
      // `UPDATE habits SET sort_order = <posição> WHERE id = <id>` para cada [id, posição]; id que não existe não faz nada.
      reorder: ['readwrite', (entries) => [positionEntries(entries)]],
    }),
    sqlite: sqliteHabits,
    firestore: (userDoc, transaction, client) => firestoreHabits(userDoc, transaction, client),
  },
  {
    name: 'xpEvents',
    spec: () => ({
      // Totais crus do SUM do SQLite (COALESCE 0); o serviço aplica Number/Math.max como a antiga.
      activeTotal: ['read', () => []],
      // Todos os eventos (auditoria e prova de migração), `created_date, id`.
      list: ['read', () => []],
      weekTotal: ['read', (since) => [goalKey(since)]],
      findActive: ['read', (type, id) => sourceKey(type, id)],
      // Índice único parcial (source_type, source_id) WHERE reversed_date IS NULL: no Firestore, sentinela.
      create: ['write', (row) => [xpEventRows.row(row)]],
      // Estorno: `reversed_date = carimbo` no evento (e, no Firestore, apaga a sentinela do ativo).
      reverse: ['readwrite', (id, stamp) => [recordId(id), textKey(stamp)]],
    }),
    sqlite: sqliteXpEvents,
    firestore: (userDoc, transaction, client) => firestoreXpEvents(userDoc, transaction, client),
  },
  {
    name: 'gamification',
    spec: () => ({
      get: ['read', (id) => [recordId(id)]],
      create: ['write', (row) => [gamificationRows.row(row)]],
      patch: ['write', (id, fields) => [recordId(id), gamificationRows.patch(fields)]],
    }),
    sqlite: sqliteGamification,
    firestore: (userDoc, transaction, client) => firestoreGamification(userDoc, transaction, client),
  },
  {
    name: 'achievements',
    spec: () => ({
      list: ['read', () => []],
      create: ['readwrite', (row) => [achievementRows.row(row)]],
      patch: ['write', (id, fields) => [recordId(id), achievementRows.patch(fields)]],
    }),
    sqlite: sqliteAchievements,
    firestore: (userDoc, transaction, client) => firestoreAchievements(userDoc, transaction, client),
  },
  {
    name: 'habitLogs',
    spec: () => ({
      create: ['readwrite', (row) => [habitLogRows.row(row)]],
      get: ['read', (id) => [recordId(id)]],
      find: ['read', (habitId, date) => [textKey(habitId), textKey(date)]],
      // Sem ORDER BY na antiga: com habit_id o SQLite usa o índice (habit_id, date); sem ele, ordem de inserção.
      list: ['read', (query) => [logListQuery(query)]],
      forDate: ['read', (date) => [textKey(date)]],
      forHabits: ['read', (ids) => [idList(ids)]],
      patch: ['write', (id, fields) => [recordId(id), habitLogRows.patch(fields)]],
      remove: ['readwrite', (id) => [recordId(id)]],
      removeByHabit: ['readwrite', (habitId) => [textKey(habitId)]],
    }),
    sqlite: sqliteHabitLogs,
    firestore: (userDoc, transaction, client) => firestoreHabitLogs(userDoc, transaction, client),
  },
  {
    name: 'rituals',
    spec: () => ({
      create: ['readwrite', (row) => [ritualRows.row(row)]],
      list: ['read', () => []],
      patch: ['write', (id, fields) => [recordId(id), ritualRows.patch(fields)]],
    }),
    sqlite: sqliteRituals,
    firestore: (userDoc, transaction, client) => firestoreRituals(userDoc, transaction, client),
  },
  {
    // Só leitura: tudo o que a avaliação de conquistas consulta, cru, em ordem canônica (rowid/_row).
    name: 'achievementFacts',
    spec: () => ({ load: ['read', () => []] }),
    sqlite: sqliteAchievementFacts,
    firestore: (userDoc, transaction, client) => firestoreAchievementFacts(userDoc, transaction, client),
  },
];
