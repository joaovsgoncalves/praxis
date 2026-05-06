import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ListTodo, Target, Timer, BarChart3, Settings, Mic, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/habitos-tarefas', label: 'Hábitos & Tarefas', icon: ListTodo },
  { path: '/foco', label: 'Modo Foco', icon: Timer },
  { path: '/metas', label: 'Metas', icon: Target },
  { path: '/historico', label: 'Histórico', icon: BarChart3 },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

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
        <div className="flex items-center justify-between px-6 h-16 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="text-lg font-bold text-sidebar-foreground tracking-tight">FlowAI</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
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
                    ? "bg-primary/15 text-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <Link
            to="/captura"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all text-sm font-medium"
          >
            <Mic className="w-4 h-4" />
            Captura por Voz
          </Link>
        </div>
      </aside>
    </>
  );
}