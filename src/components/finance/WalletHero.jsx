import React from "react";
import { CalendarClock, Clock3, Eye, EyeOff, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fortalezaStamp, midasLabel } from "@/lib/financeClock";
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

/** Chip discreto com a hora do Midas (último ingest ok); substitui o antigo "Sincronizar" do Pierre. */
export function MidasChip({ sync, className }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-muted-foreground",
        className,
      )}
    >
      <Clock3 className="h-4 w-4" aria-hidden />
      {midasLabel(sync)}
    </span>
  );
}

/** Topo da carteira: caixa livre em destaque, o que dá pra gastar e, embaixo, caixa, reservado e faturas. */
export function WalletHero({ overview, hide }) {
  const { money } = hide;
  const bankStamp = fortalezaStamp(overview.bank_data_as_of);
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">Caixa livre</h2>
              {bankStamp ? (
                <span
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
                  title="Dado mais antigo entre os bancos, no horário de Fortaleza"
                >
                  Banco: {bankStamp}
                </span>
              ) : null}
            </div>
            <p
              className={cn(
                "font-display text-4xl font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-5xl",
                Number(overview.livre) < 0 && "text-amber-200",
              )}
            >
              {money(overview.livre)}
            </p>
            <p className="pt-1 text-xs text-muted-foreground">Caixa menos o que já está reservado no mês.</p>
            {overview.safe_to_spend != null ? (
              <div className="mt-3 inline-flex flex-col gap-0.5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3.5 py-2.5">
                <p className="text-xs font-medium text-emerald-200/90">Pode gastar</p>
                <p className="text-xl font-semibold leading-tight tabular-nums">{money(overview.safe_to_spend)}</p>
                <p className="text-[11px] text-muted-foreground">livre menos faturas dos próximos 7 dias</p>
              </div>
            ) : null}
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
export function WalletActions({ hide, midasSync, onUpdateBalance, onDues }) {
  const EyeIcon = hide.hidden ? Eye : EyeOff;
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className={pillClass} onClick={onUpdateBalance}>
        <PencilLine className="mr-1.5 h-4 w-4" aria-hidden />
        Atualizar saldo
      </Button>
      <Button type="button" variant="outline" className={pillClass} onClick={onDues}>
        <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden />
        Vencimentos
      </Button>
      <Button type="button" variant="outline" className={pillClass} aria-pressed={hide.hidden} onClick={hide.toggle}>
        <EyeIcon className="mr-1.5 h-4 w-4" aria-hidden />
        {hide.hidden ? "Mostrar valores" : "Ocultar valores"}
      </Button>
      <MidasChip sync={midasSync} />
    </div>
  );
}
