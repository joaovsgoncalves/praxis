import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ListTodo, Target, Timer, BarChart3, Settings, Mic, X, Sparkles, Link2, Trophy, BookOpen, Lightbulb } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/habitos-tarefas', label: 'Hábitos & Tarefas', icon: ListTodo },
  { path: '/ideias', label: 'Ideias', icon: Lightbulb },
  { path: '/foco', label: 'Modo Foco', icon: Timer },
  { path: '/metas', label: 'Metas', icon: Target },
  { path: '/rituais', label: 'Rituais', icon: Link2 },
  { path: '/conquistas', label: 'Conquistas', icon: Trophy },
  { path: '/revisao-semanal', label: 'Revisão Semanal', icon: BookOpen },
  { path: '/historico', label: 'Histórico', icon: BarChart3 },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

// Apple-Watch-style ring drawn in SVG. Compact, but no longer tiny — the sidebar
// is part of the cockpit identity and should read like a status module.
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
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="hsl(var(--domain-gold))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)',
            filter: 'drop-shadow(0 0 4px hsl(var(--domain-gold) / 0.6))',
          }}
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
      <div className="flex items-center gap-3.5 px-3 py-3.5 rounded-2xl glass-surface">
        <AvatarRing progress={progress_pct} level={level} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-semibold text-domain-gold truncate">{level_name}</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {xp_total.toLocaleString('pt-BR')} XP
          </p>
          {next_level_xp && (
            <p className="text-xs text-muted-foreground/75 mt-0.5">
              {xpToNext} pro próximo
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ open, onClose }) {
  const location = useLocation();

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-72 bg-sidebar z-50 flex flex-col border-r border-sidebar-border transition-transform duration-300 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-20 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gold/20 border border-gold/20 flex items-center justify-center shadow-lg shadow-gold/10">
              <Sparkles className="w-5 h-5 text-gold" />
            </div>
            <div>
              <span className="block font-display text-lg font-bold text-sidebar-foreground tracking-tight">Praxis</span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/40">cockpit diário</span>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5 space-y-1.5">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[15px] font-medium transition-all",
                  isActive
                    ? "bg-gold text-sidebar-primary-foreground font-semibold shadow-lg shadow-gold/20"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive ? "text-sidebar-primary-foreground" : "")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Gamification bar */}
        <SidebarGamificationBar />

        {/* Voice capture */}
        <div className="p-4 border-t border-sidebar-border">
          <Link
            to="/captura"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all",
              location.pathname === '/captura'
                ? "bg-gold text-sidebar-primary-foreground font-semibold"
                : "bg-gold/10 text-gold hover:bg-gold/20 border border-gold/20"
            )}
          >
            <Mic className="w-4 h-4" />
            Captura por Voz
          </Link>
        </div>
      </aside>
    </>
  );
}
