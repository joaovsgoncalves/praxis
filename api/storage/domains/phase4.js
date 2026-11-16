/**
 * Domínios da fase 4 da migração. SÓ a fase 4 edita este arquivo.
 * Formato de cada item: veja storage/domains/index.js.
 */
import { StorageError, recordId } from '../contract.js';
import { applyAffinity } from '../sqliteSemantics.js';
import { sqliteUserSettings } from '../sqlite/userSettings.js';
import { firestoreUserSettings } from '../firestore/userSettings.js';
import { sqliteProjects, sqliteProjectUpdates } from '../sqlite/projects.js';
import { firestoreProjects, firestoreProjectUpdates } from '../firestore/projects.js';
import { sqliteContinuityGuidance } from '../sqlite/continuityGuidance.js';
import { firestoreContinuityGuidance } from '../firestore/continuityGuidance.js';
import { sqliteInsightsRead } from '../sqlite/insightsRead.js';
import { firestoreInsightsRead } from '../firestore/insightsRead.js';

// --- Configurações: tabela `user_settings`, linha única. ---
/**
 * Colunas da tabela no esquema atual (lib/dbInit.js), na ordem do `SELECT *`.
 * Firestore: users/{uid}/userSettings/default — id fixo `default`, o mesmo da linha SQLite.
 */
export const USER_SETTINGS_ID = 'default';
export const USER_SETTINGS_FIELDS = Object.freeze([
  'id', 'full_name', 'avatar_url', 'pomodoro_focus', 'pomodoro_break', 'notif_habits', 'notif_goals',
  'list_density', 'nutrition_enabled', 'nutrition_show_on_today', 'focus_weekly_goal_minutes',
]);
const USER_SETTINGS_AFFINITY = Object.freeze({
  id: 'TEXT', full_name: 'TEXT', avatar_url: 'TEXT', pomodoro_focus: 'INTEGER', pomodoro_break: 'INTEGER',
  notif_habits: 'INTEGER', notif_goals: 'INTEGER', list_density: 'TEXT', nutrition_enabled: 'INTEGER',
  nutrition_show_on_today: 'INTEGER', focus_weekly_goal_minutes: 'INTEGER',
});
/** O que `INSERT INTO user_settings (id) VALUES ('default')` grava (provado no teste de contrato). */
export const USER_SETTINGS_DEFAULTS = Object.freeze({
  id: USER_SETTINGS_ID, full_name: 'João Victor', avatar_url: null, pomodoro_focus: 25, pomodoro_break: 5,
  notif_habits: 1, notif_goals: 1, list_density: 'comfortable', nutrition_enabled: 1, nutrition_show_on_today: 1,
  focus_weekly_goal_minutes: null,
});

function plainObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new StorageError(code);
}
/**
 * Linha inteira: texto, número finito ou null por coluna, guardado com a afinidade da coluna no SQLite
 * (os dois motores guardam o mesmo valor; fora do subconjunto provado, `sqlite_coercion_unsupported`).
 */
function userSettingsRow(input) {
  plainObject(input, 'invalid_user_settings');
  for (const key of Object.keys(input)) if (!USER_SETTINGS_FIELDS.includes(key)) throw new StorageError('unknown_user_settings_field');
  for (const key of USER_SETTINGS_FIELDS) if (!Object.prototype.hasOwnProperty.call(input, key)) throw new StorageError('incomplete_user_settings');
  if (input.id !== USER_SETTINGS_ID) throw new StorageError('invalid_user_settings_id');
  for (const key of USER_SETTINGS_FIELDS) {
    const value = input[key];
    if (!(value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))) throw new StorageError('invalid_user_settings_value');
  }
  return Object.fromEntries(USER_SETTINGS_FIELDS.map((key) => [key, applyAffinity(input[key], USER_SETTINGS_AFFINITY[key])]));
}

const userSettings = {
  name: 'userSettings',
  spec: () => ({
    get: ['read', () => []],
    save: ['write', (row) => [userSettingsRow(row)]],
  }),
  sqlite: (db) => sqliteUserSettings(db, USER_SETTINGS_FIELDS),
  firestore: (userDoc, transaction) => firestoreUserSettings(userDoc, transaction, { fields: USER_SETTINGS_FIELDS, id: USER_SETTINGS_ID }),
};

// --- Frentes: tabelas `projects` e `project_updates`. ---
/** Colunas de `projects` num banco novo (projects.js `initProjectsSchema`), na ordem do `SELECT *`. */
export const PROJECT_FIELDS = Object.freeze([
  'id', 'slug', 'name', 'tagline', 'kind', 'column', 'focus', 'live', 'objective', 'status_summary',
  'current_slice', 'next_step', 'last_move_at', 'last_move_note', 'last_reviewed_at', 'notes',
  'shipped_note', 'blocked_note', 'prod_url', 'repo_path', 'sort_order', 'created_date', 'updated_date',
  'parent_slug', 'revision',
]);
const PROJECT_INTEGER = new Set(['focus', 'live', 'sort_order', 'revision']);
const PROJECT_NOT_NULL = new Set(['id', 'slug', 'name', 'kind', 'column', 'focus', 'live', 'revision']);
/** `id`, `slug` e criação não mudam depois de gravados; toda alteração manda a revisão nova. */
const PROJECT_IMMUTABLE = new Set(['id', 'slug', 'created_date']);
export const PROJECT_UPDATE_FIELDS = Object.freeze(['id', 'project_id', 'date', 'summary', 'source', 'created_by', 'created_at']);
const UPDATE_NOT_NULL = new Set(['id', 'project_id', 'date', 'summary']);

function scalarColumn(value, affinity, required, code) {
  // Número não finito segue para a afinidade, que recusa com `sqlite_coercion_unsupported`.
  if (!(value === null || typeof value === 'string' || (typeof value === 'number' && !Number.isNaN(value)))) throw new StorageError(code);
  const stored = applyAffinity(value, affinity);
  if (stored === null && required) throw new StorageError(code);
  return stored;
}
function fullRow(input, fieldList, integer, notNull, prefix, keyField = 'id') {
  plainObject(input, `invalid_${prefix}`);
  for (const key of Object.keys(input)) if (!fieldList.includes(key)) throw new StorageError(`unknown_${prefix}_field`);
  for (const key of fieldList) if (!Object.prototype.hasOwnProperty.call(input, key)) throw new StorageError(`incomplete_${prefix}`);
  const row = Object.fromEntries(fieldList.map((key) => [key, scalarColumn(input[key], integer.has(key) ? 'INTEGER' : 'TEXT', notNull.has(key), `invalid_${prefix}_value`)]));
  recordId(row[keyField]);
  return row;
}
function projectRow(input) {
  const row = fullRow(input, PROJECT_FIELDS, PROJECT_INTEGER, PROJECT_NOT_NULL, 'project');
  if (!Number.isSafeInteger(row.revision) || row.revision < 0) throw new StorageError('invalid_project_revision');
  return row;
}
function projectChanges(input) {
  plainObject(input, 'invalid_project');
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!PROJECT_FIELDS.includes(key)) throw new StorageError('unknown_project_field');
    if (PROJECT_IMMUTABLE.has(key)) throw new StorageError('immutable_project_field');
    out[key] = scalarColumn(value, PROJECT_INTEGER.has(key) ? 'INTEGER' : 'TEXT', PROJECT_NOT_NULL.has(key), 'invalid_project_value');
  }
  if (!Number.isSafeInteger(out.revision) || out.revision < 1) throw new StorageError('project_revision_required');
  return out;
}
const updateRow = (input) => fullRow(input, PROJECT_UPDATE_FIELDS, new Set(), UPDATE_NOT_NULL, 'project_update');
function timelineLimit(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new StorageError('invalid_limit');
  return value;
}

const projects = {
  name: 'projects',
  spec: () => ({
    /** Chave = id ou slug; o id vence (mesma escolha do `WHERE id = ? OR slug = ?`). */
    get: ['read', (key) => [recordId(key)]],
    /** Ordem `focus DESC, sort_order ASC, name ASC`, empate pela ordem de inserção. */
    list: ['read', () => []],
    // Firestore lê a sequência e a sentinela do slug antes de gravar: mesma regra nos dois motores.
    create: ['readwrite', (row) => [projectRow(row)]],
    patch: ['write', (id, changes) => [recordId(id), projectChanges(changes)]],
  }),
  sqlite: (db) => sqliteProjects(db, PROJECT_FIELDS),
  firestore: (userDoc, transaction, client) => firestoreProjects(userDoc, transaction, client, PROJECT_FIELDS),
};

const projectUpdates = {
  name: 'projectUpdates',
  spec: () => ({
    /** Ordem `date DESC, created_at DESC`, empate pela ordem de inserção; `limit` inteiro >= 0. */
    list: ['read', (projectId, limit) => [recordId(projectId), timelineLimit(limit)]],
    create: ['readwrite', (row) => [updateRow(row)]],
  }),
  sqlite: (db) => sqliteProjectUpdates(db, PROJECT_UPDATE_FIELDS),
  firestore: (userDoc, transaction, client) => firestoreProjectUpdates(userDoc, transaction, client, PROJECT_UPDATE_FIELDS),
};

// --- Orientação do dia: tabela `continuity_guidance`, uma linha por data (chave = `date`). ---
export const GUIDANCE_FIELDS = Object.freeze(['date', 'summary', 'priorities_json', 'source', 'generated_at', 'created_at', 'updated_at']);
const GUIDANCE_NOT_NULL = new Set(['date', 'summary', 'priorities_json', 'source', 'generated_at']);
const guidanceRow = (input) => fullRow(input, GUIDANCE_FIELDS, new Set(), GUIDANCE_NOT_NULL, 'guidance', 'date');

const continuityGuidance = {
  name: 'continuityGuidance',
  spec: () => ({
    get: ['read', (date) => [recordId(date)]],
    /** Linha inteira (a troca de 0 a 3 ações é o documento todo, numa gravação). */
    put: ['write', (row) => [guidanceRow(row)]],
  }),
  sqlite: (db) => sqliteContinuityGuidance(db, GUIDANCE_FIELDS),
  firestore: (userDoc, transaction) => firestoreContinuityGuidance(userDoc, transaction, GUIDANCE_FIELDS),
};

// --- Insights de leitura: domínio SÓ DE LEITURA sobre tabelas de outras fases e das frentes. ---
/**
 * Lê `tasks`, `habits`, `habit_logs`, `focus_sessions`, `wellness_checks`, `capture_queue`, `projects` e
 * `project_updates` (mapeamento do FROZEN §2: users/{uid}/<camelCase(tabela)>/{documentId(id)}, documento =
 * linha SQLite + `_row` opcional). Nunca grava nelas. Cada método é uma das consultas da rota antiga
 * (routes/insights.js, lib/weeklyInsights.js, lib/avoidanceInsights.js no commit bcbadad).
 *
 * Ordem de inserção (o rowid) que as consultas antigas usavam sem ORDER BY: `_row` do documento. Documento
 * sem `_row` vem depois dos que têm e desempata pelo id; só importa em empate de ordenação.
 * Argumento é sempre texto (data ou carimbo, ligado como TEXT); qualquer outro tipo é recusado.
 */
const insightsText = (value) => {
  if (typeof value !== 'string') throw new StorageError('invalid_insights_argument');
  return value;
};
const insightsNone = (...args) => {
  if (args.length) throw new StorageError('invalid_insights_argument');
  return [];
};
const insightsTexts = (count) => (...args) => {
  if (args.length !== count) throw new StorageError('invalid_insights_argument');
  return args.map(insightsText);
};
export const INSIGHTS_READ_METHODS = Object.freeze({
  // /api/insights/best-hours e /correlation
  focusSessionsSince: 1, wellnessSince: 1,
  // /api/insights/weekly
  completedTasksOfWeek: 2, stalePendingTasks: 1, activeHabits: 0, habitLogs: 2, taskDayCounts: 2, focusTotals: 2,
  wellnessBetween: 2, ideaCounts: 2, promissoras: 0, projectNames: 0, projectUpdatesBetween: 2, completedTasksForHistory: 2,
  // /api/insights/avoidance
  overdueTasks: 1, floatingTasks: 1, staleIdeas: 1, closedHabitIds: 1, skippedHabitIds: 1, skippedHabitCounts: 2,
  failedCaptureCount: 0, pendingTodayCount: 1,
});

const insightsRead = {
  name: 'insightsRead',
  spec: () => Object.fromEntries(Object.entries(INSIGHTS_READ_METHODS).map(([method, count]) => [method, ['read', count === 0 ? insightsNone : insightsTexts(count)]])),
  sqlite: (db) => sqliteInsightsRead(db),
  firestore: (userDoc, transaction) => firestoreInsightsRead(userDoc, transaction),
};

export const DOMAINS = [userSettings, projects, projectUpdates, continuityGuidance, insightsRead];
