/**
 * Próxima ocorrência da série sobre a camada assíncrona (oráculo: test-support/oracles/taskSeries.bcbadad.js).
 * Em duas fases porque o Firestore exige ler tudo antes de gravar: `planSpawn` só LÊ (a ocorrência
 * já existente da série naquela data) e devolve a linha nova pronta; quem chama grava com `tasks.createAt`.
 *
 * Uma ocorrência por série e data, em qualquer estado: concluir, reabrir e concluir de novo nunca cria
 * a segunda na mesma data.
 */
import { taskRow } from '../../storage/contract.js';
import { nextRecurrenceDate } from '../../taskRecurrence.js';
import { bindRow, nextSort } from './affinity.js';

const SPAWN_INSERT = [
  ['id', 'TEXT'], ['title', 'TEXT'], ['description', 'TEXT'], ['date', 'TEXT'], ['time', 'TEXT'], ['priority', 'TEXT'], ['category', 'TEXT'],
  ['goal_id', 'TEXT'], ['source', 'TEXT'], ['duration_minutes', 'INTEGER'], ['sort_order', 'INTEGER'], ['recurrence', 'TEXT'],
  ['recurrence_days', 'TEXT'], ['recurrence_parent_id', 'TEXT'],
];

/**
 * @param tx transação do storage (só leituras aqui)
 * @param top `MAX(sort_order)` cru da tabela no ponto em que a antiga gravaria o filho (inclui o que a mesma
 *   transação já gravou antes)
 * @returns null (sem série) | { id, date, created: false } | { id, date, created: true, row }
 */
export async function planSpawn(tx, task, { completedDate, today, top, now, newId }) {
  if (!task?.recurrence || task.recurrence === 'none') return null;
  const baseForNext = task.date || completedDate || today;
  const nextDate = nextRecurrenceDate(baseForNext, task.recurrence, task.recurrence_days);
  if (!nextDate) return null;

  const parentRef = task.recurrence_parent_id || task.id;
  const existingOccurrence = await tx.tasks.findOccurrence(parentRef, nextDate, task.id);
  if (existingOccurrence) return { id: existingOccurrence.id, date: nextDate, created: false };

  const childId = newId();
  const values = bindRow(SPAWN_INSERT, [
    childId, task.title, task.description, nextDate, task.time, task.priority, task.category,
    task.goal_id || null, task.source || 'recurrence', task.duration_minutes || null, nextSort(top),
    task.recurrence, task.recurrence_days || '[]', parentRef,
  ]);
  return { id: childId, date: nextDate, created: true, row: taskRow({ ...values, status: 'pending' }, now()) };
}
