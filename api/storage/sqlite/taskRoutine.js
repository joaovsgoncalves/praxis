import { StorageError } from '../contract.js';
import { CHECKLIST_FIELDS, QUEUE_FIELDS, ROLLOVER_FIELDS } from '../domains/phase3.js';

const insert = (db, table, fields, row) => {
  db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...fields.map((field) => row[field]));
  return structuredClone(row);
};
const update = (db, table, key, id, fields) => {
  const keys = Object.keys(fields);
  const result = db.prepare(`UPDATE ${table} SET ${keys.map((name) => `${name} = ?`).join(', ')} WHERE ${key} = ?`).run(...keys.map((name) => fields[name]), id);
  if (!result.changes) throw new StorageError('not_found');
};

/** Tabela `task_checklist_items`: os mesmos SQL da rota antiga. */
export function sqliteTaskChecklistItems(db) {
  return {
    async get(id, taskId) { return db.prepare('SELECT * FROM task_checklist_items WHERE id = ? AND task_id = ?').get(id, taskId) ?? null; },
    async list(taskId) {
      return db.prepare('SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY sort_order IS NULL, sort_order ASC, created_date ASC').all(taskId);
    },
    // Uma consulta agregada para a lista inteira (json_each evita estourar o limite de parâmetros).
    async counts(taskIds) {
      if (!taskIds.length) return [];
      return db.prepare(`
        SELECT task_id, COUNT(*) AS total, COALESCE(SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END), 0) AS done
        FROM task_checklist_items
        WHERE task_id IN (SELECT value FROM json_each(?))
        GROUP BY task_id
      `).all(JSON.stringify(taskIds));
    },
    async maxSort(taskId) { return db.prepare('SELECT MAX(sort_order) AS m FROM task_checklist_items WHERE task_id = ?').get(taskId).m; },
    async nextRow() { return null; },
    async create(row) { return insert(db, 'task_checklist_items', CHECKLIST_FIELDS, row); },
    async createAt(row) { return insert(db, 'task_checklist_items', CHECKLIST_FIELDS, row); },
    async patch(id, fields) { update(db, 'task_checklist_items', 'id', id, fields); },
    async remove(id) { db.prepare('DELETE FROM task_checklist_items WHERE id = ?').run(id); },
    async removeByTask(taskId) { db.prepare('DELETE FROM task_checklist_items WHERE task_id = ?').run(taskId); },
    async removeMany(ids) { const remove = db.prepare('DELETE FROM task_checklist_items WHERE id = ?'); for (const id of ids) remove.run(id); },
  };
}

/** Tabela `task_calendar_queue` (lib/taskCalendarQueue.js `initTaskCalendarQueueSchema`): chave `task_id`. */
export function sqliteTaskCalendarQueue(db) {
  return {
    async get(taskId) { return db.prepare('SELECT * FROM task_calendar_queue WHERE task_id = ?').get(taskId) ?? null; },
    async nextRow() { return null; },
    async createAt(row) { return insert(db, 'task_calendar_queue', QUEUE_FIELDS, row); },
    async patch(taskId, fields) { update(db, 'task_calendar_queue', 'task_id', taskId, fields); },
    async due(nowIso, limit) {
      return db.prepare(`SELECT * FROM task_calendar_queue WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at ASC LIMIT ?`).all(nowIso, limit);
    },
    async stats() { return db.prepare('SELECT status, COUNT(*) AS total FROM task_calendar_queue GROUP BY status').all(); },
    async list() { return db.prepare('SELECT * FROM task_calendar_queue ORDER BY rowid').all(); },
    async finish(taskId, updatedDate) { db.prepare('DELETE FROM task_calendar_queue WHERE task_id = ? AND updated_date = ?').run(taskId, updatedDate); },
    async fail(taskId, updatedDate, fields) {
      const keys = Object.keys(fields);
      db.prepare(`UPDATE task_calendar_queue SET ${keys.map((name) => `${name} = ?`).join(', ')} WHERE task_id = ? AND updated_date = ?`).run(...keys.map((name) => fields[name]), taskId, updatedDate);
    },
  };
}

/** Tabela `day_rollover_runs` (lib/dayRollover.js `initDayRolloverSchema`): chave `day`. */
export function sqliteDayRolloverRuns(db) {
  return {
    async get(day) { return db.prepare('SELECT * FROM day_rollover_runs WHERE day = ?').get(day) ?? null; },
    async list() { return db.prepare('SELECT * FROM day_rollover_runs ORDER BY day').all(); },
    async create(row) { return insert(db, 'day_rollover_runs', ROLLOVER_FIELDS, row); },
    async patch(day, fields) { update(db, 'day_rollover_runs', 'day', day, fields); },
  };
}
