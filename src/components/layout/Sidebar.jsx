import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { cn } from '@/lib/utils';
import { primaryNavItems } from '@/lib/praxisNav';

function AvatarRing({ progress, level }) {
  const size = 68;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, progress)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(0 0% 100% / 0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--domain-gold))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-domain-gold/30 to-domain-ember/20 flex items-center justify-center">
        <span className="font-display text-xl font-bold text-foreground">{level}</span>
      </div>
    </div>
  );
}

function SidebarGamificationBar() {
  const { data } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => forjaApi.gamification.get(),
    staleTime: 30_000,
  });

  if (!data) return null;

  const { level, level_name, xp_total, next_level_xp, progress_pct } = data;
  const xpToNext = next_level_xp ? Math.max(0, next_level_xp - xp_total) : 0;

  return (
    <div className="px-4 pb-4 pt-3 border-t border-sidebar-border">
      <div className="flex items-center gap-3.5 px-3 py-3.5 rounded-xl border border-sidebar-border bg-sidebar-accent/40">
        <AvatarRing progress={progress_pct} level={level} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-semibold text-domain-gold truncate">{level_name}</p>
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {xp_total.toLocaleString('pt-BR')} XP
          </p>
          {next_level_xp && (
            <p className="text-xs text-muted-foreground/75 mt-0.5">
              Faltam {xpToNext.toLocaleString('pt-BR')} XP
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function isNavActive(location, item) {
  if (item.end) return location.pathname === '/';
  if (item.path === '/habitos-tarefas') {
    return location.pathname === '/habitos-tarefas';
  }
  if (item.path === '/captura') {
    return location.pathname === '/captura' || location.pathname === '/capturas';
  }
  return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
}

export default function Sidebar({ open, onClose }) {
  const location = useLocation();

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-72 bg-sidebar z-50 flex flex-col border-r border-sidebar-border transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 h-20 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-gold" />
            </div>
            <span className="font-display text-lg font-bold text-sidebar-foreground tracking-tight">Praxis</span>
          </div>
          <button type="button" onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5 space-y-1.5">
          {primaryNavItems.map((item) => {
            const isActive = isNavActive(location, item);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[15px] font-medium transition-colors',
                  isActive
                    ? 'bg-gold/90 text-sidebar-primary-foreground font-semibold'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                )}
              >
                <item.icon className={cn('w-[18px] h-[18px] shrink-0', isActive ? 'text-sidebar-primary-foreground' : '')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <SidebarGamificationBar />
      </aside>
    </>
  );
}