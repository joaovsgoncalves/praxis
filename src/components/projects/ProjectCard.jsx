import React from 'react';
import { ExternalLink, Pin } from 'lucide-react';
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
  currentColumn,
  isDragDisabled = false,
  dragProvided,
  snapshot,
  onOpen,
  onToggleFocus,
  onMoveToColumn,
}) {
  const focused = Boolean(project.focus);
  const moveDate = formatProjectMoveDate(project.last_move_at || project.last_reviewed_at);
  const moveNote = String(project.last_move_note || '').trim();
  const slice = String(project.current_slice || '').trim();
  const nextStep = String(project.next_step || '').trim();
  const prodUrl = String(project.prod_url || '').trim();

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
          <p className="line-clamp-1 text-sm font-semibold leading-snug text-stone-100">
            {project.name}
          </p>
          {project.tagline ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
              {project.tagline}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 shrink-0 rounded-full touch-manipulation',
            focused
              ? 'text-domain-gold hover:text-domain-gold'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
          aria-label={focused ? `Tirar ${project.name} do foco` : `Fixar ${project.name} no foco`}
          aria-pressed={focused}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFocus?.(project);
          }}
        >
          <Pin className={cn('h-4 w-4', focused && 'fill-current')} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] font-medium text-muted-foreground">
          {PROJECT_KIND_LABELS[project.kind] || 'Frente'}
        </Badge>
        {project.live ? (
          <Badge variant="outline" className="border-emerald-400/20 bg-emerald-400/[0.06] text-[10px] font-medium text-emerald-300/80">
            No ar
          </Badge>
        ) : null}
        {focused ? (
          <Badge className="border-transparent bg-primary/15 text-[10px] font-medium text-primary">
            Foco
          </Badge>
        ) : null}
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/55">Agora</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-stone-200/90">
            {slice || 'Sem fatia definida'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-domain-gold/70">Próximo</p>
          <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-stone-100/90">
            {nextStep || 'Definir o próximo passo'}
          </p>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground/70">
        {moveDate || moveNote ? (
          <>
            {moveDate ? <span className="tabular-nums">{moveDate}</span> : null}
            {moveDate && moveNote ? ' · ' : null}
            {moveNote || 'revisado'}
          </>
        ) : (
          'Ainda sem revisão registrada'
        )}
      </p>

      {prodUrl ? (
        <a
          href={prodUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-primary/90 hover:text-primary"
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          Abrir
        </a>
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
              className="h-10 w-full rounded-full border-white/10 bg-white/[0.03] text-xs"
              aria-label={`Mover ${project.name}`}
            >
              <SelectValue placeholder="Mover para" />
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
