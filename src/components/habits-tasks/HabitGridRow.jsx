import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HabitGridRow({ habit, isDone, onToggleDone, onSkipClick }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/40 hover:bg-card/80 transition-colors">
      <div className="flex items-center gap-3">
        <Button
          variant={isDone ? 'default' : 'outline'}
          size="icon"
          className={cn('h-8 w-8 rounded-full transition-all', isDone && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
          onClick={() => onToggleDone(habit, isDone)}
        >
          <Check className={cn('w-4 h-4', isDone ? 'opacity-100' : 'opacity-40')} />
        </Button>
        <div>
          <p className={cn('text-sm font-medium', isDone && 'line-through text-muted-foreground')}>
            {habit.title}
          </p>
          {habit.streak > 0 && (
            <p className="text-xs text-amber-500 font-mono">🔥 {habit.streak} dias de sequência</p>
          )}
        </div>
      </div>
      {onSkipClick && !isDone && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => onSkipClick(habit)}
          title="Não deu pra fazer hoje"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
