import { assertUserId } from '../../lib/tenantDb.js';
import { StorageError, TASK_FIELDS } from '../contract.js';

/**
 * Operates the existing tasks table, not a shadow JSON store. No implicit schema/seed/connection.
 * open(owner) must return a dedicated repository connection to an authorized owner's DB.
 * All operations on that connection go through this driver to avoid observing uncommitted writes.
 */
export function createSqliteTasksDriver({ open }) {
  if (typeof open !== 'function') throw new TypeError('open(owner) required');
  const ownership = new WeakMap(), queues = new WeakMap();
  function dbFor(owner) {
    assertUserId(owner);
    const db = open(owner);
    if (!db || typeof db.prepare !== 'function') throw new TypeError('invalid SQLite connection');
    const previous = ownership.get(db);
    if (previous && previous !== owner) throw new StorageError('sqlite_owner_connection_reused');
    ownership.set(db, owner);
    return db;
  }
  function queued(db, callback) {
    const pending = (queues.get(db) || Promise.resolve()).then(callback);
    queues.set(db, pending.catch(() => {}));
    return pending;
  }
  function direct(db) {
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
  return {
    kind:'sqlite',
    tasks(owner) {
      const db=dbFor(owner), target=direct(db);
      return Object.fromEntries(Object.keys(target).map(method=>[method,(...args)=>queued(db,()=>target[method](...args))]));
    },
    async transaction(owner, callback) {
      const db=dbFor(owner);
      return queued(db, async()=>{
        if(db.inTransaction) throw new StorageError('sqlite_connection_already_in_transaction');
        db.exec('BEGIN IMMEDIATE');
        try { const value=await callback(direct(db)); db.exec('COMMIT'); return value; }
        catch(error) { if(db.inTransaction)db.exec('ROLLBACK'); throw error; }
      });
    },
  };
}
