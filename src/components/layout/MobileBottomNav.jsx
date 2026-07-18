import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { praxisApi } from '@/api/praxisClient';
import { LayoutDashboard, ListTodo, Mic, BookOpen, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const linkClass = ({ isActive }) =>
  cn(
    'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors praxis-touch-target',
    isActive ? 'text-primary' : 'text-muted-foreground',
  );

export default function MobileBottomNav({ onOpenMenu }) {
  const location = useLocation();
  const onCaptura = location.pathname === '/captura' || location.pathname === '/capturas';

  const { data: pending } = useQuery({
    queryKey: ['captures', 'pending-count'],
    queryFn: () => praxisApi.captures.pendingCount(),
    staleTime: 25_000,
    refetchInterval: 30_000,
  });
  const inboxCount = pending?.count ?? 0;

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
          to="/habitos-tarefas"
          className={({ isActive }) =>
            linkClass({ isActive: isActive || location.pathname === '/habitos-tarefas' })
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
          aria-label="Falar — captura por voz"
        >
          <span
            className={cn(
              'relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95',
              'bg-primary text-primary-foreground shadow-primary/25',
            )}
          >
            <Mic className="h-6 w-6" />
            {inboxCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center px-1">
                {inboxCount > 9 ? '9+' : inboxCount}
              </span>
            )}
          </span>
          <span className="mt-1 text-[10px] font-medium text-muted-foreground">Falar</span>
        </NavLink>

        <NavLink
          to="/revisao-semanal"
          className={({ isActive }) => linkClass({ isActive })}
        >
          <BookOpen className="h-5 w-5 shrink-0" aria-hidden />
          <span>Revisar</span>
        </NavLink>

        <button
          type="button"
          onClick={onOpenMenu}
          className={linkClass({ isActive: false })}
          aria-label="Abrir menu — ferramentas na lateral"
        >
          <Menu className="h-5 w-5 shrink-0" aria-hidden />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
