/**
 * Tabela da virada do dia (`day_rollover_runs`: uma linha por dia, `closed` soma o que as passadas
 * fecharam). A virada em si vive em `services/routine/dayRollover.js`, sobre o storage; aqui fica só o
 * esquema, que o servidor cria ao preparar cada banco de conta (e os testes, com `withTaskRoutine`).
 */
export function initDayRolloverSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS day_rollover_runs (
      day TEXT PRIMARY KEY,
      closed INTEGER NOT NULL DEFAULT 0,
      first_run_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_change_at TEXT
    )
  `);
}
