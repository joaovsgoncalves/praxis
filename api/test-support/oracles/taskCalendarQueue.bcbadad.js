/**
 * ORÁCULO CONGELADO: cópia literal de `git show bcbadad:api/lib/taskCalendarQueue.js` (só imports ajustados).
 * Não editar: é a referência da prova de paridade HTTP da fase 3.
 */
/**
 * Fila da agenda: a rota grava a INTENÇÃO de sincronizar na mesma transação da tarefa
 * e responde; o Google Agenda é chamado depois, fora da transação, com retentativa.
 * Falha de agenda nunca bloqueia nem desfaz o check.
 *
 * Uma linha por tarefa (a sincronização olha o estado atual, então intenções repetidas
 * se fundem). Exclusão guarda um retrato, porque a tarefa já não existe na hora de limpar.
 */

const MAX_ATTEMPTS = 8;
// Espera entre tentativas, em segundos: 1 min, 5 min, 15 min, 1 h e depois 6 h.
const BACKOFF_SECONDS = [60, 300, 900, 3600, 21600];

export function initTaskCalendarQueueSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_calendar_queue (
      task_id TEXT PRIMARY KEY,
      snapshot TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_date TEXT NOT NULL DEFAULT (datetime('now')),
      updated_date TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_task_calendar_queue_due
      ON task_calendar_queue(status, next_attempt_at);
  `);
}

function backoffSeconds(attempts) {
  return BACKOFF_SECONDS[Math.min(Math.max(attempts, 1), BACKOFF_SECONDS.length) - 1];
}

function isFailure(result) {
  return typeof result?.action === 'string' && result.action.endsWith('_failed');
}

/**
 * @param {{ db: import('better-sqlite3').Database, syncTaskToCalendar: (task: object) => any, now?: () => Date }} deps
 */
export function createTaskCalendarQueue({ db, syncTaskToCalendar, now = () => new Date() }) {
  initTaskCalendarQueueSchema(db);

  const upsertStmt = db.prepare(`
    INSERT INTO task_calendar_queue (task_id, snapshot, status, attempts, last_error, next_attempt_at, updated_date)
    VALUES (?, ?, 'pending', 0, NULL, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      snapshot = excluded.snapshot,
      status = 'pending',
      attempts = 0,
      last_error = NULL,
      next_attempt_at = excluded.next_attempt_at,
      updated_date = excluded.updated_date
  `);
  const dueStmt = db.prepare(`
    SELECT * FROM task_calendar_queue
    WHERE status = 'pending' AND next_attempt_at <= ?
    ORDER BY next_attempt_at ASC
    LIMIT ?
  `);
  const doneStmt = db.prepare('DELETE FROM task_calendar_queue WHERE task_id = ? AND updated_date = ?');
  const failStmt = db.prepare(`
    UPDATE task_calendar_queue
    SET attempts = ?, status = ?, last_error = ?, next_attempt_at = ?, updated_date = ?
    WHERE task_id = ? AND updated_date = ?
  `);
  const findTaskStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');

  /**
   * Registra a intenção. Chamar DENTRO da transação que altera a tarefa.
   * @param {string} taskId
   * @param {{ snapshot?: object|null }} [options] retrato da tarefa excluída (para apagar o evento)
   */
  function enqueue(taskId, { snapshot = null } = {}) {
    if (!taskId) return { queued: false };
    const stamp = now().toISOString();
    upsertStmt.run(String(taskId), snapshot ? JSON.stringify(snapshot) : null, stamp, stamp);
    return { queued: true };
  }

  function resolveTask(row) {
    const live = findTaskStmt.get(row.task_id);
    if (live) return live;
    if (!row.snapshot) return null;
    try {
      // Tarefa excluída: tratar como cancelada para o evento sair da agenda.
      return { ...JSON.parse(row.snapshot), status: 'cancelled' };
    } catch {
      return null;
    }
  }

  /** Processa as intenções vencidas. Nunca lança: erro vira retentativa. */
  function drain({ limit = 20 } = {}) {
    const summary = { processed: 0, done: 0, retry: 0, failed: 0 };
    let rows = [];
    try {
      rows = dueStmt.all(now().toISOString(), limit);
    } catch (error) {
      console.error('[calendar-queue] leitura falhou:', error.message);
      return summary;
    }
    for (const row of rows) {
      summary.processed += 1;
      let failure = null;
      try {
        const task = resolveTask(row);
        if (task) {
          const result = syncTaskToCalendar(task);
          if (isFailure(result)) failure = result.error || result.action;
        }
      } catch (error) {
        failure = error?.message || String(error);
      }

      try {
        if (!failure) {
          // updated_date na condição: se a tarefa mudou durante a chamada, a intenção nova fica.
          doneStmt.run(row.task_id, row.updated_date);
          summary.done += 1;
          continue;
        }
        const attempts = Number(row.attempts || 0) + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        const current = now();
        const nextAttempt = new Date(current.getTime() + backoffSeconds(attempts) * 1000).toISOString();
        failStmt.run(
          attempts,
          exhausted ? 'failed' : 'pending',
          String(failure).slice(0, 500),
          nextAttempt,
          current.toISOString(),
          row.task_id,
          row.updated_date,
        );
        if (exhausted) summary.failed += 1;
        else summary.retry += 1;
        console.error(`[calendar-queue] tarefa ${row.task_id}: tentativa ${attempts} falhou (${exhausted ? 'desistiu' : 'vai repetir'})`);
      } catch (error) {
        console.error('[calendar-queue] registro falhou:', error.message);
      }
    }
    return summary;
  }

  function stats() {
    const rows = db.prepare('SELECT status, COUNT(*) AS total FROM task_calendar_queue GROUP BY status').all();
    const out = { pending: 0, failed: 0 };
    for (const row of rows) out[row.status] = Number(row.total);
    return out;
  }

  return { enqueue, drain, stats };
}
