import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildWeekStrip, formatWeekRangeLabel, isSameWeek } from '@/lib/taskWeekStrip';

const DOW_FULL = {
  Seg: 'segunda',
  Ter: 'terça',
  Qua: 'quarta',
  Qui: 'quinta',
  Sex: 'sexta',
  Sáb: 'sábado',
  Dom: 'domingo',
};

const MAX_DOTS = 4;

function LoadDots({ load }) {
  const shown = Math.min(load.total, MAX_DOTS);
  let doneShown = load.total <= MAX_DOTS ? load.done : Math.round((load.done / load.total) * MAX_DOTS);
  if (load.done > 0) doneShown = Math.max(1, doneShown);
  if (load.open > 0) doneShown = Math.min(shown - 1, doneShown);

  return (
    <span className="flex h-1.5 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: shown }).map((_, index) => (
        <span
          key={index}
          className={cn('h-1.5 w-1.5 rounded-full', index < doneShown ? 'bg-domain-wellness' : 'bg-stone-400/70')}
        />
      ))}
      {load.total > MAX_DOTS ? <span className="text-[10px] font-medium leading-none text-muted-foreground">+</span> : null}
    </span>
  );
}

function loadLabel(load) {
  if (load.total === 0) return 'sem tarefas';
  const open = load.open === 1 ? '1 aberta' : load.open + ' abertas';
  const done = load.done === 1 ? '1 feita' : load.done + ' feitas';
  return open + ', ' + done;
}

/** Faixa da semana: 7 dias com carga, setas de semana e "Hoje". */
export default function TaskWeekStrip({
  weekBase,
  today,
  tasks = [],
  selectedDay = null,
  onSelectDay,
  onWeekChange,
  onToday,
  className,
}) {
  const days = buildWeekStrip(weekBase, today, tasks);
  const isCurrentWeek = isSameWeek(weekBase, today);

  return (
    <section aria-label="Dias da semana" className={cn('praxis-panel min-w-0 rounded-2xl p-2', className)}>
      <div className="flex items-center justify-between gap-2 pb-2 pl-2">
        <p className="min-w-0 truncate text-sm font-semibold tabular-nums text-foreground" aria-live="polite">
          {formatWeekRangeLabel(weekBase)}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => onWeekChange?.(-1)}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-full border-white/10 px-3 text-xs font-medium"
            onClick={onToday}
            disabled={isCurrentWeek && !selectedDay}
          >
            Hoje
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => onWeekChange?.(1)}
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="praxis-scroll-x -mx-1 px-1 pb-0.5">
        <div className="flex min-w-max gap-1 sm:min-w-0">
          {days.map((day) => {
            const selected = selectedDay === day.date;
            return (
              <button
                key={day.date}
                type="button"
                aria-pressed={selected}
                aria-current={day.isToday ? 'date' : undefined}
                aria-label={
                  DOW_FULL[day.dow] + ' ' + day.dayNum + (day.isToday ? ', hoje' : '') + ': ' + loadLabel(day.load)
                }
                onClick={() => onSelectDay?.(day.date)}
                className={cn(
                  'flex min-h-[4.25rem] min-w-[2.75rem] flex-1 flex-col items-center justify-center gap-1.5 rounded-lg px-1 py-2 outline-none',
                  'transition-[background-color,box-shadow] duration-150 ease-out',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected ? 'praxis-elev-2 bg-secondary' : 'hover:bg-white/[0.04]'
                )}
              >
                <span
                  className={cn(
                    'text-[11px] font-medium leading-none',
                    day.isToday ? 'text-primary' : selected ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {day.dow}
                </span>
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums leading-none',
                    day.isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  )}
                >
                  {day.dayNum}
                </span>
                <LoadDots load={day.load} />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
