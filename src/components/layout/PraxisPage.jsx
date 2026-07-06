import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Cabeçalho de página — kicker, título e descrição alinhados ao grid do conteúdo. */
export function PageHero({ kicker, kickerIcon: Icon, kickerClassName, title, description, action, children }) {
  return (
    <section className="praxis-page-hero">
      <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-2xl space-y-2">
          {kicker ? (
            <p className={cn('praxis-kicker-row', kickerClassName)}>
              {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden /> : null}
              <span>{kicker}</span>
            </p>
          ) : null}
          <h1 className="forja-title text-3xl font-bold leading-[1.15] sm:text-4xl">{title}</h1>
          {description ? (
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 self-start lg:self-center">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StatGrid({ children, className }) {
  return <div className={cn('mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>;
}

const STAT_TONES = {
  cyan: 'border-cyan-400/20 bg-cyan-500/10',
  amber: 'border-amber-400/20 bg-amber-500/10',
  neutral: 'border-white/5 bg-black/20',
};

export function StatTile({ label, value, tone = 'neutral', valueClassName }) {
  return (
    <div className={cn('praxis-stat-tile', STAT_TONES[tone] || STAT_TONES.neutral)}>
      <p className="praxis-stat-label">{label}</p>
      <p className={cn('praxis-stat-value', tone === 'cyan' && 'text-cyan-100', valueClassName)}>{value}</p>
    </div>
  );
}

export function SectionHeading({ kicker, title, trailing }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {kicker ? <p className="praxis-kicker-row text-muted-foreground">{kicker}</p> : null}
        <h2 className="forja-title text-xl font-semibold leading-tight sm:text-2xl">{title}</h2>
      </div>
      {trailing ? <div className="w-full shrink-0 sm:w-auto">{trailing}</div> : null}
    </div>
  );
}

/** Tela cheia centrada — login, 404, erros de rede. */
export function PraxisCenteredShell({ children, maxWidth = 'max-w-md', className }) {
  return (
    <div className={cn('min-h-screen flex items-center justify-center bg-background px-4 py-10', className)}>
      <div className={cn('w-full', maxWidth)}>{children}</div>
    </div>
  );
}

/** Splash de boot / auth — mesma linguagem visual do app. */
export function PraxisLoadingSplash({ message = 'Carregando o Praxis…' }) {
  return (
    <PraxisCenteredShell maxWidth="max-w-sm">
      <div className="glass-surface rounded-2xl border border-white/10 p-8 text-center space-y-5">
        <p className="forja-kicker text-primary">Praxis</p>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </PraxisCenteredShell>
  );
}

/** Empty padronizado — lista vazia ou filtro sem resultado. */
export function PraxisEmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <Card className={cn('border-dashed border-border/60 bg-card/40', className)}>
      <CardContent className="py-10 px-6 text-center space-y-4">
        {Icon ? (
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/15">
            <Icon className="h-5 w-5 text-primary/90" aria-hidden />
          </div>
        ) : null}
        <div className="space-y-2">
          <p className="text-base font-semibold">{title}</p>
          {description ? (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex justify-center pt-1">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

/** Skeleton de lista (cards empilhados). */
export function PraxisListSkeleton({ rows = 4, className }) {
  return (
    <Card className={cn('border-white/8', className)}>
      <CardContent className="p-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Banner / onboarding inline — Lote 8 (uma família visual no Hoje). */
export function PraxisInlinePromo({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  trailing,
  children,
  className,
  bodyClassName,
}) {
  return (
    <div className={cn('rounded-2xl border border-border/80 bg-card/40', className)}>
      <div className="flex items-start gap-3 p-4">
        {Icon ? (
          <Icon
            className={cn('h-5 w-5 shrink-0 mt-0.5 text-muted-foreground', iconClassName)}
            aria-hidden
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>
          ) : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      {children ? (
        <div className={cn('px-4 pb-4 pt-0 space-y-3', bodyClassName)}>{children}</div>
      ) : null}
    </div>
  );
}

/** Skeleton em colunas (ex.: Compras por prazo). */
export function PraxisColumnsSkeleton({ columns = 3, rowsPerColumn = 2 }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} className="space-y-3">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-3 w-44 rounded-md" />
          {Array.from({ length: rowsPerColumn }, (_, r) => (
            <Skeleton key={r} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}