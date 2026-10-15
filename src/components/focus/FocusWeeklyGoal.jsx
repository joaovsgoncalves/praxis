import React from 'react';
import { cn } from '@/lib/utils';
import { focusWeeklyGoalView } from '@/lib/focusWeeklyGoal';

/** Meta semanal de foco: só aparece com a meta ligada. Sem cobrança, sem vermelho. */
export default function FocusWeeklyGoal({ goalMinutes, doneMinutes, weekStart, today, className }) {
  const view = focusWeeklyGoalView({ goalMinutes, doneMinutes, weekStart, today });
  if (!view) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">{view.done} min</span>
        {view.isCurrentWeek ? ' nesta semana' : ' na semana'}, meta{' '}
        <span className="tabular-nums">{view.goal} min</span>
      </p>
      <div
        className="h-1 overflow-hidden rounded-full bg-white/[0.07]"
        role="progressbar"
        aria-label="Foco na semana"
        aria-valuemin={0}
        aria-valuemax={view.goal}
        aria-valuenow={Math.min(view.done, view.goal)}
      >
        <div
          className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${view.ratio})` }}
        />
      </div>
      {view.projection != null ? (
        <p className="text-xs text-muted-foreground tabular-nums">No ritmo de hoje, perto de {view.projection} min.</p>
      ) : null}
    </div>
  );
}
