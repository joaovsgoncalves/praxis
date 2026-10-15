/*
 * Hoje em um olhar: lógica pura dos hábitos em linha, dos cards de ferramentas e da semana.
 * Sem React e sem alias "@" (roda no node --test).
 */
import {
  getHabitDayOutcome,
  isHabitDueOnDate,
  isQuantitativeHabit,
  todayLogForHabit,
} from './habits.js';
import { isRitualOpenByDefault, sortCompoundHabitsForDay } from './compoundHabitOrder.js';
import { weekRange } from './taskLenses.js';

/** Passo do dia: desfecho pelo log de hoje e, se for de quantidade, quanto já foi. */
export function habitStepView(habit, habitLogs, today) {
  const log = todayLogForHabit(habitLogs || [], habit.id, today) || null;
  const outcome = getHabitDayOutcome(log);
  let progress = null;
  if (isQuantitativeHabit(habit) && outcome === 'open') {
    const value = Number(log?.value) || 0;
    progress = Math.max(0, Math.min(1, value / Number(habit.target_value)));
  }
  return { habit, log, outcome, progress };
}

/**
 * Grupo de hábitos (passos de uma rotina ou hábitos soltos) só com o que vale hoje.
 * Fechado = todos feitos ou "não rolou"; completo = todos feitos.
 */
export function summarizeHabitGroup(habits, habitLogs, today) {
  const steps = (habits || [])
    .filter((h) => isHabitDueOnDate(h, today))
    .map((h) => habitStepView(h, habitLogs, today));
  const done = steps.filter((s) => s.outcome === 'done').length;
  const skipped = steps.filter((s) => s.outcome === 'skipped').length;
  const total = steps.length;
  const next = steps.find((s) => s.outcome === 'open') || null;
  return {
    steps,
    done,
    skipped,
    total,
    closed: total > 0 && done + skipped === total,
    complete: total > 0 && done === total,
    next,
  };
}

/** Rotinas na ordem do dia (Abertura antes de Fechamento), cada uma resumida. */
export function buildRoutineGlances(compounds, habitLogs, today) {
  return sortCompoundHabitsForDay(compounds || [])
    .map((compound) => ({
      compound,
      ...summarizeHabitGroup(compound.children || [], habitLogs, today),
    }))
    .filter((routine) => routine.total > 0);
}

/**
 * A rotina começa aberta agora? Abertura antes das 11h, Fechamento a partir das 20h.
 * `clock` = "HH:MM", hora (0–23) ou Date.
 */
export function routineStartsExpanded(compound, clock) {
  return isRitualOpenByDefault(compound, clock);
}

/**
 * Frente do card: a primeira em foco com próximo passo; senão, a primeira andando com próximo passo.
 * Pausadas ficam de fora. Sem nenhuma, null.
 */
export function pickFocusFront(projects) {
  const list = (Array.isArray(projects) ? projects : []).filter(
    (p) => p && p.column !== 'pausado' && String(p.next_step || '').trim(),
  );
  return (
    list.find((p) => Number(p.focus) === 1)
    || list.find((p) => p.column === 'andando')
    || null
  );
}

/**
 * Meta do card: entre as ativas, a de prazo mais perto (prazos já passados não puxam a fila);
 * sem prazo à frente, a de maior progresso. `progressOf(goal)` devolve 0–100.
 */
export function pickMainGoal(goals, progressOf = () => 0, today = '') {
  const active = (Array.isArray(goals) ? goals : []).filter((g) => g && g.status === 'active');
  if (active.length === 0) return null;
  const upcoming = active
    .filter((g) => {
      const d = String(g.deadline || '').slice(0, 10);
      return d && (!today || d >= today);
    })
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
  if (upcoming.length > 0) return upcoming[0];
  let best = active[0];
  let bestPct = Number(progressOf(best)) || 0;
  for (const goal of active.slice(1)) {
    const pct = Number(progressOf(goal)) || 0;
    if (pct > bestPct) {
      best = goal;
      bestPct = pct;
    }
  }
  return best;
}

/** Sexta, sábado e domingo: a revisão da semana ganha destaque. */
export function isReviewWeekend(today) {
  const dow = new Date(`${String(today).slice(0, 10)}T12:00:00`).getDay();
  return dow === 5 || dow === 6 || dow === 0;
}

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "13 a 19 out" ou "29 set a 5 out". */
export function formatWeekSpan(today) {
  const { start, end } = weekRange(today);
  const [, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  if (sm === em) return `${sd} a ${ed} ${MONTH_SHORT[em - 1]}`;
  return `${sd} ${MONTH_SHORT[sm - 1]} a ${ed} ${MONTH_SHORT[em - 1]}`;
}

/** Card Revisar: capturas na fila vêm antes; sem fila, a revisão da semana. */
export function pickReviewCard({ pendingCount, today }) {
  const count = Math.max(0, Number(pendingCount) || 0);
  if (count > 0) return { kind: 'captures', count };
  return { kind: 'week', weekend: isReviewWeekend(today), span: formatWeekSpan(today) };
}

/** 45 → "45 min"; 60 → "1 h"; 200 → "3 h 20". */
export function formatMinutesShort(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Resumo da semana em até 3 números reais; zero e vazio ficam de fora. */
export function weekSummaryParts(victories) {
  if (!victories) return [];
  const parts = [];
  const focus = Number(victories.focus_minutes) || 0;
  if (focus > 0) parts.push(`${formatMinutesShort(focus)} de foco`);
  const tasks = Number(victories.tasks_completed_count) || 0;
  if (tasks > 0) parts.push(`${tasks} ${tasks === 1 ? 'tarefa' : 'tarefas'}`);
  const pct = victories.habits_completion_pct;
  if (pct != null && Number.isFinite(Number(pct)) && Number(victories.habits_target) !== 0) {
    parts.push(`${Math.round(Number(pct))}% dos hábitos`);
  }
  return parts;
}

const WEEKDAY_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** "Quarta, 4 de 16" ou "Quarta, nada agendado". */
export function weekDayAriaLabel(day) {
  const name = WEEKDAY_NAME[day?.weekday] || '';
  if (!day?.total) return `${name}, nada agendado`;
  return `${name}, ${day.done} de ${day.total}`;
}

/** Altura da barra do dia (0–1). */
export function weekBarRatio(day) {
  const total = Number(day?.total) || 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (Number(day.done) || 0) / total));
}
