import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import EmberCanvas from './EmberCanvas';
import ProgressRings, { RingLegend } from './ProgressRings';
import { Flame } from 'lucide-react';

const QUOTES = [
  'Disciplina derrota motivação todos os dias.',
  'Pequeno e consistente bate grande e raro.',
  'Cada dia martelado é uma camada a mais.',
  'A forja não pergunta se você tá com vontade.',
  'O ferro só vira aço sob calor constante.',
  'Você não precisa estar pronto, precisa começar.',
  'Hoje é o material da próxima semana.',
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
  const today = format(new Date(), 'yyyy-MM-dd');

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

  const overall = (habitsPct + tasksPct + focusPct) / 3;
  const intensity = Math.max(0.05, Math.min(1, overall / 100));

  const bestStreak = useMemo(
    () => habits.reduce((m, h) => Math.max(m, h.current_streak || 0), 0),
    [habits]
  );

  const dateStr = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });
  const focusMin = Math.round(focusSec / 60);
  const focusGoalMin = Math.round(focusGoalSec / 60);

  const quote = pickQuote();

  return (
    <div className="relative overflow-hidden rounded-2xl glass-surface p-5 md:p-7">
      <EmberCanvas intensity={intensity} />

      <div className="relative z-10 grid md:grid-cols-[auto_1fr] gap-6 md:gap-8 items-center">
        <div className="flex items-center justify-center">
          <ProgressRings
            habits={habitsPct}
            tasks={tasksPct}
            focus={focusPct}
            size={210}
          />
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground/80 mb-1">
              {emoji} {dateStr}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">
              {greeting}{userName ? `, ${userName.split(' ')[0]}` : ''}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{tagline}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {bestStreak > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-domain-ember/15 border border-domain-ember/30">
                <Flame className="w-3.5 h-3.5 text-domain-ember" />
                <span className="text-xs font-semibold text-domain-ember">
                  {bestStreak} {bestStreak === 1 ? 'dia' : 'dias'} forjando
                </span>
              </div>
            )}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-domain-focus/15 border border-domain-focus/30">
              <span className="text-xs font-semibold text-domain-focus font-mono">
                {focusMin}/{focusGoalMin}min de foco
              </span>
            </div>
          </div>

          <RingLegend habits={habitsPct} tasks={tasksPct} focus={focusPct} />

          <p className="text-xs italic text-muted-foreground/80 pt-2 border-t border-border/40">
            "{quote}"
          </p>
        </div>
      </div>
    </div>
  );
}
