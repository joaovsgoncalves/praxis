import { compareSqlite } from '../sqliteOrder.js';
import { GOAL_FIELDS } from '../domains/phase3.js';
import { phase3Rows } from './phase3Rows.js';

/** `users/{uid}/goals`: mesmas consultas da rota antiga, em memória (ver phase3Rows.js). */
export function firestoreGoals(userDoc, transaction, client) {
  const base = phase3Rows(userDoc, transaction, client, 'goals', GOAL_FIELDS);
  return {
    get: base.get,
    nextRow: base.nextRow,
    create: base.create,
    createAt: base.createAt,
    patch: base.patch,
    remove: base.remove,
    // ORDER BY created_date DESC: NULL por último; empate na ordem de inserção.
    async list() {
      const rows = await base.all();
      rows.sort((a, b) => compareSqlite(b.row.created_date, a.row.created_date) || a.seq - b.seq);
      return rows.map(({ row }) => row);
    },
  };
}
