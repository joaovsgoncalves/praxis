import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ListTodo, BookOpen, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const linkClass = ({ isActive }) =>
  cn(
    "flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium leading-none praxis-touch-target",
    "transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
    isActive
      ? "bg-primary/[0.12] text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)]"
      : "text-muted-foreground",
  );

export default function MobileBottomNav({ onOpenMenu }) {
  const location = useLocation();

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
      aria-label="Navegação principal"
    >
      <div className="praxis-nav-island pointer-events-auto mx-auto flex h-16 max-w-md items-stretch gap-1 rounded-[22px] p-1.5">
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden />
          <span>Hoje</span>
        </NavLink>

        <NavLink
          to="/habitos-tarefas"
          className={({ isActive }) =>
            linkClass({ isActive: isActive || location.pathname === "/habitos-tarefas" })
          }
        >
          <ListTodo className="h-5 w-5 shrink-0" aria-hidden />
          <span>Hábitos</span>
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
