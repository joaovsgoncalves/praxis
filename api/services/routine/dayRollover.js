/**
 * Virada do dia sobre a camada assíncrona (oráculo: test-support/oracles/dayRollover.bcbadad.js).
 *
 * Fecha o que venceu sem depender de alguém abrir a lista: instância recorrente (ou bloco com hora criado
 * pelo Sêneca) aberta de um dia anterior vira "não rolou" (cancelada, `day_outcome = 'missed'` na data
 * dela, sem XP e sem mexer no Google Agenda) e a próxima ocorrência (hoje ou depois) fica garantida.
 *
 * Roda na subida da API e depois a cada minuto, dentro do próprio processo (sem cron). A regra olha a data
 * das tarefas, não um marcador: se a API ficou parada vários dias, a primeira passada fecha tudo de uma
 * vez; se uma passada falhar, a transação desfaz e a seguinte repete. Idempotente por dia
 * (`day_rollover_runs`: uma linha por dia, `closed` soma o que as passadas fecharam).
 *
 * Uma transação por passada, em duas fases (o Firestore exige ler tudo antes de gravar): leituras (dia,
 * vencidas, séries com ocorrência aberta, ocorrência já existente, posição) e depois as gravações.
 */
import { randomUUID } from 'node:crypto';
import { maxSqlite } from '../../storage/sqliteOrder.js';
import { nextRecurrenceDate } from '../../taskRecurrence.js';
import { sqlStamp } from './affinity.js';
import { planSpawn } from './taskSeries.js';

export function createDayRollover({ storage, getLocalDateString, now = () => new Date(), newId = randomUUID, log = console }) {
  if (!storage?.tasks || !storage?.dayRolloverRuns || typeof storage.transaction !== 'function') throw new TypeError('day rollover requires storage');
  if (typeof getLocalDateString !== 'function') throw new TypeError('day rollover requires getLocalDateString');

  const closeDay = (today) => storage.transaction(async (tx) => {
    const dayRow = await tx.dayRolloverRuns.get(today);
    const firstRunOfDay = !dayRow;
    const stale = await tx.tasks.staleForRollover(today);
    const stamp = sqlStamp(now());

    if (stale.length === 0) {
      if (firstRunOfDay) await tx.dayRolloverRuns.create({ day: today, closed: 0, first_run_at: stamp, last_change_at: null });
      return { closed: 0, firstRunOfDay };
    }

    // Bloco com hora do Sêneca é avulso: ele cria o do dia seguinte, então não gera filho.
    const latestByChain = new Map();
    for (const task of stale) {
      if (!task.recurrence || task.recurrence === 'none') continue;
      latestByChain.set(task.recurrence_parent_id || task.id, task);
    }

    // Leituras: só as séries sem ocorrência aberta de hoje em diante geram filho. Nenhuma das marcas abaixo
    // muda estas respostas (todas as vencidas têm data anterior a hoje).
    let top = latestByChain.size ? await tx.tasks.maxSort() : null;
    const spawned = [];
    for (const [parentRef, task] of latestByChain) {
      if (await tx.tasks.hasOpenUpcoming(parentRef, today)) continue;
      // Avança a base até a próxima ocorrência cair em hoje ou depois (sem criar filhos no passado).
      let base = task.date;
      for (let guard = 0; guard < 400; guard += 1) {
        const next = nextRecurrenceDate(base, task.recurrence, task.recurrence_days);
        if (!next || next >= today) break;
        base = next;
      }
      const spawn = await planSpawn(tx, { ...task, date: base }, { today, top, now, newId });
      if (spawn?.created) { spawned.push(spawn.row); top = maxSqlite([top, spawn.row.sort_order]); }
    }
    let slot = spawned.length ? await tx.tasks.nextRow() : null;

    // Gravações.
    if (firstRunOfDay) await tx.dayRolloverRuns.create({ day: today, closed: stale.length, first_run_at: stamp, last_change_at: stamp });
    else await tx.dayRolloverRuns.patch(today, { closed: dayRow.closed + stale.length, last_change_at: stamp });
    for (const task of stale) await tx.tasks.patch(task.id, { status: 'cancelled', day_outcome: 'missed', day_outcome_date: task.date, updated_date: stamp });
    for (const row of spawned) { await tx.tasks.createAt(row, slot); if (slot !== null) slot += 1; }
    return { closed: stale.length, firstRunOfDay };
  });

  /** Uma passada. Nunca lança: falha fica no log e a próxima passada tenta de novo. */
  async function run(reason = 'tick') {
    const today = getLocalDateString();
    try {
      const result = await closeDay(today);
      if (result.closed > 0 || result.firstRunOfDay) {
        log.log(`[virada-do-dia] ${today} (${reason}): ${result.closed} tarefa(s) vencida(s) fechada(s)`);
      }
      return { ok: true, today, ...result };
    } catch (error) {
      log.error(`[virada-do-dia] ${today} (${reason}) falhou e foi desfeita:`, error?.message || error);
      return { ok: false, today, closed: 0, error: String(error?.message || error) };
    }
  }

  let timer = null, running = false;
  function start({ intervalMs = 60 * 1000 } = {}) {
    if (timer) return;
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try { await run('tick'); } finally { running = false; }
    }, intervalMs);
    timer.unref?.();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { run, start, stop };
}
