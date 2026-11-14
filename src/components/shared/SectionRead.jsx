import React from 'react';
import { History, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { readErrorMessage, staleCopyLabel } from '@/lib/readState';

/** A seção não foi lida: diz a causa e oferece reler. Nunca vira "vazio". */
export function SectionLoadError({ what, read, className, testId }) {
  return (
    <div
      role="alert"
      className={cn(
        'praxis-panel flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      data-testid={testId}
    >
      <p className="min-w-0 text-sm leading-relaxed text-foreground/85 [text-wrap:pretty]">
        {readErrorMessage(what, read?.error)}
      </p>
      <Button
        type="button"
        variant="secondary"
        className="praxis-touch-target shrink-0 gap-2 rounded-full px-4"
        disabled={read?.retrying}
        onClick={() => read?.retry?.()}
      >
        <RefreshCw
          className={cn('h-4 w-4', read?.retrying && 'animate-spin motion-reduce:animate-none')}
          aria-hidden
        />
        Tentar novamente
      </Button>
    </div>
  );
}

/** A seção mostra uma cópia salva: diz de quando é e oferece reler. */
export function StaleCopyNote({ read, className, testId }) {
  if (read?.status !== 'stale') return null;
  return (
    <p
      role="status"
      className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5 px-1 text-xs text-amber-200/90', className)}
      data-testid={testId}
    >
      <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{staleCopyLabel(read.cachedAt)}, pode estar desatualizada.</span>
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-full px-2 font-medium text-foreground/85 underline decoration-white/25 underline-offset-4 transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        disabled={read.retrying}
        onClick={() => read.retry?.()}
      >
        {read.retrying ? 'Tentando…' : 'Tentar novamente'}
      </button>
    </p>
  );
}

/** Lugar reservado enquanto a seção ainda não foi lida. */
export function SectionLoading({ className, label = 'Carregando' }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn('praxis-skel rounded-2xl', className)} />
  );
}
