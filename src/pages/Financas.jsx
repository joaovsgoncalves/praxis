import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  SectionHeading,
  PraxisEmptyState,
  PraxisColumnsSkeleton,
} from "@/components/layout/PraxisPage";
import {
  APR_LABELS,
  DEBT_STATUS_LABELS,
  FINANCE_SECTIONS,
  LANE_LABELS,
  SUB_STATUS_LABELS,
  debtTone,
  financeSummaryPhrase,
  formatBrl,
  formatDay,
  parseMoneyInput,
  resolveFinanceMonth,
  resolveFinanceTab,
} from "@/lib/finance";
import { coverageView, manualSubtotal } from "@/lib/financeCoverage";
import {
  UNCONFIRMED_MESSAGE,
  intentKeyFor,
  markUnconfirmed,
  outcomeUnknown,
  pendingIntent,
  settleIntent,
} from "@/lib/financeIntent";
import { failureMessage } from "@/lib/apiFailure";
import { buildWalletCards } from "@/lib/financeWallet";
import { useHideMoney } from "@/hooks/useHideMoney";
import SourceChip from "@/components/finance/SourceChip";
import WalletCards from "@/components/finance/WalletCards";
import AccountsGrid from "@/components/finance/AccountsGrid";
import { HideMoneyButton, WalletActions, WalletHero } from "@/components/finance/WalletHero";
import FinanceTabs, { FINANCE_PANEL_ID, financeTabId } from "@/components/finance/FinanceTabs";
import BankShown from "@/components/finance/BankShown";
import { CoverageNote, CoveredMoney, ManualSubtotal } from "@/components/finance/CoverageNote";
import SpendSheet from "@/components/finance/SpendSheet";
import MovementsTab from "@/components/finance/MovementsTab";
import OrganizationTab from "@/components/finance/OrganizationTab";
import { cn } from "@/lib/utils";

function invalidateFinance(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["finance"] });
}

const sectionDomId = (id) => `financas-${id}`;

/** Atalhos para as partes de Organização: contas, dívidas, parcelas, assinaturas e orçamento. */
function SectionShortcuts({ onGo }) {
  return (
    <nav aria-label="Partes de Organização" className="praxis-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {FINANCE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onGo(section.id)}
          className="praxis-touch-target flex h-10 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

function scrollToSection(id) {
  const node = document.getElementById(sectionDomId(id));
  if (!node) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { tab, section } = resolveFinanceTab(searchParams.get("aba"));
  const [payDebt, setPayDebt] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState("");
  const [caixaOpen, setCaixaOpen] = useState(false);
  const [caixaAmount, setCaixaAmount] = useState("");
  const [spendOpen, setSpendOpen] = useState(false);
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

  const { data: insights, isLoading: insightsLoading, isError: insightsFailed } = useQuery({
    queryKey: ["finance", "insights"],
    queryFn: () => praxisApi.finance.insights(),
  });

  const currentMonth = overview?.month?.month || overview?.today?.slice(0, 7) || "";
  const month = currentMonth ? resolveFinanceMonth(searchParams.get("mes"), currentMonth) : "";

  /** Troca aba e/ou mês mantendo o resto da URL. Aba nova entra no histórico; mês só substitui. */
  function goTo({ aba, mes }, { replace = false } = {}) {
    const next = new URLSearchParams(searchParams);
    if (aba !== undefined) {
      if (!aba || aba === "resumo") next.delete("aba");
      else next.set("aba", aba);
    }
    if (mes !== undefined) {
      if (!mes || mes === currentMonth) next.delete("mes");
      else next.set("mes", mes);
    }
    setSearchParams(next, { replace });
  }

  // link antigo (?aba=dividas) ou atalho: abre Organização e leva até a parte pedida
  useEffect(() => {
    if (tab !== "organizacao" || !section || !overview) return undefined;
    const frame = requestAnimationFrame(() => scrollToSection(section));
    return () => cancelAnimationFrame(frame);
  }, [tab, section, overview]);

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
    onSuccess: (row, { id }) => {
      settleIntent(`pay:${id}`);
      toast.success(row?.replayed ? "Esse pagamento já estava registrado. Nada foi baixado duas vezes." : "Pagamento registrado");
      setPayDebt(null);
      setPayError("");
      invalidateFinance(queryClient);
    },
    onError: (err, { id }) => {
      if (outcomeUnknown(err)) {
        // a resposta não voltou: pode ter gravado. A chave fica guardada e o reenvio igual é seguro.
        markUnconfirmed(`pay:${id}`);
        setPayError(UNCONFIRMED_MESSAGE);
        invalidateFinance(queryClient);
        return;
      }
      settleIntent(`pay:${id}`);
      setPayError(
        err?.status === 409
          ? "Essa tentativa já foi usada com outro valor. Confere o saldo da dívida e registra de novo."
          : failureMessage(err, err?.message || "Não deu para registrar"),
      );
    },
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

  const walletCards = useMemo(() => buildWalletCards(overview), [overview]);

  const coverage = coverageView(insights?.coverage, { loading: insightsLoading, failed: insightsFailed });
  const manual = manualSubtotal(coverage, {
    out: insights?.manual_outflow,
    inn: insights?.manual_inflow,
    count: insights?.manual_tx_count,
  });

  function openPay(debt) {
    // se a última tentativa desta dívida ficou sem confirmação, volta com o mesmo valor
    const waiting = pendingIntent(`pay:${debt.id}`);
    setPayDebt(debt);
    setPayAmount(String(waiting?.payload?.amount ?? debt.balance ?? "").replace(".", ","));
    setPayError(waiting ? UNCONFIRMED_MESSAGE : "");
  }

  function closePay() {
    setPayDebt(null);
    setPayError("");
  }

  function openCaixaDialog() {
    setCaixaAmount(String(overview?.caixa ?? ""));
    setCaixaOpen(true);
  }

  function showDues() {
    if (tab === "organizacao" && section === "dividas") scrollToSection("dividas");
    else goTo({ aba: "dividas" });
  }

  function goSection(id) {
    if (section === id) scrollToSection(id);
    else goTo({ aba: id }, { replace: true });
  }

  function submitPay() {
    if (!payDebt) return;
    const amount = parseMoneyInput(payAmount);
    if (!(amount > 0)) {
      setPayError("Informe quanto foi pago.");
      return;
    }
    const data = { amount, account_id: operationalId, method: "pix" };
    setPayError("");
    payMutation.mutate({ id: payDebt.id, data: { ...data, intent_key: intentKeyFor(`pay:${payDebt.id}`, data) } });
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
      <section className="praxis-page-hero !p-4 sm:!p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="praxis-kicker-row">
              <Wallet className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              <span>Dinheiro</span>
            </p>
            <h1 className="praxis-title text-2xl font-bold leading-[1.15] sm:text-4xl">Finanças</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              aria-label="Lançar gasto"
              className="h-10 rounded-full px-4 font-semibold"
              onClick={() => setSpendOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Lançar<span className="hidden sm:inline">&nbsp;gasto</span>
            </Button>
            <HideMoneyButton hide={hide} />
          </div>
        </div>
      </section>

      <FinanceTabs tab={tab} onChange={(id) => goTo({ aba: id })} />

      <div
        id={FINANCE_PANEL_ID}
        role="tabpanel"
        aria-labelledby={financeTabId(tab)}
        tabIndex={0}
        className="space-y-8 focus-visible:outline-none"
      >
      {tab === "resumo" ? (
      <>
      <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
        {text(financeSummaryPhrase(overview.caixa, overview.invested))}
      </p>

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
            <WalletActions midasSync={overview.last_midas_sync} onUpdateBalance={openCaixaDialog} onDues={showDues} />
          </div>
        </section>

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

                <div className="space-y-3 border-t border-white/[0.06] pt-3" data-testid="totals-30d">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Entradas (30d)</p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">
                        <CoveredMoney view={coverage} value={insights?.inflow ?? 0} money={money} />
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saídas (30d)</p>
                      <p className="text-lg font-semibold tabular-nums text-foreground">
                        <CoveredMoney view={coverage} value={insights?.outflow ?? 0} money={money} />
                      </p>
                    </div>
                  </div>
                  <CoverageNote view={coverage} />
                  <ManualSubtotal manual={manual} money={money} className="pl-3.5" />
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
                      Total: <CoveredMoney view={coverage} value={insights.outflow} money={money} />
                    </span>
                  ) : null}
                </div>

                {!topCategories.length ? (
                  <div className="flex min-h-[140px] flex-1 items-center justify-center p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {coverage.zeroIsReal
                        ? "Nenhuma saída nos últimos 30 dias, com o extrato completo."
                        : coverage.status === "loading"
                          ? "Lendo o extrato."
                          : "Sem extrato para montar as categorias deste recorte."}
                    </p>
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

          <BankShown entries={overview.bank_shown} money={money} />
        </div>
      </>
      ) : null}

      {tab === "organizacao" ? (
        <>
        <SectionShortcuts onGo={goSection} />

        <div id={sectionDomId("contas")} className="scroll-mt-20">
          <AccountsGrid accounts={overview.accounts} money={money} />
        </div>

        <div id={sectionDomId("dividas")} className="scroll-mt-20 space-y-4">
          <SectionHeading
            title="Dívidas"
            kicker={`${money(overview.debts_total)} em aberto`}
          />
          {openDebts.map((debt) => (
            <Card key={debt.id} data-testid="debt-row" className="border-white/10 bg-white/[0.03]">
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
                    {debt.note ? ` · ${text(debt.note)}` : ""}
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
          {!openDebts.length ? (
            <PraxisEmptyState compact title="Nenhuma dívida em aberto" description="Quando entrar uma, ela aparece aqui com vencimento e botão de baixa." />
          ) : null}
          {cleanDebts.length ? (
            <p className="text-xs text-muted-foreground">
              Já limpo: {cleanDebts.map((d) => d.title).join(", ")}.
            </p>
          ) : null}
        </div>

        <div id={sectionDomId("parcelas")} className="scroll-mt-20 space-y-4">
          <SectionHeading
            title="Parcelas"
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

        <div id={sectionDomId("assinaturas")} className="scroll-mt-20 space-y-4">
        <SectionHeading title="Assinaturas" kicker={`${liveSubs.length} ativas`} />
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
        </div>

        <div id={sectionDomId("orcamento")} className="scroll-mt-20">
          <OrganizationTab
            overview={overview}
            money={money}
            month={month}
            onMonthChange={(next) => goTo({ mes: next }, { replace: true })}
          />
        </div>
        </>
      ) : null}

      {tab === "movimentacoes" ? <MovementsTab overview={overview} money={money} /> : null}
      </div>

      <SpendSheet
        open={spendOpen}
        onOpenChange={setSpendOpen}
        accounts={overview.accounts}
        today={overview.today}
      />

      <Dialog open={Boolean(payDebt)} onOpenChange={(open) => !open && closePay()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pagamento{payDebt ? ` · ${payDebt.title}` : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isso não paga no banco. Só baixa a fila aqui quando o Pix já saiu.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitPay();
            }}
          >
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">Valor</span>
              <Input
                type={hide.hidden ? "password" : "text"}
                autoComplete="off"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => {
                  setPayAmount(e.target.value.replace(/[^\d.,]/g, ""));
                  setPayError("");
                }}
                aria-invalid={Boolean(payError)}
                aria-describedby={payError ? "pay-error" : undefined}
                className="tabular-nums"
              />
            </label>
            {payError ? (
              <p id="pay-error" role="alert" className="text-sm text-amber-200">
                {payError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={closePay}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-full" disabled={payMutation.isPending}>
                {payMutation.isPending ? "Registrando…" : payError === UNCONFIRMED_MESSAGE ? "Tentar de novo" : "Confirmar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={caixaOpen} onOpenChange={setCaixaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Saldo do Inter agora</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">O que o app mostra hoje. Esse número trava por cima da foto antiga.</p>
          <Input
            type={hide.hidden ? "password" : "text"}
            autoComplete="off"
            aria-label="Saldo do Inter"
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
