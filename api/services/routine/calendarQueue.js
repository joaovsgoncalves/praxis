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

function backoffSeconds(attempts) {
  return BACKOFF_SECONDS[Math.min(Math.max(attempts, 1), BACKOFF_SECONDS.length) - 1];
}

function isFailure(result) {
  return typeof result?.action === 'string' && result.action.endsWith('_failed');
}

/**
 * @param {{ storage: object, syncTaskToCalendar: (task: object) => any, now?: () => Date }} deps
 */
export function createAsyncTaskCalendarQueue({ storage, syncTaskToCalendar, now = () => new Date() }) {
  const queue = storage.taskCalendarQueue;
  let draining = null;

  async function resolveTask(row) {
    const live = await storage.tasks.get(row.task_id);
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
  async function runDrain({ limit = 20 } = {}) {
    const summary = { processed: 0, done: 0, retry: 0, failed: 0 };
    let rows = [];
    try {
      rows = await queue.due(now().toISOString(), limit);
    } catch (error) {
      console.error('[calendar-queue] leitura falhou:', error.message);
      return summary;
    }
    for (const row of rows) {
      summary.processed += 1;
      let failure = null;
      try {
        const task = await resolveTask(row);
        if (task) {
          const result = await syncTaskToCalendar(task);
          if (isFailure(result)) failure = result.error || result.action;
        }
      } catch (error) {
        failure = error?.message || String(error);
      }

      try {
        if (!failure) {
          // updated_date na condição: se a tarefa mudou durante a chamada, a intenção nova fica.
          await queue.finish(row.task_id, row.updated_date);
          summary.done += 1;
          continue;
        }
        const attempts = Number(row.attempts || 0) + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        const current = now();
        const nextAttempt = new Date(current.getTime() + backoffSeconds(attempts) * 1000).toISOString();
        await queue.fail(row.task_id, row.updated_date, {
          attempts,
          status: exhausted ? 'failed' : 'pending',
          last_error: String(failure).slice(0, 500),
          next_attempt_at: nextAttempt,
          updated_date: current.toISOString(),
        });
        if (exhausted) summary.failed += 1;
        else summary.retry += 1;
        console.error(`[calendar-queue] tarefa ${row.task_id}: tentativa ${attempts} falhou (${exhausted ? 'desistiu' : 'vai repetir'})`);
      } catch (error) {
        console.error('[calendar-queue] registro falhou:', error.message);
      }
    }
    return summary;
  }

  async function stats() {
    const rows = await queue.stats();
    const out = { pending: 0, failed: 0 };
    for (const row of rows) out[row.status] = Number(row.total);
    return out;
  }

  // Um único dreno por instância (a produção só o usa no escopo do dono com agenda).
  // Não há transação aberta durante o Google; finish/fail fazem compare-and-swap do carimbo.
  function drain(options) {
    if (draining) return draining;
    draining = runDrain(options).finally(() => { draining = null; });
    return draining;
  }
  return { drain, stats, idle: () => draining ?? Promise.resolve() };
}

/** A espera pela fila SQLite pode tornar o retrato antigo obsoleto. Relê sem await, já fora
 * de qualquer transação, imediatamente antes da chamada legada (que é síncrona).
 */
export function createCoordinatedCalendarSync({ runLegacy, readTask, syncTaskToCalendar }) {
  return (snapshot) => runLegacy(() => {
    const current = readTask(snapshot.id);
    if (current) return syncTaskToCalendar(current);
    // Retrato de exclusão: limpar o evento já conhecido. Retrato antigo de criação: não criar órfão.
    if (snapshot.status === 'cancelled') return syncTaskToCalendar(snapshot);
    return { skipped: true, reason: 'task removed before calendar delivery' };
  });
}
