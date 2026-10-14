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
  Clock,
  Hourglass,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Trash2,
  CalendarClock,
  ArrowRightLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isTaskOpen, cleanPriorityPrefix } from '@/lib/tasks';
import { fortalezaAddDays } from '@/lib/dates';
import { CATEGORIES } from '@/lib/categories';
import { BOARD_COLUMNS } from '@/lib/taskLenses';

const PRIORITY_CONFIG = {
  high: { label: 'Alta', barClass: 'bg-rose-400' },
  medium: { label: 'Média', barClass: 'bg-domain-gold/80' },
  low: { label: 'Baixa', barClass: 'bg-stone-400/60' },
};

export const BOARD_COLUMN_NAMES = {
  inbox: 'Caixa',
  todo: 'A fazer',
  doing: 'Em andamento',
  done: 'Feito',
};

function formatBoardRelativeDate(dateStr, timeStr, today) {
  const cleanTime = timeStr ? String(timeStr).slice(0, 5) : null;
  if (!dateStr) {
    return cleanTime || null;
  }

  let dateLabel = null;
  if (dateStr === today) {
    dateLabel = 'Hoje';
  } else if (dateStr === fortalezaAddDays(today, 1)) {
    dateLabel = 'Amanhã';
  } else if (dateStr === fortalezaAddDays(today, -1)) {
    dateLabel = 'Ontem';
  } else {
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);
    const [ty, tm, td] = today.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    const diffDays = Math.round((targetDate - todayDate) / (1000 * 60 * 60 * 24));

    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    if (diffDays > 1 && diffDays < 7) {
      dateLabel = weekdays[targetDate.getDay()];
    } else if (diffDays < -1 && diffDays > -7) {
      dateLabel = weekdays[targetDate.getDay()];
    } else {
      dateLabel = String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0');
    }
  }

  if (dateLabel && cleanTime) {
    return dateLabel + ', ' + cleanTime;
  }
  return dateLabel || cleanTime || null;
}

function formatDuration(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (total < 60) return total + ' min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? h + 'h' + String(m).padStart(2, '0') : h + 'h';
}

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
  const showNotToday =
    isTaskOpen(task) &&
    task.category !== 'ideias' &&
    (!task.date || task.date <= today);

  const title = cleanPriorityPrefix(task.title);
  const relativeDateText = formatBoardRelativeDate(task.date, task.time, today);
  const isOverdue = !isDone && Boolean(task.date) && task.date < today;
  const durationText = formatDuration(task.duration_minutes);
  const priority = PRIORITY_CONFIG[task.priority] ? task.priority : 'medium';
  const priorityInfo = PRIORITY_CONFIG[priority];
  const category = CATEGORIES[task.category];
  const checklistTotal = Number(task.checklist_total) || 0;
  const checklistDone = Math.min(Number(task.checklist_done) || 0, checklistTotal);
  const checklistComplete = checklistTotal > 0 && checklistDone === checklistTotal;
  const isDragging = Boolean(snapshot?.isDragging && !snapshot?.isDropAnimating);

  return (
    <div
      ref={dragProvided?.innerRef}
      {...dragProvided?.draggableProps}
      {...(!isDragDisabled ? dragProvided?.dragHandleProps : {})}
      style={dragProvided?.draggableProps?.style}
      aria-label={!isDragDisabled ? title + ', ' + BOARD_COLUMN_NAMES[currentColumn] : undefined}
      className={cn(
        'praxis-board-handle group/card pb-2 outline-none',
        !isDragDisabled && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div
        data-done={isDone ? 'true' : 'false'}
        data-dragging={isDragging ? 'true' : 'false'}
        className="praxis-board-card relative flex min-w-0 select-none flex-col gap-2 rounded-[10px] px-3 pb-2.5 pt-3 group-focus-visible/card:ring-2 group-focus-visible/card:ring-ring group-focus-visible/card:ring-offset-2 group-focus-visible/card:ring-offset-background"
      >
        {/* Régua de prioridade no topo — cor + texto acessível */}
        <span
          aria-hidden
          className={cn('absolute left-3 top-0 h-[3px] w-7 rounded-b-full', isDone ? 'bg-domain-wellness/50' : priorityInfo.barClass)}
        />

        <div className="flex min-w-0 items-start gap-2.5">
          <Checkbox
            checked={isDone}
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
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 pl-[26px] text-xs leading-none text-muted-foreground">
          {category ? (
            <span
              className={cn(
                'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-[3px] text-[11px] font-medium',
                category.color
              )}
            >
              <span aria-hidden>{category.emoji}</span>
              <span className="truncate">{category.label}</span>
            </span>
          ) : null}

          {priority === 'high' && !isDone ? (
            <span className="font-medium text-rose-300" aria-hidden>
              Alta
            </span>
          ) : null}

          {relativeDateText ? (
            <span className={cn('inline-flex shrink-0 items-center gap-1 tabular-nums', isOverdue && 'text-rose-300')}>
              <Clock className="h-3 w-3 opacity-80" aria-hidden />
              <span>
                {isOverdue ? <span className="sr-only">Atrasada: </span> : null}
                {relativeDateText}
              </span>
            </span>
          ) : null}

          {durationText ? (
            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
              <Hourglass className="h-3 w-3 opacity-80" aria-hidden />
              <span>
                <span className="sr-only">Duração: </span>
                {durationText}
              </span>
            </span>
          ) : null}

          {checklistTotal > 0 ? (
            <span
              className={cn('inline-flex shrink-0 items-center gap-1.5 tabular-nums', checklistComplete && 'text-domain-wellness')}
              aria-label={'Checklist: ' + checklistDone + ' de ' + checklistTotal}
            >
              <ListChecks className="h-3 w-3 opacity-80" aria-hidden />
              <span aria-hidden>
                {checklistDone}/{checklistTotal}
              </span>
              <span aria-hidden className="h-1 w-8 overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  className={cn(
                    'block h-full w-full origin-left rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none',
                    checklistComplete ? 'bg-domain-wellness' : 'bg-domain-gold/80'
                  )}
                  style={{ transform: 'scaleX(' + checklistDone / checklistTotal + ')' }}
                />
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
