import React, { useRef, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { taskBlock, layoutTimedBlocks } from '@/lib/taskLenses';
import { visibleWeekDays } from '@/lib/taskWeekStrip';
import { fortalezaNowTimeHHMM } from '@/lib/dates';
import { cleanPriorityPrefix, isTaskDone } from '@/lib/tasks';
import {
  PRIORITY_CONFIG,
  TaskAreaChip,
  TaskChecklistProgress,
  TaskPriorityRuler,
  taskPriorityKey,
} from './TaskCardParts';

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const HOUR_HEIGHT = 56; // Altura em px por hora
const TOTAL_HOURS = HOURS.length; // 15 horas (07:00 às 22:00)
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT; // 840px
const GUTTER = '3.5rem';
const META_MIN_HEIGHT = 76;

const DOW_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function dowFor(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return DOW_LABELS[(jsDay + 6) % 7];
}

function getBlockPosition(block, durationMinutes) {
  const [startH, startM] = block.start.split(':').map(Number);
  const [endH, endM] = block.end.split(':').map(Number);

  const startMinFrom7 = (startH - 7) * 60 + startM;
  let duration = (endH * 60 + endM) - (startH * 60 + startM);
  if (duration <= 0) {
    duration = Number(durationMinutes) > 0 ? Number(durationMinutes) : 60;
  }

  const top = (startMinFrom7 / 60) * HOUR_HEIGHT;
  const height = Math.max(28, (duration / 60) * HOUR_HEIGHT);

  const minH = 48;
  const nextHeight = Math.max(minH, height);
  const clampedTop = Math.max(0, Math.min(TOTAL_HEIGHT - minH, top));
  const clampedHeight = Math.min(TOTAL_HEIGHT - clampedTop, nextHeight);

  return { top: clampedTop, height: clampedHeight };
}

function nowOffset(nowTime) {
  const [nowH, nowM] = String(nowTime).split(':').map(Number);
  const minutesFrom7 = (nowH - 7) * 60 + nowM;
  if (minutesFrom7 < 0 || minutesFrom7 > TOTAL_HOURS * 60) return null;
  return (minutesFrom7 / 60) * HOUR_HEIGHT;
}

function UntimedTaskChip({ task, onEditTask }) {
  const isDone = isTaskDone(task);
  const title = cleanPriorityPrefix(task.title);
  const priority = PRIORITY_CONFIG[taskPriorityKey(task)];
  return (
    <button
      type="button"
      onClick={() => onEditTask?.(task)}
      data-done={isDone ? 'true' : 'false'}
      className={cn(
        'praxis-board-card flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        isDone ? 'text-muted-foreground' : 'text-stone-100'
      )}
      title={title}
    >
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isDone ? 'bg-domain-wellness/70' : priority.barClass)}
      />
      <span className={cn('min-w-0 flex-1 truncate', isDone && 'line-through decoration-muted-foreground/50')}>
        {title}
      </span>
      <span className="sr-only">{', prioridade ' + priority.label.toLowerCase()}</span>
    </button>
  );
}

function TimedTaskBlock({ task, block, col = 0, cols = 1, onEditTask }) {
  const isDone = isTaskDone(task);
  const title = cleanPriorityPrefix(task.title);
  const { top, height } = getBlockPosition(block, task.duration_minutes);
  const gap = 3;
  const widthPct = 100 / Math.max(1, cols);
  const leftPct = col * widthPct;
  const blockHeight = Math.max(48, height) - 4;
  const showMeta = blockHeight >= META_MIN_HEIGHT;
  const priority = PRIORITY_CONFIG[taskPriorityKey(task)];

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onEditTask?.(task);
      }}
      data-done={isDone ? 'true' : 'false'}
      style={{
        top: `${top + 2}px`,
        height: `${blockHeight}px`,
        left: `calc(${leftPct}% + ${gap}px)`,
        width: `calc(${widthPct}% - ${gap * 2}px)`,
      }}
      className={cn(
        // Camadas: bloco 10 < bloco em foco 11 < linha agora 12 < trilho de horas 20 < cabeçalho 30.
        'praxis-board-card absolute z-10 flex flex-col items-start justify-start gap-1 overflow-hidden rounded-lg px-2 pb-1.5 pt-2 text-left outline-none hover:z-[11]',
        'focus-visible:z-[11] focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <TaskPriorityRuler task={task} className="left-2 w-5" />
      <span className="text-[11px] font-medium leading-none tabular-nums text-muted-foreground">
        {block.start}–{block.end}
      </span>
      <span
        className={cn(
          'line-clamp-2 break-words text-xs font-medium leading-snug',
          isDone ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'text-stone-100'
        )}
      >
        {title}
        <span className="sr-only">{', prioridade ' + priority.label.toLowerCase()}</span>
      </span>
      {showMeta ? (
        <span className="mt-auto flex min-w-0 max-w-full items-center gap-2 text-[11px] leading-none text-muted-foreground">
          <TaskAreaChip category={task.category} compact={cols > 1} className="min-w-0" />
          <TaskChecklistProgress task={task} className="[&>span:last-child]:hidden" />
        </span>
      ) : null}
    </button>
  );
}

/**
 * Linha do tempo por hora (07h–22h). `weekBase` escolhe a semana; `focusDay` mostra só um dia
 * (celular); `highlightDay` marca o dia escolhido na faixa.
 */
export default function TaskWeek({
  tasks = [],
  today,
  weekBase,
  focusDay = null,
  highlightDay = null,
  onEditTask,
  onCreateTaskAt,
}) {
  const scrollRef = useRef(null);
  const todayHeaderRef = useRef(null);
  const [nowTime, setNowTime] = useState(() => fortalezaNowTimeHHMM());

  const days = visibleWeekDays(weekBase || today, focusDay);
  const single = days.length === 1;
  const showsToday = days.includes(today);
  const nowTop = showsToday ? nowOffset(nowTime) : null;

  // Mantém horário do fuso Fortaleza atualizado a cada minuto
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTime(fortalezaNowTimeHHMM());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Rolagem inicial: hora atual no topo (uma vez).
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const offset = nowOffset(fortalezaNowTimeHHMM());
    if (offset !== null) scroller.scrollTop = Math.max(0, offset - 120);
  }, []);

  // A cada troca de semana/dia: hoje à vista na horizontal (sem mexer na rolagem da página).
  const weekKey = days[0];
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const header = todayHeaderRef.current;
    if (!header || single) {
      scroller.scrollLeft = 0;
      return;
    }
    const gutterWidth = scroller.firstElementChild?.firstElementChild?.offsetWidth || 56;
    scroller.scrollLeft = Math.max(0, header.offsetLeft - gutterWidth - 8);
  }, [weekKey, single]);

  const daySet = new Set(days);
  const weekTasks = tasks.filter((t) => {
    if (!t?.date) return false;
    if (t.category === 'ideias' || t.status === 'cancelled') return false;
    return daySet.has(String(t.date).slice(0, 10));
  });

  const untimedByDay = new Map(days.map((day) => [day, []]));
  const timedByDay = new Map(days.map((day) => [day, []]));
  weekTasks.forEach((task) => {
    const day = String(task.date).slice(0, 10);
    const block = taskBlock(task);
    if (block) timedByDay.get(day).push({ id: task.id, task, ...block });
    else untimedByDay.get(day).push(task);
  });
  const hasUntimed = days.some((day) => untimedByDay.get(day).length > 0);

  const gridStyle = {
    gridTemplateColumns: single
      ? `${GUTTER} minmax(0, 1fr)`
      : `${GUTTER} repeat(${days.length}, minmax(8rem, 1fr))`,
  };

  return (
    <div className="praxis-panel min-w-0 overflow-hidden rounded-2xl">
      <div
        ref={scrollRef}
        className="praxis-scroll-x relative max-h-[70vh] overflow-auto overscroll-x-contain"
        aria-label="Linha do tempo"
        role="region"
        tabIndex={-1}
      >
        <div className="grid" style={gridStyle}>
          {/* Cabeçalho dos dias */}
          <div className="sticky left-0 top-0 z-40 border-b border-white/[0.06] bg-card" />
          {days.map((day) => {
            const isToday = day === today;
            const isHighlighted = highlightDay === day && !single;
            return (
              <div
                key={day}
                ref={isToday ? todayHeaderRef : null}
                className={cn(
                  'sticky top-0 z-30 flex items-baseline gap-1.5 border-b border-l border-white/[0.06] bg-card px-2.5 py-2.5',
                  isHighlighted && 'bg-secondary'
                )}
              >
                <span className={cn('text-xs font-medium', isToday ? 'text-primary' : 'text-muted-foreground')}>
                  {dowFor(day)}
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', isToday ? 'text-primary' : 'text-foreground')}>
                  {Number(day.slice(8, 10))}
                </span>
                {isToday ? <span className="sr-only">hoje</span> : null}
              </div>
            );
          })}

          {/* Faixa "Sem horário" — chips acima da grade */}
          {hasUntimed ? (
            <>
              <div className="sticky left-0 z-20 flex items-start justify-end border-b border-white/[0.06] bg-card px-1.5 py-2 text-right text-[11px] font-medium leading-tight text-muted-foreground">
                Sem horário
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className={cn(
                    'flex min-w-0 flex-col gap-1.5 border-b border-l border-white/[0.06] p-1.5',
                    highlightDay === day && !single && 'bg-white/[0.02]'
                  )}
                >
                  {untimedByDay.get(day).map((task) => (
                    <UntimedTaskChip key={task.id} task={task} onEditTask={onEditTask} />
                  ))}
                </div>
              ))}
            </>
          ) : null}

          {/* Trilho de horas */}
          <div style={{ height: `${TOTAL_HEIGHT}px` }} className="sticky left-0 z-20 select-none bg-card">
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT}px` }}
                className="flex items-start justify-end pr-2 text-[11px] tabular-nums text-muted-foreground"
              >
                <span className="translate-y-1">{String(hour).padStart(2, '0')}:00</span>
              </div>
            ))}
            {nowTop !== null ? (
              <span
                className="absolute right-1 -translate-y-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-primary-foreground"
                style={{ top: `${nowTop}px` }}
              >
                <span className="sr-only">Agora: </span>
                {nowTime}
              </span>
            ) : null}
          </div>

          {/* Colunas dos dias */}
          {days.map((day) => {
            const isToday = day === today;
            const dow = dowFor(day);
            const dayNum = Number(day.slice(8, 10));
            const laid = layoutTimedBlocks(timedByDay.get(day));
            return (
              <div
                key={day}
                style={{ height: `${TOTAL_HEIGHT}px` }}
                className={cn(
                  'relative min-w-0 border-l border-white/[0.06]',
                  highlightDay === day && !single && 'bg-white/[0.02]'
                )}
              >
                {HOURS.map((hour) => {
                  const timeStr = `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <div
                      key={hour}
                      onClick={() => onCreateTaskAt?.({ date: day, time: timeStr })}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className="group relative flex cursor-pointer items-center justify-center border-t border-white/[0.04] outline-none transition-colors duration-150 first:border-t-0 hover:bg-white/[0.025] focus-visible:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      title={`Criar tarefa às ${timeStr} (${dow} ${dayNum})`}
                      aria-label={`Criar tarefa às ${timeStr}, ${dow} ${dayNum}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onCreateTaskAt?.({ date: day, time: timeStr });
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-60 group-focus-visible:opacity-60" />
                    </div>
                  );
                })}

                {laid.map((item) => (
                  <TimedTaskBlock
                    key={item.task.id}
                    task={item.task}
                    block={item}
                    col={item.col}
                    cols={item.cols}
                    onEditTask={onEditTask}
                  />
                ))}

                {/* Linha de agora (apenas no dia de hoje) */}
                {isToday && nowTop !== null ? (
                  <div
                    id="praxis-week-now-line"
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-[12] flex items-center"
                    style={{ top: `${nowTop}px` }}
                  >
                    <span className="-ml-[3px] h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-primary" />
                    <span className="h-0.5 w-full -translate-y-px bg-primary" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
