import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Timer, CheckCircle2, Clock, Repeat, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CategoryBadge } from '@/lib/categories';

const priorityStyles = {
  high: 'bg-destructive/15 text-destructive border-destructive/20',
  medium: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  low: 'bg-muted text-muted-foreground border-border',
};

export default function TodayTasks({ tasks, today, onToggleComplete }) {
  const isDone = (task) => task.status === 'completed' || task.status === 'done';
  const pending = tasks.filter(t => !isDone(t));
  const completed = tasks.filter(t => isDone(t));
  const overdueCount = pending.filter(t => t.date && today && t.date < today).length;
  const cleanedOverdueCount = completed.filter(t => t.date && today && t.date < today && t.completed_date === today).length;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Tarefas de Hoje</CardTitle>
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-[10px] text-destructive">
                {overdueCount} atrasada{overdueCount === 1 ? '' : 's'}
              </Badge>
            )}
            {cleanedOverdueCount > 0 && (
              <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-[10px] text-green-400">
                {cleanedOverdueCount} limpa{cleanedOverdueCount === 1 ? '' : 's'} hoje
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {completed.length}/{tasks.length} concluídas
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <AnimatePresence>
          {pending.length === 0 && completed.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma tarefa para hoje. Que tal capturar uma por voz?
            </p>
          )}
          {pending.length > 0 && (
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 px-1 pt-1">
              Pendentes — o que ainda pesa no dia
            </div>
          )}
          {pending.map(task => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group"
            >
              <Checkbox
                checked={false}
                onCheckedChange={() => onToggleComplete(task)}
                className="border-muted-foreground/40"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <CategoryBadge category={task.category} />
                  {task.recurrence && task.recurrence !== 'none' && (
                    <span title={`Repete: ${task.recurrence}`} className="inline-flex items-center text-[10px] text-blue-400/80">
                      <Repeat className="w-3 h-3" />
                    </span>
                  )}
                </div>
                {task.time && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{task.time}</span>
                  </div>
                )}
                {task.date && today && task.date < today && (
                  <div className="flex items-center gap-1 mt-0.5 text-destructive">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="text-xs font-medium">Atrasada desde {task.date}</span>
                  </div>
                )}
              </div>
              <Badge variant="outline" className={cn('text-[10px] border', priorityStyles[task.priority || 'medium'])}>
                {task.priority || 'medium'}
              </Badge>
              <Link to={`/foco?taskId=${task.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Timer className="w-4 h-4 text-primary" />
              </Link>
            </motion.div>
          ))}
          {completed.length > 0 && (
            <div className="text-[11px] uppercase tracking-wider text-green-400/80 px-1 pt-3">
              Concluídas hoje — esforço registrado
            </div>
          )}
          {completed.map(task => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30"
            >
              <Checkbox
                checked={true}
                onCheckedChange={() => onToggleComplete(task)}
                className="border-accent text-accent"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground line-through truncate">{task.title}</p>
                {task.date && today && task.date < today && (
                  <p className="text-[11px] text-green-400/80 mt-0.5">
                    Limpa hoje · era de {task.date}
                  </p>
                )}
              </div>
              <CategoryBadge category={task.category} className="opacity-60" />
              <CheckCircle2 className="w-4 h-4 text-accent/60" />
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}