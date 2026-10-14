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

/** Ordem da coluna: sort_order crescente (nulos no fim), depois created_date mais novo primeiro. */
export function compareBoardOrder(a, b) {
  const aHas = a?.sort_order !== null && a?.sort_order !== undefined && a?.sort_order !== '';
  const bHas = b?.sort_order !== null && b?.sort_order !== undefined && b?.sort_order !== '';
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (aHas && bHas) {
    const diff = Number(a.sort_order) - Number(b.sort_order);
    if (diff !== 0) return diff;
  }
  return String(b?.created_date || '').localeCompare(String(a?.created_date || ''));
}

/** Tarefas da coluna já na ordem de exibição. */
export function sortedBoardColumn(tasks, column, today) {
  return tasksForBoardColumn(tasks, column, today).sort(compareBoardOrder);
}

/**
 * Nova ordem de IDs da coluna de destino depois de soltar `movedId` em `toIndex`.
 * `columnTasks` é a coluna como está na tela (pode ou não conter a tarefa movida).
 */
export function reorderColumnIds(columnTasks, movedId, toIndex) {
  const ids = (Array.isArray(columnTasks) ? columnTasks : [])
    .map((t) => String(t.id))
    .filter((id) => id !== String(movedId));
  const index = Math.max(0, Math.min(Number.isFinite(toIndex) ? toIndex : ids.length, ids.length));
  ids.splice(index, 0, String(movedId));
  return ids;
}

/**
 * Aplica localmente (otimista) um movimento do quadro: patch de coluna na tarefa movida
 * e sort_order = índice para os IDs da coluna de destino (mesma regra do PATCH /reorder).
 */
export function applyBoardMove(tasks, move, today) {
  if (!Array.isArray(tasks) || !move?.taskId) return tasks;
  const patch = move.patch || {};
  const order = new Map((move.orderedIds || []).map((id, index) => [String(id), index]));
  return tasks.map((t) => {
    const id = String(t.id);
    let next = t;
    if (id === String(move.taskId) && Object.keys(patch).length > 0) {
      next = { ...next, ...patch };
      if (patch.status === 'completed') {
        next.completed_date = today;
        next.completed_at = next.completed_at || new Date().toISOString();
      } else if (patch.status) {
        next.completed_date = null;
        next.completed_at = null;
      }
    }
    if (order.has(id)) next = { ...next, sort_order: order.get(id) };
    return next;
  });
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

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Coloca blocos sobrepostos lado a lado.
 * Devolve os mesmos itens + { col, cols } (0-indexed).
 */
export function layoutTimedBlocks(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];

  const parsed = list.map((item, index) => {
    const s = timeToMinutes(item.start);
    const e = Math.max(timeToMinutes(item.end), s + 1);
    return { id: item.id, s, e, index };
  });
  parsed.sort((a, b) => a.s - b.s || a.e - b.e || String(a.id).localeCompare(String(b.id)));

  const colEnd = [];
  parsed.forEach((event) => {
    let col = 0;
    while (col < colEnd.length && colEnd[col] > event.s) col += 1;
    if (col === colEnd.length) colEnd.push(event.e);
    else colEnd[col] = event.e;
    event.col = col;
  });

  const parent = parsed.map((_, i) => i);
  const find = (i) => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const unite = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < parsed.length; i += 1) {
    for (let j = i + 1; j < parsed.length; j += 1) {
      if (parsed[j].s >= parsed[i].e) break;
      if (parsed[i].s < parsed[j].e && parsed[j].s < parsed[i].e) unite(i, j);
    }
  }
  const clusterCols = new Map();
  parsed.forEach((event, i) => {
    const root = find(i);
    clusterCols.set(root, Math.max(clusterCols.get(root) || 1, event.col + 1));
  });
  const byId = new Map();
  parsed.forEach((event, i) => {
    byId.set(event.id, { col: event.col, cols: clusterCols.get(find(i)) || 1 });
  });
  return list.map((item) => ({
    ...item,
    ...(byId.get(item.id) || { col: 0, cols: 1 }),
  }));
}
