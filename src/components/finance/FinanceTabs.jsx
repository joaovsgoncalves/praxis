import React, { useRef } from "react";
import { FINANCE_TABS } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const FINANCE_PANEL_ID = "finance-panel";
export const financeTabId = (id) => `finance-tab-${id}`;

/** Seletor das três áreas. Fica preso no topo ao rolar; setas, Home e End trocam de aba. */
export default function FinanceTabs({ tab, onChange }) {
  const refs = useRef({});

  function onKeyDown(event) {
    const index = FINANCE_TABS.findIndex((item) => item.id === tab);
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % FINANCE_TABS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + FINANCE_TABS.length) % FINANCE_TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = FINANCE_TABS.length - 1;
    if (next == null) return;
    event.preventDefault();
    const target = FINANCE_TABS[next].id;
    onChange(target);
    refs.current[target]?.focus();
  }

  return (
    <div className="sticky top-0 z-30 -mx-1 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div
        role="tablist"
        aria-label="Áreas de Finanças"
        onKeyDown={onKeyDown}
        className="flex w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1"
      >
        {FINANCE_TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                refs.current[item.id] = node;
              }}
              type="button"
              role="tab"
              id={financeTabId(item.id)}
              aria-selected={selected}
              aria-controls={FINANCE_PANEL_ID}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                "praxis-touch-target flex h-10 min-w-0 flex-auto items-center justify-center rounded-full px-2 text-[13px] font-medium transition-colors sm:px-4 sm:text-sm",
                selected
                  ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40"
                  : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
