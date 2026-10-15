import React from 'react';
import { CheckCircle2, Circle, Clock, Flame, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { cleanPriorityPrefix } from '@/lib/tasks';
import {
  SKIP_REASON_LABELS,
  formatFrequencyLabel,
  formatHabitProgress,
  formatPreferredTime,
  formatQuickIncrementAriaLabel,
  formatQuickIncrementButtonLabel,
  isHabitDueOnDate,
  isQuantitativeHabit,
  isQuickIncrementHabit,
} from '@/lib/habits';
import { AreaRuler, TaskAreaChip } from '@/components/habits-tasks/TaskCardParts';

/**
 * Linha de hábito simples — a mesma na aba Hábitos e no Hoje:
 * superfície do quadro, régua da área, chips e verde quando feito.
 * As ações vêm por callback; o menu (⋯) entra pronto em `menu`.
 */
export default function HabitRowCard({
  habit,
  today,
  todayLog,
  outcome,
  rowRef,
  toggleBusy = false,
  skipBusy = false,
  saving = false,
  onToggle,
  onUndo,
  onQuickIncrement,
  onSkip,
  onNomear,
  onAdjustQuantity,
  menu,
}) {
  const done = outcome === 'done';
  const skipped = outcome === 'skipped';
  const dueToday = isHabitDueOnDate(habit, today);
  const canCheckIn = habit.tracking_mode !== 'since' && habit.status === 'active' && dueToday;
  const quant = isQuantitativeHabit(habit);
  const quick = isQuickIncrementHabit(habit);
  const title = cleanPriorityPrefix(habit.title);
  const timeLabel = formatPreferredTime(habit.preferred_time);
  const showQuickIncrement = canCheckIn && !done && !skipped && quick;
  const showSkip = canCheckIn && outcome !== 'skipped' && !quick;
  const showSkippedActions = canCheckIn && outcome === 'skipped';
  const hasActions = showQuickIncrement || showSkip || showSkippedActions;
  // No celular as ações entram na linha dos chips (sem uma linha só para o botão).
  const actions = (
    <>
      {showQuickIncrement ? (
        <Button
          type="button"
          size="sm"
          className="praxis-touch-target min-h-[44px] min-w-[72px] rounded-full border border-domain-wellness/30 bg-domain-wellness/20 px-4 font-bold text-domain-wellness transition-transform hover:bg-domain-wellness/30 active:scale-[0.96] touch-manipulation motion-reduce:transition-none"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            onQuickIncrement?.(e);
          }}
          aria-label={formatQuickIncrementAriaLabel(habit)}
        >
          {saving ? <span className="animate-pulse">…</span> : formatQuickIncrementButtonLabel(habit)}
        </Button>
      ) : null}
      {showSkip ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 rounded-full border-amber-500/30 bg-amber-500/10 text-xs text-amber-100 hover:bg-amber-500/20"
          disabled={skipBusy}
          onClick={() => onSkip?.()}
        >
          Não rolou
        </Button>
      ) : null}
      {showSkippedActions ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 rounded-full text-xs text-muted-foreground hover:text-foreground"
            disabled={skipBusy}
            onClick={() => onNomear?.()}
          >
            Nomear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-full text-xs"
            disabled={toggleBusy}
            onClick={() => onUndo?.()}
          >
            Desfazer
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <div
      ref={rowRef}
      data-done={done ? 'true' : 'false'}
      data-skipped={skipped ? 'true' : 'false'}
      className="praxis-board-card relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-1 rounded-xl py-1.5 pl-1.5 pr-1.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-x-2"
    >
      <AreaRuler category={habit.category} done={done} />
      <div className="col-start-1 row-start-1 flex">
        {canCheckIn ? (
          <button
            type="button"
            onClick={(evt) => {
              if (skipped) {
                onUndo?.();
                return;
              }
              onToggle?.(evt);
            }}
            disabled={toggleBusy || skipBusy}
            className="praxis-touch-target flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            aria-label={
              skipped
                ? `Desfazer não rolou — ${title}`
                : quick && !done
                  ? formatQuickIncrementAriaLabel(habit)
                  : `${done ? 'Desmarcar' : 'Concluir'} ${title}`
            }
          >
            {done ? (
              <CheckCircle2 className="h-5 w-5 text-domain-wellness" />
            ) : skipped ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400">
                <Minus className="h-3 w-3" />
              </span>
            ) : (
              <Circle className="h-5 w-5" />
            )}
          </button>
        ) : (
          <span className="h-11 w-11 shrink-0" aria-hidden />
        )}
      </div>

      <div className="col-start-2 row-start-1 min-w-0 py-2 pr-1">
        <p
          className={cn(
            'break-words text-[15px] font-medium leading-snug [text-wrap:pretty]',
            done
              ? 'text-muted-foreground line-through decoration-muted-foreground/50'
              : skipped
                ? 'text-muted-foreground'
                : 'text-stone-100',
          )}
        >
          {title}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs leading-none text-muted-foreground">
          <TaskAreaChip category={habit.category} />
          {timeLabel ? (
            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3 opacity-80" aria-hidden />
              <span>
                <span className="sr-only">Horário: </span>
                {timeLabel}
              </span>
            </span>
          ) : null}
          <span className="shrink-0">{formatFrequencyLabel(habit)}</span>
          {habit.current_streak > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.05] px-2 py-[3px] font-mono text-[11px] font-medium tabular-nums text-orange-300 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)]">
              <Flame className="h-3 w-3" aria-hidden />
              <span className="sr-only">Sequência: </span>
              {habit.current_streak}
              <span className="sr-only">{habit.current_streak === 1 ? ' dia' : ' dias'}</span>
            </span>
          ) : null}
          {quick ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdjustQuantity?.();
              }}
              className="inline-flex min-h-6 items-center rounded-full bg-domain-wellness/10 px-2 py-[3px] text-[11px] font-semibold tabular-nums text-domain-wellness shadow-[inset_0_0_0_1px_hsl(var(--domain-wellness)/0.3)] transition-colors hover:bg-domain-wellness/20"
              title="Clique para ajustar quantidade"
              aria-label={`Progresso: ${formatHabitProgress(todayLog?.value, habit.target_value, habit.unit)}. Clique para ajustar.`}
            >
              {formatHabitProgress(todayLog?.value, habit.target_value, habit.unit)}
            </button>
          ) : null}
          {skipped ? (
            <span className="font-medium text-amber-200/90">
              Não rolou
              {todayLog?.skip_reason
                ? ` · ${SKIP_REASON_LABELS[todayLog.skip_reason] || todayLog.skip_reason}`
                : ''}
            </span>
          ) : null}
          {quant && todayLog?.value != null && done ? (
            <span className="tabular-nums">
              Hoje: {todayLog.value}
              {habit.unit ? ` ${habit.unit}` : ''}
            </span>
          ) : null}
          {!dueToday && habit.status === 'active' ? <span>Não previsto para hoje</span> : null}
          {hasActions ? <span className="flex basis-auto items-center gap-1.5 sm:hidden">{actions}</span> : null}
        </div>
        {skipped && todayLog?.note ? (
          <p className="mt-2 text-[11px] leading-snug text-amber-100/75">
            “{todayLog.note}”
          </p>
        ) : null}
      </div>

      {hasActions ? (
        <div className="col-start-3 row-start-1 hidden items-center gap-1.5 sm:flex">{actions}</div>
      ) : null}

      <div className="col-start-3 row-start-1 flex h-11 items-center sm:col-start-4">{menu}</div>
    </div>
  );
}
