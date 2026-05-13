import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Flame, Sparkles } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const timeOfDayConfig = {
  morning: { emoji: '🌅', label: 'Manhã', order: 0 },
  afternoon: { emoji: '☀️', label: 'Tarde', order: 1 },
  evening: { emoji: '🌙', label: 'Noite', order: 2 },
};

function ConfettiOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-lg">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute animate-confetti"
          style={{
            left: `${Math.random() * 100}%`,
            top: '-10px',
            animationDelay: `${Math.random() * 1.5}s`,
            animationDuration: `${1.5 + Math.random() * 1.5}s`,
          }}
        >
          {['🎉', '✨', '⭐', '🎊', '💪'][Math.floor(Math.random() * 5)]}
        </div>
      ))}
    </div>
  );
}

function RitualItem({ ritual, onToggleHabit, onCompleteMinimum, today }) {
  const [showConfetti, setShowConfetti] = useState(false);
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
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
    prevDoneRef.current = isComplete;
  }, [isComplete]);

  return (
    <div className={cn(
      'relative p-3 rounded-lg border transition-all',
      isComplete
        ? 'bg-green-500/10 border-green-500/30'
        : isMinimum
          ? 'bg-gold/10 border-gold/30'
          : 'bg-secondary/40 border-border hover:border-border/80'
    )}>
      {showConfetti && <ConfettiOverlay />}

      {/* Ritual header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{ritual.emoji || '⚡'}</span>
        <span className="text-sm font-medium flex-1 truncate">{ritual.name}</span>
        {isComplete ? (
          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs shrink-0">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Completo
          </Badge>
        ) : isMinimum ? (
          <Badge variant="outline" className="bg-gold/15 text-gold border-gold/30 text-xs shrink-0">
            Parcial
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground shrink-0">
            {completedCount}/{totalCount}
          </span>
        )}
      </div>

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
                'text-xs cursor-pointer transition-all select-none',
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
  );
}

export default function RitualWidget() {
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
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-gold" />
          Rituais do Dia
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-secondary/40 animate-pulse" />
            ))}
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
            <p className="text-sm text-muted-foreground">Nenhum ritual configurado</p>
            <p className="text-xs text-muted-foreground/60">Crie rituais para organizar seus hábitos por período</p>
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

      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-fall 2s ease-out forwards;
        }
      `}</style>
    </Card>
  );
}
