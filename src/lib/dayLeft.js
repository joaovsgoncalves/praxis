import { isTaskOpen, isTaskCompletedForToday } from './tasks.js';
import { countHabitDayOutcomes } from './habits.js';

/** Tarefas abertas com data de hoje (as de dias anteriores ficam em "Ficou pra trás"). */
export function countOpenTasksForDay(tasks, today) {
  return (tasks || []).filter(
    (t) => isTaskOpen(t) && t.category !== 'ideias' && String(t.date || '').slice(0, 10) === today,
  ).length;
}

/**
 * Quanto falta pra fechar o dia: tarefas abertas de hoje + hábitos folha abertos.
 * Fechado = feito, não rolou ou não hoje (decisão também fecha o item).
 */
export function computeDayLeft({ tasks, habits, habitLogs, today }) {
  const openTasks = countOpenTasksForDay(tasks, today);
  const doneTasks = (tasks || []).filter(
    (t) => t.category !== 'ideias' && isTaskCompletedForToday(t, today),
  ).length;
  const habitCounts = countHabitDayOutcomes(habits || [], habitLogs || [], today);
  const left = openTasks + habitCounts.open;
  const total = left + doneTasks + habitCounts.done + habitCounts.skipped;
  return { left, total, openTasks, openHabits: habitCounts.open };
}
