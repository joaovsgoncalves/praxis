import { isTaskOpen, isTaskDone, isTaskCompletedForToday } from './tasks.js';

export const TASK_LENSES = ['list', 'board', 'week'];
export const BOARD_COLUMNS = ['inbox', 'todo', 'doing', 'done'];

/** Tarefa aberta sem data de execução. */
export function isInboxTask(task) {
  return Boolean(isTaskOpen(task) && !(task?.date && String(task.date).trim()));
}

/**
 * Mapeia a tarefa para uma das 4 colunas do quadro: 'inbox' | 'todo' | 'doing' | 'done' | null.
 * Ideias e tarefas canceladas ficam fora do quadro (null).
 * Concluídas só entram em 'done' se concluídas hoje.
 */
export function boardColumnForTask(task, today) {
  if (!task) return null;
  if (task.category === 'ideias') return null;
  if (task.status === 'cancelled') return null;

  if (isTaskDone(task)) {
    return isTaskCompletedForToday(task, today) ? 'done' : null;
  }

  if (isTaskOpen(task)) {
    if (isInboxTask(task)) {
      return 'inbox';
    }
    if (task.status === 'in_progress') {
      return 'doing';
    }
    if (task.status === 'pending') {
      return 'todo';
    }
  }

  return null;
}

/** Filtra lista de tarefas para a coluna do quadro especificada. */
export function tasksForBoardColumn(tasks, column, today) {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter((t) => boardColumnForTask(t, today) === column);
}

/**
 * Calcula patch para mover tarefa para uma coluna do quadro.
 * - inbox: { date: null, time: null }
 * - todo: { date: today } se sem data; { status: 'pending' } se não pending
 * - doing: { status: 'in_progress', date: today (se sem data) }
 * - done: { status: 'completed' }
 */
export function moveTaskToColumn(task, column, today) {
  if (column === 'inbox') {
    return { date: null, time: null };
  }

  if (column === 'todo') {
    const patch = {};
    if (!task?.date && today) {
      patch.date = today;
    }
    if (task?.status && task.status !== 'pending') {
      patch.status = 'pending';
    }
    return patch;
  }

  if (column === 'doing') {
    const patch = { status: 'in_progress' };
    if (!task?.date && today) {
      patch.date = today;
    }
    return patch;
  }

  if (column === 'done') {
    return { status: 'completed' };
  }

  return {};
}

/**
 * Retorna intervalo de segunda a domingo para a data informada (YYYY-MM-DD).
 * Usa matemática de data civil para evitar drift de fuso horário / UTC midnight trap.
 */
export function weekRange(today) {
  const dateKey = String(today || '').slice(0, 10);
  const [y, m, d] = dateKey.split('-').map(Number);
  const baseDt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = baseDt.getUTCDay(); // 0: Dom, 1: Seg, ..., 6: Sáb
  const diffToMonday = (dayOfWeek + 6) % 7;

  const mondayDt = new Date(Date.UTC(y, m - 1, d - diffToMonday, 12, 0, 0));
  const sundayDt = new Date(Date.UTC(y, m - 1, d - diffToMonday + 6, 12, 0, 0));

  const start = mondayDt.toISOString().slice(0, 10);
  const end = sundayDt.toISOString().slice(0, 10);

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const dayDt = new Date(Date.UTC(y, m - 1, d - diffToMonday + i, 12, 0, 0));
    days.push(dayDt.toISOString().slice(0, 10));
  }

  return { start, end, days };
}

/**
 * Retorna bloco de horário { date, start, end } para tarefa com time.
 * Retorna null se tarefa não tiver horário definido.
 */
export function taskBlock(task) {
  if (!task?.time || !String(task.time).trim()) return null;
  if (!task?.date || !String(task.date).trim()) return null;

  const date = String(task.date).slice(0, 10);
  const timeStr = String(task.time).trim().slice(0, 5);
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const duration = Number(task.duration_minutes) > 0 ? Number(task.duration_minutes) : 60;
  const totalMinutes = h * 60 + m + duration;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;

  const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

  return { date, start, end };
}
