import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Clock, Flame, Minus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/layout/PraxisPage';
import QuantLogSheet from '@/components/habits-tasks/QuantLogSheet';
import SkipHabitSheet from '@/components/habits-tasks/SkipHabitSheet';
import SinceHabitCard from '@/components/dashboard/SinceHabitCard';
import { cn } from '@/lib/utils';
import { sparkAt } from '@/lib/celebration';
import { cleanPriorityPrefix } from '@/lib/tasks';
import {
  SKIP_REASON_LABELS,
  formatHabitProgress,
  formatPreferredTime,
  formatQuickIncrementAriaLabel,
  getHabitDayOutcome,
  isQuantitativeHabit,
  isQuickIncrementHabit,
  todayLogForHabit,
} from '@/lib/habits';
import { buildRoutineGlances, routineStartsExpanded, summarizeHabitGroup } from '@/lib/todayGlance';

const MARK_R = 7.5;
const MARK_C = 2 * Math.PI * MARK_R;

function markAriaLabel(step) {
  const title = cleanPriorityPrefix(step.habit.title);
  if (step.outcome === 'skipped') return `Desfazer não rolou: ${title}`;
  if (step.outcome === 'done') return `Desmarcar ${title}`;
  if (isQuickIncrementHabit(step.habit)) return formatQuickIncrementAriaLabel(step.habit);
  return `Concluir ${title}`;
}

/** Marca redonda de um passo: área de toque 44 px, desenho de 18 px. */
function HabitMark({ step, isNext, busy, onPress }) {
  const { outcome, progress } = step;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy}
      aria-label={markAriaLabel(step)}
      aria-pressed={outcome === 'done'}
      title={cleanPriorityPrefix(step.habit.title)}
      className="group flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <span
        className={cn(
          'relative flex h-[18px] w-[18px] items-center justify-center rounded-full transition-[background-color,box-shadow,transform] duration-150 ease-out group-active:scale-[0.96] motion-reduce:transition-none',
          outcome === 'done' && 'bg-domain-wellness text-black',
          outcome === 'skipped' && 'bg-white/[0.04] text-muted-foreground shadow-[inset_0_0_0_1.5px_hsl(0_0%_100%/0.16)]',
          outcome === 'open' && (isNext
            ? 'shadow-[inset_0_0_0_1.5px_hsl(var(--domain-gold)/0.75)]'
            : 'shadow-[inset_0_0_0_1.5px_hsl(0_0%_100%/0.28)] group-hover:shadow-[inset_0_0_0_1.5px_hsl(0_0%_100%/0.45)]'),
        )}
        aria-hidden
      >
        {outcome === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        {outcome === 'skipped' ? <Minus className="h-3 w-3" /> : null}
        {outcome === 'open' && progress > 0 ? (
          <svg className="absolute inset-0 h-[18px] w-[18px] -rotate-90" viewBox="0 0 18 18">
            <circle
              cx="9"
              cy="9"
              r={MARK_R}
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="stroke-domain-wellness"
              strokeDasharray={MARK_C}
              strokeDashoffset={MARK_C * (1 - progress)}
            />
          </svg>
        ) : null}
      </span>
    </button>
  );
}

/** Passo aberto: nome inteiro, horário/quantidade, "Não rolou" e o lápis. */
function StepRow({ step, isNext, busy, onPress, onSkip, onNomear, onAdjust, onEdit }) {
  const { habit, log, outcome } = step;
  const title = cleanPriorityPrefix(habit.title);
  const timeLabel = formatPreferredTime(habit.preferred_time);
  const quant = isQuantitativeHabit(habit);
  const quick = isQuickIncrementHabit(habit);
  return (
    <li className="flex min-h-11 items-center gap-1">
      <HabitMark step={step} isNext={isNext} busy={busy} onPress={onPress} />
      <div className="min-w-0 flex-1 py-1.5">
        <p
          className={cn(
            'break-words text-sm leading-snug [text-wrap:pretty]',
            outcome === 'done' && 'text-muted-foreground line-through decoration-muted-foreground/50',
            outcome === 'skipped' && 'text-muted-foreground',
            outcome === 'open' && 'text-foreground/90',
          )}
        >
          {title}
        </p>
        {timeLabel || quant || outcome === 'skipped' ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-none text-muted-foreground">
            {timeLabel ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="h-3 w-3 opacity-80" aria-hidden />
                <span className="sr-only">Horário: </span>
                {timeLabel}
              </span>
            ) : null}
            {quant ? (
              <button
                type="button"
                onClick={onAdjust}
                className="relative rounded-full font-medium tabular-nums text-domain-wellness underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-3 hover:underline"
                aria-label={`Ajustar quantidade: ${formatHabitProgress(log?.value, habit.target_value, habit.unit)}`}
              >
                {formatHabitProgress(log?.value, habit.target_value, habit.unit)}
              </button>
            ) : null}
            {outcome === 'skipped' ? (
              <span className="text-amber-200/80">
                Não rolou
                {log?.skip_reason ? ` · ${SKIP_REASON_LABELS[log.skip_reason] || log.skip_reason}` : ''}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      {outcome === 'open' && !quick ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 rounded-full border-amber-500/30 bg-amber-500/10 px-3 text-xs text-amber-100 hover:bg-amber-500/20"
          onClick={onSkip}
        >
          Não rolou
        </Button>
      ) : null}
      {outcome === 'skipped' ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={onNomear}
        >
          Nomear
        </Button>
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={`Editar ${title}`}
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

/**
 * Uma linha do painel: nome, feitos/total e o próximo passo; embaixo, uma marca por passo.
 * Aberta, vira a lista curta dos passos.
 */
function GlanceRow({ title, group, defaultOpen = false, extra = null, renderSteps }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const { done, total, complete, closed, next } = group;
  const status = complete
    ? <span className="shrink-0 text-xs font-medium text-domain-wellness/85">completa</span>
    : closed
      ? <span className="shrink-0 text-xs text-muted-foreground">fechada</span>
      : next
        ? <span className="min-w-0 truncate text-xs text-muted-foreground">{cleanPriorityPrefix(next.habit.title)}</span>
        : null;

  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`${open ? 'Recolher' : 'Abrir'} ${title}, ${done} de ${total}`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown
        className={cn(
          'h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none',
          open && 'rotate-180',
        )}
        aria-hidden
      />
    </button>
  );
  // Toque no nome também abre e fecha; o controle acessível é a seta de 44 px.
  const heading = (
    <div
      className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 px-1.5"
      onClick={() => setOpen((v) => !v)}
      aria-hidden
    >
      <span className="shrink-0 text-sm font-medium leading-5 text-foreground">{title}</span>
      <span
        className={cn(
          'shrink-0 text-xs font-medium tabular-nums',
          complete ? 'text-domain-wellness/85' : 'text-muted-foreground',
        )}
      >
        {done}/{total}
      </span>
      {open ? null : <span className="ml-auto flex min-w-0 justify-end">{status}</span>}
    </div>
  );

  return (
    <div className={cn('px-1.5', open ? 'pt-0.5' : 'pt-2')} data-testid="habits-glance-row">
      {open ? (
        <div className="flex min-w-0 items-center">
          {heading}
          {toggle}
        </div>
      ) : (
        <>
          {heading}
          <div className="flex min-w-0 items-center">
            <div className="flex min-w-0 flex-1 flex-wrap">{renderSteps('marks')}</div>
            {toggle}
          </div>
        </>
      )}
      {open ? (
        <div id={panelId} className="pb-2">
          <ul className="space-y-0.5">{renderSteps('rows')}</ul>
          {extra}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hábitos do Hoje em linha: Abertura e Fechamento com uma marca por passo,
 * mais uma linha "Outros hábitos". A lista inteira mora na aba Hábitos.
 */
export default function HabitsGlance({
  today,
  clock,
  compounds = [],
  habits = [],
  sinceHabits = [],
  habitLogs = [],
  onToggleHabit,
  onQuickIncrement,
  onSkipHabit,
  onEditHabit,
}) {
  const [savingHabitId, setSavingHabitId] = useState(null);
  const [skipSheetHabit, setSkipSheetHabit] = useState(null);
  const [quantSheetHabit, setQuantSheetHabit] = useState(null);

  const routines = buildRoutineGlances(compounds, habitLogs, today);
  const others = summarizeHabitGroup(habits, habitLogs, today);
  const done = routines.reduce((acc, r) => acc + r.done, others.done);
  const total = routines.reduce((acc, r) => acc + r.total, others.total);
  const hasOthers = others.total > 0 || sinceHabits.length > 0;

  const spark = (evt) => {
    const rect = evt?.currentTarget?.getBoundingClientRect?.();
    if (rect) sparkAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const increment = async (habit, evt) => {
    if (savingHabitId === habit.id) return;
    setSavingHabitId(habit.id);
    spark(evt);
    try {
      await onQuickIncrement?.(habit, Number(habit.quick_increment) || 0.5);
    } finally {
      setSavingHabitId(null);
    }
  };

  // Mesmo toque da lista: desfaz, soma o incremento, pede a quantidade ou marca.
  const press = (step, evt) => {
    const { habit, outcome } = step;
    if (outcome !== 'open') {
      onToggleHabit?.(habit.id, true);
      return;
    }
    if (isQuickIncrementHabit(habit)) {
      increment(habit, evt);
      return;
    }
    if (isQuantitativeHabit(habit)) {
      setQuantSheetHabit(habit);
      return;
    }
    spark(evt);
    onToggleHabit?.(habit.id, false);
  };

  const renderGroup = (group, editTarget) => (mode) =>
    group.steps.map((step) => {
      const isNext = group.next?.habit.id === step.habit.id;
      const busy = savingHabitId === step.habit.id;
      if (mode === 'marks') {
        return (
          <HabitMark
            key={step.habit.id}
            step={step}
            isNext={isNext}
            busy={busy}
            onPress={(evt) => press(step, evt)}
          />
        );
      }
      return (
        <StepRow
          key={step.habit.id}
          step={step}
          isNext={isNext}
          busy={busy}
          onPress={(evt) => press(step, evt)}
          onSkip={() => onSkipHabit?.(step.habit.id)}
          onNomear={() => setSkipSheetHabit(step.habit)}
          onAdjust={() => setQuantSheetHabit(step.habit)}
          onEdit={() => onEditHabit?.(editTarget || step.habit)}
        />
      );
    });

  const sheetLog = skipSheetHabit ? todayLogForHabit(habitLogs, skipSheetHabit.id, today) : null;
  const quantLog = quantSheetHabit ? todayLogForHabit(habitLogs, quantSheetHabit.id, today) : null;

  return (
    <section className="min-w-0 space-y-3" aria-labelledby="today-habits-title" data-testid="habits-glance">
      <SectionHeader
        title={<span id="today-habits-title">Hábitos</span>}
        icon={Flame}
        iconClassName="text-domain-wellness"
        count={total > 0 ? `${done}/${total}` : undefined}
        action={(
          <Link
            to="/habitos-tarefas?tab=habits"
            className="inline-flex min-h-11 items-center gap-0.5 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver todos os hábitos
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      />

      <div className="praxis-panel rounded-2xl py-0.5">
        {routines.length === 0 && !hasOthers ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum hábito para hoje.</p>
        ) : null}

        {routines.map((routine) => {
          const startsOpen = routineStartsExpanded(routine.compound, clock);
          return (
            <GlanceRow
              // Virou a janela (11h, 20h)? Recomeça no estado da hora; dentro dela, o toque manda.
              key={`${routine.compound.id}:${startsOpen ? 'open' : 'closed'}`}
              title={routine.compound.title}
              group={routine}
              defaultOpen={startsOpen}
              renderSteps={renderGroup(routine, routine.compound)}
            />
          );
        })}

        {hasOthers ? (
          <GlanceRow
            title="Outros hábitos"
            group={others}
            renderSteps={renderGroup(others, null)}
            extra={sinceHabits.length > 0 ? (
              <div className="mt-1.5 space-y-1.5">
                {sinceHabits.map((habit) => (
                  <SinceHabitCard key={habit.id} habit={habit} compact onEdit={onEditHabit} />
                ))}
              </div>
            ) : null}
          />
        ) : null}
      </div>

      <SkipHabitSheet
        open={Boolean(skipSheetHabit)}
        onOpenChange={(open) => { if (!open) setSkipSheetHabit(null); }}
        habitTitle={skipSheetHabit?.title || 'Hábito'}
        outcome={getHabitDayOutcome(sheetLog)}
        initialNote={sheetLog?.note || ''}
        onConfirm={({ skipReason = null, skipNote = null } = {}) => {
          if (!skipSheetHabit) return;
          onSkipHabit?.(skipSheetHabit.id, skipReason, skipNote);
          setSkipSheetHabit(null);
        }}
        onUndo={() => {
          if (!skipSheetHabit) return;
          onToggleHabit?.(skipSheetHabit.id, true);
          setSkipSheetHabit(null);
        }}
        onMarkDone={() => {
          if (!skipSheetHabit) return;
          const habit = skipSheetHabit;
          setSkipSheetHabit(null);
          if (isQuantitativeHabit(habit)) {
            setQuantSheetHabit(habit);
            return;
          }
          onToggleHabit?.(habit.id, false);
        }}
      />

      <QuantLogSheet
        open={Boolean(quantSheetHabit)}
        onOpenChange={(open) => { if (!open) setQuantSheetHabit(null); }}
        habit={quantSheetHabit}
        currentValue={quantLog?.value}
        onConfirm={(value) => {
          if (!quantSheetHabit) return;
          const habitId = quantSheetHabit.id;
          setQuantSheetHabit(null);
          onToggleHabit?.(habitId, false, value);
        }}
      />
    </section>
  );
}
