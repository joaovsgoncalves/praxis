/**
 * Hábitos — status e frequência (Praxis onda 3)
 *
 * status:
 * - active: aparece no dia quando a frequência exige; pode marcar check-in
 * - paused: fora do "hoje"; logs preservados; retomar → active
 * - archived: histórico só; não conta no dia; logs preservados
 *
 * pause/archive NUNCA apagam habit_logs (streak recalcula ao retomar com dados intactos).
 */

export const HABIT_STATUSES = ['active', 'paused', 'archived'];

export const HABIT_STATUS_LABELS = {
  active: 'Ativo',
  paused: 'Pausado',
  archived: 'Arquivado',
};

export const FREQUENCY_LABELS = {
  daily: 'Diário',
  weekdays: 'Dias úteis',
  weekends: 'Fins de semana',
  weekly: 'Semanal',
};

const DOW_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function parseRecurrenceDays(habit) {
  if (!habit?.recurrence_days) return [];
  try {
    const raw = typeof habit.recurrence_days === 'string'
      ? JSON.parse(habit.recurrence_days)
      : habit.recurrence_days;
    return Array.isArray(raw)
      ? [...new Set(raw.map(Number).filter((n) => n >= 0 && n <= 6))]
      : [];
  } catch {
    return [];
  }
}

export function formatFrequencyLabel(habit) {
  if (!habit) return '';
  const base = FREQUENCY_LABELS[habit.frequency] || habit.frequency;
  if (habit.frequency === 'weekly') {
    const days = parseRecurrenceDays(habit);
    if (days.length) {
      const names = [...days].sort((a, b) => a - b).map((d) => DOW_SHORT[d]);
      return `Semanal (${names.join(', ')})`;
    }
  }
  return base;
}

/** dateKey: YYYY-MM-DD (Fortaleza / local do app) */
export function isHabitDueOnDate(habit, dateKey) {
  if (!habit || habit.status !== 'active') return false;
  const d = new Date(`${dateKey}T12:00:00`);
  const dow = d.getDay();
  switch (habit.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekends':
      return dow === 0 || dow === 6;
    case 'weekly': {
      const days = parseRecurrenceDays(habit);
      if (!days.length) return true;
      return days.includes(dow);
    }
    default:
      return true;
  }
}

export function isQuantitativeHabit(habit) {
  return habit?.target_value != null && Number(habit.target_value) > 0;
}

export function todayLogForHabit(habitLogs, habitId, dateKey) {
  return habitLogs.find((log) => log.habit_id === habitId && log.date === dateKey);
}

/** Day outcome: open | done | skipped */
export const DAY_OUTCOMES = {
  open: 'open',
  done: 'done',
  skipped: 'skipped',
};

export const DAY_OUTCOME_LABELS = {
  open: 'Aberto',
  done: 'Feito',
  skipped: 'Não rolou',
};

export const SKIP_REASONS = [
  { value: 'time', label: 'Tempo' },
  { value: 'energy', label: 'Energia' },
  { value: 'context', label: 'Contexto' },
  { value: 'other', label: 'Outro' },
];

export const SKIP_REASON_LABELS = Object.fromEntries(
  SKIP_REASONS.map((r) => [r.value, r.label]),
);

export function isHabitLogDone(log) {
  if (!log) return false;
  if (log.outcome === 'skipped') return false;
  if (log.outcome === 'done') return true;
  return log.completed === 1 || log.completed === true;
}

export function isHabitLogSkipped(log) {
  if (!log) return false;
  return log.outcome === 'skipped';
}

/** open | done | skipped */
export function getHabitDayOutcome(log) {
  if (!log) return DAY_OUTCOMES.open;
  if (isHabitLogSkipped(log)) return DAY_OUTCOMES.skipped;
  if (isHabitLogDone(log)) return DAY_OUTCOMES.done;
  return DAY_OUTCOMES.open;
}

export function habitDayOutcomeLabel(outcome) {
  return DAY_OUTCOME_LABELS[outcome] || DAY_OUTCOME_LABELS.open;
}

export function countHabitDayOutcomes(habits, habitLogs, dateKey) {
  let done = 0;
  let skipped = 0;
  let open = 0;
  for (const h of habits) {
    const log = todayLogForHabit(habitLogs, h.id, dateKey);
    const o = getHabitDayOutcome(log);
    if (o === DAY_OUTCOMES.done) done += 1;
    else if (o === DAY_OUTCOMES.skipped) skipped += 1;
    else open += 1;
  }
  return { done, skipped, open, total: habits.length };
}