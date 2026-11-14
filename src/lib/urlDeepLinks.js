/** Normaliza ?tab= para Hábitos & Tarefas */
export function habitTasksTabFromSearchParams(searchParams) {
  const tab = searchParams.get('tab');
  if (tab === 'habits' || tab === 'tasks') return tab;
  return 'all';
}

export function setHabitTasksTabInSearchParams(searchParams, view) {
  const next = new URLSearchParams(searchParams);
  if (view === 'all') next.delete('tab');
  else next.set('tab', view);
  return next;
}

export function stripQueryParam(searchParams, key) {
  const next = new URLSearchParams(searchParams);
  next.delete(key);
  return next;
}

const TASK_SCOPES = new Set(['today', 'inbox', 'week', 'overdue', 'all']);

export function taskScopeFromSearchParams(searchParams) {
  const scope = searchParams.get('scope');
  return TASK_SCOPES.has(scope) ? scope : 'today';
}

export function setTaskScopeInSearchParams(searchParams, scope) {
  const next = new URLSearchParams(searchParams);
  if (!scope || scope === 'today') next.delete('scope');
  else next.set('scope', scope);
  return next;
}

const TASK_LENSES = new Set(['list', 'board', 'week']);

export function taskLensFromSearchParams(searchParams) {
  const lens = searchParams.get('lens');
  return TASK_LENSES.has(lens) ? lens : 'list';
}

export function setTaskLensInSearchParams(searchParams, lens) {
  const next = new URLSearchParams(searchParams);
  if (!lens || lens === 'list') next.delete('lens');
  else next.set('lens', lens);
  return next;
}

/** ?task=<id> abre o painel de detalhe daquela tarefa. */
export function taskIdFromSearchParams(searchParams) {
  const id = String(searchParams.get('task') || '').trim();
  return id || null;
}

export function setTaskIdInSearchParams(searchParams, taskId) {
  const next = new URLSearchParams(searchParams);
  if (taskId === null || taskId === undefined || taskId === '') next.delete('task');
  else next.set('task', String(taskId));
  return next;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ?day=YYYY-MM-DD escolhe o dia na faixa da semana (inválido = nenhum). */
export function taskDayFromSearchParams(searchParams) {
  const day = String(searchParams.get('day') || '').trim();
  if (!DAY_KEY_RE.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return valid ? day : null;
}

export function setTaskDayInSearchParams(searchParams, day) {
  const next = new URLSearchParams(searchParams);
  if (!day) next.delete('day');
  else next.set('day', day);
  return next;
}

/** Link para Tarefas › Semana com o dia escolhido. */
export function weekDayHref(day) {
  let params = setTaskScopeInSearchParams(new URLSearchParams(), 'week');
  params = setTaskDayInSearchParams(params, day);
  return `/tarefas?${params.toString()}`;
}
