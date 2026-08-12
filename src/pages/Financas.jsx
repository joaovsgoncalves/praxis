import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { praxisApi } from '@/api/praxisClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  PageHero,
  StatGrid,
  StatTile,
  SectionHeading,
  PraxisEmptyState,
  PraxisColumnsSkeleton,
} from '@/components/layout/PraxisPage';
import {
  APR_LABELS,
  DEBT_STATUS_LABELS,
  FINANCE_TABS,
  LANE_LABELS,
  SUB_STATUS_LABELS,
  debtTone,
  formatBrl,
  formatDay,
} from '@/lib/finance';
import { cn } from '@/lib/utils';

function invalidateFinance(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['finance'] });
}

function TabChips({ tab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FINANCE_TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'praxis-touch-target h-10 rounded-full border px-3.5 text-sm font-medium',
            tab === item.id
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function SourceChip({ label }) {
  if (!label) return null;
  return (
    <Badge variant="outline" className="border-white/10 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </Badge>
  );
}

function ProgressBar({ value, max, className }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Financas() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('agora');
  const [payDebt, setPayDebt] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [caixaOpen, setCaixaOpen] = useState(false);
  const [caixaAmount, setCaixaAmount] = useState('');
  const [txCategory, setTxCategory] = useState('');

  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ['finance', 'overview'],
    queryFn: () => praxisApi.finance.overview(),
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['finance', 'subscriptions'],
    queryFn: () => praxisApi.finance.subscriptions.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['finance', 'transactions'],
    queryFn: () => praxisApi.finance.transactions.list(),
    enabled: tab === 'extrato' || tab === 'graficos',
  });

  const { data: insights } = useQuery({
    queryKey: ['finance', 'insights'],
    queryFn: () => praxisApi.finance.insights(),
    enabled: tab === 'graficos',
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['finance', 'goals'],
    queryFn: () => praxisApi.finance.goals.list(),
    enabled: tab === 'metas' || tab === 'agora',
  });

  const payMutation = useMutation({
    mutationFn: ({ id, data }) => praxisApi.finance.debts.pay(id, data),
    onSuccess: () => {
      toast.success('Pagamento registrado');
      setPayDebt(null);
      invalidateFinance(queryClient);
    },
    onError: (err) => toast.error(err.message || 'Não deu para registrar'),
  });

  const caixaMutation = useMutation({
    mutationFn: (amount) =>
      praxisApi.finance.balances.create({
        account_id: 'acc-inter',
        amount,
        amount_kind: 'available',
        source: 'joao',
        locked: true,
        note: 'saldo conferido no app',
      }),
    onSuccess: () => {
      toast.success('Saldo do Inter atualizado');
      setCaixaOpen(false);
      invalidateFinance(queryClient);
    },
    onError: (err) => toast.error(err.message || 'Não deu para atualizar'),
  });

  const subMutation = useMutation({
    mutationFn: ({ id, data }) => praxisApi.finance.subscriptions.update(id, data),
    onSuccess: () => {
      toast.success('Assinatura atualizada');
      invalidateFinance(queryClient);
    },
  });

  const operationalId = overview?.accounts?.find((a) => a.is_operational)?.id || 'acc-inter';

  const openDebts = useMemo(
    () => (overview?.debts || []).filter((d) => d.status !== 'clean'),
    [overview],
  );
  const cleanDebts = useMemo(
    () => (overview?.debts || []).filter((d) => d.status === 'clean'),
    [overview],
  );
  const workSubs = subscriptions.filter((s) => s.lane === 'work');
  const personalSubs = subscriptions.filter((s) => s.lane === 'personal');
  const visibleTx = txCategory
    ? transactions.filter((t) => t.category === txCategory)
    : transactions;
  const maxCat = insights?.categories?.[0]?.amount || 1;

  function openPay(debt) {
    setPayDebt(debt);
    setPayAmount(String(debt.balance ?? ''));
  }

  function submitPay() {
    if (!payDebt) return;
    payMutation.mutate({
      id: payDebt.id,
      data: {
        amount: Number(String(payAmount).replace(',', '.')),
        account_id: operationalId,
        method: 'pix',
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
    <div className="praxis-page space-y-6">
      <PageHero
        kicker="Dinheiro"
        kickerIcon={Wallet}
        title="Finanças"
        description={
          overview.snapshot_label
            ? `Mapa da conversa (${overview.snapshot_label}). Confere o Inter no app e atualiza se mudou.`
            : 'Caixa, fila e o próximo passo. Número que você travou não some no sync.'
        }
        action={
          <Button type="button" variant="outline" className="rounded-full" onClick={() => {
            setCaixaAmount(String(overview.caixa ?? ''));
            setCaixaOpen(true);
          }}
          >
            Atualizar saldo
          </Button>
        }
      />

      <Card className="border-primary/25 bg-primary/[0.07]">
        <CardContent className="space-y-3 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary/80">Próximo passo</p>
          <p className="text-lg font-semibold leading-snug tracking-[-0.03em]">{overview.next_step?.label}</p>
          {overview.next_step?.kind === 'due' && overview.next_step.debt_id ? (
            <Button
              type="button"
              className="h-10 rounded-full"
              onClick={() => {
                const debt = overview.debts.find((d) => d.id === overview.next_step.debt_id);
                if (debt) openPay(debt);
              }}
            >
              Registrar pagamento do {overview.next_step.title}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <StatGrid>
        <StatTile label="Caixa (Inter)" value={formatBrl(overview.caixa)} tone="amber" />
        <StatTile label="Livre depois das reservas" value={formatBrl(overview.livre)} />
        <StatTile label="Cartões abertos" value={formatBrl(overview.cards_total)} />
        <StatTile
          label="Assinaturas / mês"
          value={formatBrl(overview.subscriptions_month)}
        />
      </StatGrid>

      <TabChips tab={tab} onChange={setTab} />

      {tab === 'agora' ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionHeading title="Reservas deste mês" kicker="Antes de qualquer cartão" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="border-white/10 bg-white/[0.03]">
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-muted-foreground">Carro</p>
                  <p className="text-xl font-semibold tabular-nums">{formatBrl(overview.reserved_car)}</p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/[0.03]">
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-muted-foreground">Viver</p>
                  <p className="text-xl font-semibold tabular-nums">{formatBrl(overview.reserved_live)}</p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/[0.03]">
                <CardContent className="space-y-1 p-4">
                  <p className="text-xs text-muted-foreground">Sobrou</p>
                  <p className={cn('text-xl font-semibold tabular-nums', overview.livre < 0 && 'text-amber-200')}>
                    {formatBrl(overview.livre)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeading title="Contas" kicker="Saldo operacional" />
            <div className="space-y-2">
              {overview.accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{acc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {acc.is_operational ? 'Conta do dia' : acc.institution}
                      {acc.available_as_of ? ` · ${formatDay(acc.available_as_of)}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-base font-semibold tabular-nums">{formatBrl(acc.available)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'dividas' ? (
        <div className="space-y-4">
          <SectionHeading
            title="Fila"
            kicker={`${formatBrl(overview.debts_total)} em aberto`}
          />
          {openDebts.map((debt) => (
            <Card key={debt.id} className="border-white/10 bg-white/[0.03]">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-base font-semibold', debtTone(debt.status, debt.apr_label))}>
                      {debt.title}
                    </p>
                    <Badge variant="outline" className="border-white/10 text-[10px] uppercase">
                      {DEBT_STATUS_LABELS[debt.status] || debt.status}
                    </Badge>
                    {debt.apr_label !== 'none' ? (
                      <Badge variant="outline" className="border-amber-400/20 text-[10px] uppercase text-amber-200">
                        {APR_LABELS[debt.apr_label]}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {debt.due_date ? `Vence ${formatDay(debt.due_date)}` : 'Sem data'}
                    {debt.note ? ` · ${debt.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-semibold tabular-nums">{formatBrl(debt.balance)}</p>
                  <Button type="button" size="sm" className="h-10 rounded-full" onClick={() => openPay(debt)}>
                    Paguei
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {cleanDebts.length ? (
            <p className="text-xs text-muted-foreground">
              Já limpo: {cleanDebts.map((d) => d.title).join(', ')}.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'assinaturas' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { title: 'Trabalho', items: workSubs, total: overview.work_month },
            { title: 'Pessoal', items: personalSubs, total: overview.personal_month },
          ].map((block) => (
            <section key={block.title} className="space-y-3">
              <SectionHeading title={block.title} kicker={formatBrl(block.total)} />
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
                    <p className="tabular-nums font-semibold">{formatBrl(sub.amount)}</p>
                    {sub.status !== 'cancelled' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 rounded-full text-xs"
                        onClick={() => subMutation.mutate({ id: sub.id, data: { status: 'cancelled' } })}
                      >
                        Cancelei
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : null}

      {tab === 'extrato' ? (
        <div className="space-y-4">
          <SectionHeading title="Últimos 30 dias" kicker="Saída negativa" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={txCategory ? 'ghost' : 'secondary'}
              className="h-9 rounded-full"
              onClick={() => setTxCategory('')}
            >
              Tudo
            </Button>
            {['Dívidas', 'Assinaturas', 'Alimentação', 'Trabalho'].map((cat) => (
              <Button
                key={cat}
                type="button"
                size="sm"
                variant={txCategory === cat ? 'secondary' : 'ghost'}
                className="h-9 rounded-full"
                onClick={() => setTxCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
          {!visibleTx.length ? (
            <PraxisEmptyState
              title="Sem lançamento ainda"
              description="Quando você marcar um pagamento ou o sync entrar, aparece aqui."
            />
          ) : (
            <div className="space-y-2">
              {visibleTx.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{tx.merchant || tx.raw_description || 'Lançamento'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDay(tx.posted_on)} · {tx.category}
                      {tx.direction === 'internal' ? ' · transferência' : ''}
                    </p>
                  </div>
                  <p className={cn('tabular-nums font-semibold', tx.amount < 0 && 'text-amber-100')}>
                    {formatBrl(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'graficos' ? (
        <div className="space-y-6">
          <SectionHeading title="30 dias" kicker={insights ? formatBrl(insights.outflow) : '…'} />
          {!insights || !insights.categories.length ? (
            <PraxisEmptyState
              title="Ainda sem gasto pra desenhar"
              description="Registre um pagamento ou um lançamento que o gráfico aparece."
            />
          ) : (
            <div className="space-y-3">
              {insights.categories.map((cat) => (
                <div key={cat.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span>{cat.name}</span>
                    <span className="tabular-nums text-muted-foreground">{formatBrl(cat.amount)}</span>
                  </div>
                  <ProgressBar value={cat.amount} max={maxCat} />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Cartão {formatBrl(insights.card_outflow)} · conta {formatBrl(insights.cash_outflow)}. Transferência interna não entra.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'metas' ? (
        <div className="space-y-4">
          <SectionHeading title="Alvos" kicker="Um monstro por vez" />
          {!goals.length ? (
            <PraxisEmptyState title="Sem meta financeira" description="A seed cria carro, MP e óculos." />
          ) : (
            goals.map((goal) => (
              <Card key={goal.id} className="border-white/10 bg-white/[0.03]">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{goal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBrl(goal.current_amount)} de {formatBrl(goal.target_amount)}
                        {goal.due_date ? ` · ${formatDay(goal.due_date)}` : ''}
                      </p>
                    </div>
                    <SourceChip label={goal.status === 'done' ? 'feito' : `${goal.progress}%`} />
                  </div>
                  <ProgressBar value={goal.current_amount} max={goal.target_amount} />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}

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
              onClick={() => caixaMutation.mutate(Number(String(caixaAmount).replace(',', '.')))}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
