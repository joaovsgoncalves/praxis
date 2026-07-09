import { cn } from '@/lib/utils';
import { formatGrams, formatKcal } from '@/lib/nutrition';

const ROWS = [
  {
    key: 'kcal',
    label: 'Calorias',
    short: 'kcal',
    barClass: 'bg-primary',
    format: (n) => formatKcal(n),
  },
  {
    key: 'protein_g',
    label: 'Proteína',
    short: 'P',
    barClass: 'bg-blue-500/80',
    format: (n) => formatGrams(n),
  },
  {
    key: 'carbs_g',
    label: 'Carbo',
    short: 'C',
    barClass: 'bg-amber-500/80',
    format: (n) => formatGrams(n),
  },
  {
    key: 'fat_g',
    label: 'Gordura',
    short: 'G',
    barClass: 'bg-violet-500/80',
    format: (n) => formatGrams(n),
  },
];

function pct(used, target) {
  const t = Number(target);
  if (!t || t <= 0) return 0;
  return Math.min(100, Math.max(0, (Number(used) || 0) / t * 100));
}

/**
 * Barras de kcal + P/C/G.
 * @param {'full'|'compact'} variant
 */
export default function MacroBars({
  totals = {},
  targets = {},
  variant = 'full',
  className,
}) {
  const compact = variant === 'compact';

  return (
    <div className={cn('space-y-2.5', compact && 'space-y-2', className)}>
      {ROWS.map((row) => {
        const used = totals[row.key] ?? 0;
        const target = targets[row.key];
        const hasTarget = target != null && Number(target) > 0;
        const p = hasTarget ? pct(used, target) : 0;
        const over = hasTarget && Number(used) > Number(target) * 1.02;

        return (
          <div key={row.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={cn('text-muted-foreground shrink-0', compact && 'w-7')}>
                {compact ? row.short : row.label}
              </span>
              <span className="tabular-nums text-right min-w-0 truncate">
                <span className={cn(over && 'text-amber-400')}>{row.format(used)}</span>
                {hasTarget ? (
                  <span className="text-muted-foreground"> / {row.format(target)}</span>
                ) : null}
              </span>
            </div>
            <div
              className={cn(
                'w-full rounded-full bg-secondary/60 overflow-hidden',
                compact ? 'h-1.5' : 'h-2',
              )}
              role="progressbar"
              aria-valuenow={Math.round(Number(used) || 0)}
              aria-valuemin={0}
              aria-valuemax={hasTarget ? Math.round(Number(target)) : undefined}
              aria-label={`${row.label}: ${row.format(used)}${hasTarget ? ` de ${row.format(target)}` : ''}`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-200 ease-out',
                  row.barClass,
                  over && 'opacity-90',
                  !hasTarget && Number(used) > 0 && 'w-full opacity-40',
                )}
                style={{
                  width: hasTarget
                    ? `${p}%`
                    : Number(used) > 0
                      ? '100%'
                      : '0%',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
