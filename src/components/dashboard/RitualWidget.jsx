import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronDown, Flame, Sparkles } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const timeOfDayConfig = {
  morning: { emoji: '🌅', label: 'Manhã', order: 0 },
  afternoon: { emoji: '☀️', label: 'Tarde', order: 1 },
  evening: { emoji: '🌙', label: 'Noite', order: 2 },
};

function ConfettiOverlay() {
  return (
    <div
      className="praxis-completion-glow pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-xl"
      aria-hidden
    />
  );
}

function RitualItem({ ritual, onToggleHabit, onCompleteMinimum, today, collapsible = false }) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [isOpen, setIsOpen] = useState(!collapsible);
  const prevDoneRef = useRef(null);

  const habits = ritual.habits || [];
  const completedCount = habits.filter((h) => h.completed_today).length;
  const totalCount = habits.length;
  const isComplete = totalCount > 0 && completedCount === totalCount;
  const isMinimum = completedCount > 0 && !isComplete;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextHabit = habits.find((h) => !h.completed_today);
  const statusCopy = isComplete
    ? 'Ritual completo. Dia registrado.'
    : isMinimum
      ? 'Ritual parcial também conta. Sem culpa.'
      : 'Comece pelo mínimo: só o primeiro passo.';

  useEffect(() => {
    if (prevDoneRef.current === false && isComplete) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 1200);
      return () => clearTimeout(timer);
    }
    prevDoneRef.current = isComplete;
  }, [isComplete]);

  return (
    <div className={cn(
      'relative rounded-xl border p-3.5 transition-[background-color,border-color,box-shadow]',
      isComplete
        ? 'border-domain-wellness/18 bg-domain-wellness/[0.065]'
        : isMinimum
          ? 'border-domain-gold/18 bg-domain-gold/[0.055]'
          : 'border-white/[0.05] bg-white/[0.022] hover:border-white/[0.09] hover:bg-white/[0.035]'
    )}>
      {showConfetti && <ConfettiOverlay />}

      {/* Ritual header */}
      {collapsible ? (
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
        >
          <span className="text-lg">{ritual.emoji || '⚡'}</span>
          <span className="text-sm font-medium flex-1 truncate">{ritual.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">{completedCount}/{totalCount}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
        </button>
      ) : (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{ritual.emoji || '⚡'}</span>
          <span className="text-sm font-medium flex-1 truncate">{ritual.name}</span>
          {isComplete ? (
            <Badge variant="outline" className="shrink-0 border-domain-wellness/20 bg-domain-wellness/[0.08] text-xs text-domain-wellness">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Completo
            </Badge>
          ) : isMinimum ? (
            <Badge variant="outline" className="shrink-0 border-domain-gold/20 bg-domain-gold/[0.07] text-xs text-domain-gold">
              Parcial
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground shrink-0">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
      )}

      {(!collapsible || isOpen) && (
        <div className={collapsible ? 'mt-3' : ''}>
          {/* Progress bar */}
          <Progress
            value={progressPercent}
            className={cn('h-1.5 mb-2', isComplete ? '[&>div]:bg-green-500' : '[&>div]:bg-gold')}
          />

          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[11px] text-muted-foreground">{statusCopy}</p>
            {!isComplete && nextHabit && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-gold hover:text-gold"
                onClick={() => onCompleteMinimum(nextHabit.id)}
              >
                <Flame className="w-3 h-3" />
                Mínimo
              </Button>
            )}
          </div>

          {/* Habit checklist */}
          <ul className="space-y-1.5">
            {habits.map((habit) => (
              <li key={habit.id} className="flex items-center gap-2 group">
                <Checkbox
                  id={`ritual-habit-${ritual.id}-${habit.id}`}
                  checked={habit.completed_today}
                  onCheckedChange={() => onToggleHabit(habit.id, habit.completed_today)}
                  className={cn(
                    'h-4 w-4 shrink-0',
                    habit.completed_today
                      ? 'data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500'
                      : 'border-muted-foreground/40'
                  )}
                />
                <label
                  htmlFor={`ritual-habit-${ritual.id}-${habit.id}`}
                  className={cn(
                    'text-xs cursor-pointer transition-colors select-none',
                    habit.completed_today
                      ? 'line-through text-muted-foreground'
                      : 'text-foreground/80 group-hover:text-foreground'
                  )}
                >
                  {habit.emoji && <span className="mr-1">{habit.emoji}</span>}
                  {habit.title || habit.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function RitualWidget({ collapsible = false }) {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: rituals = [], isLoading, isError } = useQuery({
    queryKey: ['rituals', today],
    queryFn: () => forjaApi.rituals.list({ date: today }),
    refetchInterval: 30000,
  });

  const toggleHabitMutation = useMutation({
    mutationFn: async ({ habitId, isDone }) => {
      if (isDone) {
        // Find and delete the log
        const logs = await forjaApi.habitLogs.list({ habit_id: habitId, date: today });
        if (logs.length > 0) {
          await forjaApi.habitLogs.delete(logs[0].id);
        }
      } else {
        await forjaApi.habitLogs.create({ habit_id: habitId, date: today, completed: true });
      }
    },
    onMutate: async ({ habitId, isDone }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['rituals'] });
      const previous = queryClient.getQueryData(['rituals', today]);
      queryClient.setQueryData(['rituals', today], (old) => {
        if (!old) return old;
        return old.map((ritual) => ({
          ...ritual,
          habits: ritual.habits.map((h) =>
            h.id === habitId ? { ...h, completed_today: !isDone } : h
          ),
        }));
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['rituals', today], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['rituals'] });
      queryClient.invalidateQueries({ queryKey: ['habitLogs'] });
    },
  });

  // Group rituals by time_of_day
  const grouped = rituals.reduce((acc, ritual) => {
    const tod = ritual.time_of_day || 'morning';
    if (!acc[tod]) acc[tod] = [];
    acc[tod].push(ritual);
    return acc;
  }, {});

  const orderedKeys = Object.keys(timeOfDayConfig)
    .filter((k) => grouped[k]?.length > 0);

  return (
    <Card className="praxis-dashboard-card praxis-context-card">
      <CardHeader className="p-5 pb-3 sm:p-5 sm:pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-domain-gold/15 bg-domain-gold/[0.07]">
            <Sparkles className="h-4 w-4 text-domain-gold" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Ritmos do dia</p>
            <CardTitle className="mt-0.5 text-base tracking-[-0.025em]">Rituais</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-5 sm:pb-5">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive py-4 text-center">
            Erro ao carregar rituais
          </p>
        )}

        {!isLoading && !isError && rituals.length === 0 && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Sparkles className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nenhum ritual ainda</p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
              Monte uma sequência em Rituais — manhã, tarde ou noite.
            </p>
          </div>
        )}

        {!isLoading && !isError && rituals.length > 0 && (
          <div className="space-y-4">
            {orderedKeys.map((tod) => {
              const config = timeOfDayConfig[tod];
              const groupRituals = grouped[tod];
              return (
                <div key={tod}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{config.emoji}</span>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {config.label}
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {groupRituals.map((ritual) => (
                      <RitualItem
                        key={ritual.id}
                        ritual={ritual}
                        today={today}
                        collapsible={collapsible}
                        onToggleHabit={(habitId, isDone) =>
                          toggleHabitMutation.mutate({ habitId, isDone })
                        }
                        onCompleteMinimum={(habitId) =>
                          toggleHabitMutation.mutate({ habitId, isDone: false })
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

    </Card>
  );
}
