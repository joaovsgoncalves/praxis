import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import EmberCanvas from './EmberCanvas';
import ProgressRings, { RingLegend } from './ProgressRings';
import { Flame, Hammer, Target, Timer } from 'lucide-react';
import { fortalezaDateKey, fortalezaDisplayDate } from '@/lib/dates';

const QUOTES = [
  'Ganhar o dia bate resolver a vida inteira.',
  'Clareza antes da motivação.',
  'Movimento reduz ansiedade melhor que ruminação.',
  'Uma vitória pequena ainda é vitória.',
  'Falar organiza; executar confirma.',
  'O objetivo não é perfeição — é sequência.',
  'Hoje é o bloco que você escolheu.',
];

function pickQuote(date = new Date()) {
  const day = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  return QUOTES[day % QUOTES.length];
}

// Estimate a daily focus goal from user settings (4 pomodoros worth, in seconds).
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

  const habitsPct = habitsTotal > 0 ? (habitsDone / habitsTotal) * 100 : 0;
  const tasksPct = tasksTotal > 0 ? (tasksDone / tasksTotal) * 100 : 0;
  const focusPct = focusGoalSec > 0 ? Math.min(100, (focusSec / focusGoalSec) * 100) : 0;

  const trackableItemsTotal = habitsTotal + tasksTotal;
  const dayPct = trackableItemsTotal > 0
    ? ((habitsDone + tasksDone) / trackableItemsTotal) * 100
    : focusPct;
  const intensity = Math.max(0.05, Math.min(1, dayPct / 100));

  const bestStreak = useMemo(
    () => habits.reduce((m, h) => Math.max(m, h.current_streak || 0), 0),
    [habits]
  );

  const dateStr = format(fortalezaDisplayDate(), "EEEE, d 'de' MMMM", { locale: ptBR });
  const focusMin = Math.round(focusSec / 60);
  const focusGoalMin = Math.round(focusGoalSec / 60);
  const quote = pickQuote();

  const missionStats = [
    { label: 'Tarefas', value: `${tasksDone}/${tasksTotal}`, icon: Target, tone: 'text-domain-ember' },
    { label: 'Hábitos', value: `${habitsDone}/${habitsTotal}`, icon: Flame, tone: 'text-domain-wellness' },
    { label: 'Foco', value: `${focusMin}/${focusGoalMin}m`, icon: Timer, tone: 'text-domain-focus' },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl md:rounded-[2rem] glass-surface p-4 sm:p-5 md:p-8 lg:p-10">
      <EmberCanvas intensity={intensity} />
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-domain-gold/60 to-transparent" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[minmax(245px,0.72fr)_minmax(0,1fr)] gap-5 md:gap-7 lg:gap-12 items-center">
        <div className="flex items-center justify-center lg:justify-start order-2 lg:order-1">
          <div className="sm:hidden">
            <ProgressRings habits={habitsPct} tasks={tasksPct} focus={focusPct} overall={dayPct} size={200} />
          </div>
          <div className="hidden sm:block">
            <ProgressRings habits={habitsPct} tasks={tasksPct} focus={focusPct} overall={dayPct} size={260} />
          </div>
        </div>

        <div className="space-y-5 md:space-y-6 order-1 lg:order-2">
          <div>
            <p className="forja-kicker mb-2 md:mb-3">
              {emoji} Praxis · {dateStr}
            </p>
            <h1 className="forja-title text-3xl sm:text-4xl md:text-5xl xl:text-6xl font-bold leading-[0.95] max-w-3xl">
              {greeting}{userName ? `, ${userName.split(' ')[0]}` : ''}
            </h1>
            <p className="mt-3 max-w-2xl text-base md:text-lg text-muted-foreground">{tagline}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {missionStats.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3.5 shadow-inner">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground/70">{label}</span>
                  <Icon className={`w-4 h-4 ${tone}`} />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-foreground">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {bestStreak > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-domain-ember/15 border border-domain-ember/30">
                <Flame className="w-4 h-4 text-domain-ember" />
                <span className="text-sm font-semibold text-domain-ember">
                  {bestStreak} {bestStreak === 1 ? 'dia' : 'dias'} forjando
                </span>
              </div>
            )}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-domain-gold/15 border border-domain-gold/30">
              <Hammer className="w-4 h-4 text-domain-gold" />
              <span className="text-sm font-semibold text-domain-gold">
                Missão do dia · {Math.round(dayPct)}%
              </span>
            </div>
          </div>

          <div className="hidden md:block">
            <RingLegend habits={habitsPct} tasks={tasksPct} focus={focusPct} />
          </div>

          <p className="text-sm md:text-base italic text-muted-foreground/85 pt-4 border-t border-border/40">
            "{quote}"
          </p>
        </div>
      </div>
    </div>
  );
}
