import React, { useState } from "react";
import { ChevronDown, Landmark } from "lucide-react";
import { SectionHeader } from "@/components/layout/PraxisPage";
import {
  ACCOUNT_KIND_LABELS,
  accountBrand,
  accountInitials,
  accountLast4,
  brandSurfaceStyle,
} from "@/lib/financeBrand";
import { accountBill } from "@/lib/financeWallet";
import { formatDay } from "@/lib/finance";
import { cn } from "@/lib/utils";

function AccountTile({ account, money }) {
  const brand = accountBrand(account);
  const last4 = accountLast4(account);
  const bill = account.kind === "credit" ? accountBill(account) : null;
  const meta = [
    ACCOUNT_KIND_LABELS[account.kind] || "Conta",
    last4 ? `•••• ${last4}` : null,
    account.available_as_of ? formatDay(account.available_as_of) : null,
  ].filter(Boolean);

  return (
    <li className="praxis-panel flex min-w-0 items-center gap-3 rounded-xl p-3">
      <span
        aria-hidden
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-xs font-semibold tracking-[0.02em]",
          brand.neutral && "shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.55)]",
        )}
        style={brandSurfaceStyle(brand)}
      >
        {accountInitials(account.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{account.name}</p>
        <p className="truncate text-xs tabular-nums text-muted-foreground">{meta.join(" · ")}</p>
      </div>
      <div className="shrink-0 text-right">
        {bill ? <p className="text-[11px] text-muted-foreground">{bill.label}</p> : null}
        <p className="text-sm font-semibold tabular-nums">{money(bill ? bill.amount : account.available)}</p>
      </div>
    </li>
  );
}

/** Contas do dia em grade; o resto fica em "Outras contas", fechado por padrão. */
export default function AccountsGrid({ accounts, money }) {
  const [othersOpen, setOthersOpen] = useState(false);
  const main = accounts.filter((a) => a.is_operational);
  const others = accounts.filter((a) => !a.is_operational);

  return (
    <section className="space-y-3">
      <SectionHeader title="Contas" icon={Landmark} count={main.length} />
      {main.length ? (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {main.map((acc) => (
            <AccountTile key={acc.id} account={acc} money={money} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma conta marcada como do dia.</p>
      )}
      {others.length ? (
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => setOthersOpen((open) => !open)}
            aria-expanded={othersOpen}
            aria-controls="financas-outras-contas"
            className="praxis-touch-target -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-white/[0.03] hover:text-foreground"
          >
            Outras contas
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/[0.06] px-2 font-mono text-xs tabular-nums">
              {others.length}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
                othersOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {othersOpen ? (
            <ul id="financas-outras-contas" className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((acc) => (
                <AccountTile key={acc.id} account={acc} money={money} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
