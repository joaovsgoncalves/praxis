import { StorageError } from '../contract.js';
import { WELLNESS_FIELDS } from '../domains/phase3.js';

/** Tabela `wellness_checks` existente; mesmas consultas da rota antiga (oráculo wellness.bcbadad.js). */
export function sqliteWellnessChecks(db) {
  const columns = () => WELLNESS_FIELDS.join(', ');
  return {
    async get(id) { return db.prepare(`SELECT ${columns()} FROM wellness_checks WHERE id = ?`).get(id) ?? null; },
    async list({ date, limit }) {
      const params = [];
      let sql = `SELECT ${columns()} FROM wellness_checks`;
      if (date !== null) { sql += ' WHERE date = ?'; params.push(date); }
      return db.prepare(`${sql} ORDER BY date DESC LIMIT ?`).all(...params, limit);
    },
    // Sem ORDER BY, como a rota antiga: varredura na ordem do rowid, o primeiro inserido vence.
    async findByDate(date) { return db.prepare(`SELECT ${columns()} FROM wellness_checks WHERE date = ?`).get(date) ?? null; },
    async create(row) {
      db.prepare(`INSERT INTO wellness_checks (${columns()}) VALUES (${WELLNESS_FIELDS.map(() => '?').join(', ')})`).run(...WELLNESS_FIELDS.map((field) => row[field]));
      return structuredClone(row);
    },
    async patch(id, fields) {
      const keys = Object.keys(fields);
      const result = db.prepare(`UPDATE wellness_checks SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((key) => fields[key]), id);
      if (!result.changes) throw new StorageError('not_found');
    },
  };
}
