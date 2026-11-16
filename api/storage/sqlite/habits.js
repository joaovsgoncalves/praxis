import { StorageError } from '../contract.js';
import { HABIT_FIELDS } from '../domains/phase3.js';

/**
 * Tabela `habits` existente. Por enquanto só o que as metas usam (posição, vínculo inicial, soltar
 * vínculo); o domínio de hábitos (rotas /api/habits) completa o resto.
 */
export function sqliteHabits(db) {
  const columns = () => HABIT_FIELDS.join(', ');
  const insert = (row) => {
    db.prepare(`INSERT INTO habits (${columns()}) VALUES (${HABIT_FIELDS.map(() => '?').join(', ')})`).run(...HABIT_FIELDS.map((field) => row[field]));
    return structuredClone(row);
  };
  return {
    async get(id) { return db.prepare(`SELECT ${columns()} FROM habits WHERE id = ?`).get(id) ?? null; },
    async maxSort() { return db.prepare('SELECT MAX(sort_order) AS m FROM habits').get().m; },
    async idsByGoal(goalId) { return db.prepare('SELECT id FROM habits WHERE goal_id = ?').pluck().all(goalId); },
    async nextRow() { return null; },
    async create(row) { return insert(row); },
    async createAt(row) { return insert(row); },
    async clearGoal(ids) {
      const update = db.prepare('UPDATE habits SET goal_id = NULL WHERE id = ?');
      for (const id of ids) update.run(id);
    },
    async list({ status }) {
      const order = 'ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC';
      return status === null
        ? db.prepare(`SELECT ${columns()} FROM habits ${order}`).all()
        : db.prepare(`SELECT ${columns()} FROM habits WHERE status = ? ${order}`).all(status);
    },
    async patch(id, fields) {
      const keys = Object.keys(fields);
      const result = db.prepare(`UPDATE habits SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((key) => fields[key]), id);
      if (!result.changes) throw new StorageError('not_found');
    },
    async remove(id) { db.prepare('DELETE FROM habits WHERE id = ?').run(id); },
    async idsByParent(parentId) { return db.prepare('SELECT id FROM habits WHERE parent_id = ?').pluck().all(parentId); },
    async maxPosition(parentId) { return db.prepare('SELECT MAX(position_in_parent) AS m FROM habits WHERE parent_id = ?').get(parentId).m; },
    async reorder(entries) {
      const update = db.prepare('UPDATE habits SET sort_order = ? WHERE id = ?');
      for (const [id, position] of entries) update.run(position, id);
    },
  };
}
