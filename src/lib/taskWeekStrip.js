import { isTaskDone, isTaskOpen, taskCompletionDate } from './tasks.js';
import { weekRange } from './taskLenses.js';
import { addDaysToDateKey } from './taskListFilters.js';

const DOW_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Tarefa entra na faixa/linha do tempo? (fora: ideias e canceladas) */
function isStripTask(task) {
  return Boolean(task) && task.category !== 'ideias' && task.status !== 'cancelled';
}

/**
 * Tarefas de um dia: abertas com data no dia + concluídas com data no dia
 * ou fechadas naquele dia (mesma regra do "Hoje": o check verde não some).
 */
export function tasksForDay(tasks, day) {
  if (!Array.isArray(tasks) || !day) return [];
  return tasks.filter((task) => {
    if (!isStripTask(task)) return false;
    const date = String(task.date || '').slice(0, 10);
    if (isTaskOpen(task)) return date === day;
    if (isTaskDone(task)) return date === day || taskCompletionDate(task) === day;
    return false;
  });
}

/** Carga do dia: { open, done, total }. */
export function dayLoad(tasks, day) {
  const list = tasksForDay(tasks, day);
  const done = list.filter((task) => isTaskDone(task)).length;
  return { open: list.length - done, done, total: list.length };
}

/** Segunda da semana de `dateKey` deslocada `deltaWeeks` semanas. */
export function shiftWeek(dateKey, deltaWeeks) {
  const { start } = weekRange(dateKey);
  return addDaysToDateKey(start, (Number(deltaWeeks) || 0) * 7);
}

export function isSameWeek(a, b) {
  if (!a || !b) return false;
  return weekRange(a).start === weekRange(b).start;
}

/**
 * Sete dias (seg a dom) da semana de `baseDate`, com rótulo, número, hoje e carga.
 */
export function buildWeekStrip(baseDate, today, tasks = []) {
  const { days } = weekRange(baseDate);
  return days.map((date, index) => ({
    date,
    dow: DOW_SHORT[index],
    dayNum: Number(date.slice(8, 10)),
    isToday: date === today,
    load: dayLoad(tasks, date),
  }));
}

/** Tocar no dia já selecionado limpa a seleção (volta ao escopo atual). */
export function toggleSelectedDay(current, tapped) {
  return current === tapped ? null : tapped;
}

/** Dias que a linha do tempo mostra: só o dia focado (se for da semana) ou a semana toda. */
export function visibleWeekDays(baseDate, focusDay) {
  const { days } = weekRange(baseDate);
  return focusDay && days.includes(focusDay) ? [focusDay] : days;
}

/** "13 a 19 de out" ou "29 de set a 5 de out". */
export function formatWeekRangeLabel(baseDate) {
  const { start, end } = weekRange(baseDate);
  const [, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  const endMonth = MONTH_SHORT[em - 1] || '';
  if (sm === em) return `${sd} a ${ed} de ${endMonth}`;
  return `${sd} de ${MONTH_SHORT[sm - 1] || ''} a ${ed} de ${endMonth}`;
}

/** "qua, 15/10" — rótulo curto do dia selecionado. */
export function formatDayLabel(dateKey) {
  const { days } = weekRange(dateKey);
  const index = days.indexOf(dateKey);
  const [, m, d] = String(dateKey).split('-');
  return `${(DOW_SHORT[index] || '').toLowerCase()}, ${d}/${m}`;
}

/**
 * Dica da faixa da semana: deixa claro que o dia filtra só as tarefas.
 * Em "Todos" os hábitos aparecem junto e continuam no dia de hoje.
 */
export function weekStripHint({ lens, view, selectedDay }) {
  if (lens !== 'list') return 'Toque num dia para destacá-lo na linha do tempo.';
  const base = selectedDay
    ? 'Mostrando só as tarefas de ' + formatDayLabel(selectedDay) + '. Toque de novo para voltar.'
    : 'Toque num dia para ver só as tarefas dele.';
  return view === 'all' ? base + ' Hábitos seguem em hoje.' : base;
}
