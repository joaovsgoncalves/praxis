import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, ExternalLink, CalendarDays } from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { cn } from '@/lib/utils';

function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Fortaleza',
    });
  } catch {
    return '--:--';
  }
}

export default function TodayCalendar() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['todayCalendar'],
    queryFn: () => praxisApi.getTodayCalendar(),
    refetchInterval: 300000,
  });

  const events = Array.isArray(data) ? data : (data?.events ?? []);

  // Agenda vazia não ocupa o Hoje: só aparece com evento ou com erro.
  if (isLoading || (!isError && events.length === 0)) return null;

  return (
    <Card className="praxis-dashboard-card praxis-context-card">
      <CardContent className="p-5 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-domain-sky/15 bg-domain-sky/[0.07]">
            <CalendarDays className="h-4 w-4 text-domain-sky" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">Agenda</p>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <h3 className="praxis-title text-base font-semibold tracking-[-0.025em]">Hoje</h3>
              {!isError ? (
                <span className="text-[11px] tabular-nums text-muted-foreground">{events.length} evento{events.length === 1 ? '' : 's'}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4">
          {isError ? (
            <p className="py-3 text-sm text-destructive">Não foi possível carregar a agenda.</p>
          ) : null}

          {!isError ? (
            <ul className="space-y-2">
              {events.slice(0, 5).map((event, index) => (
                <li key={event.id || `${event.start}-${index}`}>
                  <a
                    href={event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.022] px-3 py-3',
                      'transition-[background-color,border-color] hover:border-white/[0.09] hover:bg-white/[0.035]',
                    )}
                  >
                    <span className="min-w-[3rem] pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {formatTime(event.start)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground/90 transition-colors group-hover:text-foreground">
                        {event.title}
                      </p>
                      {event.location ? (
                        <div className="mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden />
                          <span className="truncate text-[11px] text-muted-foreground">{event.location}</span>
                        </div>
                      ) : null}
                    </div>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/35 transition-colors group-hover:text-domain-sky" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
