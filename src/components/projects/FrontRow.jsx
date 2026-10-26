import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FRONT_STATUS_LABELS, isProjectBlocked } from '@/lib/projects';
import { cn } from '@/lib/utils';

const ROW_SURFACE = 'rounded-xl border border-white/[0.06] bg-[#141820]/70 transition-[transform,background-color,border-color] duration-150 ease-out hover:border-white/15 hover:bg-[#181d27]';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-domain-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function BlockedBadge({ note }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400"
      title={note}
    >
      Bloqueada
    </span>
  );
}

function RankBadge({ rank }) {
  return (
    <span className="inline-flex items-center rounded-full border border-domain-gold/30 bg-domain-gold/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-domain-gold">
      #{rank} hoje
    </span>
  );
}

export default function FrontRow({
  project,
  onOpen,
  isSubfront = false,
  expanded = false,
  onToggle,
}) {
  if (!project) return null;

  const statusLabel = FRONT_STATUS_LABELS[project.column] || 'Depois';
  const blocked = isProjectBlocked(project);
  const isParent = !isSubfront && project.childCount > 0;

  if (isParent) {
    // Mãe recolhida: o toque abre as filhas; a seta da direita abre a própria frente.
    const rank = expanded ? project.recommendedRank : project.sortRank;
    const countText = `${project.childCount} ${project.childCount === 1 ? 'frente' : 'frentes'}`;
    return (
      <div className={cn('group flex min-h-[52px] w-full items-stretch', ROW_SURFACE)}>
        <button
          type="button"
          onClick={() => onToggle?.(project)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Recolher' : 'Mostrar'} frentes de ${project.name}`}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 rounded-l-xl py-2.5 pl-3.5 pr-2 text-left active:scale-[0.99] motion-reduce:transform-none',
            FOCUS_RING,
          )}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-200 ease-out motion-reduce:transition-none',
              !expanded && '-rotate-90',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-stone-100 group-hover:text-white">
              {project.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground/70">
              {countText}
              {project.childSummary ? ` · ${project.childSummary}` : ''}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {blocked ? <BlockedBadge note={project.blocked_note} /> : null}
            {rank != null ? <RankBadge rank={rank} /> : null}
            <span className="text-xs text-muted-foreground/75">{statusLabel}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onOpen?.(project)}
          aria-label={`Abrir frente ${project.name}`}
          className={cn(
            'flex w-11 shrink-0 items-center justify-center rounded-r-xl border-l border-white/[0.06] text-muted-foreground/50 hover:text-stone-200',
            FOCUS_RING,
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen?.(project)}
      aria-label={`Abrir frente ${project.name}`}
      className={cn(
        'group flex min-h-[44px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left active:scale-[0.99] motion-reduce:transform-none',
        ROW_SURFACE,
        FOCUS_RING,
        // Recuo sem estourar a largura: a linha encolhe o mesmo tanto do margin.
        isSubfront && 'ml-4 w-[calc(100%-1rem)] border-l-2 border-l-white/15 bg-[#12151c]/60 sm:ml-6 sm:w-[calc(100%-1.5rem)]',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-100 group-hover:text-white">
        {project.name}
      </span>

      <span className="flex shrink-0 items-center gap-2 sm:gap-2.5">
        {blocked ? <BlockedBadge note={project.blocked_note} /> : null}
        {project.recommendedRank != null ? <RankBadge rank={project.recommendedRank} /> : null}
        <span className="text-xs text-muted-foreground/75">{statusLabel}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-300 motion-reduce:transition-none" />
      </span>
    </button>
  );
}
