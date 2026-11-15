import { StorageError, PURCHASE_FIELDS } from '../contract.js';

/** Tabela `purchase_items` existente; mesma consulta e ordem da rota antiga. */
export function sqlitePurchases(db) {
  const columns = PURCHASE_FIELDS.join(', ');
  return {
    async get(id) { return db.prepare(`SELECT ${columns} FROM purchase_items WHERE id = ?`).get(id) ?? null; },
    async list({ status, excludePaused, horizon }) {
      let sql = `SELECT ${columns} FROM purchase_items WHERE 1=1`;
      const params = [];
      if (status !== null) { sql += ' AND status = ?'; params.push(status); }
      else if (excludePaused) sql += " AND status != 'paused'";
      if (horizon !== null) { sql += ' AND horizon = ?'; params.push(horizon); }
      return db.prepare(`${sql} ORDER BY sort_order ASC, created_date DESC`).all(...params);
    },
    async maxSort() { return db.prepare('SELECT MAX(sort_order) AS m FROM purchase_items').get().m; },
    async create(row) {
      db.prepare(`INSERT INTO purchase_items (${columns}) VALUES (${PURCHASE_FIELDS.map(() => '?').join(', ')})`).run(...PURCHASE_FIELDS.map((field) => row[field]));
      return structuredClone(row);
    },
    async patch(id, fields) {
      const keys = Object.keys(fields);
      const result = db.prepare(`UPDATE purchase_items SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((key) => fields[key]), id);
      if (!result.changes) throw new StorageError('not_found');
    },
    async remove(id) { return db.prepare('DELETE FROM purchase_items WHERE id = ?').run(id).changes > 0; },
  };
}
