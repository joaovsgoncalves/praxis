import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ListTodo, Target, Timer, BarChart3, Settings, Mic, X, Sparkles, Link2, Trophy, BookOpen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/habitos-tarefas', label: 'Hábitos & Tarefas', icon: ListTodo },
  { path: '/foco', label: 'Modo Foco', icon: Timer },
  { path: '/metas', label: 'Metas', icon: Target },
  { path: '/rituais', label: 'Rituais', icon: Link2 },
  { path: '/conquistas', label: 'Conquistas', icon: Trophy },
  { path: '/revisao-semanal', label: 'Revisão Semanal', icon: BookOpen },
  { path: '/historico', label: 'Histórico', icon: BarChart3 },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

function SidebarGamificationBar() {
  const { data } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => forjaApi.gamification.get(),
    staleTime: 30_000,
  });

  if (!data) return null;

  const { level, level_name, xp_total, next_level_xp, progress_pct } = data;

  return (
    <div className="px-3 pb-2 pt-1 border-t border-sidebar-border">
      <div className="px-3 py-2.5 rounded-lg bg-gold/5 border border-gold/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gold truncate">
            Nv. {level} — {level_name}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
            {xp_total} XP
          </span>
        </div>
        <Progress
          value={progress_pct}
          className="h-1.5 [&>div]:bg-gold"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          {xp_total} / {next_level_xp} XP
        </p>
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
        "fixed top-0 left-0 h-full w-64 bg-sidebar z-50 flex flex-col border-r border-sidebar-border transition-transform duration-300 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-gold" />
            </div>
            <span className="text-base font-bold text-sidebar-foreground tracking-tight">Forja do Jota</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-gold text-sidebar-primary-foreground font-semibold shadow-lg shadow-gold/20"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-sidebar-primary-foreground" : "")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Gamification bar */}
        <SidebarGamificationBar />

        {/* Voice capture */}
        <div className="p-3 border-t border-sidebar-border">
          <Link
            to="/captura"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all",
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
