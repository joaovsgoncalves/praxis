import { nextRecurrenceDate } from '../taskRecurrence.js';
import { spawnNextRecurringTask } from './taskSeries.js';

/**
 * Virada do dia: fecha o que venceu sem depender de alguém abrir a lista.
 *
 * Instância recorrente (ou bloco com hora criado pelo Sêneca) aberta de um dia anterior vira
 * "não rolou": cancelada, day_outcome = 'missed' na data dela, sem XP e sem mexer no Google
 * Agenda. A próxima ocorrência (hoje ou depois) fica garantida.
 *
 * Roda na subida da API e depois a cada minuto, dentro do próprio processo (sem cron). A regra
 * olha a data das tarefas, não um marcador: se a API ficou parada vários dias, a primeira
 * passada fecha tudo de uma vez; se uma passada falhar, a transação desfaz e a seguinte repete.
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

export function createDayRollover({ db, getLocalDateString, nextSortOrder, log = console }) {
  initDayRolloverSchema(db);

  const staleStmt = db.prepare(`
    SELECT * FROM tasks
    WHERE (
        (recurrence IS NOT NULL AND recurrence != 'none')
        OR (source = 'seneca' AND time IS NOT NULL AND time != '')
      )
      AND date IS NOT NULL AND date != '' AND date < ?
      AND status IN ('pending', 'in_progress')
      AND category != 'ideias'
    ORDER BY date ASC
  `);
  const markMissedStmt = db.prepare(`
    UPDATE tasks SET
      status = 'cancelled',
      day_outcome = 'missed',
      day_outcome_date = date,
      updated_date = datetime('now')
    WHERE id = ? AND status IN ('pending', 'in_progress')
  `);
  const openUpcomingInChainStmt = db.prepare(`
    SELECT id FROM tasks
    WHERE (recurrence_parent_id = ? OR id = ?) AND date >= ?
      AND status IN ('pending', 'in_progress')
    LIMIT 1
  `);
  const dayRowStmt = db.prepare('SELECT day FROM day_rollover_runs WHERE day = ?');
  const insertDayStmt = db.prepare('INSERT INTO day_rollover_runs (day, closed) VALUES (?, 0)');
  const addClosedStmt = db.prepare(`
    UPDATE day_rollover_runs SET closed = closed + ?, last_change_at = datetime('now') WHERE day = ?
  `);

  const closeDay = db.transaction((today) => {
    const firstRunOfDay = !dayRowStmt.get(today);
    if (firstRunOfDay) insertDayStmt.run(today);

    const stale = staleStmt.all(today);
    if (stale.length === 0) return { closed: 0, firstRunOfDay };

    const latestByChain = new Map();
    for (const task of stale) {
      markMissedStmt.run(task.id);
      // Bloco com hora do Sêneca é avulso: ele cria o do dia seguinte, então não gera filho.
      if (!task.recurrence || task.recurrence === 'none') continue;
      latestByChain.set(task.recurrence_parent_id || task.id, task);
    }

    for (const [parentRef, task] of latestByChain) {
      if (openUpcomingInChainStmt.get(parentRef, parentRef, today)) continue;
      // Avança a base até a próxima ocorrência cair em hoje ou depois (sem criar filhos no passado).
      let base = task.date;
      for (let guard = 0; guard < 400; guard += 1) {
        const next = nextRecurrenceDate(base, task.recurrence, task.recurrence_days);
        if (!next || next >= today) break;
        base = next;
      }
      spawnNextRecurringTask(db, { ...task, date: base }, { today, nextSortOrder });
    }
    addClosedStmt.run(stale.length, today);
    return { closed: stale.length, firstRunOfDay };
  });

  /** Uma passada. Nunca lança: falha fica no log e a próxima passada tenta de novo. */
  function run(reason = 'tick') {
    const today = getLocalDateString();
    try {
      const result = closeDay(today);
      if (result.closed > 0 || result.firstRunOfDay) {
        log.log(`[virada-do-dia] ${today} (${reason}): ${result.closed} tarefa(s) vencida(s) fechada(s)`);
      }
      return { ok: true, today, ...result };
    } catch (error) {
      log.error(`[virada-do-dia] ${today} (${reason}) falhou e foi desfeita:`, error?.message || error);
      return { ok: false, today, closed: 0, error: String(error?.message || error) };
    }
  }

  let timer = null;
  function start({ intervalMs = 60 * 1000 } = {}) {
    if (timer) return;
    timer = setInterval(() => run('tick'), intervalMs);
    timer.unref?.();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { run, start, stop };
}
