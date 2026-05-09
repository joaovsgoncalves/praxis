import React from 'react';
import { motion } from 'framer-motion';

// Three concentric Apple-Fitness-style rings.
// Sizes hand-tuned so labels around the outside have room.
const RINGS = [
  { key: 'habits', stroke: 'hsl(var(--domain-wellness))', glow: 'hsl(160 80% 50% / 0.55)', radius: 86, label: 'Hábitos' },
  { key: 'tasks',  stroke: 'hsl(var(--domain-ember))',    glow: 'hsl(22 95% 58% / 0.55)',  radius: 66, label: 'Tarefas' },
  { key: 'focus',  stroke: 'hsl(var(--domain-focus))',    glow: 'hsl(265 85% 65% / 0.55)', radius: 46, label: 'Foco' },
];

export default function ProgressRings({ habits = 0, tasks = 0, focus = 0, size = 200 }) {
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 10;

  const data = { habits, tasks, focus };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          {RINGS.map(r => (
            <filter key={r.key} id={`glow-${r.key}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {RINGS.map((r) => {
          const c = 2 * Math.PI * r.radius;
          const value = Math.max(0, Math.min(100, data[r.key] || 0));
          const offset = c * (1 - value / 100);
          return (
            <g key={r.key}>
              <circle
                cx={cx} cy={cy} r={r.radius}
                fill="none"
                stroke="hsl(0 0% 100% / 0.06)"
                strokeWidth={stroke}
              />
              <motion.circle
                cx={cx} cy={cy} r={r.radius}
                fill="none"
                stroke={r.stroke}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={c}
                initial={{ strokeDashoffset: c }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                filter={`url(#glow-${r.key})`}
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-mono text-3xl font-bold text-foreground">
          {Math.round((habits + tasks + focus) / 3)}
          <span className="text-muted-foreground text-base">%</span>
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">do dia</span>
      </div>
    </div>
  );
}

export function RingLegend({ habits = 0, tasks = 0, focus = 0 }) {
  const rows = [
    { color: 'hsl(var(--domain-wellness))', label: 'Hábitos', value: habits },
    { color: 'hsl(var(--domain-ember))',    label: 'Tarefas', value: tasks },
    { color: 'hsl(var(--domain-focus))',    label: 'Foco',    value: focus },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-3 text-sm">
          <span className="block w-2 h-2 rounded-full" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
          <span className="text-muted-foreground w-20">{r.label}</span>
          <span className="font-mono font-semibold text-foreground">{Math.round(r.value)}%</span>
        </div>
      ))}
    </div>
  );
}
