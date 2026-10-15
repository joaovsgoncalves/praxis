import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Dumbbell, Heart, Plus, Timer, Wallet } from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatShortDay } from '@/lib/finance';
import { JOTA_FIT_URL } from '@/lib/praxisNav';
import { formatTaskDuration } from '@/components/habits-tasks/TaskCardParts';
import { useHideMoney } from '@/hooks/useHideMoney';
import SpendSheet from '@/components/finance/SpendSheet';
import WellnessCheckSheet, { moodLabels } from '@/components/dashboard/WellnessCheckSheet';

/** Depois desta hora (Fortaleza) o card do check-in em aberto fica dourado. */
const EVENING_HOUR = 18;

const actionClass =
  'h-11 w-full rounded-full px-3 text-xs font-semibold transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none';

/** Card do bento: rótulo, UM número e UMA ação; altura fixa igual nos quatro. */
function BentoTile({ icon: Icon, iconClassName, label, value, valueClassName, detail, action, className, testId }) {
  return (
    <div
      className={cn('praxis-panel flex h-[140px] min-w-0 flex-col rounded-2xl p-3 sm:p-3.5', className)}
      data-testid={testId}
    >
      <div className="flex min-w-0 items-start gap-1.5 text-xs leading-tight text-muted-foreground">
        <Icon className={cn('mt-px h-3.5 w-3.5 shrink-0', iconClassName)} aria-hidden />
        <div className="min-w-0 flex-1">{label}</div>
      </div>
      <div className="mt-auto min-w-0">
        <p
          className={cn(
            'truncate text-lg font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground sm:text-xl',
            valueClassName
          )}
        >
          {value}
        </p>
        {detail ? <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{detail}</p> : null}
      </div>
      <div className="mt-2">{action}</div>
    </div>
  );
}

function FinanceTile() {
  const { money } = useHideMoney();
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
  const value = isLoading ? '…' : isError ? '—' : money(hasSafe ? data.safe_to_spend : data?.caixa);

  return (
    <>
      <BentoTile
        testId="bento-finance"
        icon={Wallet}
        iconClassName="text-primary"
        label={(
          <Link
            to="/financas"
            className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {hasSafe || isLoading ? `Pode gastar${until}` : 'Caixa'}
          </Link>
        )}
        value={value}
        action={(
          <Button type="button" className={actionClass} disabled={!data} onClick={() => setSpendOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Lançar gasto
          </Button>
        )}
      />
      {data ? (
        <SpendSheet open={spendOpen} onOpenChange={setSpendOpen} accounts={data.accounts} today={data.today} />
      ) : null}
    </>
  );
}

function CheckinTile({ todayCheck, onSave, clock }) {
  const [open, setOpen] = useState(false);
  const [savedCheck, setSavedCheck] = useState(null);
  const check = todayCheck || savedCheck;
  const evening = !check && Number(String(clock || '').slice(0, 2)) >= EVENING_HOUR;
  const mood = Number(check?.mood) || 3;

  return (
    <>
      <BentoTile
        testId="bento-checkin"
        icon={Heart}
        iconClassName={evening ? 'text-domain-gold' : 'text-domain-wellness'}
        label={<span className={cn(evening && 'text-domain-gold')}>Check-in</span>}
        value={check ? 'Feito' : 'Falta fazer'}
        detail={check ? `${moodLabels[mood - 1]} · energia ${check.productivity || 3}/5` : null}
        className={cn(evening && 'shadow-[inset_0_0_0_1px_hsl(var(--domain-gold)/0.3)]')}
        action={(
          <Button
            type="button"
            variant={check ? 'secondary' : 'default'}
            className={actionClass}
            onClick={() => setOpen(true)}
          >
            {check ? 'Editar' : 'Fazer check-in'}
          </Button>
        )}
      />
      <WellnessCheckSheet
        open={open}
        onOpenChange={setOpen}
        todayCheck={check}
        onSave={onSave}
        onSaved={setSavedCheck}
      />
    </>
  );
}

function FocusTile({ today }) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['todayFocus', today],
    queryFn: () => praxisApi.focus.list({ date: today }),
    staleTime: 60_000,
  });
  const minutes = Math.round(
    (Array.isArray(sessions) ? sessions : []).reduce((acc, s) => acc + (Number(s.duration_seconds) || 0), 0) / 60
  );
  const value = isLoading ? '…' : minutes >= 60 ? formatTaskDuration(minutes) : `${minutes} min`;

  return (
    <BentoTile
      testId="bento-focus"
      icon={Timer}
      iconClassName="text-domain-focus"
      label="Foco hoje"
      value={value}
      action={(
        <Button asChild variant="secondary" className={actionClass}>
          <Link to="/foco">Iniciar</Link>
        </Button>
      )}
    />
  );
}

function JotaFitTile() {
  return (
    <BentoTile
      testId="bento-jotafit"
      icon={Dumbbell}
      iconClassName="text-domain-ember"
      label="Jota Fit"
      value="Treino e comida"
      valueClassName="whitespace-normal text-sm font-medium tracking-normal sm:text-sm"
      action={(
        <Button asChild variant="secondary" className={actionClass}>
          <a href={JOTA_FIT_URL} target="_blank" rel="noopener noreferrer">
            Abrir
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
          </a>
        </Button>
      )}
    />
  );
}

/** Bento 2x2 do Hoje: Finanças, Check-in, Foco e Jota Fit. */
export default function DayBento({ today, clock, todayCheck, onSaveWellness }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3" data-testid="day-bento">
      <FinanceTile />
      <CheckinTile todayCheck={todayCheck} onSave={onSaveWellness} clock={clock} />
      <FocusTile today={today} />
      <JotaFitTile />
    </div>
  );
}
