/** Tabela `user_settings` existente, linha única `default` (colunas em storage/domains/phase4.js). */
export function sqliteUserSettings(db, fields) {
  const columns = fields.join(', ');
  return {
    async get() { return db.prepare(`SELECT ${columns} FROM user_settings WHERE id = 'default'`).get() ?? null; },
    async save(row) {
      const updates = fields.filter((field) => field !== 'id').map((field) => `${field} = excluded.${field}`).join(', ');
      db.prepare(`INSERT INTO user_settings (${columns}) VALUES (${fields.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updates}`)
        .run(...fields.map((field) => row[field]));
      return structuredClone(row);
    },
  };
}
