import { StorageError, TASK_FIELDS } from '../contract.js';

/** Operações sobre a tabela `tasks` existente, na conexão dedicada escolhida pelo driver. */
export function sqliteTasks(db) {
  return {
    async get(id) { return db.prepare('SELECT * FROM tasks WHERE id=?').get(id) ?? null; },
    async list({ date, status, limit, offset, ...rest }) {
      if (Object.keys(rest).length) throw new StorageError('invalid_task_query');
      const predicates = [], params = [];
      // Missing versus explicit null has different meaning; normalized query preserves both.
      if (date !== undefined) { predicates.push('date IS ?'); params.push(date); }
      if (status !== undefined) { predicates.push('status IS ?'); params.push(status); }
      return db.prepare(`SELECT * FROM tasks ${predicates.length ? 'WHERE ' + predicates.join(' AND ') : ''} ORDER BY id COLLATE BINARY ASC LIMIT ? OFFSET ?`).all(...params,limit,offset);
    },
    async create(row) {
      db.prepare(`INSERT INTO tasks (${TASK_FIELDS.join(',')}) VALUES (${TASK_FIELDS.map(() => '?').join(',')})`).run(...TASK_FIELDS.map(field=>row[field]));
      return structuredClone(row);
    },
    async patch(id, fields) {
      const keys = Object.keys(fields);
      if (keys.some(k=>!TASK_FIELDS.includes(k)||k==='id')) throw new StorageError('unknown_task_field');
      const result=db.prepare(`UPDATE tasks SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`).run(...keys.map(k=>fields[k]),id);
      if (!result.changes) throw new StorageError('not_found');
    },
    async remove(id) { db.prepare('DELETE FROM tasks WHERE id=?').run(id); },
  };
}
