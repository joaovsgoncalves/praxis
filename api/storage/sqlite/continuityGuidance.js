/** Tabela `continuity_guidance` existente, uma linha por data (colunas em storage/domains/phase4.js). */
export function sqliteContinuityGuidance(db, fields) {
  return {
    async get(date) { return db.prepare(`SELECT ${fields.join(', ')} FROM continuity_guidance WHERE date = ?`).get(date) ?? null; },
    async put(row) {
      const updates = fields.filter((f) => f !== 'date').map((f) => `${f} = excluded.${f}`).join(', ');
      db.prepare(`INSERT INTO continuity_guidance (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')}) ON CONFLICT(date) DO UPDATE SET ${updates}`)
        .run(...fields.map((f) => row[f]));
      return structuredClone(row);
    },
  };
}
