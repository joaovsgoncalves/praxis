import { maxSqlite } from '../sqliteOrder.js';
import { HABIT_FIELDS } from '../domains/phase3.js';
import { phase3Rows } from './phase3Rows.js';

/** `users/{uid}/habits`: por enquanto só o que as metas usam (ver storage/sqlite/habits.js). */
export function firestoreHabits(userDoc, transaction, client) {
  const base = phase3Rows(userDoc, transaction, client, 'habits', HABIT_FIELDS);
  return {
    get: base.get,
    nextRow: base.nextRow,
    create: base.create,
    createAt: base.createAt,
    async maxSort() { return maxSqlite((await base.all()).map(({ row }) => row.sort_order)); },
    async idsByGoal(goalId) { return (await base.all()).filter(({ row }) => row.goal_id === goalId).map(({ row }) => row.id); },
    async clearGoal(ids) { for (const id of ids) await base.patch(id, { goal_id: null }); },
  };
}
