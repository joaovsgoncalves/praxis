import React from 'react';
import { cn } from '@/lib/utils';

export default function DayProgressBar({ habits = [], habitLogs = [], tasks = [] }) {
  const today = new Date().toISOString().split('T')[0];

  const completedHabits = habits.filter(h =>
    habitLogs.some(l => l.habit_id === h.id && l.date === today && l.completed)
  ).length;

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalItems = habits.length + tasks.length;
  const completedItems = completedHabits + completedTasks;
  const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const getLabel = () => {
    if (pct === 0) return 'Vamos lá! 💪';
    if (pct < 30) return 'Começando...';
    if (pct < 60) return 'Indo bem!';
    if (pct < 90) return 'Quase lá! 🔥';
    return 'Dia incrível! 🏆';
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Progresso do dia</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{getLabel()}</span>
          <span className="text-sm font-bold text-gold">{pct}%</span>
        </div>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: pct >= 80
              ? 'linear-gradient(90deg, hsl(265 85% 65%), hsl(160 80% 50%))'
              : 'linear-gradient(90deg, hsl(40 95% 55%), hsl(35 100% 50%))',
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>{completedHabits}/{habits.length} hábitos</span>
        <span>{completedTasks}/{tasks.length} tarefas</span>
      </div>
    </div>
  );
}