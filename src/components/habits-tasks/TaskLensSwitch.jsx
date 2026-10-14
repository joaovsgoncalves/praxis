import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarClock, Columns3, List } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Valor interno "week" continua igual na URL (?lens=week); só o rótulo mudou. */
const LENS_OPTIONS = [
  { id: 'list', label: 'Lista', icon: List },
  { id: 'board', label: 'Quadro', icon: Columns3 },
  { id: 'week', label: 'Linha do tempo', icon: CalendarClock },
];

export default function TaskLensSwitch({ value, onChange, className }) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="group"
      aria-label="Visão das tarefas"
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-0.5 rounded-full bg-white/[0.03] p-1 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)]',
        className
      )}
    >
      {LENS_OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange?.(id);
            }}
            className={cn(
              'relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium outline-none transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active ? (
              <motion.span
                layoutId="praxis-task-lens-indicator"
                aria-hidden
                className="praxis-elev-1 absolute inset-0 rounded-full bg-secondary"
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
              />
            ) : null}
            <Icon
              aria-hidden
              className={cn('relative h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'opacity-80')}
            />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
