import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { BOARD_COLUMNS, tasksForBoardColumn, moveTaskToColumn } from '@/lib/taskLenses';
import TaskBoardCard from './TaskBoardCard';
import { cn } from '@/lib/utils';

const COLUMN_CONFIG = {
  inbox: {
    id: 'inbox',
    title: 'Caixa',
    emptyText: 'Nenhuma tarefa na caixa',
    dotClass: 'bg-muted-foreground/60',
  },
  todo: {
    id: 'todo',
    title: 'A fazer',
    emptyText: 'Nenhuma tarefa a fazer',
    dotClass: 'bg-domain-ember',
  },
  doing: {
    id: 'doing',
    title: 'Andamento',
    emptyText: 'Nenhuma em andamento',
    dotClass: 'bg-domain-gold',
  },
  done: {
    id: 'done',
    title: 'Feito',
    emptyText: 'Nenhuma concluída hoje',
    dotClass: 'bg-domain-wellness',
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

export default function TaskBoard({
  tasks = [],
  allTasks = [],
  today,
  onUpdateTask,
  onToggleComplete,
  onEditTask,
  onDeleteTask,
  onNotToday,
}) {
  const isDesktop = useIsDesktop();
  const isDragDisabled = !isDesktop;

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const task = tasks.find((t) => String(t.id) === String(draggableId));
    if (!task) return;

    const patch = moveTaskToColumn(task, destination.droppableId, today);
    if (Object.keys(patch).length === 0) return;
    onUpdateTask?.(task.id, patch);
  };

  const handleMoveToColumn = (task, targetColumn) => {
    const patch = moveTaskToColumn(task, targetColumn, today);
    if (Object.keys(patch).length === 0) return;
    onUpdateTask?.(task.id, patch);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="praxis-scroll-x flex gap-3 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory">
        {BOARD_COLUMNS.map((columnId) => {
          const colConfig = COLUMN_CONFIG[columnId];
          const columnTasks = tasksForBoardColumn(tasks, columnId, today);

          return (
            <div
              key={columnId}
              className="flex w-[min(280px,82vw)] shrink-0 flex-col rounded-2xl border border-white/[0.06] bg-card/30 p-3 snap-start xl:min-w-[240px] xl:w-auto xl:flex-1"
            >
              <div className="flex items-center justify-between px-1 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', colConfig.dotClass)} />
                  <span className="text-xs font-semibold tracking-wide text-foreground">
                    {colConfig.title}
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums text-muted-foreground/70">
                  {columnTasks.length}
                </span>
              </div>

              <Droppable droppableId={columnId} isDropDisabled={isDragDisabled}>
                {(droppableProvided, droppableSnapshot) => (
                  <div
                    ref={droppableProvided.innerRef}
                    {...droppableProvided.droppableProps}
                    className={cn(
                      'flex-1 min-h-[140px] space-y-2 rounded-xl p-1 transition-colors',
                      droppableSnapshot.isDraggingOver && 'bg-white/[0.02] ring-1 ring-white/10'
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
                            allTasks={allTasks.length > 0 ? allTasks : tasks}
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
                    {columnTasks.length === 0 && !droppableSnapshot.isDraggingOver && (
                      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/[0.05] p-3 text-center">
                        <p className="text-xs text-muted-foreground/50">{colConfig.emptyText}</p>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
