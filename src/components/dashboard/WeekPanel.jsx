import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { praxisApi } from '@/api/praxisClient';
import { SectionLoadError, StaleCopyNote } from '@/components/shared/SectionRead';
import { buildSectionRead } from '@/lib/readState';
import { cn } from '@/lib/utils';
import { weekRange } from '@/lib/taskLenses';
import { weekDayHref } from '@/lib/urlDeepLinks';
import { weekBarRatio, weekDayAriaLabel, weekSummaryParts } from '@/lib/todayGlance';

const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Mesma chave da tela Foco: tarefas, hábitos e foco mudam a semana. */
export const WEEK_QUERY_KEY = 'weeklyInsights';

function DayBar({ day }) {
  const ratio = weekBarRatio(day);
  const complete = day.total > 0 && day.done >= day.total;
  return (
    <Link
      to={weekDayHref(day.date)}
      aria-label={weekDayAriaLabel(day)}
      aria-current={day.is_today ? 'date' : undefined}
      className={cn(
        'flex h-[92px] min-w-0 flex-col items-center justify-end gap-2 rounded-xl pb-2 pt-2.5 transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        day.is_today && 'bg-white/[0.045] shadow-[inset_0_0_0_1px_hsl(var(--domain-gold)/0.35)]',
        day.is_future && 'opacity-50',
      )}
    >
      {/* Trilho fixo; o preenchido sobe por transform (nada de animar altura). */}
      <span className="relative block h-14 w-3 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
        <span
          className={cn(
            'absolute inset-0 rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none',
            day.is_today ? 'bg-domain-gold' : complete ? 'bg-domain-wellness/80' : 'bg-foreground/35',
          )}
          style={{ transform: `translateY(${(1 - ratio) * 100}%)` }}
        />
      </span>
      <span
        className={cn(
          'text-[11px] font-medium leading-none',
          day.is_today ? 'text-domain-gold' : 'text-muted-foreground',
        )}
        aria-hidden
      >
        {WEEKDAY_LETTER[day.weekday]}
      </span>
    </Link>
  );
}

/** Semana em barras (seg a dom) e um resumo curto; o toque num dia abre a semana em Tarefas. */
export default function WeekPanel({ today }) {
  const weekStart = weekRange(today).start;
  const query = useQuery({
    queryKey: [WEEK_QUERY_KEY, weekStart],
    queryFn: () => praxisApi.insights.weekly(weekStart),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
  const { data, isLoading } = query;
  const read = buildSectionRead([query]);
  const days = Array.isArray(data?.days) ? data.days : [];

  if (read.status === 'error') return <SectionLoadError what="a semana" read={read} testId="week-error" />;
  // API antiga sem days[]: o bloco não ocupa o Hoje.
  if (!isLoading && days.length !== 7) return null;

  const summary = weekSummaryParts(data?.victories);

  return (
    <nav className="praxis-panel rounded-2xl p-2.5" aria-label="Semana" data-testid="week-panel">
      {isLoading ? (
        <div className="grid grid-cols-7 gap-1" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex h-[92px] flex-col items-center justify-end gap-2 pb-2 pt-2.5">
              <span className="praxis-skel block h-14 w-3 rounded-full" />
              <span className="praxis-skel block h-[11px] w-2.5 rounded-sm" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => (
            <DayBar key={day.date} day={day} />
          ))}
        </div>
      )}
      <p className="mt-1.5 min-h-[18px] px-1.5 pb-0.5 text-xs leading-[18px] tabular-nums text-muted-foreground">
        {isLoading ? <span className="praxis-skel inline-block h-3 w-48 rounded-md align-middle" /> : summary.join(' · ')}
      </p>
      <StaleCopyNote read={read} className="px-1.5" testId="week-stale" />
    </nav>
  );
}
