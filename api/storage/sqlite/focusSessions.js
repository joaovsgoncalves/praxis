import { FOCUS_FIELDS } from '../domains/phase3.js';

/** Tabela `focus_sessions` existente; mesmas consultas da rota antiga (oráculo focus.bcbadad.js). */
export function sqliteFocusSessions(db) {
  const columns = () => FOCUS_FIELDS.join(', ');
  return {
    async get(id) { return db.prepare(`SELECT ${columns()} FROM focus_sessions WHERE id = ?`).get(id) ?? null; },
    async list({ date, limit }) {
      const params = [];
      let sql = `SELECT ${columns()} FROM focus_sessions`;
      if (date !== null) { sql += ' WHERE date = ?'; params.push(date); }
      return db.prepare(`${sql} ORDER BY created_date DESC LIMIT ?`).all(...params, limit);
    },
    async stats({ since, limit }) {
      return db.prepare(`
        SELECT task_id, COALESCE(MAX(task_title), '(sem tarefa)') AS task_title,
               SUM(duration_seconds) AS total_seconds, COUNT(*) AS sessions
        FROM focus_sessions
        WHERE created_date >= ?
        GROUP BY task_id, task_title
        ORDER BY total_seconds DESC
        LIMIT ?`).all(since, limit);
    },
    async create(row) {
      db.prepare(`INSERT INTO focus_sessions (${columns()}) VALUES (${FOCUS_FIELDS.map(() => '?').join(', ')})`).run(...FOCUS_FIELDS.map((field) => row[field]));
      return structuredClone(row);
    },
  };
}
