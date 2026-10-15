/**
 * Day-flow order for compound habits (rotinas): morning/opening first, evening/closing last.
 * No schema change — uses preferred_time, title keywords, then sort_order / title.
 */

import { normalizePreferredTime } from './habits.js';

const MORNING_RE = /abertura|manh[ãa]|acordar|amanhecer|despertar|wake/i;
const AFTERNOON_RE = /tarde|almo[cç]o|meio[- ]?dia/i;
const EVENING_RE = /fechamento|noite|dormir|sono|jantar|fim do dia|encerramento/i;
const CLOSING_RE = /fechamento|fim do dia|encerramento/i;

/** Default minutes when only title keywords apply. */
const KEYWORD_MINUTES = {
  morning: 6 * 60,
  afternoon: 14 * 60,
  evening: 21 * 60,
  unknown: 12 * 60,
};

function timeToMinutes(value) {
  const t = normalizePreferredTime(value);
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Title keyword → day bucket minutes, or null if no match. */
export function titlePeriodMinutes(title) {
  const t = String(title || '');
  if (MORNING_RE.test(t)) return KEYWORD_MINUTES.morning;
  if (EVENING_RE.test(t)) return KEYWORD_MINUTES.evening;
  if (AFTERNOON_RE.test(t)) return KEYWORD_MINUTES.afternoon;
  return null;
}

/**
 * Rank a compound for day order.
 * Priority: compound preferred_time → first step preferred_time → title keywords → noon.
 */
export function compoundHabitDayRank(compound) {
  const fromCompound = timeToMinutes(compound?.preferred_time);
  const firstStep = Array.isArray(compound?.children) ? compound.children[0] : null;
  const fromStep = timeToMinutes(firstStep?.preferred_time);
  const fromTitle = titlePeriodMinutes(compound?.title);

  const minutes = fromCompound ?? fromStep ?? fromTitle ?? KEYWORD_MINUTES.unknown;
  const rawOrder = compound?.sort_order;
  const sortOrder = Number.isFinite(Number(rawOrder)) ? Number(rawOrder) : Number.MAX_SAFE_INTEGER;
  const title = String(compound?.title || '');

  return { minutes, sortOrder, title };
}

export function compareCompoundHabitsForDay(a, b) {
  const ra = compoundHabitDayRank(a);
  const rb = compoundHabitDayRank(b);
  if (ra.minutes !== rb.minutes) return ra.minutes - rb.minutes;
  if (ra.sortOrder !== rb.sortOrder) return ra.sortOrder - rb.sortOrder;
  return ra.title.localeCompare(rb.title, 'pt-BR', { sensitivity: 'base' });
}

/** Stable copy sorted for day flow (abertura → tarde → fechamento). */
export function sortCompoundHabitsForDay(compounds) {
  if (!Array.isArray(compounds) || compounds.length <= 1) {
    return Array.isArray(compounds) ? [...compounds] : [];
  }
  return [...compounds].sort(compareCompoundHabitsForDay);
}

/**
 * Split the sorted routines around regular check habits in the unified list.
 * Evening/closing routines always belong to the tail, so Fechamento stays last.
 */
export function partitionCompoundHabitsForDay(compounds) {
  const beforeChecks = [];
  const afterChecks = [];

  for (const compound of sortCompoundHabitsForDay(compounds)) {
    const titleMinutes = titlePeriodMinutes(compound?.title);
    const { minutes } = compoundHabitDayRank(compound);
    const isMorning = titleMinutes === KEYWORD_MINUTES.morning
      || (titleMinutes === null && minutes < 12 * 60);
    (isMorning ? beforeChecks : afterChecks).push(compound);
  }

  afterChecks.sort((a, b) => {
    const aClosing = CLOSING_RE.test(String(a?.title || ''));
    const bClosing = CLOSING_RE.test(String(b?.title || ''));
    return Number(aClosing) - Number(bClosing);
  });

  return { beforeChecks, afterChecks };
}

/** Abertura começa aberta antes das 11h; Fechamento, a partir das 20h. */
export const OPENING_OPEN_UNTIL_HOUR = 11;
export const CLOSING_OPEN_FROM_HOUR = 20;

/** Fase do ritual no dia: 'opening' (manhã), 'closing' (noite/fechamento) ou 'other'. */
export function ritualPhase(compound) {
  const titleMinutes = titlePeriodMinutes(compound?.title);
  const { minutes } = compoundHabitDayRank(compound);
  if (titleMinutes === KEYWORD_MINUTES.morning || (titleMinutes === null && minutes < 12 * 60)) return 'opening';
  if (titleMinutes === KEYWORD_MINUTES.evening || (titleMinutes === null && minutes >= 18 * 60)) return 'closing';
  return 'other';
}

/**
 * O ritual começa expandido agora? `now` = hora (0–23), "HH:MM" ou Date.
 * Fora das janelas fica recolhido mostrando feitos/total; o toque abre e fecha.
 */
export function isRitualOpenByDefault(compound, now) {
  let hour;
  if (typeof now === 'number') hour = now;
  else if (typeof now === 'string') hour = Number(now.split(':')[0]);
  else hour = (now instanceof Date ? now : new Date()).getHours();
  if (!Number.isFinite(hour)) return false;
  const phase = ritualPhase(compound);
  if (phase === 'opening') return hour < OPENING_OPEN_UNTIL_HOUR;
  if (phase === 'closing') return hour >= CLOSING_OPEN_FROM_HOUR;
  return false;
}
