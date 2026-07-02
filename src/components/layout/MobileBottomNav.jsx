import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, ListTodo, Mic, Timer, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const linkClass = ({ isActive }) =>
  cn(
    'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors praxis-touch-target',
    isActive ? 'text-primary' : 'text-muted-foreground',
  );

export default function MobileBottomNav({ onOpenMenu }) {
  const location = useLocation();
  const onCaptura = location.pathname === '/captura' || location.pathname === '/capturas';

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch px-1">
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden />
          <span>Hoje</span>
        </NavLink>

        <NavLink
          to="/habitos-tarefas?tab=tasks"
          className={({ isActive }) =>
            linkClass({
              isActive:
                isActive ||
                (location.pathname === '/habitos-tarefas' && location.search.includes('tab=tasks')),
            })
          }
        >
          <ListTodo className="h-5 w-5 shrink-0" aria-hidden />
          <span>Tarefas</span>
        </NavLink>

        <NavLink
          to="/captura"
          className={cn(
            'flex flex-1 flex-col items-center justify-center -mt-5 praxis-touch-target',
            onCaptura && 'text-primary',
          )}
          aria-label="Captura por voz"
        >
          <span
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95',
              onCaptura
                ? 'bg-primary text-primary-foreground shadow-primary/30'
                : 'bg-primary text-primary-foreground shadow-primary/25',
            )}
          >
            <Mic className="h-6 w-6" />
          </span>
          <span className="mt-1 text-[10px] font-medium text-muted-foreground">Voz</span>
        </NavLink>

        <NavLink to="/foco" className={linkClass}>
          <Timer className="h-5 w-5 shrink-0" aria-hidden />
          <span>Foco</span>
        </NavLink>

        <button
          type="button"
          onClick={onOpenMenu}
          className={cn(linkClass({ isActive: false }), 'border-0 bg-transparent')}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}