import React from 'react';
import { Clock, Hourglass, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isTaskDone } from '@/lib/tasks';
import { fortalezaAddDays } from '@/lib/dates';
import { CATEGORIES } from '@/lib/categories';

/** Peças do card de tarefa — mesma linguagem no Quadro, na Lista e na Linha do tempo. */

export const PRIORITY_CONFIG = {
  high: { label: 'Alta', barClass: 'bg-rose-400' },
  medium: { label: 'Média', barClass: 'bg-domain-gold/80' },
  low: { label: 'Baixa', barClass: 'bg-stone-400/60' },
};

export function taskPriorityKey(task) {
  return PRIORITY_CONFIG[task?.priority] ? task.priority : 'medium';
}

export function formatTaskRelativeDate(dateStr, timeStr, today) {
  const cleanTime = timeStr ? String(timeStr).slice(0, 5) : null;
  if (!dateStr) {
    return cleanTime || null;
  }

  let dateLabel = null;
  if (dateStr === today) {
    dateLabel = 'Hoje';
  } else if (dateStr === fortalezaAddDays(today, 1)) {
    dateLabel = 'Amanhã';
  } else if (dateStr === fortalezaAddDays(today, -1)) {
    dateLabel = 'Ontem';
  } else {
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);
    const [ty, tm, td] = today.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    const diffDays = Math.round((targetDate - todayDate) / (1000 * 60 * 60 * 24));

    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    if (diffDays > 1 && diffDays < 7) {
      dateLabel = weekdays[targetDate.getDay()];
    } else if (diffDays < -1 && diffDays > -7) {
      dateLabel = weekdays[targetDate.getDay()];
    } else {
      dateLabel = String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0');
    }
  }

  if (dateLabel && cleanTime) {
    return dateLabel + ', ' + cleanTime;
  }
  return dateLabel || cleanTime || null;
}

export function formatTaskDuration(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (total < 60) return total + ' min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? h + 'h' + String(m).padStart(2, '0') : h + 'h';
}

/** Régua de prioridade no topo do card — cor; o texto acessível fica no título. */
export function TaskPriorityRuler({ task, className }) {
  const priority = taskPriorityKey(task);
  return (
    <span
      aria-hidden
      className={cn(
        'absolute left-3 top-0 h-[3px] w-7 rounded-b-full',
        isTaskDone(task) ? 'bg-domain-wellness/50' : PRIORITY_CONFIG[priority].barClass,
        className
      )}
    />
  );
}

export function TaskAreaChip({ category, className, compact = false }) {
  const cat = CATEGORIES[category];
  if (!cat) return null;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-[3px] text-[11px] font-medium leading-none',
        cat.color,
        className
      )}
    >
      <span aria-hidden>{cat.emoji}</span>
      <span className={cn('truncate', compact && 'sr-only')}>{cat.label}</span>
    </span>
  );
}

export function TaskChecklistProgress({ task, className }) {
  const total = Number(task?.checklist_total) || 0;
  if (total <= 0) return null;
  const done = Math.min(Number(task.checklist_done) || 0, total);
  const complete = done === total;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1.5 tabular-nums', complete && 'text-domain-wellness', className)}
      aria-label={'Checklist: ' + done + ' de ' + total}
    >
      <ListChecks className="h-3 w-3 opacity-80" aria-hidden />
      <span aria-hidden>
        {done}/{total}
      </span>
      <span aria-hidden className="h-1 w-8 overflow-hidden rounded-full bg-white/[0.08]">
        <span
          className={cn(
            'block h-full w-full origin-left rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none',
            complete ? 'bg-domain-wellness' : 'bg-domain-gold/80'
          )}
          style={{ transform: 'scaleX(' + done / total + ')' }}
        />
      </span>
    </span>
  );
}

/** Linha de meta: área, prioridade alta, data/hora, duração, checklist (+ extras no fim). */
export function TaskCardMeta({ task, today, className, children }) {
  const isDone = isTaskDone(task);
  const priority = taskPriorityKey(task);
  const relativeDateText = formatTaskRelativeDate(task.date, task.time, today);
  const isOverdue = !isDone && Boolean(task.date) && task.date < today;
  const durationText = formatTaskDuration(task.duration_minutes);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs leading-none text-muted-foreground',
        className
      )}
    >
      <TaskAreaChip category={task.category} />

      {priority === 'high' && !isDone ? (
        <span className="font-medium text-rose-300" aria-hidden>
          Alta
        </span>
      ) : null}

      {relativeDateText ? (
        <span className={cn('inline-flex shrink-0 items-center gap-1 tabular-nums', isOverdue && 'text-rose-300')}>
          <Clock className="h-3 w-3 opacity-80" aria-hidden />
          <span>
            {isOverdue ? <span className="sr-only">Atrasada: </span> : null}
            {relativeDateText}
          </span>
        </span>
      ) : null}

      {durationText ? (
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <Hourglass className="h-3 w-3 opacity-80" aria-hidden />
          <span>
            <span className="sr-only">Duração: </span>
            {durationText}
          </span>
        </span>
      ) : null}

      <TaskChecklistProgress task={task} />

      {children}
    </div>
  );
}
