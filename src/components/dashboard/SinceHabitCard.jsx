import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { daysSinceDate, formatSinceDatePt, sinceMilestone } from "@/lib/habits";

export default function SinceHabitCard({ habit, today }) {
  if (!habit) return null;
  const days = habit.days_since !== undefined && habit.days_since !== null
    ? Number(habit.days_since)
    : daysSinceDate(habit.since_date, today);

  const milestone = habit.since_line
    ? { phase: habit.since_phase, line: habit.since_line }
    : sinceMilestone(days);

  const sinceText = formatSinceDatePt(habit.since_date);

  return (
    <Card className="praxis-dashboard-card border border-domain-gold/25 bg-card/60 overflow-hidden">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-domain-gold" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-domain-gold">
              Limpo
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground/80 font-medium">
            {habit.since_phase || milestone.phase}
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2.5">
          <span className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight text-foreground">
            {days}
          </span>
          <span className="text-sm sm:text-base font-medium text-muted-foreground">
            {days === 1 ? "dia" : "dias"}
          </span>
        </div>

        {sinceText ? (
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            {sinceText}
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-3.5 space-y-2">
          <p className="text-xs sm:text-sm font-medium text-foreground/90 leading-relaxed">
            {habit.since_line || milestone.line}
          </p>
          <p className="text-[11px] text-muted-foreground/75 border-t border-white/[0.04] pt-2">
            Você já segurou isso do fim de 2022 a 2025.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
