import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, ExternalLink, CalendarDays } from 'lucide-react';
import { forjaApi } from '@/api/forjaClient';
import { cn } from '@/lib/utils';

function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

export default function TodayCalendar() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['todayCalendar'],
    queryFn: () => forjaApi.getTodayCalendar(),
    refetchInterval: 300000, // 5 minutes
  });

  const events = Array.isArray(data) ? data : (data?.events ?? []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          Agenda de hoje
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-secondary/40 animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive py-4 text-center">
            Erro ao carregar eventos
          </p>
        )}

        {!isLoading && !isError && events.length === 0 && (
          <div className="flex flex-col items-start py-3 gap-1">
            <p className="text-sm text-muted-foreground">Nenhum evento no Google Agenda hoje.</p>
          </div>
        )}

        {!isLoading && !isError && events.length > 0 && (
          <ul className="space-y-2">
            {events.slice(0, 5).map((event, idx) => (
              <li key={idx}>
                <a
                  href={event.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg transition-colors',
                    'bg-secondary/50 hover:bg-secondary group'
                  )}
                >
                  <span className="text-xs tabular-nums text-muted-foreground pt-0.5 min-w-[3.2rem]">
                    {formatTime(event.start)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {event.title}
                    </p>
                    {event.location && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground truncate">
                          {event.location}
                        </span>
                      </div>
                    )}
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary shrink-0 mt-0.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
