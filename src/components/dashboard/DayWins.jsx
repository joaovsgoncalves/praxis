import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Timer, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isTaskDone } from '@/lib/tasks';

/**
 * Vitórias do dia — cockpit Praxis alinhado a “ganhar o dia”, não resolver a vida.
 */
export default function DayWins({ tasks = [], today, onToggleComplete }) {
  const todayPending = tasks
    .filter((t) => t.date === today && !isTaskDone(t))
    .slice(0, 5);

  const todayDone = tasks.filter((t) => t.date === today && isTaskDone(t)).length;
  const todayTotal = tasks.filter((t) => t.date === today).length;
  const pct = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;

  return (
    <Card className="border-domain-gold/25 bg-gradient-to-br from-domain-gold/5 via-transparent to-domain-ember/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-domain-gold" />
              Vitórias de hoje
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Movimento conta — não precisa resolver tudo.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold font-mono text-domain-gold">{pct}%</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              do dia
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {todayPending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            Nada pendente com data de hoje — ou você já ganhou o dia.
          </p>
        ) : (
          todayPending.map((task) => (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border border-white/10',
                'bg-secondary/40 hover:bg-secondary/70 transition-colors'
              )}
            >
              <Checkbox
                checked={false}
                onCheckedChange={() => onToggleComplete?.(task)}
                className="h-5 w-5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-snug truncate">{task.title}</p>
                {task.time && (
                  <p className="text-xs text-muted-foreground mt-0.5">{task.time}</p>
                )}
              </div>
              <Button asChild size="sm" variant="secondary" className="shrink-0 gap-1.5">
                <Link to={`/foco?taskId=${task.id}`}>
                  <Timer className="w-3.5 h-3.5" />
                  Foco
                </Link>
              </Button>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground/80 pt-2 border-t border-border/40">
          Treino · pessoas · trabalho — marque e use Pomodoro quando for executar.
        </p>
      </CardContent>
    </Card>
  );
}