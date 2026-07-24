import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronDown, Clock, Flame, Minus, Pencil, Sparkles } from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fortalezaDateKey } from '@/lib/dates';
import { formatPreferredTime } from '@/lib/habits';
import { toast } from 'sonner';
import SkipHabitSheet from '@/components/habits-tasks/SkipHabitSheet';
import HabitForm from '@/components/habits-tasks/HabitForm';

function habitDayState(habit) {
  if (habit?.day_outcome === 'skipped' || habit?.skipped_today) return 'skipped';
  if (habit?.day_outcome === 'done' || habit?.completed_today) return 'done';
  return 'open';
}

function ConfettiOverlay() {
  return (
    <div
      className="praxis-completion-glow pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-xl"
      aria-hidden
    />
  );
}

function CompoundHabitItem({
  compound,
  onToggleHabit,
  onOpenSkip,
  onCompleteMinimum,
  onEditCompound,
  collapsible = true,
  listItem = false,
}) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const prevAllDoneRef = useRef(null);
  const steps = compound.children || [];
  const completedCount = steps.filter((step) => habitDayState(step) === 'done').length;
  const skippedCount = steps.filter((step) => habitDayState(step) === 'skipped').length;
  const addressedCount = completedCount + skippedCount;
  const totalCount = steps.length;
  const isClosed = totalCount > 0 && addressedCount === totalCount;
  const allDone = totalCount > 0 && completedCount === totalCount;
  const isPartial = addressedCount > 0 && !isClosed;
  const progressPercent = totalCount > 0 ? Math.round((addressedCount / totalCount) * 100) : 0;
  const nextStep = steps.find((step) => habitDayState(step) === 'open');
  const statusCopy = isClosed
    ? skippedCount > 0
      ? `Dia registrado · ${completedCount} ${completedCount === 1 ? 'feito' : 'feitos'} · ${skippedCount} não rolou`
      : 'Rotina concluída. Dia registrado.'
    : isPartial
      ? 'Você já começou. Siga pelo próximo passo.'
      : 'Comece pelo mínimo: só o primeiro passo.';

  useEffect(() => {
    if (prevAllDoneRef.current === false && allDone) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 1200);
      return () => clearTimeout(timer);
    }
    prevAllDoneRef.current = allDone;
  }, [allDone]);

  return (
    <div
      className={cn(
        'relative rounded-xl border p-3.5 transition-[background-color,border-color,box-shadow]',
        listItem && 'card-domain domain-wellness bg-card/75',
        isClosed
          ? 'border-domain-wellness/25 bg-domain-wellness/[0.07]'
          : isPartial
            ? 'border-domain-gold/18 bg-domain-gold/[0.055]'
            : 'border-white/[0.07] bg-white/[0.022] hover:border-white/[0.11] hover:bg-white/[0.035]',
      )}
    >
      {showConfetti && <ConfettiOverlay />}

      <div className="flex items-center gap-1">
        {collapsible ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
          >
            <span className="text-lg">{compound.emoji || '⚡'}</span>
            <span className="flex-1 truncate text-sm font-medium">{compound.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {completedCount}/{totalCount}
              {skippedCount > 0 ? ` · ${skippedCount} não rolou` : ''}
            </span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-lg">{compound.emoji || '⚡'}</span>
            <span className="flex-1 truncate text-sm font-medium">{compound.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {completedCount}/{totalCount}
              {skippedCount > 0 ? ` · ${skippedCount} não rolou` : ''}
            </span>
          </div>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Editar rotina ${compound.title}`}
          onClick={() => onEditCompound(compound)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      {(!collapsible || isOpen) && (
        <div className="mt-3">
          <Progress
            value={progressPercent}
            className={cn('mb-2 h-1.5', isClosed ? '[&>div]:bg-green-500' : '[&>div]:bg-gold')}
          />
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">{statusCopy}</p>
            {!isClosed && nextStep && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-gold hover:text-gold"
                onClick={() => onCompleteMinimum(nextStep.id)}
              >
                <Flame className="h-3 w-3" />
                Mínimo
              </Button>
            )}
          </div>

          <ul className="space-y-1.5">
            {steps.map((step) => {
              const state = habitDayState(step);
              const done = state === 'done';
              const skipped = state === 'skipped';
              const timeLabel = formatPreferredTime(step.preferred_time);
              const checkboxId = `compound-habit-${compound.id}-${step.id}`;
              return (
                <li
                  key={step.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg px-1 py-1.5',
                    skipped && 'bg-amber-500/[0.06]',
                    timeLabel && !done && !skipped && 'bg-domain-gold/[0.04]',
                  )}
                >
                  {skipped ? (
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400"
                      aria-hidden
                    >
                      <Minus className="h-2.5 w-2.5" />
                    </span>
                  ) : (
                    <Checkbox
                      id={checkboxId}
                      checked={done}
                      onCheckedChange={() => onToggleHabit(step.id, done)}
                      className={cn(
                        'h-4 w-4 shrink-0',
                        done
                          ? 'data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500'
                          : 'border-muted-foreground/40',
                      )}
                    />
                  )}
                  <label
                    htmlFor={skipped ? undefined : checkboxId}
                    className={cn(
                      'min-w-0 flex-1 select-none text-xs',
                      skipped ? 'text-muted-foreground opacity-80' : 'cursor-pointer',
                      done
                        ? 'text-muted-foreground line-through'
                        : !skipped && 'text-foreground/80 group-hover:text-foreground',
                    )}
                  >
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span>{step.title}</span>
                      {timeLabel && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-domain-gold/25 bg-domain-gold/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-domain-gold">
                          <Clock className="h-2.5 w-2.5" aria-hidden />
                          {timeLabel}
                        </span>
                      )}
                      {skipped && (
                        <span className="text-[10px] font-medium text-amber-200/80">Não rolou</span>
                      )}
                    </span>
                    {skipped && step.skip_note && (
                      <span className="mt-0.5 block text-[10px] leading-snug text-amber-100/70">
                        “{step.skip_note}”
                      </span>
                    )}
                  </label>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Editar rotina e passo ${step.title}`}
                    onClick={() => onEditCompound(compound)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {skipped ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground"
                      onClick={() => onOpenSkip(step)}
                    >
                      Nomear
                    </Button>
                  ) : !done ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 rounded-full border-amber-500/30 bg-amber-500/10 px-2 text-[11px] text-amber-100 hover:bg-amber-500/20"
                      onClick={() => onOpenSkip(step)}
                    >
                      Não rolou
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function CompoundHabitsWidget({
  collapsible = true,
  compounds: compoundsProp,
  today: todayProp,
  status = 'active',
  variant = 'card',
  onEditCompound: onEditCompoundProp,
}) {
  const queryClient = useQueryClient();
  const today = todayProp || fortalezaDateKey();
  const habitParams = { date: today, status };
  const compoundQueryKey = ['habits', 'compounds', habitParams];
  const [skipHabitTarget, setSkipHabitTarget] = useState(null);
  const [editingCompound, setEditingCompound] = useState(null);

  const { data: queriedHabits = [], isLoading, isError } = useQuery({
    queryKey: compoundQueryKey,
    queryFn: () => praxisApi.habits.list(habitParams),
    enabled: compoundsProp === undefined,
    refetchInterval: 30000,
  });
  const compounds = compoundsProp
    ?? queriedHabits.filter((habit) => habit.kind === 'compound');

  const toggleHabitMutation = useMutation({
    mutationFn: async ({ habitId, isDone }) => {
      if (isDone) {
        const logs = await praxisApi.habitLogs.list({ habit_id: habitId, date: today });
        if (logs.length > 0) await praxisApi.habitLogs.delete(logs[0].id);
      } else {
        await praxisApi.habitLogs.create({
          habit_id: habitId,
          date: today,
          outcome: 'done',
          completed: true,
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['habitLogs'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
    },
  });

  const skipHabitMutation = useMutation({
    mutationFn: ({ habitId, skipReason, skipNote }) => praxisApi.habitLogs.create({
      habit_id: habitId,
      date: today,
      outcome: 'skipped',
      ...(skipReason ? { skip_reason: skipReason } : {}),
      ...(skipNote ? { note: skipNote } : {}),
    }),
    onSuccess: () => {
      toast('Não rolou — registrado.');
      setSkipHabitTarget(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['habitLogs'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
    },
  });

  const updateCompoundMutation = useMutation({
    mutationFn: ({ id, data }) => praxisApi.habits.update(id, data),
    onSuccess: () => {
      toast('Rotina atualizada.');
      setEditingCompound(null);
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
    },
    onError: () => toast.error('Não deu pra salvar a rotina.'),
  });

  const openCompoundEditor = (compound) => {
    if (onEditCompoundProp) onEditCompoundProp(compound);
    else setEditingCompound(compound);
  };

  const content = (
    <>
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}
      {isError && <p className="py-4 text-center text-sm text-destructive">Erro ao carregar as rotinas</p>}
      {!isLoading && !isError && compounds.length === 0 && variant === 'card' && (
        <div className="flex flex-col items-center gap-2 py-6">
          <Sparkles className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhuma rotina ainda</p>
          <p className="max-w-xs text-center text-xs text-muted-foreground/60">
            Agrupe passos que fazem sentido juntos no seu dia.
          </p>
        </div>
      )}
      {!isLoading && !isError && compounds.length > 0 && (
        <div className="space-y-3">
          {compounds.map((compound) => (
            <CompoundHabitItem
              key={compound.id}
              compound={compound}
              collapsible={collapsible}
              listItem={variant === 'list'}
              onToggleHabit={(habitId, isDone) =>
                toggleHabitMutation.mutate({ habitId, isDone })
              }
              onOpenSkip={setSkipHabitTarget}
              onEditCompound={openCompoundEditor}
              onCompleteMinimum={(habitId) =>
                toggleHabitMutation.mutate({ habitId, isDone: false })
              }
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      {variant === 'list' ? content : (
        <Card className="praxis-dashboard-card">
          <CardHeader className="p-5 pb-3 sm:p-5 sm:pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-domain-gold/15 bg-domain-gold/[0.07]">
                <Sparkles className="h-4 w-4 text-domain-gold" aria-hidden />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Hábitos compostos</p>
                <CardTitle className="mt-0.5 text-base tracking-[-0.025em]">Rotinas</CardTitle>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Faça, nomeie o que não rolou e siga pelo próximo passo.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 sm:px-5 sm:pb-5">{content}</CardContent>
        </Card>
      )}

      <SkipHabitSheet
        open={Boolean(skipHabitTarget)}
        onOpenChange={(open) => { if (!open) setSkipHabitTarget(null); }}
        habitTitle={skipHabitTarget?.title || 'Hábito'}
        outcome={skipHabitTarget ? habitDayState(skipHabitTarget) : 'open'}
        initialNote={skipHabitTarget?.skip_note || ''}
        busy={skipHabitMutation.isPending}
        onConfirm={({ skipReason, skipNote }) =>
          skipHabitMutation.mutate({
            habitId: skipHabitTarget.id,
            skipReason,
            skipNote,
          })
        }
        onUndo={() => {
          if (!skipHabitTarget) return;
          toggleHabitMutation.mutate({ habitId: skipHabitTarget.id, isDone: true });
          setSkipHabitTarget(null);
        }}
        onMarkDone={() => {
          if (!skipHabitTarget) return;
          toggleHabitMutation.mutate({ habitId: skipHabitTarget.id, isDone: false });
          setSkipHabitTarget(null);
        }}
      />

      {!onEditCompoundProp && (
        <Dialog
          open={Boolean(editingCompound)}
          onOpenChange={(open) => { if (!open) setEditingCompound(null); }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar rotina</DialogTitle>
            </DialogHeader>
            {editingCompound && (
              <HabitForm
                key={editingCompound.id}
                initial={editingCompound}
                onSubmit={(data) => updateCompoundMutation.mutate({ id: editingCompound.id, data })}
                onCancel={() => setEditingCompound(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
