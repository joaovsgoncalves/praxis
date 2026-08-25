import React, { useEffect, useState } from 'react';
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
    const onChange = () => {
      setIsDesktop(mql.matches);
    };
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

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const project = projects.find((item) => String(item.id) === String(draggableId));
    if (!project) return;
    onMoveToColumn?.(project, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="praxis-scroll-x flex gap-3 overflow-x-auto pb-4 pt-1 xl:grid xl:grid-cols-4 xl:gap-3.5 xl:overflow-visible">
        {PROJECT_COLUMNS.map((columnId) => {
          const columnProjects = projects.filter((item) => item.column === columnId);

          return (
            <div
              key={columnId}
              className="flex w-[min(280px,85vw)] shrink-0 min-w-[240px] flex-col rounded-2xl border border-white/[0.06] bg-[#12151c]/90 p-3 xl:w-auto xl:min-w-[240px] xl:flex-1"
            >
              <div className="flex items-center gap-2 px-1 pb-3">
                <span className="text-sm font-semibold tracking-tight text-stone-100">
                  {PROJECT_COLUMN_LABELS[columnId]}
                </span>
                <span className="rounded-md bg-stone-800/80 px-1.5 py-0.5 text-xs font-mono tabular-nums text-stone-400">
                  {columnProjects.length}
                </span>
              </div>

              <Droppable droppableId={columnId} isDropDisabled={isDragDisabled}>
                {(droppableProvided, droppableSnapshot) => (
                  <div
                    ref={droppableProvided.innerRef}
                    {...droppableProvided.droppableProps}
                    className={cn(
                      'flex-1 min-h-[140px] space-y-2 rounded-xl p-0.5 transition-colors',
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
                    {columnProjects.length === 0 && !droppableSnapshot.isDraggingOver && (
                      <div className="flex items-center justify-center py-8 text-center">
                        <p className="text-xs text-muted-foreground/45">
                          {PROJECT_COLUMN_EMPTY[columnId]}
                        </p>
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
