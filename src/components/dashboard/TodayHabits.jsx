import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Flame } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CategoryBadge } from '@/lib/categories';

export default function TodayHabits({ habits, habitLogs, onToggleHabit }) {
  const today = new Date().toISOString().split('T')[0];

  const isCompletedToday = (habitId) =>
    habitLogs.some(log => log.habit_id === habitId && log.date === today && log.completed);

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
        {habits.length > 0 && (
          <div className="h-1 bg-secondary rounded-full overflow-hidden mt-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round((completedCount / habits.length) * 100)}%`,
                background: 'linear-gradient(90deg, hsl(40 95% 55%), hsl(35 100% 50%))',
              }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
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
                done ? "bg-gold/10 border border-gold/20" : "bg-secondary/50 hover:bg-secondary"
              )}
              onClick={() => onToggleHabit(habit.id, done)}
            >
              <span className="text-base w-6 text-center shrink-0">💪</span>
              <Checkbox
                checked={done}
                onCheckedChange={() => onToggleHabit(habit.id, done)}
                className={cn(done ? "border-gold data-[state=checked]:bg-gold data-[state=checked]:border-gold" : "border-muted-foreground/40")}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn("text-sm font-medium truncate", done && "text-gold line-through")}>{habit.title}</p>
                  <CategoryBadge category={habit.category} />
                </div>
              </div>
              {habit.current_streak > 0 && (
                <span className="inline-flex items-center gap-1 bg-orange-500/20 text-orange-400 text-xs px-2 py-0.5 rounded-full shrink-0">
                  🔥 {habit.current_streak}
                </span>
              )}
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}