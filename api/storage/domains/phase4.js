/**
 * Domínios da fase 4 da migração. SÓ a fase 4 edita este arquivo.
 * Formato de cada item: veja storage/domains/index.js.
 */
import { StorageError } from '../contract.js';
import { applyAffinity } from '../sqliteSemantics.js';
import { sqliteUserSettings } from '../sqlite/userSettings.js';
import { firestoreUserSettings } from '../firestore/userSettings.js';

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

export const DOMAINS = [userSettings];
