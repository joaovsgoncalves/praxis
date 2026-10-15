import { isTaskDone, isTaskOpen } from './tasks.js';
import { fortalezaNowTimeHHMM } from './dates.js';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

/** Tarefa de hoje com hora anterior a esta janela (minutos antes de agora) ficou pra trás. */
export const NOW_WINDOW_MINUTES = 90;

const DOW_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function isP0Title(title) {
  return /^P0[\s:\-]/i.test(String(title || '').trim());
}

function comparePending(a, b) {
  const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  if (pr !== 0) return pr;
  const dateCmp = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateCmp !== 0) return dateCmp;
  return String(a.time || '').localeCompare(String(b.time || ''));
}

/** "HH:MM" → minutos do dia (null se inválido). */
export function timeToMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (!match) return null;
  return (Number(match[1]) % 24) * 60 + Number(match[2]);
}

/** Relógio injetável: aceita "HH:MM", Date ou nada (agora, em Fortaleza). */
function resolveNowMinutes(now) {
  if (typeof now === 'string') return timeToMinutes(now) ?? 0;
  return timeToMinutes(fortalezaNowTimeHHMM(now instanceof Date ? now : new Date())) ?? 0;
}

function fallbackNowTask(pending, today) {
  const overdue = pending
    .filter((t) => t.date && t.date < today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || comparePending(a, b));
  if (overdue.length) return overdue[0];

  const highTodayNoTime = pending
    .filter((t) => t.date === today && !t.time && (t.priority === 'high' || isP0Title(t.title)))
    .sort(comparePending);
  if (highTodayNoTime.length) return highTodayNoTime[0];

  const anyTodayNoTime = pending.filter((t) => t.date === today && !t.time).sort(comparePending);
  if (anyTodayNoTime.length) return anyTodayNoTime[0];

  return null;
}

/**
 * Plano do momento: { now, next, behind }.
 * - Cada tarefa de hoje com hora ocupa um bloco até `time + duração` ou, sem duração,
 *   até a próxima tarefa com hora. Blocos que terminaram antes de `agora - 90 min`
 *   ficaram pra trás.
 * - Agora: a tarefa com hora que já começou mais recente dentro da janela; se nenhuma
 *   começou, a próxima a começar. Sem tarefa com hora na janela, vale a regra antiga
 *   (atrasada mais antiga → alta/P0 sem hora → qualquer de hoje sem hora).
 * - Depois: a próxima tarefa com hora depois do Agora.
 * - Ficou pra trás: abertas de dias anteriores + de hoje fora da janela.
 */
export function planNowTasks(tasks, today, now) {
  const nowMin = resolveNowMinutes(now);
  const windowStart = nowMin - NOW_WINDOW_MINUTES;
  const pending = (tasks || []).filter((t) => isTaskOpen(t) && !isTaskDone(t));

  const timedToday = pending
    .filter((t) => t.date === today && timeToMinutes(t.time) !== null)
    .map((task) => ({ task, start: timeToMinutes(task.time) }))
    .sort((a, b) => a.start - b.start);

  const inWindow = [];
  const behindToday = [];
  timedToday.forEach((item, index) => {
    const duration = Number(item.task.duration_minutes) || 0;
    const nextStart = timedToday.slice(index + 1).find((other) => other.start > item.start)?.start;
    const end = duration > 0 ? item.start + duration : (nextStart ?? item.start);
    if (end < windowStart) behindToday.push(item.task);
    else inWindow.push(item);
  });

  const started = inWindow.filter((item) => item.start <= nowMin);
  const upcoming = inWindow.filter((item) => item.start > nowMin);
  const current = started.length ? started[started.length - 1] : upcoming[0];

  const behindPast = pending
    .filter((t) => t.date && t.date < today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || comparePending(a, b));
  const behind = [...behindPast, ...behindToday];

  if (current) {
    const next = inWindow.find((item) => item.start > current.start)?.task ?? null;
    return { now: current.task, next, behind };
  }

  const fallback = fallbackNowTask(pending, today)
    ?? (behindToday.length ? behindToday[behindToday.length - 1] : null);
  return { now: fallback, next: null, behind };
}

/** Atalho: só o Agora (mesmo relógio injetável). */
export function pickNowTask(tasks, today, now) {
  return planNowTasks(tasks, today, now).now;
}

/** "desde ontem", "desde seg 12/10" ou, para hoje, "desde 07:15". */
export function formatBehindSince(task, today) {
  const date = String(task?.date || '').slice(0, 10);
  if (!date) return '';
  if (date === today) {
    const time = formatTaskTimeLabel(task);
    return time ? `desde ${time}` : 'desde hoje cedo';
  }
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = String(today).split('-').map(Number);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / dayMs);
  if (diffDays === 1) return 'desde ontem';
  const dow = DOW_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `desde ${dow} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export function formatTaskTimeLabel(task) {
  if (!task?.time) return null;
  return task.time.slice(0, 5);
}

export function isTaskOverdue(task, today) {
  return Boolean(task?.date && task.date < today && isTaskOpen(task));
}
