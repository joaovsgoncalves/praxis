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
    <div className="relative overflow-hidden rounded-2xl glass-surface border border-white/5 p-3 sm:p-4 md:p-5">
      <div className="relative z-10 space-y-3 md:space-y-3.5">
        <div className="flex flex-wrap items-end justify-between gap-2 gap-y-1">
          <div className="min-w-0">
            <p className="forja-kicker mb-1 text-[11px] sm:text-xs">
              {emoji} Praxis · {dateStr}
            </p>
            <h1 className="forja-title text-xl sm:text-2xl md:text-3xl font-bold leading-tight">
              {greeting}{userName ? `, ${userName.split(' ')[0]}` : ''}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{tagline}</p>
          </div>
          <div className="shrink-0 rounded-full border border-domain-gold/30 bg-domain-gold/10 px-3 py-1 text-xs font-semibold text-domain-gold tabular-nums">
            Dia · {Math.round(dayPct)}%
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          {missionStats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 sm:px-3 sm:py-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground/80">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />
              </div>
              <div className="mt-0.5 text-lg sm:text-xl font-semibold tabular-nums leading-none">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {bestStreak > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-domain-ember/25 bg-domain-ember/10 px-2.5 py-1 text-xs font-medium text-domain-ember">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {bestStreak}d sequência
            </span>
          )}
          <Button asChild size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs gap-1">
            <Link to="/foco"><Timer className="h-3.5 w-3.5" /> Foco</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs gap-1">
            <Link to="/ideias?new=1"><Lightbulb className="h-3.5 w-3.5" /> Ideia</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs gap-1">
            <Link to="/captura"><Mic className="h-3.5 w-3.5" /> Voz</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}