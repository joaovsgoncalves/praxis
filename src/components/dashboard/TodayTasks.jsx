import React, { useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Timer,
  CheckCircle2,
  Clock,
  AlertTriangle,
  GripVertical,
  Pencil,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CategoryBadge } from '@/lib/categories';
import { sparkFromElement } from '@/lib/celebration';
import TaskRecurrenceBadge from '@/components/habits-tasks/TaskRecurrenceBadge';
import { sortPendingWithOverdueFirst } from '@/lib/taskListFilters';

const priorityStyles = {
  high: 'bg-destructive/15 text-destructive border-destructive/20',
  medium: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  low: 'bg-muted text-muted-foreground border-border',
};

export default function TodayTasks({
  tasks,
  today,
  allTasksForRecurrence,
  onToggleComplete,
  onEditTask,
  onReorderPending,
  reorderBusy = false,
}) {
  const rowRefs = useRef(new Map());
  const recurrencePool = allTasksForRecurrence ?? tasks;
  const isDone = (task) => task.status === 'completed' || task.status === 'done';
  const completedOn = (task) =>
    task.completed_date || String(task.completed_at || task.updated_date || '').slice(0, 10);
  const pending = sortPendingWithOverdueFirst(
    tasks.filter((t) => !isDone(t)),
    today,
  );
  const completed = tasks.filter((t) => isDone(t));
  const overdueCount = pending.filter((t) => t.date && today && t.date < today).length;
  const cleanedOverdueCount = completed.filter(
    (t) => t.date && today && t.date < today && completedOn(t) === today
  ).length;
  const donePct = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  const handleComplete = (task) => {
    if (!isDone(task)) {
      sparkFromElement(rowRefs.current.get(task.id), 'ember');
    }
    onToggleComplete?.(task);
  };

  const handleDragEnd = (result) => {
    if (!result.destination || reorderBusy) return;
    onReorderPending?.(result.source.index, result.destination.index);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Tarefas de Hoje</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {overdueCount > 0 && (
              <Badge
                variant="outline"
                className="border-destructive/30 bg-destructive/10 text-[10px] text-destructive"
              >
                {overdueCount} atrasada{overdueCount === 1 ? '' : 's'}
              </Badge>
            )}
            {cleanedOverdueCount > 0 && (
              <Badge
                variant="outline"
                className="border-green-500/30 bg-green-500/10 text-[10px] text-green-400"
              >
                {cleanedOverdueCount} limpa{cleanedOverdueCount === 1 ? '' : 's'} hoje
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {completed.length}/{tasks.length} concluídas
            </span>
          </div>
        </div>
        {tasks.length > 0 && (
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-2 rail-inset">
            <motion.div
              className="h-full rounded-full"
              initial={false}
              animate={{ width: `${donePct}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              style={{
                background: 'linear-gradient(90deg, hsl(var(--domain-ember)), hsl(var(--domain-gold)))',
              }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {pending.length === 0 && completed.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground py-4 text-center"
            >
              Nenhuma tarefa para hoje. Que tal capturar uma por voz?
            </motion.p>
          )}
          {pending.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Pendentes</div>
              <p className="text-[10px] text-muted-foreground/80">Segure ⋮⋮ e arraste para ordenar</p>
            </div>
          )}
        </AnimatePresence>

        {pending.length > 0 && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="dashboard-today-pending">
              {(dropProvided) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className="space-y-3"
                >
                  {pending.map((task, index) => (
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
                            if (el) rowRefs.current.set(task.id, el);
                            else rowRefs.current.delete(task.id);
                          }}
                          {...dragProvided.draggableProps}
                          style={dragProvided.draggableProps.style}
                          className={cn(
                            'flex flex-col gap-3 p-4 rounded-2xl bg-secondary/45 border transition-colors sm:flex-row sm:items-start',
                            snapshot.isDragging
                              ? 'border-domain-ember/40 shadow-lg shadow-black/20 z-10'
                              : 'border-transparent hover:bg-secondary/80 hover:border-domain-ember/20'
                          )}
                        >
                          <div className="flex items-start gap-2 flex-1 min-w-0 w-full">
                            <button
                              type="button"
                              className="mt-1.5 shrink-0 rounded-lg p-1 text-muted-foreground touch-manipulation hover:bg-black/20 hover:text-foreground"
                              aria-label="Arrastar para reordenar"
                              {...dragProvided.dragHandleProps}
                            >
                              <GripVertical className="h-5 w-5" />
                            </button>
                            <Checkbox
                              checked={false}
                              onCheckedChange={() => handleComplete(task)}
                              className="mt-1 h-6 w-6 shrink-0 border-muted-foreground/40 touch-manipulation"
                            />
                            <div className="flex-1 min-w-0 space-y-2">
                              <p className="text-base font-semibold leading-snug break-words">{task.title}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <CategoryBadge category={task.category} />
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-xs border px-2.5 py-1',
                                    priorityStyles[task.priority || 'medium']
                                  )}
                                >
                                  {task.priority || 'medium'}
                                </Badge>
                                <TaskRecurrenceBadge task={task} allTasks={recurrencePool} />
                              </div>
                              {task.time && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground font-medium">{task.time}</span>
                                </div>
                              )}
                              {task.date && today && task.date < today && (
                                <div className="flex items-center gap-1 text-destructive">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span className="text-xs font-medium">Atrasada desde {task.date}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex w-full gap-2 sm:w-auto sm:flex-col sm:items-stretch shrink-0">
                            <Button
                              type="button"
                              size="default"
                              variant="secondary"
                              className="gap-2 h-11 flex-1 touch-manipulation"
                              onClick={() => onEditTask?.(task)}
                            >
                              <Pencil className="w-4 h-4" />
                              Editar
                            </Button>
                            <Link to={`/foco?taskId=${task.id}`} className="flex-1 sm:flex-none">
                              <Button
                                type="button"
                                size="default"
                                variant="outline"
                                className="gap-2 h-11 w-full sm:h-9 sm:w-auto touch-manipulation"
                              >
                                <Timer className="w-4 h-4" />
                                Iniciar foco
                              </Button>
                            </Link>
                          </div>
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
            <div className="text-xs uppercase tracking-[0.2em] text-green-400/80 px-1 pt-4">
              Concluídas hoje
            </div>
          )}
          {completed.map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-4 p-4 rounded-2xl bg-domain-wellness/10 border border-domain-wellness/25"
            >
              <Checkbox
                checked
                onCheckedChange={() => onToggleComplete(task)}
                className="h-6 w-6 border-domain-wellness data-[state=checked]:bg-domain-wellness touch-manipulation"
              />
              <div className="min-w-0 flex-1">
                <p className="text-base text-domain-wellness line-through break-words">{task.title}</p>
                {task.date && today && task.date < today && (
                  <p className="text-[11px] text-green-400/80 mt-0.5">Limpa hoje · era de {task.date}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 touch-manipulation"
                aria-label="Editar tarefa concluída"
                onClick={() => onEditTask?.(task)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <CategoryBadge category={task.category} className="opacity-60 hidden sm:flex" />
              <CheckCircle2 className="w-5 h-5 text-domain-wellness shrink-0" />
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}