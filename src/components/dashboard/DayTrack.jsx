import React, { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Clock,
  ChevronRight,
  ExternalLink,
  Hourglass,
  MapPin,
  MoreHorizontal,
  Pencil,
  Route,
  Timer,
  Trash2,
} from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { SectionLoadError, SectionLoading, StaleCopyNote } from '@/components/shared/SectionRead';
import { isReadable } from '@/lib/readState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SectionHeader } from '@/components/layout/PraxisPage';
import { TaskAreaChip, formatTaskDuration } from '@/components/habits-tasks/TaskCardParts';
import { cn } from '@/lib/utils';
import { sparkFromElement } from '@/lib/celebration';
import { buildDayTrack } from '@/lib/dayTrack';
import { formatBehindSince, formatTaskTimeLabel } from '@/lib/nowTask';
import { cleanPriorityPrefix } from '@/lib/tasks';
import { useBusyTasks } from '@/lib/taskBusy';

/** Coluna de horário: largura fixa, números alinhados. */
function TimeCell({ children, className }) {
  return (
    <span
      className={cn(
        'w-11 shrink-0 pt-3 text-right text-xs font-medium tabular-nums leading-none text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  );
}

function TaskMeta({ task, behindLabel }) {
  const duration = formatTaskDuration(task.duration_minutes);
  if (!task.category && !duration && task.priority !== 'high' && !behindLabel) return null;
  return (
    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-none text-muted-foreground">
      <TaskAreaChip category={task.category} />
      {duration ? (
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <Hourglass className="h-3 w-3 opacity-80" aria-hidden />
          <span className="sr-only">Duração: </span>
          {duration}
        </span>
      ) : null}
      {task.priority === 'high' ? <span className="font-medium text-rose-300">Alta</span> : null}
      {behindLabel ? <span className="font-medium text-amber-200/85">{behindLabel}</span> : null}
    </div>
  );
}

function TaskMenu({ task, done = false, actions }) {
  const { onEditTask, onDeleteTask, onNotToday, notTodayBusy, onSnooze15, today } = actions;
  const title = cleanPriorityPrefix(task.title);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-lg text-muted-foreground touch-manipulation hover:text-foreground"
          aria-label={`Mais opções para ${title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {!done ? (
          <>
            <DropdownMenuItem asChild>
              <Link to={`/foco?taskId=${encodeURIComponent(task.id)}`} className="flex items-center">
                <Timer className="mr-2 h-4 w-4" /> Iniciar foco
              </Link>
            </DropdownMenuItem>
            {onSnooze15 && task.date === today ? (
              <DropdownMenuItem onClick={() => onSnooze15(task)}>
                <Clock className="mr-2 h-4 w-4" /> Adiar 15 min
              </DropdownMenuItem>
            ) : null}
            {onNotToday ? (
              <DropdownMenuItem disabled={notTodayBusy} onClick={() => onNotToday(task)}>
                <CalendarClock className="mr-2 h-4 w-4" /> Não hoje
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        <DropdownMenuItem onClick={() => onEditTask?.(task)}>
          <Pencil className="mr-2 h-4 w-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDeleteTask?.(task)}>
          <Trash2 className="mr-2 h-4 w-4" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskRow({ task, time, behindLabel, tone = 'default', rowRef, onComplete, actions, busy = false }) {
  const title = cleanPriorityPrefix(task.title);
  return (
    <li
      ref={rowRef}
      className={cn(
        'flex min-w-0 items-start gap-1 rounded-xl pr-0.5 transition-colors duration-150',
        tone === 'behind' ? 'bg-amber-500/[0.045]' : 'hover:bg-white/[0.03]'
      )}
    >
      <TimeCell className="text-foreground/80">{time}</TimeCell>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
        <Checkbox
          checked={false}
          disabled={busy}
          aria-busy={busy || undefined}
          onCheckedChange={() => onComplete(task)}
          aria-label={`Concluir ${title}`}
          className="h-5 w-5 border-muted-foreground/40 touch-manipulation"
        />
      </span>
      <div className="min-w-0 flex-1 py-2.5">
        <p className="break-words text-[15px] font-medium leading-snug text-foreground [text-wrap:pretty]">{title}</p>
        <TaskMeta task={task} behindLabel={behindLabel} />
      </div>
      <TaskMenu task={task} actions={actions} />
    </li>
  );
}

function EventRow({ item }) {
  const { event } = item;
  const ended = item.kind === 'event' && item.past && !item.inProgress && item.start !== null;
  const body = (
    <>
      <TimeCell className={cn(item.inProgress && 'text-domain-gold')}>{item.startLabel || ''}</TimeCell>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center text-domain-sky/70" aria-hidden>
        <CalendarDays className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 py-2.5">
        <p className="break-words text-sm leading-snug text-foreground/75 [text-wrap:pretty]">
          <span className="sr-only">Agenda: </span>
          {event.title}
        </p>
        {event.location ? (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{event.location}</span>
          </p>
        ) : null}
      </div>
      {event.htmlLink ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground/45" aria-hidden>
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="w-11 shrink-0" aria-hidden />
      )}
    </>
  );
  const className = cn(
    'flex min-w-0 items-start gap-1 rounded-xl pr-0.5',
    ended && 'opacity-60'
  );
  return (
    <li>
      {event.htmlLink ? (
        <a
          href={event.htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(className, 'transition-colors duration-150 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        >
          {body}
        </a>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

/** Marcador "agora": hora em números tabulares e uma linha fina dourada. */
function NowMarker({ clock }) {
  return (
    <li className="flex items-center gap-1 py-0.5" aria-label={`Agora, ${clock}`}>
      <span className="w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums leading-none text-domain-gold">
        {clock}
      </span>
      <span className="ml-[19px] h-1.5 w-1.5 shrink-0 rounded-full bg-domain-gold" aria-hidden />
      <span className="h-px min-w-0 flex-1 bg-domain-gold/55" aria-hidden />
    </li>
  );
}

function GroupLabel({ children, className }) {
  return <h3 className={cn('px-1 pb-1 pt-2 text-xs font-medium text-muted-foreground', className)}>{children}</h3>;
}

/**
 * Trilha do dia: tarefas com hora e eventos da agenda por horário, marcador do agora,
 * "Durante o dia" para o que não tem hora e concluídas recolhidas no fim.
 */
export default function DayTrack({
  tasks,
  today,
  clock,
  read = null,
  behind = [],
  onToggleComplete,
  onEditTask,
  onDeleteTask,
  onNotToday,
  notTodayBusy = false,
  onSnooze15,
}) {
  const rowRefs = useRef(new Map());
  const { data: calendarData, isError: calendarError } = useQuery({
    queryKey: ['todayCalendar'],
    queryFn: () => praxisApi.getTodayCalendar(),
    refetchInterval: 300000,
  });
  const events = useMemo(
    () => (Array.isArray(calendarData) ? calendarData : calendarData?.events ?? []),
    [calendarData]
  );

  const behindIds = useMemo(() => behind.map((t) => t.id), [behind]);
  const track = useMemo(
    () => buildDayTrack({ tasks, events, now: clock, today, excludeIds: behindIds }),
    [tasks, events, clock, today, behindIds]
  );

  const actions = { onEditTask, onDeleteTask, onNotToday, notTodayBusy, onSnooze15, today };
  const setRowRef = (id) => (el) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };
  const busyTasks = useBusyTasks();
  const complete = (task) => {
    if (busyTasks.has(task.id)) return;
    sparkFromElement(rowRefs.current.get(task.id), 'ember');
    onToggleComplete?.(task);
  };

  const trailCount = track.timeline.length + track.untimed.length;
  const isEmpty = behind.length === 0 && trailCount === 0 && track.done.length === 0;

  const renderTimelineItem = (item) =>
    item.kind === 'task' ? (
      <TaskRow
        key={item.key}
        task={item.task}
        time={item.startLabel}
        rowRef={setRowRef(item.task.id)}
        onComplete={complete}
        actions={actions}
        busy={busyTasks.has(item.task.id)}
      />
    ) : (
      <EventRow key={item.key} item={item} />
    );

  return (
    <section className="min-w-0 space-y-3" aria-label="Trilha do dia" data-testid="day-track">
      <SectionHeader
        title="Trilha do dia"
        icon={Route}
        iconClassName="text-domain-gold"
        count={isReadable(read) ? trailCount + behind.length || undefined : undefined}
        action={(
          <Link
            to="/tarefas"
            className="inline-flex min-h-11 items-center gap-0.5 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver todas
            <span className="sr-only"> as tarefas</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      />
      <StaleCopyNote read={read} testId="track-stale" />
      {read?.status === 'error' ? (
        <SectionLoadError what="as tarefas" read={read} testId="track-error" />
      ) : read?.status === 'loading' ? (
        <SectionLoading className="h-[220px]" label="Carregando as tarefas" />
      ) : (
      <Card className="praxis-dashboard-card">
        <CardContent className="space-y-1 px-2 py-2 sm:px-3 sm:py-3">
          {isEmpty ? <p className="px-3 py-3 text-sm text-muted-foreground">Dia livre</p> : null}

          {behind.length > 0 ? (
            <div>
              <GroupLabel className="text-amber-200/90">Ficou pra trás · {behind.length}</GroupLabel>
              <ul className="space-y-0.5">
                {behind.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    time={task.date === today ? formatTaskTimeLabel(task) : ''}
                    // As de hoje já mostram a hora; "desde…" só para dias anteriores.
                    behindLabel={task.date && task.date < today ? formatBehindSince(task, today) : null}
                    tone="behind"
                    rowRef={setRowRef(task.id)}
                    onComplete={complete}
                    actions={actions}
                    busy={busyTasks.has(task.id)}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {track.untimed.length > 0 ? (
            <div>
              <GroupLabel>Durante o dia</GroupLabel>
              <ul className="space-y-0.5">
                {track.untimed.map((item) =>
                  item.kind === 'task' ? (
                    <TaskRow
                      key={item.key}
                      task={item.task}
                      time=""
                      rowRef={setRowRef(item.task.id)}
                      onComplete={complete}
                      actions={actions}
                      busy={busyTasks.has(item.task.id)}
                    />
                  ) : (
                    <EventRow key={item.key} item={item} />
                  )
                )}
              </ul>
            </div>
          ) : null}

          {track.timeline.length > 0 ? (
            <ul className={cn('space-y-0.5', (behind.length > 0 || track.untimed.length > 0) && 'pt-2')}>
              {track.timeline.slice(0, track.nowIndex).map(renderTimelineItem)}
              <NowMarker clock={clock} />
              {track.timeline.slice(track.nowIndex).map(renderTimelineItem)}
            </ul>
          ) : null}

          {calendarError ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground" role="status">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Agenda indisponível
            </p>
          ) : null}

          {track.done.length > 0 ? (
            <Collapsible defaultOpen={false} className="pt-1">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm text-domain-wellness/90 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="tabular-nums">Concluídas ({track.done.length})</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="space-y-0.5 pt-1">
                  {track.done.map((task) => {
                    const title = cleanPriorityPrefix(task.title);
                    return (
                      <li
                        key={task.id}
                        className="flex min-w-0 items-start gap-1 rounded-xl bg-domain-wellness/[0.065] pr-0.5 shadow-[inset_0_0_0_1px_hsl(var(--domain-wellness)/0.15)]"
                      >
                        <TimeCell className="text-domain-wellness/70">{formatTaskTimeLabel(task) || ''}</TimeCell>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                          <Checkbox
                            checked
                            disabled={busyTasks.has(task.id)}
                            aria-busy={busyTasks.has(task.id) || undefined}
                            onCheckedChange={() => onToggleComplete?.(task)}
                            aria-label={`Reabrir ${title}`}
                            className="h-5 w-5 border-domain-wellness touch-manipulation data-[state=checked]:bg-domain-wellness"
                          />
                        </span>
                        <p className="min-w-0 flex-1 break-words py-3 text-sm leading-snug text-domain-wellness/90 line-through [text-wrap:pretty]">
                          {title}
                        </p>
                        <TaskMenu task={task} done actions={actions} />
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </CardContent>
      </Card>
      )}
    </section>
  );
}
