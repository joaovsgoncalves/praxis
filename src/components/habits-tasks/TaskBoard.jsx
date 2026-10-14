import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  BOARD_COLUMNS,
  sortedBoardColumn,
  moveTaskToColumn,
  reorderColumnIds,
  applyBoardMove,
} from '@/lib/taskLenses';
import TaskBoardCard from './TaskBoardCard';
import { SectionHeader, PraxisEmptyState } from '@/components/layout/PraxisPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Inbox,
  Circle,
  Timer,
  CheckCircle2,
  MoreHorizontal,
  Plus,
  PanelLeftClose,
  SquarePen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const COLLAPSED_STORAGE_KEY = 'praxis:board:collapsed';

const COLUMN_CONFIG = {
  inbox: {
    title: 'Caixa',
    icon: Inbox,
    iconClass: 'text-domain-sky',
    lineClass: 'bg-domain-sky/55',
    emptyTitle: 'Caixa vazia',
    emptyText: 'Ideias soltas e tarefas sem data caem aqui.',
  },
  todo: {
    title: 'A fazer',
    icon: Circle,
    iconClass: 'text-stone-300',
    lineClass: 'bg-stone-300/35',
    emptyTitle: 'Nada a fazer',
    emptyText: 'Arraste da Caixa ou adicione abaixo.',
  },
  doing: {
    title: 'Em andamento',
    icon: Timer,
    iconClass: 'text-domain-gold',
    lineClass: 'bg-domain-gold/55',
    emptyTitle: 'Nada em andamento',
    emptyText: 'Puxe uma tarefa quando começar.',
  },
  done: {
    title: 'Feito',
    icon: CheckCircle2,
    iconClass: 'text-domain-wellness',
    lineClass: 'bg-domain-wellness/55',
    emptyTitle: 'Nada feito hoje ainda',
    emptyText: 'O que você concluir hoje aparece aqui.',
  },
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      setIsDesktop(mql.matches);
    };
    mql.addEventListener('change', onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readCollapsed() {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => BOARD_COLUMNS.includes(id)) : [];
  } catch {
    return [];
  }
}

function useCollapsedColumns() {
  const [collapsed, setCollapsed] = useState(() => (typeof window === 'undefined' ? [] : readCollapsed()));

  const toggle = useCallback((columnId) => {
    setCollapsed((prev) => {
      const next = prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId];
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage indisponível (modo privado): o estado vale só nesta sessão.
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}

/** Pé da coluna: botão que vira input. Enter cria e mantém aberto; Esc fecha. */
function InlineAddTask({ columnTitle, open, onOpenChange, onCreate }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setValue('');
    onOpenChange(false);
  };

  const submit = async () => {
    const title = value.trim();
    if (!title || pending) return;
    setPending(true);
    try {
      await onCreate(title);
      setValue('');
    } catch {
      // erro já avisado pelo toast da mutation; o texto fica pra tentar de novo
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="praxis-touch-target flex w-full items-center gap-2 rounded-[10px] px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Adicionar tarefa
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        onBlur={() => {
          if (!value.trim() && !pending) close();
        }}
        placeholder="Título da tarefa"
        aria-label={'Nova tarefa em ' + columnTitle}
        aria-busy={pending || undefined}
        maxLength={240}
        className="h-10 rounded-[10px] border-white/10 bg-card text-sm placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
      />
      <p className="px-1 text-[11px] text-muted-foreground">
        {pending ? 'Salvando…' : 'Enter adiciona · Esc fecha'}
      </p>
    </div>
  );
}

function CollapsedColumn({ columnId, count, onExpand }) {
  const config = COLUMN_CONFIG[columnId];
  const Icon = config.icon;
  return (
    <button
      type="button"
      onClick={() => onExpand(columnId)}
      aria-label={'Expandir coluna ' + config.title + ', ' + count + (count === 1 ? ' tarefa' : ' tarefas')}
      title={'Expandir ' + config.title}
      className="praxis-panel relative flex min-h-[16rem] w-full flex-col items-center gap-3 overflow-hidden rounded-[18px] bg-card/60 px-1 py-3 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span aria-hidden className={cn('absolute inset-x-3 top-0 h-px', config.lineClass)} />
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)]">
        <Icon className={cn('h-3.5 w-3.5', config.iconClass)} aria-hidden />
      </span>
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/[0.06] px-1.5 font-mono text-xs font-medium tabular-nums text-secondary-foreground">
        {count}
      </span>
      <span className="praxis-title rotate-180 text-sm font-semibold tracking-[-0.01em] text-foreground [writing-mode:vertical-rl]">
        {config.title}
      </span>
    </button>
  );
}

export default function TaskBoard({
  tasks = [],
  today,
  onMoveTask,
  onCreateInColumn,
  onToggleComplete,
  onEditTask,
  onDeleteTask,
  onNotToday,
  onOpenCreateTask,
}) {
  const isDesktop = useIsDesktop();
  const isDragDisabled = !isDesktop;
  const [collapsedIds, toggleCollapsed] = useCollapsedColumns();
  const [addingIn, setAddingIn] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Movimento recém-solto: aplicado já no mesmo frame do drop, até o cache (otimista) chegar.
  const [pendingMove, setPendingMove] = useState(null);
  const trackRef = useRef(null);
  const columnRefs = useRef({});
  // Ação do menu da coluna que decide pra onde o foco vai (o Radix devolveria pro gatilho).
  const menuFocusRef = useRef(null);

  const handleColumnMenuCloseFocus = (event, columnId) => {
    const next = menuFocusRef.current;
    menuFocusRef.current = null;
    if (!next || next.columnId !== columnId) return;
    event.preventDefault();
    if (next.type === 'collapsed') {
      requestAnimationFrame(() => {
        columnRefs.current[next.columnId]?.querySelector('button')?.focus();
      });
    }
  };

  useEffect(() => {
    setPendingMove(null);
  }, [tasks]);

  const boardTasks = useMemo(
    () => (pendingMove ? applyBoardMove(tasks, pendingMove, today) : tasks),
    [tasks, pendingMove, today]
  );

  const columns = useMemo(() => {
    const map = {};
    BOARD_COLUMNS.forEach((columnId) => {
      map[columnId] = sortedBoardColumn(boardTasks, columnId, today);
    });
    return map;
  }, [boardTasks, today]);

  const isCollapsed = (columnId) => isDesktop && collapsedIds.includes(columnId);

  const gridTemplateColumns = BOARD_COLUMNS.map((columnId) =>
    isCollapsed(columnId) ? '3.25rem' : 'minmax(15.5rem, 1fr)'
  ).join(' ');

  const commitMove = (task, targetColumn, targetIndex, changedColumn) => {
    const orderedIds = reorderColumnIds(columns[targetColumn], task.id, targetIndex);
    const patch = changedColumn ? moveTaskToColumn(task, targetColumn, today) : {};
    const move = { taskId: task.id, patch, orderedIds };
    setPendingMove(move);
    onMoveTask?.({ task, patch, orderedIds });
  };

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const task = boardTasks.find((t) => String(t.id) === String(draggableId));
    if (!task) return;

    commitMove(task, destination.droppableId, destination.index, source.droppableId !== destination.droppableId);
  };

  const handleMoveToColumn = (task, targetColumn) => {
    commitMove(task, targetColumn, Infinity, true);
  };

  // Indicador mobile: qual coluna está à vista no trilho.
  const handleTrackScroll = () => {
    const track = trackRef.current;
    if (!track || isDesktop) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    BOARD_COLUMNS.forEach((columnId, index) => {
      const el = columnRefs.current[columnId];
      if (!el) return;
      const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setActiveIndex((prev) => (prev === nearest ? prev : nearest));
  };

  const scrollToColumn = (columnId) => {
    const track = trackRef.current;
    const el = columnRefs.current[columnId];
    if (!track || !el) return;
    track.scrollTo({ left: el.offsetLeft, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <div className="min-w-0 space-y-3">
      {/* Mobile: abas pequenas que mostram e levam à coluna visível */}
      <nav aria-label="Colunas do quadro" className="praxis-scroll-x flex gap-1 p-0.5 lg:hidden">
        {BOARD_COLUMNS.map((columnId, index) => {
          const config = COLUMN_CONFIG[columnId];
          const Icon = config.icon;
          const active = activeIndex === index;
          return (
            <button
              key={columnId}
              type="button"
              onClick={() => scrollToColumn(columnId)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-white/[0.07] text-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.09)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', active ? config.iconClass : 'opacity-80')} aria-hidden />
              {config.title}
              <span className="font-mono tabular-nums opacity-80">{columns[columnId].length}</span>
            </button>
          );
        })}
      </nav>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          ref={trackRef}
          onScroll={handleTrackScroll}
          style={{ gridTemplateColumns }}
          className={cn(
            'praxis-scroll-x relative flex snap-x snap-mandatory items-start gap-3 pb-4 pt-1',
            'lg:grid lg:snap-none lg:gap-3.5'
          )}
        >
          {BOARD_COLUMNS.map((columnId) => {
            const config = COLUMN_CONFIG[columnId];
            const columnTasks = columns[columnId];
            const collapsed = isCollapsed(columnId);

            if (collapsed) {
              return (
                <div key={columnId} ref={(el) => { columnRefs.current[columnId] = el; }} className="min-w-0">
                  <CollapsedColumn columnId={columnId} count={columnTasks.length} onExpand={toggleCollapsed} />
                </div>
              );
            }

            return (
              <section
                key={columnId}
                ref={(el) => { columnRefs.current[columnId] = el; }}
                aria-label={config.title}
                className="praxis-panel relative flex w-[86vw] max-w-[24rem] shrink-0 snap-start flex-col rounded-[18px] bg-card/60 p-2 lg:w-auto lg:max-w-none lg:min-w-0"
              >
                <span aria-hidden className={cn('absolute inset-x-4 top-0 h-px', config.lineClass)} />

                <SectionHeader
                  size="sm"
                  as="h3"
                  icon={config.icon}
                  iconClassName={config.iconClass}
                  title={config.title}
                  count={columnTasks.length}
                  className="px-1.5 pb-2.5 pt-1.5"
                  action={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                          aria-label={'Opções da coluna ' + config.title}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52" onCloseAutoFocus={(event) => handleColumnMenuCloseFocus(event, columnId)}>
                        <DropdownMenuItem
                          onClick={() => {
                            menuFocusRef.current = { type: 'inline', columnId };
                            setAddingIn(columnId);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Adicionar tarefa
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpenCreateTask?.(columnId)}>
                          <SquarePen className="mr-2 h-4 w-4" /> Nova com detalhes
                        </DropdownMenuItem>
                        {isDesktop ? (
                          <DropdownMenuItem
                            onClick={() => {
                              menuFocusRef.current = { type: 'collapsed', columnId };
                              toggleCollapsed(columnId);
                            }}
                          >
                            <PanelLeftClose className="mr-2 h-4 w-4" /> Recolher coluna
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />

                <Droppable droppableId={columnId} isDropDisabled={isDragDisabled}>
                  {(droppableProvided, droppableSnapshot) => (
                    <div
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                      className={cn(
                        'min-h-[7rem] flex-1 rounded-[12px] px-0.5 pt-0.5 transition-colors duration-150',
                        droppableSnapshot.isDraggingOver && 'bg-white/[0.025] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08)]'
                      )}
                    >
                      {columnTasks.map((task, index) => (
                        <Draggable
                          key={task.id}
                          draggableId={String(task.id)}
                          index={index}
                          isDragDisabled={isDragDisabled}
                        >
                          {(draggableProvided, draggableSnapshot) => (
                            <TaskBoardCard
                              task={task}
                              today={today}
                              currentColumn={columnId}
                              isDragDisabled={isDragDisabled}
                              dragProvided={draggableProvided}
                              snapshot={draggableSnapshot}
                              onToggleComplete={onToggleComplete}
                              onMoveToColumn={handleMoveToColumn}
                              onEdit={onEditTask}
                              onDelete={onDeleteTask}
                              onNotToday={onNotToday}
                            />
                          )}
                        </Draggable>
                      ))}
                      {droppableProvided.placeholder}
                      {columnTasks.length === 0 && !droppableSnapshot.isDraggingOver && addingIn !== columnId ? (
                        <PraxisEmptyState
                          compact
                          icon={config.icon}
                          title={config.emptyTitle}
                          description={config.emptyText}
                          className="mb-2 border-white/[0.07] bg-transparent"
                        />
                      ) : null}
                    </div>
                  )}
                </Droppable>

                <div className="pt-1">
                  <InlineAddTask
                    columnTitle={config.title}
                    open={addingIn === columnId}
                    onOpenChange={(open) => setAddingIn(open ? columnId : null)}
                    onCreate={(title) => onCreateInColumn?.(columnId, title)}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
