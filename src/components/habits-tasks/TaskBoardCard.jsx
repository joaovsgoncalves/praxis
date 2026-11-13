import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
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
  MoreHorizontal,
  Pencil,
  Trash2,
  CalendarClock,
  ArrowRightLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isTaskOpen, cleanPriorityPrefix } from '@/lib/tasks';
import { BOARD_COLUMNS } from '@/lib/taskLenses';
import { useTaskBusy } from '@/lib/taskBusy';
import { PRIORITY_CONFIG, TaskCardMeta, TaskPriorityRuler, taskPriorityKey } from './TaskCardParts';

export const BOARD_COLUMN_NAMES = {
  inbox: 'Caixa',
  todo: 'A fazer',
  doing: 'Em andamento',
  done: 'Feito',
};

export default function TaskBoardCard({
  task,
  today,
  currentColumn,
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
  const busy = Boolean(useTaskBusy(task.id));
  const showNotToday =
    isTaskOpen(task) &&
    task.category !== 'ideias' &&
    (!task.date || task.date <= today);

  const title = cleanPriorityPrefix(task.title);
  const priorityInfo = PRIORITY_CONFIG[taskPriorityKey(task)];
  const isDragging = Boolean(snapshot?.isDragging && !snapshot?.isDropAnimating);

  return (
    <div
      ref={dragProvided?.innerRef}
      {...dragProvided?.draggableProps}
      {...(!isDragDisabled ? dragProvided?.dragHandleProps : {})}
      style={dragProvided?.draggableProps?.style}
      aria-label={!isDragDisabled ? title + ', ' + BOARD_COLUMN_NAMES[currentColumn] + '. Enter abre os detalhes' : undefined}
      onKeyDown={(e) => {
        // Espaço continua com o arraste do teclado; Enter abre o detalhe.
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onEdit?.(task);
          return;
        }
        dragProvided?.dragHandleProps?.onKeyDown?.(e);
      }}
      className={cn(
        'praxis-board-handle group/card pb-2 outline-none',
        !isDragDisabled && 'cursor-grab active:cursor-grabbing'
      )}
    >
      {/* Clique no card abre o detalhe (o pangea não dispara clique depois de arrastar). */}
      <div
        data-done={isDone ? 'true' : 'false'}
        data-dragging={isDragging ? 'true' : 'false'}
        onClick={() => onEdit?.(task)}
        className={cn(
          'praxis-board-card relative flex min-w-0 select-none flex-col gap-2 rounded-[10px] px-3 pb-2.5 pt-3 group-focus-visible/card:ring-2 group-focus-visible/card:ring-ring group-focus-visible/card:ring-offset-2 group-focus-visible/card:ring-offset-background',
          isDragDisabled && 'cursor-pointer'
        )}
      >
        <TaskPriorityRuler task={task} />

        <div className="flex min-w-0 items-start gap-2.5">
          <Checkbox
            checked={isDone}
            disabled={busy}
            aria-busy={busy || undefined}
            onCheckedChange={() => onToggleComplete?.(task)}
            className={cn(
              'mt-[3px] h-4 w-4 shrink-0 rounded-[5px] border-white/25 touch-manipulation',
              'data-[state=checked]:border-domain-wellness data-[state=checked]:bg-domain-wellness data-[state=checked]:text-black'
            )}
            aria-label={(isDone ? 'Reabrir ' : 'Concluir ') + title}
            onClick={(e) => e.stopPropagation()}
          />

          <p
            className={cn(
              'min-w-0 flex-1 break-words text-sm font-medium leading-snug line-clamp-3 [text-wrap:pretty]',
              isDone ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'text-stone-100'
            )}
            title={title}
          >
            {title}
            <span className="sr-only">{', prioridade ' + priorityInfo.label.toLowerCase()}</span>
          </p>

          <div className="praxis-board-actions -mr-1.5 -mt-1 flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground touch-manipulation lg:h-7 lg:w-7"
              onClick={() => onEdit?.(task)}
              aria-label={'Editar ' + title}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground touch-manipulation lg:h-7 lg:w-7"
                  aria-label={'Opções de ' + title}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowRightLeft className="mr-2 h-4 w-4" /> Mover para
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    {BOARD_COLUMNS.map((colKey) => (
                      <DropdownMenuItem
                        key={colKey}
                        disabled={currentColumn === colKey}
                        onClick={() => onMoveToColumn?.(task, colKey)}
                      >
                        {BOARD_COLUMN_NAMES[colKey]}
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
        </div>

        {/* Meta: área, data/hora, duração, checklist */}
        <TaskCardMeta task={task} today={today} className="pl-[26px]" />
      </div>
    </div>
  );
}
