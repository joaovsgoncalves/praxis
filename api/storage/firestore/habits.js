import { compareSqlite, maxSqlite } from '../sqliteOrder.js';
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
    /** `ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC`; empate na ordem de inserção. */
    async list({ status }) {
      return (await base.all()).filter(({ row }) => status === null || row.status === status)
        .sort((a, b) => ((a.row.sort_order === null) - (b.row.sort_order === null)) || compareSqlite(a.row.sort_order, b.row.sort_order)
          || compareSqlite(b.row.created_date, a.row.created_date) || a.seq - b.seq).map(({ row }) => row);
    },
    patch: base.patch,
    remove: base.remove,
    async idsByParent(parentId) { return (await base.all()).filter(({ row }) => row.parent_id === parentId).map(({ row }) => row.id); },
    async maxPosition(parentId) { return maxSqlite((await base.all()).filter(({ row }) => row.parent_id === parentId).map(({ row }) => row.position_in_parent)); },
    async reorder(entries) {
      const present = new Set((await base.all()).map(({ row }) => row.id));
      for (const [id, position] of entries) if (present.has(id)) await base.patch(id, { sort_order: position });
    },
  };
}
