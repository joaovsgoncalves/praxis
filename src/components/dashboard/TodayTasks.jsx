import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Timer, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CategoryBadge } from '@/lib/categories';

const priorityStyles = {
  high: 'bg-destructive/15 text-destructive border-destructive/20',
  medium: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  low: 'bg-muted text-muted-foreground border-border',
};

export default function TodayTasks({ tasks, onToggleComplete }) {
  const pending = tasks.filter(t => t.status !== 'completed');
  const completed = tasks.filter(t => t.status === 'completed');

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Tarefas de Hoje</CardTitle>
          <span className="text-xs text-muted-foreground">
            {completed.length}/{tasks.length} concluídas
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <AnimatePresence>
          {pending.length === 0 && completed.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma tarefa para hoje. Que tal capturar uma por voz?
            </p>
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
                </div>
                {task.time && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{task.time}</span>
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
              <p className="text-sm text-muted-foreground line-through truncate flex-1">{task.title}</p>
              <CategoryBadge category={task.category} className="opacity-60" />
              <CheckCircle2 className="w-4 h-4 text-accent/60" />
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}