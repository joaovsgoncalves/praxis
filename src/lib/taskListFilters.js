import { isTaskDone, isTaskOpen, isTaskClosed, isTaskForToday, isInboxTask } from './tasks.js';

export const TASK_SCOPE_CHIPS = [
  { id: 'today', label: 'Hoje' },
  { id: 'inbox', label: 'Caixa' },
  { id: 'week', label: 'Semana' },
  { id: 'overdue', label: 'Atrasadas' },
  { id: 'all', label: 'Todas' },
];

/** ISO date + N days (Fortaleza keys YYYY-MM-DD). */
export function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function isTaskOverdue(task, today) {
  if (!isTaskOpen(task)) return false;
  const date = (task?.date || '').slice(0, 10);
  return Boolean(date && today && date < today);
}

export function countOpenOverdue(tasks, today) {
  return tasks.filter((t) => isTaskOverdue(t, today)).length;
}

export function filterTasksByScope(tasks, scope, today) {
  const open = tasks.filter((t) => !isTaskClosed(t));
  switch (scope) {
    case 'inbox':
      return open.filter((t) => isInboxTask(t));
    case 'overdue':
      return open.filter((t) => isTaskOverdue(t, today));
    case 'week': {
      const end = addDaysToDateKey(today, 7);
      return open.filter((t) => {
        const d = (t.date || '').slice(0, 10);
        if (!d) return false;
        return d >= today && d <= end;
      });
    }
    case 'all':
      return tasks.filter((t) => t.status !== 'cancelled');
    case 'today':
    default:
      return tasks.filter((t) => {
        if (t.status === 'cancelled') return false;
        if (isTaskOpen(t)) return isTaskForToday(t, today);
        return isTaskDone(t) && (t.completed_date || '').slice(0, 10) === today;
      });
  }
}

/** Atrasadas no topo; depois data/hora; concluídas por último. */
export function sortTasksForList(a, b, today) {
  const aDone = isTaskDone(a);
  const bDone = isTaskDone(b);
  if (aDone !== bDone) return aDone ? 1 : -1;

  const aOver = isTaskOverdue(a, today);
  const bOver = isTaskOverdue(b, today);
  if (aOver !== bOver) return aOver ? -1 : 1;

  const dateCmp = String(a?.date || '9999').localeCompare(String(b?.date || '9999'));
  if (dateCmp !== 0) return dateCmp;

  const timeCmp = String(a?.time || '').localeCompare(String(b?.time || ''));
  if (timeCmp !== 0) return timeCmp;

  const ao = a?.sort_order ?? 9999;
  const bo = b?.sort_order ?? 9999;
  return ao - bo;
}

export function sortPendingWithOverdueFirst(pending, today) {
  return [...pending].sort((a, b) => sortTasksForList(a, b, today));
}
