import React from "react";
import { CalendarClock, Eye, EyeOff, PencilLine, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function HideMoneyButton({ hide, className }) {
  const Icon = hide.hidden ? EyeOff : Eye;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={hide.toggle}
      aria-pressed={hide.hidden}
      aria-label={hide.hidden ? "Mostrar valores" : "Ocultar valores"}
      title={hide.hidden ? "Mostrar valores" : "Ocultar valores"}
      className={cn(
        "h-10 w-10 shrink-0 rounded-full text-muted-foreground transition-transform duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground active:scale-[0.96] motion-reduce:transition-none",
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </Button>
  );
}

/** Topo da carteira: caixa livre em destaque e, embaixo, caixa, reservado e faturas abertas. */
export function WalletHero({ overview, hide }) {
  const { money } = hide;
  const stats = [
    { label: "Caixa", value: overview.caixa },
    { label: "Reservado", value: overview.reserved },
    { label: "Faturas abertas", value: overview.cards_total },
  ];
  return (
    <Card className="min-w-0">
      <CardContent className="flex h-full flex-col justify-between gap-6 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-sm font-medium text-muted-foreground">Caixa livre</h2>
            <p
              className={cn(
                "font-display text-4xl font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-5xl",
                Number(overview.livre) < 0 && "text-amber-200",
              )}
            >
              {money(overview.livre)}
            </p>
            <p className="pt-1 text-xs text-muted-foreground">Caixa menos o que já está reservado no mês.</p>
          </div>
          <HideMoneyButton hide={hide} className="-mr-2 -mt-2" />
        </div>
        <dl className="grid gap-2.5 border-t border-white/[0.06] pt-4 sm:grid-cols-3 sm:gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 items-baseline justify-between gap-3 sm:block sm:space-y-1">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="text-base font-semibold tabular-nums sm:text-lg">{money(stat.value)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

const pillClass =
  "h-10 rounded-full border-white/10 bg-white/[0.03] px-4 text-sm font-medium transition-transform duration-150 ease-out hover:bg-white/[0.07] active:scale-[0.96] motion-reduce:transition-none";

/** Ações rápidas abaixo da pilha de cartões. */
export function WalletActions({ hide, syncing, onUpdateBalance, onSync, onDues }) {
  const EyeIcon = hide.hidden ? Eye : EyeOff;
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className={pillClass} onClick={onUpdateBalance}>
        <PencilLine className="mr-1.5 h-4 w-4" aria-hidden />
        Atualizar saldo
      </Button>
      <Button type="button" variant="outline" className={pillClass} disabled={syncing} onClick={onSync}>
        <RefreshCw className={cn("mr-1.5 h-4 w-4", syncing && "animate-spin motion-reduce:animate-none")} aria-hidden />
        {syncing ? "Sincronizando…" : "Sincronizar"}
      </Button>
      <Button type="button" variant="outline" className={pillClass} onClick={onDues}>
        <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden />
        Vencimentos
      </Button>
      <Button type="button" variant="outline" className={pillClass} aria-pressed={hide.hidden} onClick={hide.toggle}>
        <EyeIcon className="mr-1.5 h-4 w-4" aria-hidden />
        {hide.hidden ? "Mostrar valores" : "Ocultar valores"}
      </Button>
    </div>
  );
}
