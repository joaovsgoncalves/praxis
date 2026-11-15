import { StorageError } from '../contract.js';

/**
 * Tabelas `projects` e `project_updates` existentes. `SELECT *` de propósito: a ordem das chaves é a
 * do banco de cada conta, como na rota antiga. O gatilho `projects_revision_bump` continua valendo
 * para quem grava direto; aqui toda alteração já manda a revisão nova, então ele não soma de novo.
 */
function uniqueField(error) {
  if (error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return new StorageError('foreign_key_violation');
  const match = /UNIQUE constraint failed: \w+\.(\w+)/.exec(error?.message || '');
  if (!match) return error;
  const mapped = new StorageError('already_exists');
  mapped.field = match[1];
  return mapped;
}

export function sqliteProjects(db, fields) {
  return {
    async get(key) { return db.prepare('SELECT * FROM projects WHERE id = ? OR slug = ?').get(key, key) ?? null; },
    async list() { return db.prepare('SELECT * FROM projects ORDER BY focus DESC, sort_order ASC, name ASC').all(); },
    async create(row) {
      let info;
      try {
        info = db.prepare(`INSERT INTO projects (${fields.map((f) => `"${f}"`).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...fields.map((f) => row[f]));
      } catch (error) { throw uniqueField(error); }
      // Volta como o banco guardou, na ordem de colunas do banco desta conta.
      return db.prepare('SELECT * FROM projects WHERE rowid = ?').get(info.lastInsertRowid);
    },
    async patch(id, changes) {
      const keys = Object.keys(changes);
      const result = db.prepare(`UPDATE projects SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => changes[k]), id);
      if (!result.changes) throw new StorageError('not_found');
    },
  };
}

export function sqliteProjectUpdates(db, fields) {
  return {
    async list(projectId, limit) {
      return db.prepare('SELECT * FROM project_updates WHERE project_id = ? ORDER BY date DESC, created_at DESC LIMIT ?').all(projectId, limit);
    },
    async create(row) {
      let info;
      try {
        info = db.prepare(`INSERT INTO project_updates (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...fields.map((f) => row[f]));
      } catch (error) { throw uniqueField(error); }
      return db.prepare('SELECT * FROM project_updates WHERE rowid = ?').get(info.lastInsertRowid);
    },
  };
}
