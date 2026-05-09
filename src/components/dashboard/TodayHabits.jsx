import React, { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CategoryBadge } from '@/lib/categories';
import confetti from 'canvas-confetti';

// Fire a tiny gold/ember burst at the click point. Cheap and synchronous.
function sparkAt(x, y) {
  confetti({
    particleCount: 14,
    spread: 38,
    startVelocity: 22,
    gravity: 0.9,
    ticks: 90,
    scalar: 0.7,
    origin: { x: x / window.innerWidth, y: y / window.innerHeight },
    colors: ['#FFC857', '#F59E0B', '#FB923C', '#FFFFFF'],
  });
}

export default function TodayHabits({ habits, habitLogs, onToggleHabit }) {
  const today = new Date().toISOString().split('T')[0];
  const rowRefs = useRef(new Map());

  const isCompletedToday = (habitId) =>
    habitLogs.some(log => log.habit_id === habitId && log.date === today && log.completed);

  const completedCount = habits.filter(h => isCompletedToday(h.id)).length;

  const handleToggle = (habit, done, evt) => {
    if (!done) {
      // Becoming done — fire a spark from the row.
      const target = rowRefs.current.get(habit.id);
      const rect = (evt?.currentTarget || target)?.getBoundingClientRect?.();
      if (rect) sparkAt(rect.left + 28, rect.top + rect.height / 2);
    }
    onToggleHabit?.(habit.id, done);
  };

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
          <div className="h-1 bg-secondary rounded-full overflow-hidden mt-2 rail-inset">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round((completedCount / habits.length) * 100)}%`,
                background: 'linear-gradient(90deg, hsl(var(--domain-wellness)), hsl(var(--domain-ember)))',
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
              ref={el => { if (el) rowRefs.current.set(habit.id, el); else rowRefs.current.delete(habit.id); }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer",
                done
                  ? "bg-domain-wellness/10 border border-domain-wellness/25"
                  : "bg-secondary/50 hover:bg-secondary"
              )}
              onClick={(e) => handleToggle(habit, done, e)}
            >
              <span className="text-base w-6 text-center shrink-0">💪</span>
              <Checkbox
                checked={done}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => handleToggle(habit, done)}
                className={cn(done ? "border-domain-wellness data-[state=checked]:bg-domain-wellness data-[state=checked]:border-domain-wellness" : "border-muted-foreground/40")}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn("text-sm font-medium truncate", done && "text-domain-wellness line-through")}>{habit.title}</p>
                  <CategoryBadge category={habit.category} />
                </div>
              </div>
              {habit.current_streak > 0 && (
                <span className="inline-flex items-center gap-1 bg-domain-ember/15 text-domain-ember text-xs px-2 py-0.5 rounded-full shrink-0">
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
