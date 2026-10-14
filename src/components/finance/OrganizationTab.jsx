import React, { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChartPie, ChevronLeft, ChevronRight, Circle, CircleCheck, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { praxisApi } from "@/api/praxisClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PraxisEmptyState, PraxisListSkeleton, SectionHeader } from "@/components/layout/PraxisPage";
import { ChoiceChip } from "@/components/finance/SpendSheet";
import {
  budgetTone,
  formatDay,
  monthLabel,
  parseMoneyInput,
  shiftMonthYm,
} from "@/lib/finance";
import { BUDGET_CATEGORIES, categoryIcon } from "@/lib/financeCategories";
import { cn } from "@/lib/utils";

const BAR_FILL = {
  ok: "bg-primary",
  near: "bg-orange-400",
  over: "bg-red-400",
  neutral: "bg-primary/45",
};

function useInvalidateFinance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["finance"] });
}

function LimitEditor({ category, limit, onDone }) {
  const [value, setValue] = useState(limit != null ? String(limit).replace(".", ",") : "");
  const inputRef = useRef(null);
  const invalidate = useInvalidateFinance();
  const mutation = useMutation({
    mutationFn: (monthly_limit) => praxisApi.finance.budgets.save({ category, monthly_limit }),
    onSuccess: () => {
      invalidate();
      onDone();
    },
    onError: (err) => toast.error(err?.message || "Não deu para salvar o limite"),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function save() {
    if (!value.trim()) {
      if (limit == null) onDone();
      else mutation.mutate(null);
      return;
    }
    const parsed = parseMoneyInput(value);
    if (!(parsed >= 0)) {
      toast.error("Limite inválido. Ex.: 400 ou 400,00");
      return;
    }
    mutation.mutate(parsed);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="sr-only" htmlFor={`limit-${category}`}>
        Limite por mês para {category}
      </label>
      <Input
        id={`limit-${category}`}
        ref={inputRef}
        inputMode="decimal"
        placeholder="Limite/mês"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
        className="h-10 w-32 rounded-full tabular-nums"
      />
      <Button type="submit" size="sm" className="h-10 rounded-full px-4" disabled={mutation.isPending}>
        Salvar
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-10 rounded-full px-3 text-muted-foreground" onClick={onDone}>
        Cancelar
      </Button>
    </form>
  );
}

function CategoryRow({ row, maxSpent, money, editing, onEdit, onDone }) {
  const Icon = categoryIcon(row.category);
  const tone = budgetTone(row.pct);
  const hasLimit = row.limit != null;
  const fill = hasLimit
    ? Math.min(100, row.pct ?? 0)
    : maxSpent > 0
      ? Math.round((row.spent / maxSpent) * 100)
      : 0;
  const over = hasLimit && row.spent > row.limit ? row.spent - row.limit : 0;
  const status = hasLimit
    ? over > 0
      ? `passou ${money(over)}`
      : tone === "near"
        ? `perto do limite · ${row.pct}%`
        : `${row.pct}% do limite`
    : null;

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04] shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)]">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium">{row.category}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums">
              {money(row.spent)}
              {hasLimit ? <span className="font-normal text-muted-foreground"> de {money(row.limit)}</span> : null}
            </p>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]"
            role="img"
            aria-label={
              hasLimit
                ? `${row.category}: ${money(row.spent)} de ${money(row.limit)}, ${status}`
                : `${row.category}: ${money(row.spent)}`
            }
            title={hasLimit ? `${money(row.spent)} de ${money(row.limit)}` : money(row.spent)}
          >
            <div className={cn("h-full rounded-full", BAR_FILL[hasLimit ? tone : "neutral"])} style={{ width: `${fill}%` }} />
          </div>
        </div>
      </div>
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 sm:pl-12">
        {editing ? (
          <LimitEditor category={row.category} limit={row.limit} onDone={onDone} />
        ) : (
          <>
            <p
              className={cn(
                "text-xs tabular-nums text-muted-foreground",
                tone === "near" && hasLimit && "text-orange-200",
                over > 0 && "font-medium text-red-300",
              )}
            >
              {status || `${row.tx_count} ${row.tx_count === 1 ? "lançamento" : "lançamentos"}`}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={onEdit}
            >
              {hasLimit ? "Mudar limite" : "Pôr limite"}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function MonthSection({ currentMonth, money }) {
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ["finance", "month", month],
    queryFn: () => praxisApi.finance.month({ month }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.categories || [];
  const extra = editing && !rows.some((r) => r.category === editing)
    ? [{ category: editing, spent: 0, limit: null, pct: null, tx_count: 0 }]
    : [];
  const allRows = [...rows, ...extra];
  const maxSpent = Math.max(0, ...rows.map((r) => r.spent));
  const missing = BUDGET_CATEGORIES.filter((c) => !allRows.some((r) => r.category === c));

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Gasto por categoria"
        icon={ChartPie}
        trailing={
          <div className="-mx-2 flex items-center gap-0.5 sm:mx-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full"
              aria-label="Mês anterior"
              onClick={() => setMonth((m) => shiftMonthYm(m, -1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium tabular-nums">{monthLabel(month)}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full"
              aria-label="Próximo mês"
              disabled={month >= currentMonth}
              onClick={() => setMonth((m) => shiftMonthYm(m, 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        }
      />
      <div className="praxis-panel rounded-2xl p-4 sm:p-5">
        {isLoading && !data ? (
          <PraxisListSkeleton rows={4} />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/[0.06] pb-3">
              <p className="text-sm text-muted-foreground">
                Saiu no mês <span className="text-lg font-semibold tabular-nums text-foreground">{money(data?.total_out ?? 0)}</span>
              </p>
              {data?.budget_total > 0 ? (
                <p className="text-xs tabular-nums text-muted-foreground">Orçamento {money(data.budget_total)}</p>
              ) : null}
            </div>
            {allRows.length ? (
              <ul className="divide-y divide-white/[0.05]">
                {allRows.map((row) => (
                  <CategoryRow
                    key={row.category}
                    row={row}
                    maxSpent={maxSpent}
                    money={money}
                    editing={editing === row.category}
                    onEdit={() => setEditing(row.category)}
                    onDone={() => setEditing(null)}
                  />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem gasto neste mês ainda.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
              <p className="text-xs text-muted-foreground">
                Fatura paga e transferência entre contas ficam fora
                {data?.off_budget_out > 0 ? ` (${money(data.off_budget_out)} no mês)` : ""}.
              </p>
              {missing.length ? (
                <Select value="" onValueChange={(cat) => setEditing(cat)}>
                  <SelectTrigger className="h-10 w-auto gap-2 rounded-full border-white/10 bg-white/[0.03] px-4 text-sm" aria-label="Pôr limite em outra categoria">
                    <SelectValue placeholder="Limite em outra categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {missing.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const EMPTY_FIXED = { name: "", amount: "", due_day: "", category: "Outros", lane: "personal", active: true, note: "" };

function FixedDialog({ open, fixed, onClose }) {
  const invalidate = useInvalidateFinance();
  const [form, setForm] = useState(EMPTY_FIXED);

  useEffect(() => {
    if (!open) return;
    setForm(
      fixed
        ? {
            name: fixed.name,
            amount: String(fixed.amount).replace(".", ","),
            due_day: fixed.due_day == null ? "" : String(fixed.due_day),
            category: fixed.category || "Outros",
            lane: fixed.lane || "personal",
            active: fixed.active,
            note: fixed.note || "",
          }
        : EMPTY_FIXED,
    );
  }, [open, fixed]);

  const save = useMutation({
    mutationFn: (data) => (fixed ? praxisApi.finance.fixed.update(fixed.id, data) : praxisApi.finance.fixed.create(data)),
    onSuccess: () => {
      toast.success(fixed ? "Despesa fixa atualizada" : "Despesa fixa adicionada");
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err?.message || "Não deu para salvar"),
  });
  const remove = useMutation({
    mutationFn: () => praxisApi.finance.fixed.remove(fixed.id),
    onSuccess: () => {
      toast.success("Tirei das fixas");
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err?.message || "Não deu para apagar"),
  });

  function submit(e) {
    e.preventDefault();
    const amount = parseMoneyInput(form.amount);
    const day = form.due_day.trim() ? Number(form.due_day) : null;
    if (!form.name.trim()) return toast.error("Dê um nome, ex.: Faculdade");
    if (!(amount >= 0)) return toast.error("Valor inválido. Ex.: 505 ou 505,00");
    if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return toast.error("Dia de 1 a 31");
    save.mutate({
      name: form.name.trim(),
      amount,
      due_day: day,
      category: form.category,
      lane: form.lane,
      active: form.active,
      note: form.note,
    });
  }

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{fixed ? "Editar despesa fixa" : "Nova despesa fixa"}</DialogTitle>
          <DialogDescription>Com dia, entra no pode gastar até o salário enquanto não estiver paga no mês.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Nome</span>
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Faculdade" className="h-11 rounded-xl" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Valor</span>
              <Input
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => set("amount")(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="505,00"
                className="h-11 rounded-xl tabular-nums"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Dia do mês</span>
              <Input
                inputMode="numeric"
                value={form.due_day}
                onChange={(e) => set("due_day")(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="sem dia"
                className="h-11 rounded-xl tabular-nums"
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Categoria</span>
            <Select value={form.category} onValueChange={set("category")}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <fieldset className="space-y-1.5 text-sm">
            <legend className="font-medium">De quem</legend>
            <div className="flex gap-2">
              <ChoiceChip selected={form.lane === "personal"} onClick={() => set("lane")("personal")}>
                Pessoal
              </ChoiceChip>
              <ChoiceChip selected={form.lane === "work"} onClick={() => set("lane")("work")}>
                Trabalho
              </ChoiceChip>
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span className="font-medium">Ativa</span>
            <Switch checked={form.active} onCheckedChange={set("active")} />
          </label>
          <div className="flex items-center justify-between gap-2 pt-1">
            {fixed ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-full px-3 text-muted-foreground hover:text-foreground"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                Apagar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="h-11 rounded-full" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" className="h-11 rounded-full px-5" disabled={save.isPending}>
                Salvar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FixedSection({ money }) {
  const invalidate = useInvalidateFinance();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState({ open: false, fixed: null });
  const { data: fixed = [], isLoading } = useQuery({
    queryKey: ["finance", "fixed"],
    queryFn: () => praxisApi.finance.fixed.list(),
  });

  const toggle = useMutation({
    mutationFn: (item) => (item.paid_this_month ? praxisApi.finance.fixed.unmarkPaid(item.id) : praxisApi.finance.fixed.markPaid(item.id)),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: ["finance", "fixed"] });
      const previous = queryClient.getQueryData(["finance", "fixed"]);
      queryClient.setQueryData(["finance", "fixed"], (old) =>
        Array.isArray(old) ? old.map((f) => (f.id === item.id ? { ...f, paid_this_month: !item.paid_this_month } : f)) : old,
      );
      return { previous };
    },
    onError: (err, _item, context) => {
      queryClient.setQueryData(["finance", "fixed"], context?.previous);
      toast.error(err?.message || "Não deu para marcar");
    },
    onSettled: invalidate,
  });

  const active = fixed.filter((f) => f.active);
  const monthly = active.reduce((s, f) => s + Number(f.amount || 0), 0);
  const open = active.filter((f) => !f.paid_this_month).reduce((s, f) => s + Number(f.amount || 0), 0);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Despesas fixas"
        icon={CalendarClock}
        count={active.length}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full border-white/10 bg-white/[0.03] px-4"
            onClick={() => setDialog({ open: true, fixed: null })}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Adicionar
          </Button>
        }
      />
      {isLoading ? (
        <PraxisListSkeleton rows={3} />
      ) : !fixed.length ? (
        <PraxisEmptyState
          compact
          icon={CalendarClock}
          title="Nenhuma despesa fixa"
          description="Faculdade, carro, contador, impostos: com o dia, elas saem do pode gastar até o salário."
          action={
            <Button type="button" className="h-10 rounded-full" onClick={() => setDialog({ open: true, fixed: null })}>
              Adicionar a primeira
            </Button>
          }
        />
      ) : (
        <div className="praxis-panel rounded-2xl p-2 sm:p-3">
          <p className="px-2 pb-2 pt-1 text-xs tabular-nums text-muted-foreground">
            {money(monthly)} por mês · falta pagar {money(open)} neste mês
          </p>
          <ul className="divide-y divide-white/[0.05]">
            {fixed.map((item) => (
              <li key={item.id} className={cn("flex items-center gap-2 py-1", !item.active && "opacity-60")}>
                <button
                  type="button"
                  onClick={() => setDialog({ open: true, fixed: item })}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-10 shrink-0 text-center">
                    <span className="block font-mono text-sm font-semibold tabular-nums">{item.due_day ?? "—"}</span>
                    <span className="block text-[11px] text-muted-foreground">{item.due_day ? "dia" : "sem dia"}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.category}
                      {item.lane === "work" ? " · trabalho" : ""}
                      {!item.active ? " · pausada" : item.paid_this_month ? " · pago este mês" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount)}</span>
                </button>
                {item.active ? (
                  <button
                    type="button"
                    aria-pressed={item.paid_this_month}
                    aria-label={item.paid_this_month ? `${item.name}: pago este mês. Desfazer` : `Marcar ${item.name} como pago este mês`}
                    onClick={() => toggle.mutate(item)}
                    className={cn(
                      "mr-1 inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      item.paid_this_month
                        ? "bg-emerald-400/10 text-emerald-200"
                        : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                    )}
                  >
                    {item.paid_this_month ? <CircleCheck className="h-5 w-5" aria-hidden /> : <Circle className="h-5 w-5" aria-hidden />}
                    <span className="hidden sm:inline">{item.paid_this_month ? "Pago" : "Marcar pago"}</span>
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      <FixedDialog open={dialog.open} fixed={dialog.fixed} onClose={() => setDialog({ open: false, fixed: null })} />
    </section>
  );
}

function GoalsSection({ money }) {
  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["finance", "goals"],
    queryFn: () => praxisApi.finance.goals.list(),
  });
  return (
    <section className="space-y-4">
      <SectionHeader title="Metas de economia" icon={Target} count={goals.length} />
      {isLoading ? (
        <PraxisListSkeleton rows={2} />
      ) : !goals.length ? (
        <PraxisEmptyState compact icon={Target} title="Sem meta ainda" description="Quando o Midas criar uma meta, o progresso aparece aqui." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => {
            const done = goal.status === "done";
            return (
              <li key={goal.id} className="praxis-panel space-y-3 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{goal.title}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {money(goal.current_amount)} de {money(goal.target_amount)}
                      {goal.due_date ? ` · até ${formatDay(goal.due_date)}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-medium tabular-nums",
                      done ? "bg-emerald-400/15 text-emerald-200" : "bg-white/[0.06] text-secondary-foreground",
                    )}
                  >
                    {done ? "feita" : `${goal.progress}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                  <div
                    className={cn("h-full rounded-full", done ? "bg-emerald-400" : "bg-primary")}
                    style={{ width: `${Math.min(100, goal.progress || 0)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Organização: gasto por categoria com orçamento, despesas fixas e metas. */
export default function OrganizationTab({ overview, money }) {
  const currentMonth = overview.month?.month || overview.today.slice(0, 7);
  return (
    <div className="space-y-10">
      <MonthSection currentMonth={currentMonth} money={money} />
      <FixedSection money={money} />
      <GoalsSection money={money} />
    </div>
  );
}
