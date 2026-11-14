import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { praxisApi } from "@/api/praxisClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { addDaysYmd, parseMoneyInput } from "@/lib/finance";
import { SPEND_CATEGORIES, categoryIcon } from "@/lib/financeCategories";
import { UNCONFIRMED_MESSAGE, intentKeyFor, markUnconfirmed, outcomeUnknown, settleIntent } from "@/lib/financeIntent";
import { failureMessage } from "@/lib/apiFailure";
import { cn } from "@/lib/utils";

const OVERVIEW_KEY = ["finance", "overview"];
const SPEND_SCOPE = "spend";

function localToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Chip selecionável — mesma pílula das abas de Finanças, tamanho de toque. */
export function ChoiceChip({ selected, onClick, children, icon: Icon, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none",
        selected
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        className,
      )}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Desconta o gasto do overview na hora (mesma regra da API: conta do dia ou sem conta). */
function applyOptimistic(old, { amount, accountId, postedOn }) {
  if (!old) return old;
  const account = (old.accounts || []).find((a) => a.id === accountId);
  const hitsCash = !accountId || (account?.is_operational && account?.kind !== "credit");
  const isToday = postedOn === old.today;
  const next = { ...old };
  if (hitsCash && isToday) {
    next.caixa = round2(Number(old.caixa || 0) - amount);
    next.livre = round2(Number(old.livre || 0) - amount);
    next.safe_to_spend = round2(Math.max(0, Number(old.livre || 0) - amount - Number(old.committed_until_salary || 0)));
    next.manual_pending_out = round2(Number(old.manual_pending_out || 0) + amount);
  }
  if (old.month && postedOn?.slice(0, 7) === old.month.month) {
    next.month = { ...old.month, total_out: round2(Number(old.month.total_out || 0) + amount) };
  }
  return next;
}

/**
 * Sheet rápido de gasto: valor com teclado numérico e foco automático, descrição,
 * categoria em chips, conta opcional e data (hoje/ontem). Grava com source joão.
 */
export default function SpendSheet({ open, onOpenChange, accounts = [], today }) {
  const queryClient = useQueryClient();
  const day = today || localToday();
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState(null);
  const [postedOn, setPostedOn] = useState(day);
  const [error, setError] = useState("");
  const amountRef = useRef(null);

  const choices = accounts.filter((a) => a.status !== "archived");

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setMerchant("");
    setCategory("");
    setAccountId(null);
    setPostedOn(day);
    setError("");
  }, [open, day]);

  const mutation = useMutation({
    mutationFn: (data) => praxisApi.finance.transactions.create(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: OVERVIEW_KEY });
      const previous = queryClient.getQueryData(OVERVIEW_KEY);
      queryClient.setQueryData(OVERVIEW_KEY, (old) =>
        applyOptimistic(old, { amount: Math.abs(data.amount), accountId: data.account_id, postedOn: data.posted_on }),
      );
      return { previous };
    },
    onSuccess: (row) => {
      settleIntent(SPEND_SCOPE);
      toast.success(row?.replayed ? "Esse gasto já estava lançado. Nada entrou duas vezes." : "Gasto lançado");
      onOpenChange(false);
    },
    onError: (err, _data, context) => {
      queryClient.setQueryData(OVERVIEW_KEY, context?.previous);
      if (outcomeUnknown(err)) {
        // pode ter gravado: guarda a chave para o reenvio igual devolver o primeiro resultado
        markUnconfirmed(SPEND_SCOPE);
        setError(UNCONFIRMED_MESSAGE);
        return;
      }
      settleIntent(SPEND_SCOPE);
      setError(failureMessage(err, err?.message || "Não deu para lançar o gasto"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
  });

  function submit(event) {
    event.preventDefault();
    const value = parseMoneyInput(amount);
    if (!(value > 0)) {
      setError("Digite o valor, por exemplo 25,90");
      amountRef.current?.focus();
      return;
    }
    const data = {
      amount: -value,
      direction: "outflow",
      merchant: merchant.trim() || category || "Gasto",
      category: category || "Outros",
      account_id: accountId || undefined,
      posted_on: postedOn,
      source: "joao",
    };
    setError("");
    mutation.mutate({ ...data, intent_key: intentKeyFor(SPEND_SCOPE, data) });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-[28px] border-white/10 bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6 sm:mx-auto sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          amountRef.current?.focus();
        }}
      >
        <SheetHeader className="text-left">
          <SheetTitle>Lançar gasto</SheetTitle>
          <SheetDescription>Sai do pode gastar agora; quando o banco atualizar, a linha dele assume.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="mt-5 space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Valor</span>
            <div className="flex h-14 items-center gap-2 rounded-2xl bg-white/[0.04] px-4 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.08)] focus-within:shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.7)]">
              <span className="text-lg font-medium text-muted-foreground" aria-hidden>
                R$
              </span>
              <input
                ref={amountRef}
                inputMode="decimal"
                enterKeyHint="next"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.,]/g, ""));
                  setError("");
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "spend-amount-error" : undefined}
                className="min-w-0 flex-1 bg-transparent font-display text-3xl font-semibold tabular-nums tracking-[-0.02em] outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            {error ? (
              <span id="spend-amount-error" className="block text-sm text-amber-200">
                {error}
              </span>
            ) : null}
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Descrição</span>
            <Input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Padaria, Uber, farmácia…"
              maxLength={120}
              enterKeyHint="done"
              className="h-11 rounded-xl"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Categoria</legend>
            <div className="flex flex-wrap gap-2">
              {SPEND_CATEGORIES.map((cat) => (
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
          </fieldset>

          {choices.length ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Conta</legend>
              <div className="praxis-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                <ChoiceChip selected={!accountId} onClick={() => setAccountId(null)}>
                  Sem conta
                </ChoiceChip>
                {choices.map((acc) => (
                  <ChoiceChip key={acc.id} selected={accountId === acc.id} onClick={() => setAccountId(acc.id)}>
                    {acc.name}
                  </ChoiceChip>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Quando</legend>
            <div className="flex gap-2">
              <ChoiceChip selected={postedOn === day} onClick={() => setPostedOn(day)}>
                Hoje
              </ChoiceChip>
              <ChoiceChip selected={postedOn === addDaysYmd(day, -1)} onClick={() => setPostedOn(addDaysYmd(day, -1))}>
                Ontem
              </ChoiceChip>
            </div>
          </fieldset>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" className="h-12 flex-1 rounded-full" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="h-12 flex-[2] rounded-full text-base" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando…" : "Lançar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
