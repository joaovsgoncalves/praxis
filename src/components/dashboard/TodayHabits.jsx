import React, { useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryBadge } from '@/lib/categories';
import { sparkAt } from '@/lib/celebration';

export default function TodayHabits({ habits, habitLogs, onToggleHabit, title = 'Hábitos de Hoje', today: todayProp }) {
  const today = todayProp || new Date().toISOString().split('T')[0];
  const rowRefs = useRef(new Map());

  const isCompletedToday = (habitId) =>
    habitLogs.some((log) => log.habit_id === habitId && log.date === today && log.completed);

  const completedCount = habits.filter((habit) => isCompletedToday(habit.id)).length;
  const donePct = habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0;

  const handleToggle = (habit, done, evt) => {
    if (!done) {
      const target = rowRefs.current.get(habit.id);
      const rect = (evt?.currentTarget || target)?.getBoundingClientRect?.();
      if (rect) sparkAt(rect.left + 28, rect.top + rect.height / 2);
    }
    onToggleHabit?.(habit.id, done);
  };

  return (
    <Card className="praxis-dashboard-card">
      <CardHeader className="p-5 pb-4 sm:p-5 sm:pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Consistência</p>
            <h3 className="forja-title mt-1 text-xl font-semibold tracking-[-0.035em]">{title}</h3>
          </div>
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {completedCount}/{habits.length}
          </span>
        </div>
        {habits.length > 0 ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.055] rail-inset">
            <div
              className="praxis-progress-fill h-full rounded-full bg-gradient-to-r from-domain-wellness to-domain-gold"
              style={{ width: `${donePct}%` }}
            />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-2.5 px-5 pb-5 sm:px-5 sm:pb-5">
        {habits.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted-foreground">
            Nenhum hábito essencial para hoje.
          </p>
        ) : null}

        {habits.map((habit) => {
          const done = isCompletedToday(habit.id);
          return (
            <motion.div
              key={habit.id}
              role="button"
              tabIndex={0}
              ref={(el) => {
                if (el) rowRefs.current.set(habit.id, el);
                else rowRefs.current.delete(habit.id);
              }}
              whileTap={{ scale: 0.985 }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-[background-color,border-color,box-shadow]',
                done
                  ? 'border-domain-wellness/15 bg-domain-wellness/[0.065]'
                  : 'border-white/[0.055] bg-white/[0.022] hover:border-white/[0.09] hover:bg-white/[0.035]',
              )}
              onClick={(event) => handleToggle(habit, done, event)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleToggle(habit, done, event);
                }
              }}
            >
              <Checkbox
                checked={done}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={() => handleToggle(habit, done)}
                className={cn(
                  'h-5 w-5 shrink-0',
                  done
                    ? 'border-domain-wellness data-[state=checked]:border-domain-wellness data-[state=checked]:bg-domain-wellness'
                    : 'border-muted-foreground/40',
                )}
              />

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className={cn('min-w-0 truncate text-sm font-semibold sm:text-[15px]', done && 'text-domain-wellness/90 line-through')}>
                    {habit.title}
                  </p>
                  <CategoryBadge category={habit.category} />
                </div>
              </div>

              {habit.current_streak > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-domain-ember/15 bg-domain-ember/[0.07] px-2 py-1 text-[11px] font-medium text-domain-ember">
                  <Flame className="h-3 w-3" aria-hidden />
                  {habit.current_streak}
                </span>
              ) : null}
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
