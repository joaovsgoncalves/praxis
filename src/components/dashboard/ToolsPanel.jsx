import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Compass, Heart, Plus, Target, Timer, Wallet } from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fortalezaAddDays } from '@/lib/dates';
import { formatShortDay } from '@/lib/finance';
import { weekRange } from '@/lib/taskLenses';
import { computeGoalProgress } from '@/lib/goalProgress';
import { focusWeeklyGoalView } from '@/lib/focusWeeklyGoal';
import { formatMinutesShort, pickFocusFront, pickMainGoal, pickReviewCard } from '@/lib/todayGlance';
import { useHideMoney } from '@/hooks/useHideMoney';
import SpendSheet from '@/components/finance/SpendSheet';
import WellnessCheckSheet, { moodLabels } from '@/components/dashboard/WellnessCheckSheet';

/** Depois desta hora (Fortaleza) o card do check-in em aberto fica dourado. */
const EVENING_HOUR = 18;
const LIGHT = { staleTime: 60_000, retry: 1 };

const actionClass =
  'h-11 w-full rounded-full px-3 text-xs font-semibold transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none';

const goldRing = 'shadow-[inset_0_0_0_1px_hsl(var(--domain-gold)/0.3)]';

function ValueSkeleton() {
  return (
    <span className="flex h-[22.5px] items-center sm:h-[25px]" aria-hidden>
      <span className="praxis-skel h-4 w-20 rounded-md" />
    </span>
  );
}

/**
 * Card de ferramenta: rótulo, UM número/estado e UMA ação, altura fixa igual nos seis.
 * O card inteiro leva à ferramenta (camada por baixo); a ação fica por cima.
 */
function ToolCard({
  to,
  onOpen,
  openLabel,
  icon: Icon,
  iconClassName,
  label,
  labelClassName,
  value,
  valueClassName,
  loading = false,
  detail,
  detailClassName,
  action,
  className,
  testId,
}) {
  // Quando a ação já leva ao mesmo lugar, a camada do card não entra no Tab (sem parada dupla).
  const overlayClass =
    'absolute inset-0 rounded-[inherit] transition-colors duration-150 hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div
      className={cn('praxis-panel relative flex h-[144px] min-w-0 flex-col rounded-2xl p-3', className)}
      data-testid={testId}
    >
      {to ? (
        <Link
          to={to}
          className={overlayClass}
          aria-label={openLabel}
          tabIndex={openLabel ? undefined : -1}
          aria-hidden={openLabel ? undefined : true}
        />
      ) : onOpen ? (
        <button type="button" className={overlayClass} onClick={onOpen} tabIndex={-1} aria-hidden />
      ) : null}
      <div className="pointer-events-none relative flex min-w-0 items-start gap-1.5 text-xs leading-tight text-muted-foreground">
        <Icon className={cn('mt-px h-3.5 w-3.5 shrink-0', iconClassName)} aria-hidden />
        <span className={cn('min-w-0 flex-1 truncate', labelClassName)}>{label}</span>
      </div>
      <div className="pointer-events-none relative mt-auto min-w-0">
        {loading ? (
          <ValueSkeleton />
        ) : (
          <p
            className={cn(
              'truncate text-lg font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground sm:text-xl',
              valueClassName,
            )}
          >
            {value}
          </p>
        )}
        {detail && !loading ? (
          <div className={cn('mt-0.5 text-[11px] leading-tight text-muted-foreground', detailClassName || 'truncate')}>
            {detail}
          </div>
        ) : null}
      </div>
      <div className="relative z-10 mt-2">{action}</div>
    </div>
  );
}

function FinanceCard() {
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

  return (
    <>
      <ToolCard
        testId="tool-finance"
        to="/financas"
        openLabel="Abrir Finanças"
        icon={Wallet}
        iconClassName="text-primary"
        label={hasSafe || isLoading || isError ? `Pode gastar${until}` : 'Caixa'}
        loading={isLoading}
        value={isError ? '—' : money(hasSafe ? data.safe_to_spend : data?.caixa)}
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

function FocusCard({ today, focusGoalMinutes }) {
  const weekStart = weekRange(today).start;
  const { data: sessions, isLoading, isError } = useQuery({
    queryKey: ['todayFocus', today],
    queryFn: () => praxisApi.focus.list({ date: today }),
    ...LIGHT,
  });
  const goalOn = Number(focusGoalMinutes) > 0;
  const { data: week } = useQuery({
    queryKey: ['weeklyInsights', weekStart],
    queryFn: () => praxisApi.insights.weekly(weekStart),
    enabled: goalOn,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
  const minutes = Math.round(
    (Array.isArray(sessions) ? sessions : []).reduce((acc, s) => acc + (Number(s.duration_seconds) || 0), 0) / 60,
  );
  const goal = goalOn && week
    ? focusWeeklyGoalView({
        goalMinutes: focusGoalMinutes,
        doneMinutes: week.victories?.focus_minutes,
        weekStart,
        today,
      })
    : null;

  return (
    <ToolCard
      testId="tool-focus"
      to="/foco"
      icon={Timer}
      iconClassName="text-domain-focus"
      label="Foco hoje"
      loading={isLoading}
      value={isError ? '—' : formatMinutesShort(minutes)}
      detail={goal ? `${goal.done} de ${goal.goal} min na semana` : null}
      action={(
        <Button asChild variant="secondary" className={actionClass}>
          <Link to="/foco">Iniciar</Link>
        </Button>
      )}
    />
  );
}

function FrontCard() {
  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: () => praxisApi.projects.list(),
    ...LIGHT,
  });
  const front = pickFocusFront(projects);

  return (
    <ToolCard
      testId="tool-fronts"
      to="/frentes"
      icon={Compass}
      iconClassName="text-domain-gold"
      label="Frentes"
      loading={isLoading}
      value={isError ? '—' : front ? front.name : 'Nenhuma frente em foco'}
      valueClassName={front ? 'text-base sm:text-base' : 'whitespace-normal text-sm font-medium tracking-normal sm:text-sm'}
      detail={front ? front.next_step : null}
      detailClassName="line-clamp-2 whitespace-normal [text-wrap:pretty]"
      action={(
        <Button asChild variant="secondary" className={actionClass}>
          <Link to="/frentes">Abrir</Link>
        </Button>
      )}
    />
  );
}

function GoalCard({ today }) {
  const { data: goals, isLoading, isError } = useQuery({
    queryKey: ['allGoals'],
    queryFn: () => praxisApi.goals.list(),
    ...LIGHT,
  });
  const hasActive = Array.isArray(goals) && goals.some((g) => g.status === 'active');
  // Mesmas listas (e chaves) da tela Metas: o cache serve às duas, sem uma chamada por meta.
  const linked = { enabled: hasActive, ...LIGHT, staleTime: 5 * 60 * 1000 };
  const tasksQ = useQuery({ queryKey: ['goalTasks'], queryFn: () => praxisApi.tasks.list(), ...linked });
  const habitsQ = useQuery({ queryKey: ['goalHabits'], queryFn: () => praxisApi.habits.list(), ...linked });
  const logsQ = useQuery({
    queryKey: ['goalHabitLogs', today],
    queryFn: () => praxisApi.habitLogs.list({ from: fortalezaAddDays(today, -6), to: today }),
    ...linked,
  });
  const linksReady = tasksQ.isSuccess && habitsQ.isSuccess && logsQ.isSuccess;
  const progressOf = (goal) =>
    linksReady ? computeGoalProgress(goal, tasksQ.data, habitsQ.data, logsQ.data) : Number(goal.manual_progress) || 0;
  const goal = hasActive ? pickMainGoal(goals, progressOf, today) : null;
  const pct = goal ? Math.max(0, Math.min(100, Math.round(progressOf(goal)))) : 0;
  const linksLoading = hasActive && !linksReady && !(tasksQ.isError || habitsQ.isError || logsQ.isError);

  return (
    <ToolCard
      testId="tool-goals"
      to="/metas"
      icon={Target}
      iconClassName="text-primary"
      label="Metas"
      loading={isLoading}
      value={isError ? '—' : goal ? goal.title : 'Sem meta ativa'}
      valueClassName={goal ? 'text-base sm:text-base' : 'whitespace-normal text-sm font-medium tracking-normal sm:text-sm'}
      detailClassName="overflow-hidden"
      detail={goal ? (
        <span className="mt-1 flex items-center gap-2">
          <span
            className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]"
            role="progressbar"
            aria-label={`Progresso de ${goal.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <span
              className="block h-full w-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: `scaleX(${linksLoading ? 0 : pct / 100})` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums">{linksLoading ? '…' : `${pct}%`}</span>
        </span>
      ) : null}
      action={(
        <Button asChild variant="secondary" className={actionClass}>
          <Link to="/metas">{goal || isError ? 'Abrir' : 'Criar meta'}</Link>
        </Button>
      )}
    />
  );
}

function CheckinCard({ todayCheck, onSave, clock }) {
  const [open, setOpen] = useState(false);
  const [savedCheck, setSavedCheck] = useState(null);
  const check = todayCheck || savedCheck;
  const evening = !check && Number(String(clock || '').slice(0, 2)) >= EVENING_HOUR;
  const mood = Number(check?.mood) || 3;

  return (
    <>
      <ToolCard
        testId="tool-checkin"
        onOpen={() => setOpen(true)}
        icon={Heart}
        iconClassName={evening ? 'text-domain-gold' : 'text-domain-wellness'}
        label="Check-in"
        labelClassName={cn(evening && 'text-domain-gold')}
        value={check ? 'Feito' : 'Falta fazer'}
        detail={check ? `${moodLabels[mood - 1]} · energia ${check.productivity || 3}/5` : null}
        className={cn(evening && goldRing)}
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

function ReviewCard({ today }) {
  const { data, isLoading } = useQuery({
    queryKey: ['captures', 'pending-count'],
    queryFn: () => praxisApi.captures.pendingCount(),
    staleTime: 30_000,
    retry: 1,
  });
  // Sem a contagem (erro), segue para a revisão da semana.
  const review = pickReviewCard({ pendingCount: data?.count, today });

  if (review.kind === 'captures') {
    return (
      <ToolCard
        testId="tool-review"
        to="/capturas"
        icon={CalendarCheck}
        iconClassName="text-domain-gold"
        label="Revisar"
        value={review.count}
        detail={review.count === 1 ? 'captura na fila' : 'capturas na fila'}
        action={(
          <Button asChild variant="secondary" className={actionClass}>
            <Link to="/capturas">Abrir</Link>
          </Button>
        )}
      />
    );
  }

  return (
    <ToolCard
      testId="tool-review"
      to="/revisao-semanal"
      icon={CalendarCheck}
      iconClassName="text-domain-gold"
      label="Revisar"
      labelClassName={cn(review.weekend && 'text-domain-gold')}
      loading={isLoading}
      value={review.span}
      className={cn(review.weekend && goldRing)}
      action={(
        <Button asChild variant={review.weekend ? 'default' : 'secondary'} className={actionClass}>
          <Link to="/revisao-semanal">Revisar a semana</Link>
        </Button>
      )}
    />
  );
}

/** Ferramentas do Hoje, 2 colunas: Finanças, Foco, Frentes, Metas, Check-in e Revisar. */
export default function ToolsPanel({ today, clock, todayCheck, onSaveWellness, focusGoalMinutes }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3" data-testid="tools-panel">
      <FinanceCard />
      <FocusCard today={today} focusGoalMinutes={focusGoalMinutes} />
      <FrontCard />
      <GoalCard today={today} />
      <CheckinCard todayCheck={todayCheck} onSave={onSaveWellness} clock={clock} />
      <ReviewCard today={today} />
    </div>
  );
}
