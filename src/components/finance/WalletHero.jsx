import React from "react";
import { CalendarClock, ChevronRight, Clock3, Eye, EyeOff, PencilLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COMMITMENT_KIND_LABELS, formatShortDay } from "@/lib/finance";
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

/** Lista do que sai até o salário (popover a partir da linha "Compromissos até o salário"). */
function CommitmentsList({ overview, money }) {
  const items = overview.commitments_until_salary || [];
  const unknown = overview.commitments_unknown_day || [];
  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="text-sm font-semibold">Até o salário de {formatShortDay(overview.next_salary_date)}</p>
        <p className="text-xs text-muted-foreground">
          Fixas não pagas, assinaturas e mínimo de cartão em aberto. Dívida adiada não entra.
        </p>
      </div>
      {items.length ? (
        <ul className="divide-y divide-white/[0.06]">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}-${item.due_date}`} className="flex items-center gap-3 py-2">
              <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatShortDay(item.due_date)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="block text-[11px] text-muted-foreground">{COMMITMENT_KIND_LABELS[item.kind]}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nada sai do caixa até o salário.</p>
      )}
      {unknown.length ? (
        <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Sem dia definido, fora da conta: {unknown.map((u) => u.name).join(", ")}. Coloque o dia em Organização.
        </p>
      ) : null}
    </div>
  );
}

/** Topo da carteira: pode gastar até o salário em destaque; embaixo, compromissos, livre, caixa, reservado e faturas. */
export function WalletHero({ overview, hide }) {
  const { money } = hide;
  const bankStamp = fortalezaStamp(overview.bank_data_as_of);
  const hasSalary = Boolean(overview.next_salary_date);
  const safe = overview.safe_to_spend ?? overview.livre;
  const stats = [
    { label: "Caixa livre", value: overview.livre, warn: Number(overview.livre) < 0 },
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
              <h2 className="text-sm font-medium text-muted-foreground">
                {hasSalary ? `Pode gastar até ${formatShortDay(overview.next_salary_date)}` : "Pode gastar"}
              </h2>
              {bankStamp ? (
                <span
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
                  title="Dado mais antigo entre os bancos, no horário de Fortaleza"
                >
                  Banco: {bankStamp}
                </span>
              ) : null}
            </div>
            <p className="font-display text-4xl font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-5xl">
              {money(safe)}
            </p>
            {hasSalary ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="-ml-2 mt-1 inline-flex min-h-10 flex-wrap items-center gap-x-1 rounded-2xl px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Compromissos até o salário
                    <span className="font-semibold tabular-nums text-foreground">{money(overview.committed_until_salary)}</span>
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] rounded-xl p-4">
                  <CommitmentsList overview={overview} money={money} />
                </PopoverContent>
              </Popover>
            ) : null}
            {Number(overview.manual_pending_out) > 0 ? (
              <p className="text-xs text-muted-foreground">
                Já desconta {money(overview.manual_pending_out)} lançado por ti que o banco ainda não mostrou.
              </p>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-4">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 space-y-0.5">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className={cn("truncate text-base font-semibold tabular-nums sm:text-lg", stat.warn && "text-amber-200")}>
                {money(stat.value)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

const pillClass =
  "h-10 rounded-full border-white/10 bg-white/[0.03] px-4 text-sm font-medium transition-transform duration-150 ease-out hover:bg-white/[0.07] active:scale-[0.96] motion-reduce:transition-none";

/** Ações rápidas abaixo da pilha de cartões; "Lançar gasto" é a primária. */
export function WalletActions({ hide, midasSync, onUpdateBalance, onDues, onSpend }) {
  const EyeIcon = hide?.hidden ? Eye : EyeOff;
  return (
    <div className="flex flex-wrap gap-2">
      {onSpend ? (
        <Button
          type="button"
          className="h-10 rounded-full px-4 text-sm font-semibold transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none"
          onClick={onSpend}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Lançar gasto
        </Button>
      ) : null}
      <Button type="button" variant="outline" className={pillClass} onClick={onUpdateBalance}>
        <PencilLine className="mr-1.5 h-4 w-4" aria-hidden />
        Atualizar saldo
      </Button>
      <Button type="button" variant="outline" className={pillClass} onClick={onDues}>
        <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden />
        Vencimentos
      </Button>
      {hide ? (
        <Button type="button" variant="outline" className={pillClass} aria-pressed={hide.hidden} onClick={hide.toggle}>
          <EyeIcon className="mr-1.5 h-4 w-4" aria-hidden />
          {hide.hidden ? "Mostrar valores" : "Ocultar valores"}
        </Button>
      ) : null}
      <MidasChip sync={midasSync} />
    </div>
  );
}
