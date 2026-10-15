import React, { useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { SectionHeader } from '@/components/layout/PraxisPage';
import { sparkAt } from '@/lib/celebration';
import { cleanPriorityPrefix } from '@/lib/tasks';
import {
  countHabitDayOutcomes,
  getHabitDayOutcome,
  isQuantitativeHabit,
  isQuickIncrementHabit,
  todayLogForHabit,
} from '@/lib/habits';
import { isRitualOpenByDefault, partitionCompoundHabitsForDay } from '@/lib/compoundHabitOrder';
import QuantLogSheet from '@/components/habits-tasks/QuantLogSheet';
import SkipHabitSheet from '@/components/habits-tasks/SkipHabitSheet';
import HabitRowCard from '@/components/habits-tasks/HabitRowCard';
import { HabitRowMenu } from '@/components/habits-tasks/ListRowMenus';
import CompoundHabitsWidget from '@/components/dashboard/CompoundHabitsWidget';
import SinceHabitCard from '@/components/dashboard/SinceHabitCard';

/**
 * Hábitos do Hoje — o mesmo cartão e o mesmo ritual da aba Hábitos.
 * Abertura começa aberta antes das 11h, Fechamento a partir das 20h.
 */
export default function TodayHabits({
  habits,
  compounds = [],
  sinceHabits = [],
  summaryHabits,
  habitLogs,
  onToggleHabit,
  onQuickIncrement,
  onSkipHabit,
  onEditHabit,
  onDeleteHabit,
  title = 'Hábitos',
  today,
  clock,
}) {
  const [savingHabitId, setSavingHabitId] = useState(null);
  const rowRefs = useRef(new Map());
  const [skipSheetHabit, setSkipSheetHabit] = useState(null);
  const [quantSheetHabit, setQuantSheetHabit] = useState(null);

  const { beforeChecks, afterChecks } = partitionCompoundHabitsForDay(compounds);
  const hasRows = habits.length > 0 || compounds.length > 0 || sinceHabits.length > 0;
  const { done: doneCount, total } = countHabitDayOutcomes(summaryHabits || habits, habitLogs, today);
  const ritualStartsOpen = (compound) => isRitualOpenByDefault(compound, clock);

  const spark = (habit, evt) => {
    const target = rowRefs.current.get(habit.id);
    const rect = (evt?.currentTarget || target)?.getBoundingClientRect?.();
    if (rect) sparkAt(rect.left + 28, rect.top + rect.height / 2);
  };

  const handleIncrement = async (habit, evt) => {
    if (savingHabitId === habit.id) return;
    setSavingHabitId(habit.id);
    spark(habit, evt);
    try {
      await onQuickIncrement?.(habit, Number(habit.quick_increment) || 0.5);
    } finally {
      setSavingHabitId(null);
    }
  };

  const handleToggle = (habit, isDone, evt) => {
    if (isDone) {
      onToggleHabit?.(habit.id, true);
      return;
    }
    if (isQuickIncrementHabit(habit)) {
      handleIncrement(habit, evt);
      return;
    }
    if (isQuantitativeHabit(habit)) {
      setQuantSheetHabit(habit);
      return;
    }
    spark(habit, evt);
    onToggleHabit?.(habit.id, false);
  };

  const sheetLog = skipSheetHabit ? todayLogForHabit(habitLogs, skipSheetHabit.id, today) : null;

  const ritual = (list) =>
    list.length > 0 ? (
      <CompoundHabitsWidget
        collapsible
        compounds={list}
        today={today}
        variant="list"
        defaultOpenFor={ritualStartsOpen}
      />
    ) : null;

  return (
    <section className="min-w-0 space-y-3" aria-labelledby="today-habits-title">
      <SectionHeader
        title={<span id="today-habits-title">{title}</span>}
        icon={Flame}
        iconClassName="text-domain-wellness"
        count={total > 0 ? `${doneCount}/${total}` : undefined}
      />

      {!hasRows ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Nenhum hábito para hoje.</p>
      ) : null}

      <div className="space-y-3">
        {ritual(beforeChecks)}

        {habits.map((habit) => {
          const log = todayLogForHabit(habitLogs, habit.id, today);
          const outcome = getHabitDayOutcome(log);
          const label = cleanPriorityPrefix(habit.title);
          return (
            <HabitRowCard
              key={habit.id}
              habit={habit}
              today={today}
              todayLog={log}
              outcome={outcome}
              rowRef={(el) => {
                if (el) rowRefs.current.set(habit.id, el);
                else rowRefs.current.delete(habit.id);
              }}
              saving={savingHabitId === habit.id}
              onToggle={(evt) => handleToggle(habit, outcome === 'done', evt)}
              onUndo={() => onToggleHabit?.(habit.id, true)}
              onQuickIncrement={(evt) => handleIncrement(habit, evt)}
              onSkip={() => onSkipHabit?.(habit.id)}
              onNomear={() => setSkipSheetHabit(habit)}
              onAdjustQuantity={() => setQuantSheetHabit(habit)}
              menu={(
                <HabitRowMenu
                  label={label}
                  busy={savingHabitId === habit.id}
                  canCheckIn
                  dayOutcome={outcome}
                  onEdit={() => onEditHabit?.(habit)}
                  onDelete={() => onDeleteHabit?.(habit)}
                  onNaoRolou={() => onSkipHabit?.(habit.id)}
                  onNomear={() => setSkipSheetHabit(habit)}
                  onUndoDayOutcome={() => onToggleHabit?.(habit.id, true)}
                  onAdjustQuantity={isQuantitativeHabit(habit) ? () => setQuantSheetHabit(habit) : undefined}
                  hasValue={log?.value != null && Number(log.value) > 0}
                />
              )}
            />
          );
        })}

        {sinceHabits.map((habit) => (
          <SinceHabitCard
            key={habit.id}
            habit={habit}
            trailing={(
              <HabitRowMenu
                label={cleanPriorityPrefix(habit.title)}
                onEdit={() => onEditHabit?.(habit)}
                onDelete={() => onDeleteHabit?.(habit)}
              />
            )}
          />
        ))}

        {ritual(afterChecks)}
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
          spark(habit);
          onToggleHabit?.(habit.id, false);
        }}
      />

      <QuantLogSheet
        open={Boolean(quantSheetHabit)}
        onOpenChange={(open) => {
          if (!open) setQuantSheetHabit(null);
        }}
        habit={quantSheetHabit}
        currentValue={
          quantSheetHabit ? todayLogForHabit(habitLogs, quantSheetHabit.id, today)?.value : undefined
        }
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
