import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CategoryBadge } from '@/lib/categories';
import { formatBehindSince, formatTaskTimeLabel, isTaskOverdue } from '@/lib/nowTask';
import { cleanPriorityPrefix } from '@/lib/tasks';
import { Timer, CheckCircle2, Clock, Plus, ArrowRight } from 'lucide-react';

export default function NowBlock({
  task,
  next = null,
  today,
  busy = false,
  onComplete,
  onSnooze15,
  onSnoozeTomorrow,
  onAddTask,

}) {
  if (!task) {
      return (
        <Card className="praxis-now-card praxis-tactile-card relative overflow-hidden border-amber-500/25 bg-[linear-gradient(135deg,rgba(245,158,11,0.10),hsl(var(--card)/0.92)_52%,rgba(245,158,11,0.03))]">
                {/* Empty state: soft edge wash only — no big mid-card orb */}
                <div
                  className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 bg-[radial-gradient(circle,rgba(245,158,11,0.08),transparent_70%)] opacity-70"
                  aria-hidden
                />
                <CardContent className="relative p-5 sm:p-6">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.7)]" aria-hidden />
                    Agora
                  </div>
                <h2 className="praxis-title mt-4 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.045em] text-foreground sm:text-3xl">
                  Nada urgente na fila.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Bom momento para capturar o que está na cabeça ou criar o próximo passo de forma consciente.
                </p>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    className="praxis-touch-target praxis-glow-ember w-full gap-2 rounded-full bg-amber-500 text-slate-950 hover:bg-amber-400 sm:w-auto"
                    onClick={onAddTask}
                  >
                    <Plus className="h-4 w-4" /> Nova tarefa
                  </Button>
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  Também dá para abrir o{' '}
                  <Link to="/foco" className="font-medium text-amber-200/90 underline-offset-4 hover:text-amber-100 hover:underline">
                    Modo foco
                  </Link>{' '}
                  ou registrar uma{' '}
                  <Link to="/ideias?new=1" className="font-medium text-amber-200/90 underline-offset-4 hover:text-amber-100 hover:underline">
                    ideia
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
    );
  }

  const overdue = isTaskOverdue(task, today);
  const timeLabel = formatTaskTimeLabel(task);
  const title = cleanPriorityPrefix(task.title);

  return (
      <Card className="praxis-now-card group relative overflow-hidden border-domain-gold/18 bg-[linear-gradient(135deg,hsl(var(--domain-gold)/0.08),hsl(var(--card)/0.84)_50%,hsl(var(--primary)/0.05))]">
        {/* Anchored behind title block — supports hierarchy, not a random blob */}
        <div
          className="pointer-events-none absolute left-0 top-0 h-40 w-56 bg-[radial-gradient(circle_at_20%_30%,hsl(var(--domain-gold)/0.10),transparent_68%)] opacity-90 transition-opacity duration-500 group-hover:opacity-100 sm:h-48 sm:w-72"
          aria-hidden
        />
        <CardContent className="relative p-4 sm:p-6">
          <div className="flex flex-col gap-3.5 sm:gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl flex-1">
              {/* Rótulo e selos na mesma linha: no celular cada linha a menos sobe o primeiro hábito. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 flex items-center gap-2 text-xs font-medium text-domain-gold">
                  <span className="praxis-now-pulse relative flex h-2.5 w-2.5 items-center justify-center" aria-hidden>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-domain-gold/35" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-domain-gold" />
                  </span>
                  Agora
                </span>
                {overdue ? (
                  <Badge variant="outline" className="border-amber-500/20 bg-amber-500/[0.06] text-amber-200/90">
                    {formatBehindSince(task, today)}
                  </Badge>
                ) : null}
                {timeLabel ? (
                  <Badge variant="outline" className="gap-1 border-white/[0.07] bg-white/[0.03] text-foreground/75">
                    <Clock className="h-3 w-3" /> {timeLabel}
                  </Badge>
                ) : null}
                {task.priority === 'high' ? (
                  <Badge className="border border-destructive/15 bg-destructive/10 text-xs text-destructive shadow-none">Prioridade alta</Badge>
                ) : null}
                <CategoryBadge category={task.category} />
              </div>

              {/* Título longo corta em duas linhas no celular; inteiro, ele está na trilha logo abaixo. */}
              <h2
                className="praxis-title mt-3 line-clamp-2 text-2xl font-semibold leading-[1.12] tracking-[-0.045em] sm:mt-4 sm:line-clamp-3 sm:text-4xl sm:leading-[1.05] sm:tracking-[-0.055em]"
                title={title}
              >
                {task.title}
              </h2>
              {task.description ? (
                <p className="mt-2 line-clamp-1 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:line-clamp-3 sm:text-base">{task.description}</p>
              ) : (
                <p className="mt-3 hidden text-sm text-muted-foreground sm:block">Uma coisa de cada vez.</p>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-2 lg:max-w-[360px] lg:justify-end">
              <div className="flex gap-2 sm:contents">
                <Button
                  type="button"
                  className="praxis-touch-target min-w-0 flex-1 gap-2 rounded-full bg-domain-gold px-5 text-black hover:bg-domain-gold/90 sm:w-auto sm:flex-none"
                  disabled={busy}
                  aria-label={`Concluir ${title}`}
                  data-testid="now-complete"
                  onClick={() => onComplete?.(task)}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Concluir
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="praxis-touch-target shrink-0 gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-foreground hover:bg-white/[0.08]"
                >
                  <Link to={`/foco?taskId=${encodeURIComponent(task.id)}`} aria-label="Começar foco">
                    <Timer className="h-4 w-4" aria-hidden />
                    <span className="sm:hidden">Foco</span>
                    <span className="hidden sm:inline">Começar foco</span>
                  </Link>
                </Button>
              </div>
              {/* Adiar fica em texto: alvo de 44 px, peso visual baixo. */}
              <div className="-mb-2 flex items-center gap-1 sm:mb-0 sm:basis-full sm:justify-end" role="group" aria-label="Adiar">
                <span className="pl-1 pr-1 text-xs text-muted-foreground/80" aria-hidden>Adiar</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="praxis-touch-target rounded-full px-3 text-xs text-foreground/75 hover:bg-white/[0.04] hover:text-foreground"
                  disabled={busy}
                  aria-label="Adiar 15 minutos"
                  onClick={() => onSnooze15?.(task)}
                >
                  +15 min
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="praxis-touch-target rounded-full px-3 text-xs text-foreground/75 hover:bg-white/[0.04] hover:text-foreground"
                  disabled={busy}
                  aria-label="Adiar para amanhã"
                  onClick={() => onSnoozeTomorrow?.(task)}
                >
                  Amanhã
                </Button>
              </div>
            </div>
          </div>

        {next ? (
          <p
            className="mt-2 flex min-w-0 items-center gap-2 border-t border-white/[0.055] pt-3 text-sm text-muted-foreground sm:mt-5 sm:pt-4"
            data-testid="now-next"
          >
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-domain-gold/80" aria-hidden />
            <span className="shrink-0">Depois:</span>
            <span className="min-w-0 truncate font-medium text-foreground/85">{cleanPriorityPrefix(next.title)}</span>
            {formatTaskTimeLabel(next) ? (
              <span className="shrink-0 tabular-nums">· {formatTaskTimeLabel(next)}</span>
            ) : null}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
