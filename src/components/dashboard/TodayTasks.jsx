import React, { useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Timer,
  CheckCircle2,
  Clock,
  GripVertical,
  Hourglass,
  Pencil,
  CalendarClock,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { sparkFromElement } from '@/lib/celebration';
import { sortPendingWithOverdueFirst, addDaysToDateKey } from '@/lib/taskListFilters';
import { formatBehindSince, formatTaskTimeLabel } from '@/lib/nowTask';
import { countOpenTasksForDay } from '@/lib/dayLeft';
import { TaskAreaChip, formatTaskDuration } from '@/components/habits-tasks/TaskCardParts';
import { SectionHeading } from '@/components/layout/PraxisPage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Hora · área · duração (e "desde ontem" quando ficou pra trás). Uma linha, sem data ISO. */
function TaskRowMeta({ task, behindLabel }) {
  const time = formatTaskTimeLabel(task);
  const duration = formatTaskDuration(task.duration_minutes);
  return (
    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-none text-muted-foreground">
      {time ? (
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <Clock className="h-3 w-3 opacity-80" aria-hidden />
          {time}
        </span>
      ) : null}
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

function TaskRowMenu({ task, onEditTask, onDeleteTask, onNotToday, notTodayBusy }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-lg text-muted-foreground hover:text-foreground touch-manipulation"
          aria-label={`Mais opções para ${task.title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link to={`/foco?taskId=${task.id}`} className="flex items-center">
            <Timer className="mr-2 h-4 w-4" /> Iniciar foco
          </Link>
        </DropdownMenuItem>
        {onNotToday ? (
          <DropdownMenuItem disabled={notTodayBusy} onClick={() => onNotToday(task)}>
            <CalendarClock className="mr-2 h-4 w-4" /> Não hoje
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onEditTask?.(task)}>
          <Pencil className="mr-2 h-4 w-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDeleteTask?.(task)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function TodayTasks({
  tasks,
  today,
  behind = [],
  allTasksForRecurrence,
  onToggleComplete,
  onEditTask,
  onDeleteTask,
  onNotToday,
  notTodayBusy = false,
  onReorderPending,
  reorderBusy = false,
}) {
  const rowRefs = useRef(new Map());
  const isDone = (task) => task.status === 'completed' || task.status === 'done';
  const pending = sortPendingWithOverdueFirst(
    tasks.filter((t) => !isDone(t)),
    today,
  );
  const behindIds = new Set(behind.map((t) => t.id));
  // Ficou pra trás: dias anteriores e as de hoje que passaram da janela do Agora.
  const behindPending = pending.filter(
    (t) => behindIds.has(t.id) || Boolean(t.date && today && t.date < today),
  );
  const todayPending = pending.filter((t) => !behindPending.includes(t));
  const completed = tasks.filter((t) => isDone(t));
  // Contador do card = só o dia de hoje (bate com o "faltam N" da faixa).
  const openToday = countOpenTasksForDay(tasks, today);
  const dayTotal = openToday + completed.length;
  const donePct = dayTotal > 0 ? Math.round((completed.length / dayTotal) * 100) : 0;

  const upcomingOpenCount = React.useMemo(() => {
    if (!allTasksForRecurrence || !today) return 0;
    const endOfWeek = addDaysToDateKey(today, 7);
    return allTasksForRecurrence.filter((t) => {
      if (t.status === 'cancelled' || isDone(t)) return false;
      const d = (t.date || '').slice(0, 10);
      return Boolean(d && d > today && d <= endOfWeek);
    }).length;
  }, [allTasksForRecurrence, today]);

  const setRowRef = (id) => (el) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  const handleComplete = (task) => {
    if (!isDone(task)) {
      sparkFromElement(rowRefs.current.get(task.id), 'ember');
    }
    onToggleComplete?.(task);
  };

  const handleDragEnd = (result) => {
    if (!result.destination || reorderBusy) return;
    onReorderPending?.(todayPending, result.source.index, result.destination.index);
  };

  const renderRowBody = (task, { behindLabel, dragHandleProps } = {}) => (
    <>
      {dragHandleProps ? (
        <button
          type="button"
          className="hidden h-11 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground touch-manipulation hover:bg-white/[0.03] hover:text-foreground sm:flex"
          aria-label="Arrastar para reordenar"
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
        <Checkbox
          checked={false}
          onCheckedChange={() => handleComplete(task)}
          aria-label={`Concluir ${task.title}`}
          className="h-5 w-5 border-muted-foreground/40 touch-manipulation"
        />
      </span>
      <div className="min-w-0 flex-1 py-2.5">
        <p className="line-clamp-2 break-words text-[15px] font-medium leading-snug text-foreground [text-wrap:pretty]">
          {task.title}
        </p>
        <TaskRowMeta task={task} behindLabel={behindLabel} />
      </div>
      <TaskRowMenu
        task={task}
        onEditTask={onEditTask}
        onDeleteTask={onDeleteTask}
        onNotToday={onNotToday}
        notTodayBusy={notTodayBusy}
      />
    </>
  );

  const rowClass = 'flex min-w-0 items-start gap-0.5 rounded-xl border pr-1 transition-[background-color,border-color,box-shadow] sm:pl-1';

  return (
    <Card className="praxis-dashboard-card">
      <CardHeader className="p-5 pb-3 sm:p-5 sm:pb-4">
        <SectionHeading
          kicker="Hoje"
          title="Tarefas"
          trailing={
            <span className="text-sm text-muted-foreground tabular-nums" data-testid="today-tasks-open">
              {openToday} {openToday === 1 ? 'aberta' : 'abertas'}
              {completed.length > 0 ? ` · ${completed.length} ${completed.length === 1 ? 'feita' : 'feitas'}` : ''}
            </span>
          }
        />
        {dayTotal > 0 && (
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-2 rail-inset">
            <motion.div
              className="h-full w-full origin-left rounded-full"
              initial={false}
              animate={{ scaleX: Math.max(0, Math.min(1, donePct / 100)) }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              style={{
                transformOrigin: 'left center',
                background: 'linear-gradient(90deg, hsl(var(--domain-ember)), hsl(var(--domain-gold)))',
              }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-4 sm:px-5 sm:pb-5">
        {pending.length === 0 && completed.length === 0 && (
          <div className="space-y-1.5 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              {upcomingOpenCount > 0
                ? `Nenhuma tarefa para hoje · ${upcomingOpenCount} na semana`
                : 'Nenhuma tarefa para hoje.'}
            </p>
            {upcomingOpenCount > 0 && (
              <Link
                to="/habitos-tarefas?tab=tasks&scope=week"
                className="inline-block text-xs font-medium text-primary hover:underline"
              >
                Ver tarefas da semana →
              </Link>
            )}
          </div>
        )}

        {behindPending.length > 0 && (
          <section aria-labelledby="today-tasks-behind" className="space-y-1.5">
            <h3 id="today-tasks-behind" className="px-2 pt-1 text-xs font-medium text-amber-200/90">
              Ficou pra trás · {behindPending.length}
            </h3>
            {behindPending.map((task) => (
              <div
                key={task.id}
                ref={setRowRef(task.id)}
                className={cn(rowClass, 'border-amber-500/15 bg-amber-500/[0.035]')}
              >
                {renderRowBody(task, {
                  // As de hoje já mostram a hora; "desde…" só para dias anteriores.
                  behindLabel: task.date && task.date < today ? formatBehindSince(task, today) : null,
                })}
              </div>
            ))}
          </section>
        )}

        {todayPending.length > 0 && (
          <DragDropContext onDragEnd={handleDragEnd}>
            {behindPending.length > 0 ? (
              <h3 className="px-2 pt-2 text-xs font-medium text-muted-foreground">Hoje · {todayPending.length}</h3>
            ) : null}
            <Droppable droppableId="dashboard-today-pending">
              {(dropProvided) => (
                <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1.5">
                  {todayPending.map((task, index) => (
                    <Draggable
                      key={task.id}
                      draggableId={String(task.id)}
                      index={index}
                      isDragDisabled={reorderBusy}
                    >
                      {(dragProvided, snapshot) => (
                        <div
                          ref={(el) => {
                            dragProvided.innerRef(el);
                            setRowRef(task.id)(el);
                          }}
                          {...dragProvided.draggableProps}
                          style={dragProvided.draggableProps.style}
                          className={cn(
                            rowClass,
                            snapshot.isDragging
                              ? 'z-10 border-domain-gold/30 bg-white/[0.045] shadow-lg shadow-black/20'
                              : 'border-white/[0.055] bg-white/[0.022] hover:border-white/[0.09] hover:bg-white/[0.035]'
                          )}
                        >
                          {renderRowBody(task, { dragHandleProps: dragProvided.dragHandleProps })}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {completed.length > 0 && (
            <div key="completed-heading" className="px-2 pt-3 text-xs font-medium text-domain-wellness/80">
              Concluídas hoje
            </div>
          )}
          {completed.map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="flex min-w-0 items-center gap-0.5 rounded-xl border border-domain-wellness/15 bg-domain-wellness/[0.065] pr-1 sm:pl-1"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                <Checkbox
                  checked
                  onCheckedChange={() => onToggleComplete(task)}
                  aria-label={`Reabrir ${task.title}`}
                  className="h-5 w-5 border-domain-wellness data-[state=checked]:bg-domain-wellness touch-manipulation"
                />
              </span>
              <div className="min-w-0 flex-1 py-2.5">
                <p className="line-clamp-2 break-words text-sm text-domain-wellness/90 line-through">{task.title}</p>
                {task.date && today && task.date < today && (
                  <p className="mt-0.5 text-[11px] text-domain-wellness/75">Limpa hoje</p>
                )}
              </div>
              <CheckCircle2 className="h-5 w-5 shrink-0 text-domain-wellness" aria-hidden />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-lg touch-manipulation text-muted-foreground hover:text-foreground"
                    aria-label={`Opções da tarefa ${task.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => onEditTask?.(task)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDeleteTask?.(task)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
