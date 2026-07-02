import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CategoryBadge } from '@/lib/categories';
import { formatTaskTimeLabel, isTaskOverdue } from '@/lib/nowTask';
import { Timer, CheckCircle2, Clock, AlertTriangle, Mic, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NowBlock({
  task,
  today,
  busy = false,
  onComplete,
  onSnooze15,
  onSnoozeTomorrow,
  onAddTask,
  onVoiceCapture,
}) {
  if (!task) {
    return (
      <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="p-6 sm:p-8 space-y-4">
          <p className="forja-kicker text-primary">Agora</p>
          <h2 className="forja-title text-xl sm:text-2xl font-semibold">
            Nada urgente na fila — bom momento para capturar ou planejar.
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Use a voz ou crie uma tarefa com horário para o Praxis destacar o próximo passo aqui.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="default" className="praxis-touch-target w-full gap-2 sm:w-auto" onClick={onVoiceCapture}>
              <Mic className="h-4 w-4" /> Captura por voz
            </Button>
            <Button type="button" variant="outline" className="praxis-touch-target w-full gap-2 sm:w-auto" onClick={onAddTask}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const overdue = isTaskOverdue(task, today);
  const timeLabel = formatTaskTimeLabel(task);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/15 via-background to-background shadow-lg shadow-primary/5">
      <CardContent className="p-6 sm:p-8 space-y-5">
        <div className="space-y-1">
          <p className="forja-kicker text-primary">Agora</p>
          <p className="text-sm text-muted-foreground italic">
            Se só fizer uma coisa agora, faça isso.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {overdue && (
              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                <AlertTriangle className="h-3 w-3" /> Atrasada
              </Badge>
            )}
            {timeLabel && (
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" /> {timeLabel}
              </Badge>
            )}
            {task.priority === 'high' && (
              <Badge className={cn('text-xs', 'bg-destructive/15 text-destructive')}>Alta</Badge>
            )}
            <CategoryBadge category={task.category} />
          </div>
          <h2 className="forja-title text-2xl sm:text-3xl font-semibold leading-snug">
            {task.title}
          </h2>
          {task.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Button asChild className="praxis-touch-target w-full gap-2 sm:w-auto">
            <Link to={`/foco?taskId=${encodeURIComponent(task.id)}`}>
              <Timer className="h-4 w-4" /> Começar foco
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="praxis-touch-target w-full gap-2 sm:w-auto"
            disabled={busy}
            onClick={() => onComplete?.(task)}
          >
            <CheckCircle2 className="h-4 w-4" /> Concluir
          </Button>
          <Button
            type="button"
            variant="outline"
            className="praxis-touch-target w-full sm:w-auto"
            disabled={busy}
            onClick={() => onSnooze15?.(task)}
          >
            Adiar +15 min
          </Button>
          <Button
            type="button"
            variant="outline"
            className="praxis-touch-target w-full sm:w-auto"
            disabled={busy}
            onClick={() => onSnoozeTomorrow?.(task)}
          >
            Amanhã
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}