import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Clock,
  Calendar,
  MoreHorizontal,
  Pencil,
  Trash2,
  CalendarClock,
  ArrowRightLeft,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryBadge } from '@/lib/categories';
import TaskRecurrenceBadge from '@/components/habits-tasks/TaskRecurrenceBadge';
import { isTaskOverdue } from '@/lib/taskListFilters';
import { cleanPriorityPrefix, isTaskOpen } from '@/lib/tasks';

const priorityStyles = {
  high: 'bg-destructive/15 text-destructive border-destructive/20',
  medium: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const priorityLabels = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const COLUMN_NAMES = {
  inbox: 'Caixa',
  todo: 'A fazer',
  doing: 'Andamento',
  done: 'Feito',
};

export default function TaskBoardCard({
  task,
  today,
  currentColumn,
  allTasks,
  isDragDisabled = false,
  dragProvided,
  snapshot,
  onToggleComplete,
  onMoveToColumn,
  onEdit,
  onDelete,
  onNotToday,
}) {
  const isDone = task.status === 'completed' || task.status === 'done';
  const showNotToday =
    isTaskOpen(task) &&
    task.category !== 'ideias' &&
    (!task.date || task.date <= today);

  return (
    <div
      ref={dragProvided?.innerRef}
      {...dragProvided?.draggableProps}
      style={dragProvided?.draggableProps?.style}
      className={cn(
        'group relative flex flex-col gap-2 rounded-xl border p-3 transition-[background-color,border-color,box-shadow]',
        snapshot?.isDragging
          ? 'z-50 border-domain-gold/40 bg-card shadow-xl shadow-black/40 ring-1 ring-domain-gold/30'
          : 'border-white/[0.06] bg-card/60 hover:border-white/[0.12] hover:bg-card/80',
        isDone && 'opacity-70'
      )}
    >
      <div className="flex items-start gap-2">
        {!isDragDisabled && dragProvided?.dragHandleProps && (
          <button
            type="button"
            className="mt-0.5 -ml-1 shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing touch-manipulation"
            aria-label="Arrastar cartão"
            {...dragProvided.dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <Checkbox
          checked={isDone}
          onCheckedChange={() => onToggleComplete?.(task)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded touch-manipulation"
          aria-label={`Completar ${cleanPriorityPrefix(task.title)}`}
        />

        <p
          className={cn(
            'flex-1 min-w-0 text-sm font-medium leading-snug break-words',
            isDone ? 'line-through text-muted-foreground' : 'text-foreground'
          )}
        >
          {cleanPriorityPrefix(task.title)}
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 -mr-1 -mt-1 shrink-0 rounded-lg text-muted-foreground/60 hover:text-foreground touch-manipulation"
              aria-label={`Opções de ${cleanPriorityPrefix(task.title)}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft className="mr-2 h-4 w-4" /> Mover para
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-40">
                {['inbox', 'todo', 'doing', 'done'].map((colKey) => (
                  <DropdownMenuItem
                    key={colKey}
                    disabled={currentColumn === colKey}
                    onClick={() => onMoveToColumn?.(task, colKey)}
                  >
                    {COLUMN_NAMES[colKey]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit?.(task)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            {showNotToday && onNotToday ? (
              <DropdownMenuItem onClick={() => onNotToday(task)}>
                <CalendarClock className="mr-2 h-4 w-4" /> Não hoje
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete?.(task)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Badge
          variant="outline"
          className={cn(
            'border px-1.5 py-0 text-[10px]',
            priorityStyles[task.priority || 'medium']
          )}
        >
          {priorityLabels[task.priority || 'medium']}
        </Badge>

        <CategoryBadge category={task.category} className="text-[10px]" />
        <TaskRecurrenceBadge task={task} allTasks={allTasks} className="shrink-0" />

        {isTaskOverdue(task, today) && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
            Atrasada
          </Badge>
        )}

        {task.time && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
            <Clock className="h-3 w-3" />
            {String(task.time).slice(0, 5)}
          </span>
        )}

        {task.date && currentColumn !== 'inbox' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
            <Calendar className="h-3 w-3" />
            {task.date}
          </span>
        )}
      </div>
    </div>
  );
}
