import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Flame, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function TodayHabits({ habits, habitLogs, onToggleHabit }) {
  const today = new Date().toISOString().split('T')[0];

  const isCompletedToday = (habitId) => {
    return habitLogs.some(log => log.habit_id === habitId && log.date === today && log.completed);
  };

  const completedCount = habits.filter(h => isCompletedToday(h.id)).length;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Hábitos de Hoje</CardTitle>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{habits.length} feitos
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {habits.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum hábito ativo. Crie seu primeiro hábito!
          </p>
        )}
        {habits.map(habit => {
          const done = isCompletedToday(habit.id);
          return (
            <motion.div
              key={habit.id}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer",
                done ? "bg-accent/10" : "bg-secondary/50 hover:bg-secondary"
              )}
              onClick={() => onToggleHabit(habit.id, done)}
            >
              <Checkbox
                checked={done}
                onCheckedChange={() => onToggleHabit(habit.id, done)}
                className={cn(done ? "border-accent text-accent" : "border-muted-foreground/40")}
              />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", done && "text-accent")}>{habit.title}</p>
              </div>
              {habit.current_streak > 0 && (
                <div className="flex items-center gap-1 text-chart-4">
                  <Flame className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{habit.current_streak}</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}