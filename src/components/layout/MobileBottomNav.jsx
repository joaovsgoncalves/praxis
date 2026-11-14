import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { mobileNavItems } from "@/lib/praxisNav";
import { prefetchHandlers } from "@/lib/routePrefetch";

const linkClass = ({ isActive }) =>
  cn(
    "flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium leading-none praxis-touch-target",
    "transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
    isActive
      ? "bg-primary/[0.12] text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)]"
      : "text-muted-foreground",
  );

/** A tela conjunta antiga acende o destino que ela está mostrando. */
function legacyDestination(location) {
  if (location.pathname !== "/habitos-tarefas") return null;
  return new URLSearchParams(location.search).get("tab") === "habits" ? "/habitos" : "/tarefas";
}

// O menu (Revisar, Frentes, Foco e o resto) abre pelo botão do cabeçalho.
export default function MobileBottomNav() {
  const location = useLocation();
  const legacy = legacyDestination(location);

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
      aria-label="Navegação principal"
    >
      <div className="praxis-nav-island pointer-events-auto mx-auto flex h-16 max-w-md items-stretch gap-1 rounded-[22px] p-1.5">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              {...prefetchHandlers(item.path)}
              className={({ isActive }) => linkClass({ isActive: isActive || legacy === item.path })}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
