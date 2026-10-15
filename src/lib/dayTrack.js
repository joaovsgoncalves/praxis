import { isTaskCompletedForToday, isTaskOpen, taskCompletionDate } from './tasks.js';
import { sortTasksForList } from './taskListFilters.js';
import { fortalezaNowTimeHHMM } from './dates.js';
import { timeToMinutes, nowToMinutes } from './nowTask.js';

/** Título comparável: sem prefixo P1/P2, sem acento, minúsculo, espaço único. */
export function normalizeTrackTitle(title) {
  return String(title || '')
    .replace(/^\s*P\d+\s*(?:[—–-]|:|\.)?\s*/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isAllDayEvent(event) {
  if (event?.all_day) return true;
  return !String(event?.start || '').includes('T');
}

/** Início/fim do evento em minutos do dia (Fortaleza); null se não tiver hora. */
function eventMinutes(value) {
  const raw = String(value || '');
  if (!raw.includes('T')) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return timeToMinutes(raw.split('T')[1]);
  return timeToMinutes(fortalezaNowTimeHHMM(date));
}

function minutesLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Evento da agenda que é espelho de uma tarefa da Praxis (a sync grava
 * `calendar_event_id` na tarefa e "Task ID: <id>" na descrição do evento).
 * Segundo critério: mesmo título normalizado e mesmo horário de início.
 */
function buildMirrorCheck(tasks) {
  const eventIds = new Set();
  const taskIds = new Set();
  const titleAtTime = new Set();
  for (const task of tasks) {
    if (task?.calendar_event_id) eventIds.add(String(task.calendar_event_id));
    if (task?.id != null) taskIds.add(String(task.id));
    const start = timeToMinutes(task?.time);
    if (start !== null) titleAtTime.add(`${normalizeTrackTitle(task.title)}|${start}`);
  }
  return (event, start) => {
    if (event?.id && eventIds.has(String(event.id))) return true;
    if (event?.task_id && taskIds.has(String(event.task_id))) return true;
    if (start !== null && titleAtTime.has(`${normalizeTrackTitle(event?.title)}|${start}`)) return true;
    return false;
  };
}

/**
 * Trilha do dia: { untimed, timeline, done, nowIndex }.
 * - timeline: tarefas abertas de hoje com hora + eventos com hora, por início
 *   (empate: tarefa antes de evento).
 * - untimed: tarefas abertas de hoje sem hora (ordem da lista) + eventos de dia inteiro.
 * - done: concluídas hoje.
 * - nowIndex: posição do marcador "agora" — depois do último item que já começou.
 * `excludeIds` tira da trilha o que já aparece em "Ficou pra trás".
 */
export function buildDayTrack({ tasks = [], events = [], now, today, excludeIds = [] } = {}) {
  const nowMin = nowToMinutes(now);
  const excluded = new Set((excludeIds || []).map(String));
  const allTasks = Array.isArray(tasks) ? tasks : [];
  const isMirror = buildMirrorCheck(allTasks);

  const openToday = allTasks.filter(
    (task) =>
      isTaskOpen(task) &&
      task.category !== 'ideias' &&
      String(task.date || '').slice(0, 10) === today &&
      !excluded.has(String(task.id))
  );

  const timedTasks = [];
  const untimedTasks = [];
  for (const task of openToday) {
    const start = timeToMinutes(task.time);
    if (start === null) untimedTasks.push(task);
    else timedTasks.push({ kind: 'task', key: `task:${task.id}`, start, end: null, task });
  }
  untimedTasks.sort((a, b) => sortTasksForList(a, b, today));

  const timedEvents = [];
  const allDayEvents = [];
  (Array.isArray(events) ? events : []).forEach((event, index) => {
    const key = `event:${event?.id || `${event?.start || ''}-${index}`}`;
    if (isAllDayEvent(event)) {
      if (!isMirror(event, null)) allDayEvents.push({ kind: 'event', key, start: null, end: null, event });
      return;
    }
    const start = eventMinutes(event.start);
    if (start === null) return;
    if (isMirror(event, start)) return;
    timedEvents.push({ kind: 'event', key, start, end: eventMinutes(event.end), event });
  });

  const timeline = [...timedTasks, ...timedEvents]
    .sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
      return 0;
    })
    .map((item) => ({
      ...item,
      startLabel: minutesLabel(item.start),
      past: item.start <= nowMin,
      inProgress: item.start <= nowMin && item.end !== null && nowMin < item.end,
    }));

  const nowIndex = timeline.filter((item) => item.start <= nowMin).length;

  const untimed = [
    ...untimedTasks.map((task) => ({ kind: 'task', key: `task:${task.id}`, start: null, task })),
    ...allDayEvents,
  ];

  const done = allTasks
    .filter((task) => task.category !== 'ideias' && isTaskCompletedForToday(task, today))
    .sort((a, b) =>
      String(a.completed_at || taskCompletionDate(a)).localeCompare(String(b.completed_at || taskCompletionDate(b)))
    );

  return { untimed, timeline, done, nowIndex };
}
