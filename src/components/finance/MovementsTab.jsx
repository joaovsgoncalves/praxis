import React, { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Search } from "lucide-react";
import { toast } from "sonner";
import { praxisApi } from "@/api/praxisClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PraxisEmptyState, PraxisListSkeleton, SectionHeader } from "@/components/layout/PraxisPage";
import { ChoiceChip } from "@/components/finance/SpendSheet";
import { addDaysYmd, formatDay } from "@/lib/finance";
import {
  ALL_CATEGORIES,
  OFF_BUDGET_CATEGORIES,
  categoryIcon,
  dayHeading,
  groupTransactionsByDay,
  isManualTx,
  isOutflow,
} from "@/lib/financeCategories";
import { cn } from "@/lib/utils";

const PAGE_DAYS = 60;

function TxRow({ tx, accountName, money, onOpen }) {
  const Icon = categoryIcon(tx.category);
  const out = isOutflow(tx);
  const offBudget = OFF_BUDGET_CATEGORIES.includes(tx.category) || tx.direction === "internal";
  const value = money(Math.abs(Number(tx.amount) || 0));
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(tx)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)]">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{tx.merchant || tx.raw_description || "Lançamento"}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              {tx.category}
              {accountName ? ` · ${accountName}` : ""}
            </span>
            {isManualTx(tx) ? (
              <span className="shrink-0 rounded-full bg-primary/15px-1.5 py-px text-[11px] font-medium text-primary">
                lançado por ti
              </span>
            ) : null}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            out ? "text-foreground" : "text-emerald-300",
            offBudget && "font-medium text-muted-foreground",
          )}
        >
          <span className="sr-only">{out ? "saída" : "entrada"} </span>
          <span aria-hidden>{out ? "−" : "+"}</span>
          {value}
        </span>
      </button>
    </li>
  );
}

function CategoryDialog({ tx, onClose }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, category }) => praxisApi.finance.transactions.update(id, { category }),
    onMutate: async ({ id, category }) => {
      await queryClient.cancelQueries({ queryKey: ["finance", "transactions"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["finance", "transactions"] });
      queryClient.setQueriesData({ queryKey: ["finance", "transactions"] }, (old) =>
        Array.isArray(old) ? old.map((row) => (row.id === id ? { ...row, category } : row)) : old,
      );
      onClose();
      return { snapshots };
    },
    onError: (err, _vars, context) => {
      for (const [key, data] of context?.snapshots || []) queryClient.setQueryData(key, data);
      toast.error(err?.message || "Não deu para trocar a categoria");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["finance"] }),
  });

  return (
    <Dialog open={Boolean(tx)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{tx?.merchant || tx?.raw_description || "Lançamento"}</DialogTitle>
          <DialogDescription>
            {tx ? `${formatDay(tx.posted_on)} · escolha a categoria` : ""}
          </DialogDescription>
        </DialogHeader>
        {tx?.raw_description && tx.raw_description !== tx.merchant ? (
          <p className="truncate text-xs text-muted-foreground">Banco: {tx.raw_description}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((cat) => (
            <ChoiceChip
              key={cat}
              icon={categoryIcon(cat)}
              selected={tx?.category === cat}
              onClick={() => tx && mutation.mutate({ id: tx.id, category: cat })}
            >
              {cat}
            </ChoiceChip>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Pagamento de fatura e transferência entre contas não entram no gráfico nem no orçamento.</p>
      </DialogContent>
    </Dialog>
  );
}

/** Extrato por dia com busca e filtros; carrega de 60 em 60 dias. */
export default function MovementsTab({ overview, money }) {
  const today = overview.today;
  const [days, setDays] = useState(PAGE_DAYS);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [account, setAccount] = useState("all");
  const [kind, setKind] = useState("all");
  const [editing, setEditing] = useState(null);

  const from = addDaysYmd(today, -days);
  const { data: transactions = [], isLoading, isFetching } = useQuery({
    queryKey: ["finance", "transactions", { from, to: today }],
    queryFn: () => praxisApi.finance.transactions.list({ from, to: today, limit: 1000 }),
    placeholderData: keepPreviousData,
  });

  const accountNames = useMemo(
    () => new Map((overview.accounts || []).map((a) => [a.id, a.name])),
    [overview.accounts],
  );

  const presentCategories = useMemo(
    () => ALL_CATEGORIES.filter((c) => transactions.some((tx) => tx.category === c)),
    [transactions],
  );
  const presentAccounts = useMemo(
    () => (overview.accounts || []).filter((a) => transactions.some((tx) => tx.account_id === a.id)),
    [overview.accounts, transactions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (category && tx.category !== category) return false;
      if (account !== "all" && (tx.account_id || "none") !== account) return false;
      if (kind === "out" && !isOutflow(tx)) return false;
      if (kind === "in" && isOutflow(tx)) return false;
      if (kind === "manual" && !isManualTx(tx)) return false;
      if (q && !`${tx.merchant} ${tx.raw_description} ${tx.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [transactions, search, category, account, kind]);

  const groups = useMemo(() => groupTransactionsByDay(filtered), [filtered]);
  const hasFilter = Boolean(search.trim() || category || account !== "all" || kind !== "all");

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Movimentações"
        icon={ArrowLeftRight}
        count={filtered.length}
        trailing={<p className="text-sm text-muted-foreground">Desde {formatDay(from)}</p>}
      />

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar padaria, Uber…"
              className="h-11 rounded-full pl-10"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="h-11 rounded-full" aria-label="Conta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {presentAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">Sem conta</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-11 rounded-full" aria-label="Tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Entradas e saídas</SelectItem>
                <SelectItem value="out">Só saídas</SelectItem>
                <SelectItem value="in">Só entradas</SelectItem>
                <SelectItem value="manual">Lançados por ti</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {presentCategories.length ? (
          <div className="praxis-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Categoria">
            <ChoiceChip selected={!category} onClick={() => setCategory("")}>
              Todas
            </ChoiceChip>
            {presentCategories.map((cat) => (
              <ChoiceChip
                key={cat}
                icon={categoryIcon(cat)}
                selected={category === cat}
                onClick={() => setCategory((current) => (current === cat ? "" : cat))}
              >
                {cat}
              </ChoiceChip>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <PraxisListSkeleton rows={5} />
      ) : !groups.length ? (
        <PraxisEmptyState
          icon={ArrowLeftRight}
          title={hasFilter ? "Nada com esse filtro" : "Sem movimentação ainda"}
          description={
            hasFilter
              ? "Tira um filtro ou busca outro nome."
              : "Quando o Midas mandar o extrato do banco ou você lançar um gasto, aparece aqui."
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.date} aria-label={dayHeading(group.date, today)} className="praxis-panel rounded-2xl p-2 sm:p-3">
              <header className="flex items-baseline justify-between gap-3 px-2 pb-1 pt-1">
                <h3 className="text-sm font-semibold">{dayHeading(group.date, today)}</h3>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {group.spent > 0 ? `Saiu ${money(group.spent)}` : null}
                  {group.spent > 0 && group.received > 0 ? " · " : null}
                  {group.received > 0 ? `Entrou ${money(group.received)}` : null}
                </p>
              </header>
              <ul>
                {group.items.map((tx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    accountName={accountNames.get(tx.account_id)}
                    money={money}
                    onOpen={setEditing}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-full border-white/10 bg-white/[0.03] px-5"
          disabled={isFetching}
          onClick={() => setDays((d) => d + PAGE_DAYS)}
        >
          {isFetching && !isLoading ? "Carregando…" : `Carregar mais ${PAGE_DAYS} dias`}
        </Button>
      </div>

      <CategoryDialog tx={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
