import { weekRange } from './taskLenses.js';

/** Projeção só a partir de quarta (índice 2, semana começando na segunda). */
const PROJECTION_FROM_DAY_INDEX = 2;

/**
 * Meta semanal de foco (opcional). Devolve null com a meta desligada: nada aparece na UI.
 * @param {{ goalMinutes: number|null|undefined, doneMinutes: number|null|undefined, weekStart: string, today: string }} input
 */
export function focusWeeklyGoalView({ goalMinutes, doneMinutes, weekStart, today }) {
  const goal = Number(goalMinutes);
  if (goalMinutes == null || !Number.isFinite(goal) || goal <= 0) return null;

  const done = Math.max(0, Math.round(Number(doneMinutes) || 0));
  const ratio = Math.min(1, done / goal);
  const week = weekRange(today);
  const isCurrentWeek = week.start === weekStart;

  let projection = null;
  if (isCurrentWeek && done > 0) {
    const dayIndex = week.days.indexOf(today);
    if (dayIndex >= PROJECTION_FROM_DAY_INDEX) {
      // Ritmo dos dias já vividos (hoje incluso), arredondado de 5 em 5.
      projection = Math.round(((done / (dayIndex + 1)) * 7) / 5) * 5;
    }
  }

  return { goal, done, ratio, isCurrentWeek, projection };
}
