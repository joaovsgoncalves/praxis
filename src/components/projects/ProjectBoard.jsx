import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import {
  PROJECT_COLUMNS,
  PROJECT_COLUMN_LABELS,
  PROJECT_COLUMN_EMPTY,
} from '@/lib/projects';
import ProjectCard from './ProjectCard';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export default function ProjectBoard({
  projects = [],
  onMoveToColumn,
  onToggleFocus,
  onOpen,
}) {
  const isDesktop = useIsDesktop();
  const isDragDisabled = !isDesktop;
  const [dragging, setDragging] = useState(false);

  const visibleColumns = useMemo(() => {
    if (dragging) return PROJECT_COLUMNS;
    const nonEmpty = PROJECT_COLUMNS.filter((columnId) => projects.some((item) => item.column === columnId));
    return nonEmpty.length ? nonEmpty : PROJECT_COLUMNS.slice(0, 1);
  }, [dragging, projects]);

  const handleDragEnd = (result) => {
    setDragging(false);
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const project = projects.find((item) => String(item.id) === String(draggableId));
    if (!project) return;
    onMoveToColumn?.(project, destination.droppableId);
  };

  return (
    <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={handleDragEnd}>
      <div className="praxis-scroll-x flex gap-3 overflow-x-auto pb-4 pt-1 xl:overflow-visible">
        {visibleColumns.map((columnId) => {
          const columnProjects = projects.filter((item) => item.column === columnId);

          return (
            <div
              key={columnId}
              className="flex w-[min(280px,85vw)] shrink-0 min-w-[240px] flex-col rounded-2xl border border-white/[0.06] bg-[#12151c]/90 p-3 xl:min-w-0 xl:flex-1"
            >
              <div className="flex items-center gap-2 px-1 pb-3">
                <span className="text-sm font-semibold tracking-tight text-stone-100">
                  {PROJECT_COLUMN_LABELS[columnId]}
                </span>
                <span className="rounded-md bg-stone-800/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-stone-400">
                  {columnProjects.length}
                </span>
              </div>

              <Droppable droppableId={columnId} isDropDisabled={isDragDisabled}>
                {(droppableProvided, droppableSnapshot) => (
                  <div
                    ref={droppableProvided.innerRef}
                    {...droppableProvided.droppableProps}
                    className={cn(
                      'min-h-[120px] flex-1 space-y-2 rounded-xl p-0.5 transition-colors',
                      droppableSnapshot.isDraggingOver && 'bg-white/[0.02] ring-1 ring-white/10',
                    )}
                  >
                    {columnProjects.map((project, index) => (
                      <Draggable
                        key={project.id}
                        draggableId={String(project.id)}
                        index={index}
                        isDragDisabled={isDragDisabled}
                      >
                        {(draggableProvided, draggableSnapshot) => (
                          <ProjectCard
                            project={project}
                            currentColumn={columnId}
                            isDragDisabled={isDragDisabled}
                            dragProvided={draggableProvided}
                            snapshot={draggableSnapshot}
                            onOpen={onOpen}
                            onToggleFocus={onToggleFocus}
                            onMoveToColumn={onMoveToColumn}
                          />
                        )}
                      </Draggable>
                    ))}
                    {droppableProvided.placeholder}
                    {columnProjects.length === 0 && !droppableSnapshot.isDraggingOver ? (
                      <div className="flex items-center justify-center py-7 text-center">
                        <p className="text-xs text-muted-foreground/40">{PROJECT_COLUMN_EMPTY[columnId]}</p>
                      </div>
                    ) : null}
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
