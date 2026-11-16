import { StorageError, TASK_FIELDS, TASK_ROW_FIELDS } from '../contract.js';

/** Operações sobre a tabela `tasks` existente, na conexão dedicada escolhida pelo driver. */
export function sqliteTasks(db) {
  const insertAll = (row) => {
    db.prepare(`INSERT INTO tasks (${TASK_ROW_FIELDS.join(', ')}) VALUES (${TASK_ROW_FIELDS.map(() => '?').join(', ')})`).run(...TASK_ROW_FIELDS.map((field) => row[field]));
    return structuredClone(row);
  };
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
    // SQLite: o rowid é implícito; a ficha só existe no Firestore.
    async nextRow() { return null; },
    async createAt(row) { return insertAll(row); },
    async patch(id, fields) {
      const keys = Object.keys(fields);
      if (keys.some(k=>!TASK_FIELDS.includes(k)||k==='id')) throw new StorageError('unknown_task_field');
      const result=db.prepare(`UPDATE tasks SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`).run(...keys.map(k=>fields[k]),id);
      if (!result.changes) throw new StorageError('not_found');
    },
    async remove(id) { db.prepare('DELETE FROM tasks WHERE id=?').run(id); },
    async maxSort() { return db.prepare('SELECT MAX(sort_order) AS m FROM tasks').get().m; },
    async maxSortExcept(id) { return db.prepare('SELECT MAX(sort_order) AS m FROM tasks WHERE id != ?').get(id).m; },
    async idsByGoal(goalId) { return db.prepare('SELECT id FROM tasks WHERE goal_id = ?').pluck().all(goalId); },
    async clearGoal(ids) {
      const update = db.prepare('UPDATE tasks SET goal_id = NULL WHERE id = ?');
      for (const id of ids) update.run(id);
    },

    // ---- consultas das rotas: o SQL da rota antiga, igual ----
    async search({ date, status, category, idea_status, limit, offset }) {
      let query = 'SELECT * FROM tasks WHERE 1=1';
      const params = [];
      if (date !== null) { query += ' AND date = ?'; params.push(date); }
      if (status !== null) { query += ' AND status = ?'; params.push(status); }
      if (category !== null) { query += ' AND category = ?'; params.push(category); }
      if (idea_status !== null) { query += ' AND idea_status = ?'; params.push(idea_status); }
      query += ' ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC LIMIT ? OFFSET ?';
      return db.prepare(query).all(...params, limit, offset);
    },
    async all() { return db.prepare('SELECT * FROM tasks ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC').all(); },
    async operational() {
      return db.prepare(`
        SELECT * FROM tasks
        WHERE status NOT IN ('completed', 'done', 'cancelled')
          AND category != 'ideias'
        ORDER BY (date IS NULL) ASC, date ASC, priority DESC, sort_order IS NULL, sort_order ASC
        LIMIT 150
      `).all();
    },
    async completedOn(today) {
      return db.prepare(`
        SELECT * FROM tasks
        WHERE status IN ('completed', 'done')
          AND category != 'ideias'
          AND (
            completed_date = ?
            OR (
              (completed_date IS NULL OR completed_date = '')
              AND substr(COALESCE(completed_at, updated_date, ''), 1, 10) = ?
            )
          )
        ORDER BY updated_date DESC
        LIMIT 80
      `).all(today, today);
    },
    async missedSince(since) {
      return db.prepare(`
        SELECT * FROM tasks
        WHERE status = 'cancelled'
          AND day_outcome = 'missed'
          AND day_outcome_date >= ?
        ORDER BY day_outcome_date DESC
        LIMIT 60
      `).all(since);
    },
    async findOccurrence(parentRef, date, exceptId) {
      return db.prepare(`SELECT id FROM tasks
        WHERE (recurrence_parent_id = ? OR id = ?) AND date = ? AND id != ?
        ORDER BY created_date ASC
        LIMIT 1`).get(parentRef, parentRef, date, exceptId) ?? null;
    },
    async hasOpenUpcoming(parentRef, today) {
      return Boolean(db.prepare(`SELECT id FROM tasks
        WHERE (recurrence_parent_id = ? OR id = ?) AND date >= ?
          AND status IN ('pending', 'in_progress')
        LIMIT 1`).get(parentRef, parentRef, today));
    },
    async staleForRollover(today) {
      return db.prepare(`
        SELECT * FROM tasks
        WHERE (
            (recurrence IS NOT NULL AND recurrence != 'none')
            OR (source = 'seneca' AND time IS NOT NULL AND time != '')
          )
          AND date IS NOT NULL AND date != '' AND date < ?
          AND status IN ('pending', 'in_progress')
          AND category != 'ideias'
        ORDER BY date ASC
      `).all(today);
    },
    async reorder(entries) {
      const update = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
      for (const [id, position] of entries) update.run(position, id);
    },
  };
}
