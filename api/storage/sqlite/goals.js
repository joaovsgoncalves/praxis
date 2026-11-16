import { StorageError } from '../contract.js';
import { GOAL_FIELDS } from '../domains/phase3.js';

/** Tabela `goals` existente; mesmas consultas da rota antiga (oráculo goals.bcbadad.js). */
export function sqliteGoals(db) {
  const columns = () => GOAL_FIELDS.join(', ');
  const insert = (row) => {
    db.prepare(`INSERT INTO goals (${columns()}) VALUES (${GOAL_FIELDS.map(() => '?').join(', ')})`).run(...GOAL_FIELDS.map((field) => row[field]));
    return structuredClone(row);
  };
  return {
    async get(id) { return db.prepare(`SELECT ${columns()} FROM goals WHERE id = ?`).get(id) ?? null; },
    async list() { return db.prepare(`SELECT ${columns()} FROM goals ORDER BY created_date DESC`).all(); },
    // O rowid é a ordem de inserção: nada a reservar.
    async nextRow() { return null; },
    async create(row) { return insert(row); },
    async createAt(row) { return insert(row); },
    async patch(id, fields) {
      const keys = Object.keys(fields);
      const result = db.prepare(`UPDATE goals SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((key) => fields[key]), id);
      if (!result.changes) throw new StorageError('not_found');
    },
    async remove(id) { db.prepare('DELETE FROM goals WHERE id = ?').run(id); },
  };
}
