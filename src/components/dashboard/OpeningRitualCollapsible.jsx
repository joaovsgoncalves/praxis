import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { praxisApi } from '@/api/praxisClient';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, Flame, Sparkles, Sunrise } from 'lucide-react';
import { PraxisListSkeleton } from '@/components/layout/PraxisPage';
import { cn } from '@/lib/utils';
import { fortalezaDateKey } from '@/lib/dates';

const OPEN_KEY = 'praxis:opening-ritual-open';
const RITUAL_NAME = 'Abertura do dia';

function readDefaultOpen() {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    if (v === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export default function OpeningRitualCollapsible() {
  const queryClient = useQueryClient();
  const today = fortalezaDateKey();
  const [open, setOpen] = useState(readDefaultOpen);

  const { data: rituals = [], isLoading } = useQuery({
    queryKey: ['rituals', today],
    queryFn: () => praxisApi.rituals.list({ date: today }),
    staleTime: 30_000,
  });

  const opening = useMemo(
    () => rituals.find((r) => r.name === RITUAL_NAME || r.time_of_day === 'morning'),
    [rituals],
  );

  const createFromTemplate = useMutation({
    mutationFn: () => praxisApi.rituals.fromTemplate('day_open'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rituals'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
  });

  const toggleHabit = useMutation({
    mutationFn: async ({ habitId, isDone }) => {
      if (isDone) {
        const logs = await praxisApi.habitLogs.list({ habit_id: habitId, date: today });
        if (logs.length > 0) await praxisApi.habitLogs.delete(logs[0].id);
      } else {
        await praxisApi.habitLogs.create({ habit_id: habitId, date: today, completed: true });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['rituals'] });
      queryClient.invalidateQueries({ queryKey: ['habitLogs'] });
    },
  });

  const onOpenChange = (next) => {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {}
  };

  const habits = opening?.habits || [];
  const done = habits.filter((h) => h.completed_today).length;
  const allDone = habits.length > 0 && done === habits.length;

  const subtitle = opening
    ? allDone
      ? 'Ritual de hoje completo'
      : `${done}/${habits.length} passos`
    : 'Água, movimento e prioridade';

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="rounded-2xl border border-border/80 bg-card/40"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Sunrise className="h-5 w-5 shrink-0 text-gold/80" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug">Abertura do dia · ~3 min</p>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-3">
        {isLoading && <PraxisListSkeleton rows={2} className="border-0 bg-transparent shadow-none" />}
        {!isLoading && !opening && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Três passos leves para começar o dia. Você configura uma vez.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full gap-1.5"
              disabled={createFromTemplate.isPending}
              onClick={() => createFromTemplate.mutate()}
            >
              <Sparkles className="h-4 w-4" />
              {createFromTemplate.isPending ? 'Criando…' : 'Começar abertura'}
            </Button>
          </div>
        )}
        {opening && (
          <ul className="space-y-2">
            {habits.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <Checkbox
                  checked={h.completed_today}
                  onCheckedChange={() =>
                    toggleHabit.mutate({ habitId: h.id, isDone: h.completed_today })
                  }
                  className="h-4 w-4"
                />
                <span
                  className={cn(
                    'text-sm',
                    h.completed_today && 'line-through text-muted-foreground',
                  )}
                >
                  {h.title || h.name}
                </span>
              </li>
            ))}
            {!allDone && habits[0] && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const next = habits.find((x) => !x.completed_today);
                  if (next) toggleHabit.mutate({ habitId: next.id, isDone: false });
                }}
              >
                <Flame className="h-3 w-3 mr-1" />
                Só o próximo passo
              </Button>
            )}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}