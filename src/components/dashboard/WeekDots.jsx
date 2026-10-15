import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { praxisApi } from '@/api/praxisClient';
import { cn } from '@/lib/utils';
import { weekRange } from '@/lib/taskLenses';
import { weekDayHref } from '@/lib/urlDeepLinks';

const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

export const WEEK_DOTS_QUERY_KEY = 'weeklyInsights';

function dayAriaLabel(day) {
  const name = WEEKDAY_NAME[day.weekday] || '';
  if (!day.total) return `${name}, nada agendado`;
  return `${name}, ${day.done} de ${day.total}`;
}

function DayDot({ day }) {
  const ratio = day.total > 0 ? Math.min(1, day.done / day.total) : 0;
  const complete = day.total > 0 && day.done >= day.total;
  return (
    <Link
      to={weekDayHref(day.date)}
      aria-label={dayAriaLabel(day)}
      aria-current={day.is_today ? 'date' : undefined}
      className={cn(
        'flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl py-1 transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        day.is_today && 'bg-white/[0.045] shadow-[inset_0_0_0_1px_hsl(var(--domain-gold)/0.35)]',
        day.is_future && 'opacity-60'
      )}
    >
      <span
        className={cn('text-[11px] font-medium leading-none', day.is_today ? 'text-domain-gold' : 'text-muted-foreground')}
        aria-hidden
      >
        {WEEKDAY_LETTER[day.weekday]}
      </span>
      <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r={RING_R} fill="none" strokeWidth="3" className="stroke-white/[0.09]" />
        {ratio > 0 ? (
          <circle
            cx="12"
            cy="12"
            r={RING_R}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className={complete ? 'stroke-domain-wellness' : 'stroke-domain-gold'}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - ratio)}
          />
        ) : null}
      </svg>
      <span className="text-[11px] leading-none tabular-nums text-muted-foreground" aria-hidden>
        {day.total > 0 ? `${day.done}/${day.total}` : '–'}
      </span>
    </Link>
  );
}

/** Semana em 7 pontos (seg a dom): feitos/total por dia; o toque abre a semana em Tarefas. */
export default function WeekDots({ today }) {
  const weekStart = weekRange(today).start;
  const { data, isLoading, isError } = useQuery({
    queryKey: [WEEK_DOTS_QUERY_KEY, weekStart],
    queryFn: () => praxisApi.insights.weekly(weekStart),
    staleTime: 2 * 60 * 1000,
  });
  const days = Array.isArray(data?.days) ? data.days : [];

  // Sem a semana (erro ou API antiga sem days[]), o ponto não ocupa o Hoje.
  if (isError || (!isLoading && days.length !== 7)) return null;

  return (
    <nav className="praxis-panel rounded-2xl p-1.5" aria-label="Semana" data-testid="week-dots">
      {isLoading ? (
        <div className="grid grid-cols-7 gap-1" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="praxis-skeleton h-[56px] rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => (
            <DayDot key={day.date} day={day} />
          ))}
        </div>
      )}
    </nav>
  );
}
