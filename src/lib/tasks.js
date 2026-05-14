export const isTaskDone = (task) => task?.status === 'completed' || task?.status === 'done';

export const taskCompletionDate = (task) => (
  task?.completed_date || String(task?.completed_at || task?.updated_date || '').slice(0, 10)
);

export function isTaskCompletedForToday(task, today) {
  if (!isTaskDone(task)) return false;
  const wasCompletedToday = taskCompletionDate(task) === today;
  const legacyCompletedTodayTask = !task?.completed_date && task?.date === today;
  return wasCompletedToday || legacyCompletedTodayTask;
}

export function isTaskRelevantForTodayList(task, today) {
  return !isTaskDone(task) || isTaskCompletedForToday(task, today);
}

export function sortTodayRelevantTasks(a, b) {
  const aDone = isTaskDone(a);
  const bDone = isTaskDone(b);
  if (aDone !== bDone) return aDone ? 1 : -1;

  const dateCompare = String(a?.date || '').localeCompare(String(b?.date || ''));
  if (dateCompare !== 0) return dateCompare;

  return String(a?.time || '').localeCompare(String(b?.time || ''));
}
