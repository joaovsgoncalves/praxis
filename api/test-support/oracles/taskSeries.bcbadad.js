/**
 * ORÁCULO CONGELADO: cópia literal de `git show bcbadad:api/lib/taskSeries.js` (só imports ajustados).
 * Não editar: é a referência da prova de paridade HTTP da fase 3.
 */
import { randomUUID } from 'crypto';
import { nextRecurrenceDate } from '../../taskRecurrence.js';

/**
 * Garante a próxima ocorrência da série. Uma ocorrência por série e data, em qualquer
 * estado: concluir, reabrir e concluir de novo nunca cria a segunda na mesma data.
 * Só grava no banco; quem chama decide a agenda.
 */
export function spawnNextRecurringTask(db, task, { completedDate, today, nextSortOrder }) {
  if (!task?.recurrence || task.recurrence === 'none') return null;
  const baseForNext = task.date || completedDate || today;
  const nextDate = nextRecurrenceDate(baseForNext, task.recurrence, task.recurrence_days);
  if (!nextDate) return null;

  const parentRef = task.recurrence_parent_id || task.id;
  const existingOccurrence = db
    .prepare(
      `SELECT id FROM tasks
       WHERE (recurrence_parent_id = ? OR id = ?) AND date = ? AND id != ?
       ORDER BY created_date ASC
       LIMIT 1`,
    )
    .get(parentRef, parentRef, nextDate, task.id);
  if (existingOccurrence) return { id: existingOccurrence.id, date: nextDate, created: false };

  const childId = randomUUID();
  db.prepare(`
    INSERT INTO tasks (id, title, description, date, time, status, priority, category, goal_id, source, duration_minutes, sort_order, recurrence, recurrence_days, recurrence_parent_id)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    childId,
    task.title,
    task.description,
    nextDate,
    task.time,
    task.priority,
    task.category,
    task.goal_id || null,
    task.source || 'recurrence',
    task.duration_minutes || null,
    nextSortOrder('tasks'),
    task.recurrence,
    task.recurrence_days || '[]',
    parentRef,
  );
  return { id: childId, date: nextDate, created: true };
}
