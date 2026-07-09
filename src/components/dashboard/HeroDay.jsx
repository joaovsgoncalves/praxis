import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { Flame, Target, Timer, Mic, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fortalezaDateKey, fortalezaDisplayDate } from '@/lib/dates';

const DEFAULT_FOCUS_GOAL_SEC = 25 * 60 * 4;

export default function HeroDay({
  habitsDone = 0,
  habitsTotal = 0,
  tasksDone = 0,
  tasksTotal = 0,
  userName,
}) {
  const { greeting, emoji, tagline } = useTimeOfDay();
  const today = fortalezaDateKey();

  const { data: focusToday = [] } = useQuery({
    queryKey: ['focusToday', today],
    queryFn: () => forjaApi.focus.list({ date: today }),
    staleTime: 30_000,
  });
  const { data: settings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => forjaApi.user.getSettings(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: habits = [] } = useQuery({
    queryKey: ['habits'],
    queryFn: () => forjaApi.habits.list({ status: 'active' }),
    staleTime: 60_000,
  });

  const focusGoalSec = settings?.pomodoro_focus
    ? settings.pomodoro_focus * 60 * 4
    : DEFAULT_FOCUS_GOAL_SEC;
  const focusSec = focusToday.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

  const trackableItemsTotal = habitsTotal + tasksTotal;
  const dayPct = trackableItemsTotal > 0
    ? ((habitsDone + tasksDone) / trackableItemsTotal) * 100
    : (focusGoalSec > 0 ? Math.min(100, (focusSec / focusGoalSec) * 100) : 0);

  const bestStreak = useMemo(
    () => habits.reduce((m, h) => Math.max(m, h.current_streak || 0), 0),
    [habits],
  );

  const dateStr = format(fortalezaDisplayDate(), "EEEE, d 'de' MMMM", { locale: ptBR });
  const focusMin = Math.round(focusSec / 60);
  const focusGoalMin = Math.round(focusGoalSec / 60);

  const missionStats = [
    { label: 'Tarefas', value: `${tasksDone}/${tasksTotal}`, icon: Target, tone: 'text-domain-ember' },
    { label: 'Hábitos', value: `${habitsDone}/${habitsTotal}`, icon: Flame, tone: 'text-domain-wellness' },
    { label: 'Foco', value: `${focusMin}/${focusGoalMin}m`, icon: Timer, tone: 'text-domain-focus' },
  ];

  return (
    <div className="rounded-2xl border border-border/80 bg-card/40 p-3 sm:p-3.5">
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
          <div className="min-w-0">
            <p className="forja-kicker mb-0.5 text-[11px] sm:text-xs">
              {emoji} Praxis · {dateStr}
            </p>
            <h1 className="forja-title text-lg sm:text-xl md:text-2xl font-bold leading-tight">
              {greeting}{userName ? `, ${userName.split(' ')[0]}` : ''}
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground line-clamp-1">{tagline}</p>
          </div>
          <div className="shrink-0 rounded-full border border-domain-gold/30 bg-domain-gold/10 px-2.5 py-0.5 text-xs font-semibold text-domain-gold tabular-nums">
            Dia · {Math.round(dayPct)}%
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {missionStats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border border-border/60 bg-card/30 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs text-muted-foreground/80">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />
              </div>
              <div className="mt-0.5 text-base sm:text-lg font-semibold tabular-nums leading-none">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {bestStreak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-domain-ember/25 bg-domain-ember/10 px-2 py-0.5 text-[11px] font-medium text-domain-ember">
              <Flame className="h-3 w-3" aria-hidden />
              {bestStreak}d sequência
            </span>
          )}
          <Button asChild size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-[11px] gap-1">
            <Link to="/foco"><Timer className="h-3 w-3" /> Foco</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-[11px] gap-1">
            <Link to="/ideias?new=1"><Lightbulb className="h-3 w-3" /> Ideia</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-[11px] gap-1">
            <Link to="/captura"><Mic className="h-3 w-3" /> Voz</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}