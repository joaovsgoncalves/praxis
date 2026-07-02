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