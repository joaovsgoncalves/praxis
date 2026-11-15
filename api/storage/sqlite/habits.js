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
  };
}
