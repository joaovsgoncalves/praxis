import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { praxisApi } from "@/api/praxisClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PageHero,
  SectionHeading,
  PraxisEmptyState,
  PraxisColumnsSkeleton,
} from "@/components/layout/PraxisPage";
import {
  APR_LABELS,
  DEBT_STATUS_LABELS,
  FINANCE_TABS,
  LANE_LABELS,
  SUB_STATUS_LABELS,
  debtTone,
  financeSummaryPhrase,
  formatBrl,
  formatDay,
} from "@/lib/finance";
import { buildWalletCards } from "@/lib/financeWallet";
import { useHideMoney } from "@/hooks/useHideMoney";
import SourceChip from "@/components/finance/SourceChip";
import WalletCards from "@/components/finance/WalletCards";
import AccountsGrid from "@/components/finance/AccountsGrid";
import { HideMoneyButton, MidasChip, WalletActions, WalletHero } from "@/components/finance/WalletHero";
import SpendSheet from "@/components/finance/SpendSheet";
import MovementsTab from "@/components/finance/MovementsTab";
import OrganizationTab from "@/components/finance/OrganizationTab";
import { cn } from "@/lib/utils";

function invalidateFinance(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["finance"] });
}

function TabChips({ tab, onChange }) {
  return (
    <div className="praxis-scroll-x flex w-full max-w-full flex-nowrap items-center gap-2 overflow-x-auto py-1">
      {FINANCE_TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "praxis-touch-target flex h-11 shrink-0 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors",
            tab === item.id
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ProgressBar({ value, max, className }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div className="praxis-progress-fill rounded-full bg-primary" style={{ "--p": pct / 100 }} />
    </div>
  );
}

export default function Financas() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("agora");
  const [payDebt, setPayDebt] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [caixaOpen, setCaixaOpen] = useState(false);
  const [caixaAmount, setCaixaAmount] = useState("");
  const [spendOpen, setSpendOpen] = useState(false);
  const tabsRef = useRef(null);
  const hide = useHideMoney();
  const { money, text } = hide;

  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ["finance", "overview"],
    queryFn: () => praxisApi.finance.overview(),
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ["finance", "subscriptions"],
    queryFn: () => praxisApi.finance.subscriptions.list(),
  });

  const { data: installments = [] } = useQuery({
    queryKey: ["finance", "installments"],
    queryFn: () => praxisApi.finance.installments.list({ status: "open" }),
  });

  const { data: insights } = useQuery({
    queryKey: ["finance", "insights"],
    queryFn: () => praxisApi.finance.insights(),
  });

  const fixedPaidMutation = useMutation({
    mutationFn: (id) => praxisApi.finance.fixed.markPaid(id),
    onSuccess: (row) => {
      toast.success(`${row?.name || "Despesa"} marcada como paga`);
      invalidateFinance(queryClient);
    },
    onError: (err) => toast.error(err.message || "Não deu para marcar"),
  });

  const payMutation = useMutation({
    mutationFn: ({ id, data }) => praxisApi.finance.debts.pay(id, data),
    onSuccess: () => {
      toast.success("Pagamento registrado");
      setPayDebt(null);
      invalidateFinance(queryClient);
    },
    onError: (err) => toast.error(err.message || "Não deu para registrar"),
  });

  const caixaMutation = useMutation({
    mutationFn: (amount) =>
      praxisApi.finance.balances.create({
        account_id: "acc-inter",
        amount,
        amount_kind: "available",
        source: "joao",
        locked: true,
        note: "saldo conferido no app",
      }),
    onSuccess: () => {
      toast.success("Saldo do Inter atualizado");
      setCaixaOpen(false);
      invalidateFinance(queryClient);
    },
    onError: (err) => toast.error(err.message || "Não deu para atualizar"),
  });

  const deleteSubMutation = useMutation({
    mutationFn: (id) => praxisApi.finance.subscriptions.remove(id),
    onSuccess: () => {
      toast.success("Tirei da lista");
      invalidateFinance(queryClient);
    },
    onError: (err) => toast.error(err.message || "Não deu para apagar"),
  });

  const operationalId = overview?.accounts?.find((a) => a.is_operational)?.id || "acc-inter";

  const openDebts = useMemo(
    () => (overview?.debts || []).filter((d) => d.status !== "clean"),
    [overview],
  );
  const cleanDebts = useMemo(
    () => (overview?.debts || []).filter((d) => d.status === "clean"),
    [overview],
  );
  const liveSubs = subscriptions.filter((s) => s.status !== "cancelled" && s.status !== "cancel" && s.status !== "installment");
  const workSubs = liveSubs.filter((s) => s.lane === "work");
  const personalSubs = liveSubs.filter((s) => s.lane === "personal");

  const topCategories = useMemo(
    () => (insights?.categories || []).slice(0, 5),
    [insights],
  );
  const topCategoriesMax = useMemo(
    () => topCategories[0]?.amount || 1,
    [topCategories],
  );

  const syncedAccounts = useMemo(() => {
    const accounts = overview?.accounts || [];
    const fromPierre = accounts.filter(
      (a) => a.available_source === "pierre" || a.invested_source === "pierre" || a.pierre_account_id,
    );
    if (fromPierre.length > 0) return fromPierre;
    return accounts.filter((a) => (a.available || 0) > 0 || (a.invested || 0) > 0);
  }, [overview]);

  const bankEntries = useMemo(() => {
    const list = [];
    for (const acc of syncedAccounts) {
      if (acc.available !== undefined && acc.available !== null) {
        list.push({
          id: `${acc.id}-available`,
          name: acc.name,
          kind: "available",
          kindLabel: "livre",
          amount: acc.available,
          source: acc.available_source || "pierre",
          asOf: acc.available_as_of,
        });
      }
      if (Number(acc.invested || 0) > 0) {
        list.push({
          id: `${acc.id}-invested`,
          name: acc.name,
          kind: "invested",
          kindLabel: "auto-invest",
          amount: acc.invested,
          source: acc.invested_source || "pierre",
          asOf: acc.invested_as_of,
        });
      }
    }
    return list;
  }, [syncedAccounts]);

  const walletCards = useMemo(() => buildWalletCards(overview), [overview]);

  function openPay(debt) {
    setPayDebt(debt);
    setPayAmount(String(debt.balance ?? ""));
  }

  function openCaixaDialog() {
    setCaixaAmount(String(overview?.caixa ?? ""));
    setCaixaOpen(true);
  }

  function showDues() {
    setTab("dividas");
    requestAnimationFrame(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      tabsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }

  function submitPay() {
    if (!payDebt) return;
    payMutation.mutate({
      id: payDebt.id,
      data: {
        amount: Number(String(payAmount).replace(",", ".")),
        account_id: operationalId,
        method: "pix",
      },
    });
  }

  if (isLoading) {
    return (
      <div className="praxis-page">
        <PraxisColumnsSkeleton />
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="praxis-page">
        <PraxisEmptyState
          title="Finanças não carregou"
          description="A API não respondeu. Tenta de novo em instantes."
        />
      </div>
    );
  }

  return (
    <div className="praxis-page space-y-8">
      <PageHero
        kicker="Dinheiro"
        kickerIcon={Wallet}
        title="Finanças"
        description={text(financeSummaryPhrase(overview.caixa, overview.invested))}
        action={
          tab === "agora" ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" className="h-10 rounded-full px-4 font-semibold" onClick={() => setSpendOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Lançar gasto
              </Button>
              <MidasChip sync={overview.last_midas_sync} />
              <Button type="button" variant="outline" className="rounded-full" onClick={openCaixaDialog}>
                Atualizar saldo
              </Button>
              <HideMoneyButton hide={hide} />
            </div>
          )
        }
      />

      <Card className="border-primary/25 bg-primary/[0.07]">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary/80">Próximo passo</p>
            <p className="text-lg font-semibold leading-snug tracking-[-0.03em]">{text(overview.next_step?.label)}</p>
          </div>
          {overview.next_step?.kind === "cover" && overview.next_step.ref?.kind === "fixed" ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 rounded-full border-white/15 bg-white/[0.03]"
              disabled={fixedPaidMutation.isPending}
              onClick={() => fixedPaidMutation.mutate(overview.next_step.ref.id)}
            >
              Já paguei {overview.next_step.title}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {tab === "agora" ? (
        <section aria-label="Carteira" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
          <WalletHero overview={overview} hide={hide} />
          <div className="flex min-w-0 flex-col justify-between gap-4">
            {walletCards.length ? (
              <WalletCards cards={walletCards} money={money} />
            ) : (
              <PraxisEmptyState
                compact
                icon={Wallet}
                title="Nenhum cartão para mostrar"
                description="Marque uma conta como do dia ou sincronize os bancos."
              />
            )}
            <WalletActions
              hide={hide}
              midasSync={overview.last_midas_sync}
              onUpdateBalance={openCaixaDialog}
              onDues={showDues}
              onSpend={() => setSpendOpen(true)}
            />
          </div>
        </section>
      ) : null}

      <div ref={tabsRef} className="scroll-mt-4">
        <TabChips tab={tab} onChange={setTab} />
      </div>

      {tab === "agora" ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 lg:gap-6">
            <Card className="flex h-full flex-col justify-between border-white/10 bg-white/[0.03]">
              <CardContent className="flex h-full flex-col justify-between space-y-4 p-5">
                <div className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Entradas e saídas
                  </p>
                  {overview.invested > 0 ? (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Em auto-invest {money(overview.invested)}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Entradas (30d)</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {insights ? money(insights.inflow) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saídas (30d)</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {insights ? money(insights.outflow) : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="flex h-full flex-col justify-between border-white/10 bg-white/[0.03]">
              <CardContent className="flex h-full flex-col justify-between space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Categorias (30 dias)
                  </p>
                  {insights && insights.outflow > 0 ? (
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      Total: {money(insights.outflow)}
                    </span>
                  ) : null}
                </div>

                {!topCategories.length ? (
                  <div className="flex min-h-[140px] flex-1 items-center justify-center p-4 text-center">
                    <p className="text-sm text-muted-foreground">Sem movimento neste recorte</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    {topCategories.map((cat) => (
                      <div key={cat.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate text-foreground">{cat.name}</span>
                          <span className="tabular-nums text-muted-foreground">{money(cat.amount)}</span>
                        </div>
                        <ProgressBar value={cat.amount} max={topCategoriesMax} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <section className="space-y-4">
            <SectionHeading title="Reservas deste mês" kicker="Antes de qualquer cartão" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border-white/10 bg-white/[0.03]">
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-muted-foreground">Carro</p>
                  <p className="text-xl font-semibold tabular-nums">{money(overview.reserved_car)}</p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/[0.03]">
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-muted-foreground">Viver</p>
                  <p className="text-xl font-semibold tabular-nums">{money(overview.reserved_live)}</p>
                </CardContent>
              </Card>
            </div>
          </section>

          <AccountsGrid accounts={overview.accounts} money={money} />

          {overview.last_sync && Boolean(overview.last_sync.ok) ? (
            <section className="space-y-3">
              <SectionHeading
                title="O banco mostrou"
                kicker={
                  overview.last_sync.finished_at || overview.last_sync.started_at
                    ? `Sync ${formatDay((overview.last_sync.finished_at || overview.last_sync.started_at).slice(0, 10))}`
                    : "Sincronizado"
                }
              />
              <div className="space-y-2">
                {bankEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{entry.name}</p>
                        <Badge variant="outline" className="border-white/10 text-[10px] uppercase text-muted-foreground">
                          {entry.kindLabel}
                        </Badge>
                        <SourceChip source={entry.source} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.kind === "invested" ? "Investimento / auto-invest" : "Saldo em conta"}
                        {entry.asOf ? ` · ${formatDay(entry.asOf)}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-semibold tabular-nums">
                      {money(entry.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {(overview.installments_n || 0) > 0 ? (
            <section className="space-y-3">
              <SectionHeading title="Compras parceladas" kicker="Já está no cartão — não soma de novo" />
              <Card className="border-white/10 bg-white/[0.03]">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Ainda resta</p>
                    <p className="text-xl font-semibold tabular-nums">{money(overview.installments_remaining)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pesa por mês</p>
                    <p className="text-xl font-semibold tabular-nums">{money(overview.installments_month)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Última</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {overview.installments_last ? formatDay(overview.installments_last) : "—"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "dividas" ? (
        <div className="space-y-4">
          <SectionHeading
            title="Fila"
            kicker={`${money(overview.debts_total)} em aberto`}
          />
          {openDebts.map((debt) => (
            <Card key={debt.id} className="border-white/10 bg-white/[0.03]">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("text-base font-semibold", debtTone(debt.status, debt.apr_label))}>
                      {debt.title}
                    </p>
                    <Badge variant="outline" className="border-white/10 text-[10px] uppercase">
                      {DEBT_STATUS_LABELS[debt.status] || debt.status}
                    </Badge>
                    {debt.apr_label !== "none" ? (
                      <Badge variant="outline" className="border-amber-400/20 text-[10px] uppercase text-amber-200">
                        {APR_LABELS[debt.apr_label]}
                      </Badge>
                    ) : null}
                    <SourceChip source={debt.source} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {debt.due_date ? `Vence ${formatDay(debt.due_date)}` : "Sem data"}
                    {debt.note ? ` · ${debt.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-semibold tabular-nums">{money(debt.balance)}</p>
                  <Button type="button" size="sm" className="h-10 rounded-full" onClick={() => openPay(debt)}>
                    Paguei
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {cleanDebts.length ? (
            <p className="text-xs text-muted-foreground">
              Já limpo: {cleanDebts.map((d) => d.title).join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "parcelas" ? (
        <div className="space-y-4">
          <SectionHeading
            title="Já comprado, ainda cai"
            kicker={`${overview.installments_n || 0} em andamento`}
          />
          <p className="text-sm text-muted-foreground">
            {Number(overview.cards_total) > 0
              ? text(`Isso já está dentro da fatura do cartão. Não soma em cima dos ${formatBrl(overview.cards_total)} em faturas abertas.`)
              : "Isso já está dentro da fatura do cartão. Não soma de novo."}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="space-y-1 p-4">
                <p className="text-xs text-muted-foreground">Ainda resta</p>
                <p className="text-xl font-semibold tabular-nums">{money(overview.installments_remaining)}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="space-y-1 p-4">
                <p className="text-xs text-muted-foreground">Pesa / mês</p>
                <p className="text-xl font-semibold tabular-nums">{money(overview.installments_month)}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="space-y-1 p-4">
                <p className="text-xs text-muted-foreground">Última parcela</p>
                <p className="text-xl font-semibold tabular-nums">
                  {overview.installments_last ? formatDay(overview.installments_last) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
          {!installments.length ? (
            <PraxisEmptyState
              title="Sem parcela em andamento"
              description="Quando o Pierre ou um print entrar, a lista aparece aqui."
            />
          ) : (
            <div className="space-y-2">
              {installments.map((inst) => {
                const acc = overview.accounts.find((a) => a.id === inst.account_id);
                return (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                  >
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{inst.title}</p>
                      <SourceChip source={inst.source} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inst.paid_n}/{inst.total_n}x · {money(inst.monthly)}/mês
                      {acc ? ` · ${acc.name}` : ""}
                    </p>
                    </div>
                    <p className="shrink-0 tabular-nums font-semibold">{money(inst.remaining)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === "assinaturas" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { title: "Trabalho", items: workSubs, total: overview.work_month },
            { title: "Pessoal", items: personalSubs, total: overview.personal_month },
          ].map((block) => (
            <section key={block.title} className="space-y-3">
              <SectionHeading title={block.title} kicker={money(block.total)} />
              {block.items.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{sub.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {LANE_LABELS[sub.lane]} · {SUB_STATUS_LABELS[sub.status] || sub.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="tabular-nums font-semibold">{money(sub.amount)}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 rounded-full text-xs text-muted-foreground"
                      disabled={deleteSubMutation.isPending}
                      onClick={() => deleteSubMutation.mutate(sub.id)}
                    >
                      Apagar
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : null}

      {tab === "movimentacoes" ? <MovementsTab overview={overview} money={money} /> : null}

      {tab === "organizacao" ? <OrganizationTab overview={overview} money={money} /> : null}

      <SpendSheet
        open={spendOpen}
        onOpenChange={setSpendOpen}
        accounts={overview.accounts}
        today={overview.today}
      />

      <Dialog open={Boolean(payDebt)} onOpenChange={(open) => !open && setPayDebt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isso não paga no banco. Só baixa a fila aqui quando o Pix já saiu.
          </p>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Valor</span>
            <Input
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="tabular-nums"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setPayDebt(null)}>
              Cancelar
            </Button>
            <Button type="button" className="rounded-full" disabled={payMutation.isPending} onClick={submitPay}>
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={caixaOpen} onOpenChange={setCaixaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Saldo do Inter agora</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">O que o app mostra hoje. Esse número trava por cima da foto antiga.</p>
          <Input
            inputMode="decimal"
            value={caixaAmount}
            onChange={(e) => setCaixaAmount(e.target.value)}
            className="tabular-nums"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setCaixaOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={caixaMutation.isPending}
              onClick={() => caixaMutation.mutate(Number(String(caixaAmount).replace(",", ".")))}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
