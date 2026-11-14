// O que um toque num hábito vira na tela, antes de a API responder.
// A meta vem do próprio hábito (inclusive passo de rotina), nunca de uma lista que
// pode não estar carregada: sem meta conhecida, 0,5 L de 3 L aparecia como feito.

const round3 = (value) => Math.round(value * 1000) / 1000;

function targetOf(habit) {
  const target = Number(habit?.target_value);
  return Number.isFinite(target) && target > 0 ? target : 0;
}

/** Acha o hábito (ou passo de rotina) em qualquer das listas carregadas. */
export function findHabitInLists(lists, habitId) {
  for (const list of lists || []) {
    if (!Array.isArray(list)) continue;
    for (const habit of list) {
      if (habit?.id === habitId) return habit;
      const child = Array.isArray(habit?.children) ? habit.children.find((item) => item?.id === habitId) : null;
      if (child) return child;
    }
  }
  return null;
}

/**
 * Marcar, registrar quantidade ou desfazer.
 * @returns {{ completed: boolean, value: number|null, outcome: 'done'|null, cleared: boolean }}
 */
export function planHabitToggle({ habit, isDone, value }) {
  if (isDone) return { completed: false, value: null, outcome: null, cleared: true };
  const target = targetOf(habit);
  if (value === undefined || value === null) {
    return { completed: true, value: target || null, outcome: 'done', cleared: false };
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) return { completed: false, value: null, outcome: null, cleared: false };
  const completed = target > 0 ? amount >= target : true;
  return { completed, value: round3(amount), outcome: completed ? 'done' : null, cleared: false };
}

/** Somar uma dose (ex.: +500 ml) ao que já foi registrado no dia. */
export function planHabitIncrement({ habit, currentValue, increment }) {
  const previous = Number.isFinite(Number(currentValue)) && currentValue != null ? Number(currentValue) : 0;
  const step = Number(increment ?? habit?.quick_increment ?? 0.5);
  const next = round3(previous + (Number.isFinite(step) ? step : 0));
  const target = targetOf(habit);
  const completed = target > 0 && next >= target;
  return { completed, value: next, outcome: completed ? 'done' : null, cleared: false };
}

// "Não rolou" zera a quantidade do dia, igual à API.
export const SKIPPED_PLAN = Object.freeze({ completed: false, value: null, outcome: 'skipped', cleared: false });

function patchFromPlan(plan) {
  const skipped = plan.outcome === 'skipped';
  const patch = {
    completed_today: plan.completed,
    skipped_today: skipped,
    day_outcome: skipped ? 'skipped' : plan.completed ? 'done' : 'open',
  };
  if (plan.value !== undefined) patch.value_today = plan.value;
  return patch;
}

/** Aplica o plano ao hábito ou ao passo de rotina dentro de uma lista. */
export function applyPlanToHabitList(list, habitId, plan) {
  if (!Array.isArray(list)) return list;
  const patch = patchFromPlan(plan);
  return list.map((habit) => {
    if (habit?.id === habitId) return { ...habit, ...patch };
    if (Array.isArray(habit?.children) && habit.children.some((child) => child?.id === habitId)) {
      return {
        ...habit,
        children: habit.children.map((child) => (child?.id === habitId ? { ...child, ...patch } : child)),
      };
    }
    return habit;
  });
}

/** Aplica o plano ao registro do dia. `extra` leva motivo/nota do "Não rolou". */
export function applyPlanToLogs(logs, { habitId, date, plan, tempId, extra = {} }) {
  if (!Array.isArray(logs)) return logs;
  const current = logs.find((log) => log.habit_id === habitId && log.date === date);
  const rest = logs.filter((log) => !(log.habit_id === habitId && log.date === date));
  if (plan.cleared) return rest;
  return [
    ...rest,
    {
      id: current?.id || tempId,
      habit_id: habitId,
      date,
      outcome: plan.outcome,
      completed: plan.completed ? 1 : 0,
      value: plan.value === undefined ? (current?.value ?? null) : plan.value,
      ...extra,
    },
  ];
}
