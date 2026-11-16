/**
 * Configurações sobre a camada assíncrona, com o comportamento da rota antiga (oráculo em
 * test-support/oracles/settings.bcbadad.js):
 *
 * - linha única `default`; conta sem linha ganha a linha com os padrões do SQLite (GET ou PUT);
 * - PUT: `COALESCE(?, coluna)` nos sete campos antigos (ausente e null preservam), na ordem dos
 *   marcadores, com a mesma ligação do better-sqlite3 (lista achata, objeto vira saco nomeado e
 *   desloca os valores, booleano é TypeError) e a afinidade de cada coluna;
 * - meta de foco: só quando veio no corpo, null explícito desliga (validação fica na rota);
 * - erro de ligação acontece antes de qualquer gravação: o pedido inteiro não grava nada.
 *
 * Diferença intencional: número fora do subconjunto provado de `sqliteSemantics.js` (ex.: 1e20 num
 * campo inteiro, 1e15 num campo de texto) responde 500 `sqlite_coercion_unsupported` sem gravar, em
 * vez de guardar o REAL. Nem a tela nem o Alfred mandam isso.
 */
import { bindPositional } from '../../storage/sqliteSemantics.js';
import { USER_SETTINGS_DEFAULTS } from '../../storage/domains/phase4.js';

// Colunas do UPDATE antigo, na ordem dos `?`.
const COALESCED = ['full_name', 'avatar_url', 'pomodoro_focus', 'pomodoro_break', 'notif_habits', 'notif_goals', 'list_density'];

export function createSettingsService({ storage }) {
  if (!storage?.userSettings || typeof storage.transaction !== 'function') throw new TypeError('settings service requires storage');

  async function get() {
    const row = await storage.userSettings.get();
    if (row) return row;
    return storage.transaction(async (tx) => {
      const current = await tx.userSettings.get();
      if (current) return current;
      return tx.userSettings.save(USER_SETTINGS_DEFAULTS);
    });
  }

  /**
   * values: os sete campos crus do corpo, na ordem do UPDATE antigo (densidade já validada).
   * focusGoal: { value } quando o corpo trouxe `focus_weekly_goal_minutes`, senão null.
   */
  async function update(values, focusGoal) {
    const bound = bindPositional(COALESCED.map((key) => values[key]), COALESCED.length);
    return storage.transaction(async (tx) => {
      const current = (await tx.userSettings.get()) ?? { ...USER_SETTINGS_DEFAULTS };
      const next = { ...current };
      COALESCED.forEach((key, index) => { if (bound[index] !== null) next[key] = bound[index]; });
      if (focusGoal) next.focus_weekly_goal_minutes = focusGoal.value;
      // Devolve a linha como ficou guardada (afinidade aplicada), como o SELECT da rota antiga.
      return tx.userSettings.save(next);
    });
  }

  return Object.freeze({ get, update });
}
