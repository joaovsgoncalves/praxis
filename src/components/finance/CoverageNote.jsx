import React from "react";
import { totalDisplay } from "@/lib/financeCoverage";
import { cn } from "@/lib/utils";

const DOT = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  muted: "bg-white/30",
};

/** Uma linha que diz de onde vêm os totais do período: extrato completo, parcial, só à mão ou nada. */
export function CoverageNote({ view, className }) {
  if (!view) return null;
  return (
    <p
      data-testid="coverage-note"
      data-status={view.status}
      className={cn("flex items-start gap-2 text-xs leading-relaxed text-muted-foreground", className)}
    >
      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[view.tone] || DOT.muted)} aria-hidden />
      <span>
        <span className={cn("font-medium", view.tone === "warn" ? "text-amber-200" : "text-foreground")}>{view.label}.</span>{" "}
        {view.detail}
      </span>
    </p>
  );
}

/** Total de período: só vira número quando o extrato sustenta. Zero sem extrato aparece como "sem dado". */
export function CoveredMoney({ view, value, money, className }) {
  const shown = totalDisplay(view, value);
  if (!shown.known) {
    return (
      <span className={className} data-covered="unknown">
        <span aria-hidden>—</span>
        <span className="sr-only">{view?.status === "loading" ? "lendo" : "sem dado para afirmar"}</span>
      </span>
    );
  }
  return (
    <span className={className} data-covered={shown.qualifier ? "qualified" : "full"}>
      {money(value)}
      {shown.qualifier ? (
        <span className="ml-1.5 align-middle text-[11px] font-medium text-amber-200">{shown.qualifier}</span>
      ) : null}
    </span>
  );
}

/** Subtotal do que foi lançado à mão, quando está misturado com o extrato. */
export function ManualSubtotal({ manual, money, className }) {
  if (!manual) return null;
  const parts = [];
  if (manual.out > 0) parts.push(`${money(manual.out)} de saída`);
  if (manual.in > 0) parts.push(`${money(manual.in)} de entrada`);
  if (!parts.length) return null;
  return (
    <p data-testid="manual-subtotal" className={cn("text-xs text-muted-foreground", className)}>
      Lançado à mão: {parts.join(" e ")} ({manual.count === 1 ? "1 lançamento" : `${manual.count} lançamentos`}).
    </p>
  );
}
