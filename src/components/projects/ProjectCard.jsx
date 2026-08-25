import React from 'react';
import { ArrowRight, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  PROJECT_COLUMNS,
  PROJECT_COLUMN_LABELS,
  PROJECT_KIND_LABELS,
  formatProjectMoveDate,
} from '@/lib/projects';

export default function ProjectCard({
  project,
  subProjects = [],
  currentColumn,
  isDragDisabled = false,
  dragProvided,
  snapshot,
  onOpen,
  onToggleFocus,
  onMoveToColumn,
}) {
  const focused = Boolean(project.focus);
  const moveDate = formatProjectMoveDate(project.last_reviewed_at || project.last_move_at);
  const slice = String(project.current_slice || '').trim();
  const nextStep = String(project.next_step || '').trim();

  return (
    <div
      ref={dragProvided?.innerRef}
      {...dragProvided?.draggableProps}
      {...(!isDragDisabled ? dragProvided?.dragHandleProps : {})}
      style={dragProvided?.draggableProps?.style}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(project)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(project);
        }
      }}
      className={cn(
        'group relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-xl border px-3 py-3 text-left transition-all select-none',
        snapshot?.isDragging
          ? 'z-50 border-domain-gold/40 bg-card shadow-2xl shadow-black/80 ring-1 ring-domain-gold/30'
          : 'border-white/[0.06] bg-[#161a23]/90 hover:border-white/[0.12] hover:bg-[#1c212c]',
        !isDragDisabled && 'cursor-grab active:cursor-grabbing',
        isDragDisabled && 'cursor-pointer',
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold leading-snug text-stone-100">{project.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 border-white/10 bg-white/[0.03] px-1.5 text-[9px] font-medium text-muted-foreground">
              {PROJECT_KIND_LABELS[project.kind] || 'Frente'}
            </Badge>
            {project.live ? (
              <Badge variant="outline" className="h-5 border-emerald-400/20 bg-emerald-400/[0.06] px-1.5 text-[9px] font-medium text-emerald-300/80">
                No ar
              </Badge>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0 rounded-full touch-manipulation',
            focused
              ? 'text-domain-gold hover:text-domain-gold'
              : 'text-muted-foreground/45 hover:text-foreground',
          )}
          aria-label={focused ? `Tirar ${project.name} do foco` : `Fixar ${project.name} no foco`}
          aria-pressed={focused}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFocus?.(project);
          }}
        >
          <Pin className={cn('h-3.5 w-3.5', focused && 'fill-current')} />
        </Button>
      </div>

      {slice ? (
        <p className="line-clamp-1 text-[11px] leading-snug text-muted-foreground/70">
          <span className="text-muted-foreground/45">Agora:</span> {slice}
        </p>
      ) : null}

      <div className="flex items-start gap-1.5 rounded-lg bg-black/15 px-2.5 py-2">
        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-domain-gold/85" />
        <p className="line-clamp-2 text-xs font-medium leading-snug text-stone-100/90">
          {nextStep || 'Próximo passo pendente de revisão'}
        </p>
      </div>

      <p className="text-[10px] tabular-nums text-muted-foreground/45">
        {moveDate ? `Atualizado ${moveDate}` : 'Ainda sem revisão'}
      </p>

      {subProjects.length > 0 ? (
        <div className="mt-1 rounded-lg border border-white/[0.05] bg-black/10 p-2">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/45">
            Dentro de {project.name}
          </p>
          <div className="space-y-1.5">
            {subProjects.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen?.(sub);
                }}
                className="block w-full rounded-md border border-white/[0.04] bg-[#12151c]/70 px-2 py-1.5 text-left transition-colors hover:border-domain-gold/25 hover:bg-[#1a1f2a]"
              >
                <p className="line-clamp-1 text-xs font-semibold text-stone-100">{sub.name}</p>
                <p className="line-clamp-1 text-[10px] text-muted-foreground/60">
                  {String(sub.next_step || sub.current_slice || 'Próximo passo pendente').trim()}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isDragDisabled ? (
        <div onClick={(event) => event.stopPropagation()}>
          <Select
            value={currentColumn}
            onValueChange={(column) => {
              if (column !== currentColumn) onMoveToColumn?.(project, column);
            }}
          >
            <SelectTrigger
              className="h-9 w-full rounded-full border-white/10 bg-white/[0.025] text-[11px]"
              aria-label={`Mover ${project.name}`}
            >
              <SelectValue placeholder="Mover" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_COLUMNS.map((column) => (
                <SelectItem key={column} value={column}>
                  {PROJECT_COLUMN_LABELS[column]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
