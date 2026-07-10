import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { Flame, Target, Timer } from 'lucide-react';
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
  const focusSec = focusToday.reduce((sum, session) => sum + (session.duration_seconds || 0), 0);

  const trackableItemsTotal = habitsTotal + tasksTotal;
  const dayPct = trackableItemsTotal > 0
    ? ((habitsDone + tasksDone) / trackableItemsTotal) * 100
    : (focusGoalSec > 0 ? Math.min(100, (focusSec / focusGoalSec) * 100) : 0);
  const roundedDayPct = Math.round(dayPct);

  const bestStreak = useMemo(
    () => habits.reduce((max, habit) => Math.max(max, habit.current_streak || 0), 0),
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
    <section className="praxis-dashboard-summary relative overflow-hidden rounded-3xl border border-white/[0.065] bg-white/[0.025] p-5 sm:p-6">
      <div className="pointer-events-none absolute right-0 top-0 h-52 w-52 bg-[radial-gradient(circle,hsl(var(--domain-gold)/0.08),transparent_68%)]" aria-hidden />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">
            {emoji} Praxis · {dateStr}
          </p>
          <h1 className="forja-title mt-2 text-2xl font-bold leading-tight tracking-[-0.045em] sm:text-3xl lg:text-[2rem]">
            {greeting}{userName ? `, ${userName.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{tagline}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:justify-end">
          {bestStreak > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-domain-ember/20 bg-domain-ember/[0.08] px-3 py-1.5 text-xs font-medium text-domain-ember">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {bestStreak}d
            </span>
          ) : null}
          <div className="rounded-2xl border border-domain-gold/15 bg-domain-gold/[0.055] px-4 py-3 text-right">
            <p className="text-[10px] font-medium text-muted-foreground">Dia concluído</p>
            <p className="forja-title mt-1 text-2xl font-bold tabular-nums text-domain-gold sm:text-3xl">{roundedDayPct}%</p>
          </div>
        </div>
      </div>

      <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
        <div
          className="praxis-progress-fill h-full rounded-full bg-gradient-to-r from-domain-gold via-domain-gold to-domain-wellness"
          style={{ width: `${Math.max(0, Math.min(100, roundedDayPct))}%` }}
        />
      </div>

      <div className="relative mt-5 grid grid-cols-3 divide-x divide-white/[0.06] rounded-2xl border border-white/[0.055] bg-black/15">
        {missionStats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex min-w-0 items-center gap-2.5 px-3 py-3.5 sm:px-4 sm:py-4">
            <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.05] bg-white/[0.025] sm:flex">
              <Icon className={`h-4 w-4 ${tone}`} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground sm:text-[11px]">{label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
