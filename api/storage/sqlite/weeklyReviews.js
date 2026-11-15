import { StorageError, REVIEW_FIELDS } from '../contract.js';

/**
 * Tabela `weekly_reviews` existente. `week_start` é UNIQUE no próprio esquema; a violação vira
 * `already_exists` pelo mapeamento comum. `limit: null` = sem limite (LIMIT -1 do SQLite).
 */
export function sqliteWeeklyReviews(db) {
  const columns = REVIEW_FIELDS.join(', ');
  return {
    async get(id) { return db.prepare(`SELECT ${columns} FROM weekly_reviews WHERE id = ?`).get(id) ?? null; },
    async getByWeek(weekStart) { return db.prepare(`SELECT ${columns} FROM weekly_reviews WHERE week_start = ?`).get(weekStart) ?? null; },
    async list({ limit }) {
      return db.prepare(`SELECT ${columns} FROM weekly_reviews ORDER BY week_start DESC LIMIT ?`).all(limit ?? -1);
    },
    async create(row) {
      db.prepare(`INSERT INTO weekly_reviews (${columns}) VALUES (${REVIEW_FIELDS.map(() => '?').join(', ')})`).run(...REVIEW_FIELDS.map((field) => row[field]));
      return structuredClone(row);
    },
    async patch(id, fields) {
      const keys = Object.keys(fields);
      const result = db.prepare(`UPDATE weekly_reviews SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((key) => fields[key]), id);
      if (!result.changes) throw new StorageError('not_found');
    },
    async remove(id) { db.prepare('DELETE FROM weekly_reviews WHERE id = ?').run(id); },
  };
}
