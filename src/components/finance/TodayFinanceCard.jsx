import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Wallet, ArrowRight, Plus } from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatShortDay } from '@/lib/finance';
import { useHideMoney } from '@/hooks/useHideMoney';
import SpendSheet from '@/components/finance/SpendSheet';

export default function TodayFinanceCard() {
  const { money, text } = useHideMoney();
  const [spendOpen, setSpendOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance', 'overview'],
    queryFn: () => praxisApi.finance.overview(),
    retry: 1,
    staleTime: 30_000,
  });

  // livre menos os compromissos até o salário; API antiga sem o campo cai no caixa
  const hasSafe = data?.safe_to_spend != null;
  const until = data?.next_salary_date ? ` até ${formatShortDay(data.next_salary_date)}` : '';
  const label = isLoading
    ? '…'
    : isError
      ? '—'
      : money(hasSafe ? data.safe_to_spend : data?.caixa);

  return (
    <Card className="praxis-dashboard-card praxis-context-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">Finanças</p>
              <h3 className="praxis-title mt-0.5 text-base font-semibold tracking-[-0.025em] tabular-nums">
                {hasSafe || isLoading ? `Pode gastar${until}` : 'Caixa'} {label}
              </h3>
            </div>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isError
            ? 'Não deu para carregar o caixa agora.'
            : text(data?.next_step?.label) || 'Abrir o mapa do mês.'}
        </p>
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] pt-3">
          <Button
            type="button"
            size="sm"
            className="h-10 rounded-full px-4 text-xs font-semibold transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none"
            disabled={!data}
            onClick={() => setSpendOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Lançar gasto
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-10 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground">
            <Link to="/financas">
              Abrir Finanças
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </CardContent>
      {data ? (
        <SpendSheet open={spendOpen} onOpenChange={setSpendOpen} accounts={data.accounts} today={data.today} />
      ) : null}
    </Card>
  );
}
