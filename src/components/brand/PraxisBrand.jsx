import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Marca canônica da Praxis — usada na landing e dentro do produto.
 * Evita que o app e a página pública evoluam com identidades diferentes.
 */
export default function PraxisBrand({
  compact = false,
  tagline = 'Menos plano. Mais prática.',
  className,
  markClassName,
  nameClassName,
  taglineClassName,
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'praxis-brand-mark relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          'border border-white/10 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
          markClassName,
        )}
        aria-hidden
      >
        <span className="forja-title text-xl font-bold tracking-[-0.09em] text-domain-gold">π</span>
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-domain-gold shadow-[0_0_16px_hsl(var(--domain-gold)/0.8)]" />
      </div>

      {!compact ? (
        <div className="min-w-0">
          <p className={cn('forja-title text-lg font-bold leading-none tracking-[-0.055em]', nameClassName)}>
            Praxis
          </p>
          {tagline ? (
            <p
              className={cn(
                'mt-1 truncate text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground',
                taglineClassName,
              )}
            >
              {tagline}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
