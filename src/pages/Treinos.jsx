import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Dumbbell,
  History,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
  Scale,
} from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import {
  PageHero,
  PraxisEmptyState,
  PraxisListSkeleton,
} from '@/components/layout/PraxisPage';
import { useWorkoutSessionMode } from '@/components/layout/AppLayout';
import WorkoutProgramDialog from '@/components/workouts/WorkoutProgramDialog';
import WorkoutProgramEditor from '@/components/workouts/WorkoutProgramEditor';
import WorkoutSessionView from '@/components/workouts/WorkoutSessionView';
import WorkoutHistory from '@/components/workouts/WorkoutHistory';
import WorkoutProgress from '@/components/workouts/WorkoutProgress';
import WorkoutMuscleMap from '@/components/workouts/WorkoutMuscleMap';
import WorkoutLibrary from '@/components/workouts/WorkoutLibrary';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  formatSeconds,
  formatSessionDuration,
  formatWorkoutTarget,
  workoutDateLabel,
  workoutDayShortLabel,
} from '@/lib/workouts';

const TABS = [
  { id: 'hoje', label: 'Hoje', icon: Play },
  { id: 'programa', label: 'Programa', icon: ListChecks },
  { id: 'biblioteca', label: 'Biblioteca', icon: Dumbbell },
  { id: 'progresso', label: 'Progresso', icon: History },
  { id: 'corpo', label: 'Corpo', icon: Activity },
];

export default function Treinos() {
  const [tab, setTab] = useState('hoje');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [programDialogOpen, setProgramDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  useWorkoutSessionMode(Boolean(activeSessionId));

  const { data: summary, isLoading, isError, error } = useQuery({
    queryKey: ['workouts', 'summary'],
    queryFn: () => praxisApi.workouts.summary(),
    retry: 1,
  });

  const { data: programs = [] } = useQuery({
    queryKey: ['workouts', 'programs'],
    queryFn: () => praxisApi.workouts.programs.list(),
    retry: 1,
  });

  const { data: completedSessions = [] } = useQuery({
    queryKey: ['workouts', 'sessions', 'last-completed'],
    queryFn: () => praxisApi.workouts.sessions.list({ status: 'completed', limit: 1 }),
    retry: 1,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workouts'] });

  const createProgram = useMutation({
    mutationFn: (data) => praxisApi.workouts.programs.create(data),
    onSuccess: () => {
      setProgramDialogOpen(false);
      setTab('programa');
      refresh();
      toast.success('Programa criado', { description: 'Agora adiciona os dias e monta teus treinos.' });
    },
    onError: (mutationError) => toast.error('Não deu pra criar o programa', { description: mutationError?.message || 'Tenta novamente.' }),
  });

  const startSession = useMutation({
    mutationFn: (dayId) => praxisApi.workouts.sessions.start(dayId),
    onSuccess: (session) => {
      setActiveSessionId(session.id);
      refresh();
    },
    onError: (mutationError, requestedDayId) => {
      if (mutationError?.status === 409 && mutationError?.body?.session?.id) {
        if (mutationError.body.session.workout_day_id === requestedDayId) {
          setActiveSessionId(mutationError.body.session.id);
          return;
        }
        toast.error('Treino em andamento', {
          description: 'Termina ou abandona o treino em andamento antes de começar outro.',
        });
        return;
      }
      toast.error('Não deu pra começar o treino', { description: mutationError?.message || 'Tenta novamente.' });
    },
  });

  const advanceRest = useMutation({
    mutationFn: ({ programId, dayId }) => praxisApi.workouts.programs.advance(programId, { current_day_id: dayId }),
    onSuccess: () => {
      refresh();
      toast('Descanso concluído', { description: 'O próximo dia do ciclo já está pronto.' });
    },
    onError: (mutationError) => toast.error('Não deu pra avançar o ciclo', { description: mutationError?.message || 'Tenta novamente.' }),
  });

  if (activeSessionId) {
    return (
      <WorkoutSessionView
        sessionId={activeSessionId}
        onExit={() => {
          setActiveSessionId(null);
          refresh();
        }}
      />
    );
  }

  const program = summary?.active_program || null;
  const currentDay = summary?.current_day || null;
  const activeSession = summary?.active_session || null;
  const lastSession = Array.isArray(completedSessions) ? completedSessions[0] || null : null;

  return (
    <div className="praxis-page space-y-6 pb-24">
      <PageHero
        kicker="Corpo"
        kickerIcon={Dumbbell}
        title="Jota Fit"
        description="Treino de hoje."
      />

      {isLoading ? <PraxisListSkeleton rows={4} /> : null}

      {isError && !summary ? (
        <PraxisEmptyState
          icon={Dumbbell}
          title="Não consegui carregar teus treinos"
          description={error?.message || 'A API de treinos não respondeu. Tenta novamente.'}
          action={<Button type="button" variant="outline" className="rounded-full" onClick={() => refresh()}>Tentar de novo</Button>}
        />
      ) : null}

      {!isLoading && (!isError || summary) ? (
        <>
          {activeSession && tab !== 'hoje' ? (
            <Card className="border-primary/35 bg-primary/10 shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Play className="h-5 w-5 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Treino em andamento</p>
                    <p className="mt-1 truncate text-sm font-semibold">{activeSession.workout_day_name_snapshot}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{activeSession.completed_sets || 0} séries registradas</p>
                  </div>
                  <Button type="button" size="sm" className="shrink-0 rounded-full" onClick={() => setActiveSessionId(activeSession.id)}>
                    Continuar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div
            className="grid grid-cols-5 gap-1 rounded-full bg-secondary/40 p-1"
            role="tablist"
            aria-label="Seções do Jota Fit"
          >
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'flex min-h-10 items-center justify-center gap-1 rounded-full px-1.5 py-1.5 text-[11px] font-medium transition-colors sm:min-h-11 sm:gap-1.5 sm:px-2 sm:py-2 sm:text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    tab === item.id
                      ? 'bg-background text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div role="tabpanel" className="space-y-5">
            {tab === 'hoje' ? (
              program ? (
                <TodayWorkout
                  currentDay={currentDay}
                  activeSession={activeSession}
                  lastSession={lastSession}
                  onStart={(dayId) => startSession.mutate(dayId)}
                  onContinue={() => setActiveSessionId(activeSession?.id)}
                  starting={startSession.isPending}
                  onAdvanceRest={() => advanceRest.mutate({ programId: program.id, dayId: currentDay.id })}
                  advancingRest={advanceRest.isPending}
                  onOpenProgram={() => setTab('programa')}
                  onOpenLast={() => setTab('progresso')}
                  onStartFreestyle={() => startSession.mutate({ kind: 'freestyle', name: 'Treino Livre' })}
                />
              ) : (
                <>
                  {activeSession ? (
                    <Card className="overflow-hidden border-border/80 bg-card/35 shadow-none">
                      <CardContent className="p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Treino em andamento</p>
                        <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{activeSession.workout_day_name_snapshot}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">{activeSession.completed_sets || 0} séries registradas</p>
                        <Button type="button" className="mt-5 h-12 w-full rounded-xl text-base" onClick={() => setActiveSessionId(activeSession.id)}>
                          <Play className="mr-2 h-5 w-5 fill-current" /> Continuar
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <PraxisEmptyState
                      icon={Dumbbell}
                      title="Monta teu primeiro programa"
                      description="Cria o ciclo, adiciona os dias e define exercícios, séries, repetições e descanso."
                      action={(
                        <div className="flex flex-col items-center gap-2">
                          <Button type="button" className="h-12 rounded-xl px-6 text-base" onClick={() => setProgramDialogOpen(true)}>
                            <Plus className="mr-1.5 h-4 w-4" /> Criar programa
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-9 rounded-xl text-sm text-muted-foreground"
                            onClick={() => startSession.mutate({ kind: 'freestyle', name: 'Treino Livre' })}
                            disabled={startSession.isPending}
                          >
                            Treino livre
                          </Button>
                        </div>
                      )}
                    />
                  )}
                  <LastWorkoutCard session={lastSession} onOpen={() => setTab('progresso')} />
                  <WorkoutProgramDialog
                    open={programDialogOpen}
                    onOpenChange={setProgramDialogOpen}
                    onSubmit={(data) => createProgram.mutate(data)}
                    busy={createProgram.isPending}
                  />
                </>
              )
            ) : null}

            {tab === 'programa' ? (
              program ? (
                <WorkoutProgramEditor
                  program={program}
                  programs={programs}
                  activeSession={activeSession}
                  onStart={(dayId) => startSession.mutate(dayId)}
                  onContinue={() => setActiveSessionId(activeSession?.id)}
                  starting={startSession.isPending}
                />
              ) : (
                <>
                  <PraxisEmptyState
                    icon={ListChecks}
                    title="Nenhum programa configurado"
                    description="Cria o ciclo, adiciona os dias e define teus exercícios."
                    action={(
                      <Button type="button" className="rounded-full" onClick={() => setProgramDialogOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> Criar programa
                      </Button>
                    )}
                  />
                  <WorkoutProgramDialog
                    open={programDialogOpen}
                    onOpenChange={setProgramDialogOpen}
                    onSubmit={(data) => createProgram.mutate(data)}
                    busy={createProgram.isPending}
                  />
                </>
              )
            ) : null}

            {tab === 'biblioteca' ? (
              <WorkoutLibrary
                summary={summary}
                onOpenProgram={() => setTab('programa')}
              />
            ) : null}

            {tab === 'progresso' ? (
              <>
                <WorkoutProgress />
                <WorkoutHistory />
              </>
            ) : null}

            {tab === 'corpo' ? (
              <div className="space-y-5">
                <BodyWeightReadCard />
                <WorkoutMuscleMap
                  onNavigateToLibrary={() => setTab('biblioteca')}
                  onNavigateToProgram={() => setTab('programa')}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatBodyWeightDate(value) {
  if (!value) return '';
  const iso = String(value).slice(0, 10);
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function BodyWeightReadCard() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['nutrition', 'weight', 'list', { limit: 1 }],
    queryFn: () => praxisApi.nutrition.weight.list({ limit: 1 }),
    retry: 1,
  });
  const log = Array.isArray(logs) ? logs[0] || null : null;

  if (isLoading) {
    return (
      <Card className="border-border/80 bg-card/35 shadow-none">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Carregando peso…</p>
        </CardContent>
      </Card>
    );
  }

  if (!log) {
    return (
      <Card className="border-border/80 bg-card/35 shadow-none">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Peso</p>
            <p className="mt-1.5 text-sm text-muted-foreground">Peso vive em Nutrição</p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full">
            <Link to="/nutricao">Nutrição</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const kg = Number(log.weight_kg);
  const kgLabel = Number.isFinite(kg)
    ? kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    : '—';

  return (
    <Card className="border-border/80 bg-card/35 shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Peso</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
              {kgLabel}{' '}
              <span className="text-sm font-normal text-muted-foreground">kg</span>
            </p>
            {log.date ? (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {formatBodyWeightDate(log.date)}
              </p>
            ) : null}
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Scale className="h-5 w-5" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function lastWorkoutWorkSets(session = {}) {
  if (session.completed_work_sets != null) return Number(session.completed_work_sets);
  return Number(session.completed_sets || 0);
}

function LastWorkoutCard({ session, onOpen }) {
  if (!session) return null;
  const workSets = lastWorkoutWorkSets(session);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-border/70 bg-card/35 px-4 py-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Último treino</p>
      <div className="mt-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session.workout_day_name_snapshot}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {workoutDateLabel(session.started_at || session.completed_at)}
            {session.duration_seconds ? ` · ${formatSessionDuration(session.duration_seconds)}` : ''}
            {workSets ? ` · ${workSets} ${workSets === 1 ? 'série' : 'séries'}` : ''}
          </p>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
    </button>
  );
}

function FreestyleLink({ onClick, disabled }) {
  if (!onClick) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-9 w-full rounded-xl text-sm font-normal text-muted-foreground hover:text-foreground"
      onClick={onClick}
      disabled={disabled}
    >
      Treino livre
    </Button>
  );
}

function TodayWorkout({
  currentDay,
  activeSession,
  lastSession,
  onStart,
  onContinue,
  starting,
  onAdvanceRest,
  advancingRest,
  onOpenProgram,
  onOpenLast,
  onStartFreestyle,
}) {
  if (!currentDay) {
    return (
      <div className="space-y-5">
        <PraxisEmptyState
          icon={ListChecks}
          title="Teu programa ainda não tem dias"
          description="Adiciona Pull, Push, Legs, descanso ou qualquer divisão que você usa."
          action={<Button type="button" className="rounded-full" onClick={onOpenProgram}><Plus className="mr-1.5 h-4 w-4" /> Montar programa</Button>}
        />
        <LastWorkoutCard session={lastSession} onOpen={onOpenLast} />
      </div>
    );
  }

  const hasActiveSession = Boolean(activeSession);
  const dayMeta = currentDay.day_type === 'rest'
    ? 'Dia de recuperação'
    : workoutDayShortLabel(currentDay);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-border/80 bg-card/35 shadow-none">
        <CardContent className="p-0">
          <div className="px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  {hasActiveSession ? 'Treino em andamento' : currentDay.day_type === 'rest' ? 'Hoje é descanso' : 'Treino de hoje'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{currentDay.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {hasActiveSession
                    ? `${activeSession.completed_sets || 0} séries registradas`
                    : dayMeta}
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                {hasActiveSession ? <Play className="h-5 w-5 fill-current" /> : currentDay.day_type === 'rest' ? <RotateCcw className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
              </div>
            </div>

            {currentDay.notes && !hasActiveSession ? (
              <details className="group mt-3 rounded-xl bg-background/35 px-3 py-2">
                <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-muted-foreground marker:content-none">
                  <span>Nota</span>
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="pb-1 pt-1.5 text-xs leading-relaxed text-muted-foreground">{currentDay.notes}</p>
              </details>
            ) : null}

            {hasActiveSession ? (
              <Button type="button" className="mt-5 h-12 w-full rounded-xl text-base" onClick={onContinue}>
                <Play className="mr-2 h-5 w-5 fill-current" /> Continuar
              </Button>
            ) : currentDay.day_type === 'rest' ? (
              <Button type="button" className="mt-5 h-12 w-full rounded-xl text-base" onClick={onAdvanceRest} disabled={advancingRest}>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {advancingRest ? 'Avançando...' : 'Concluir descanso'}
              </Button>
            ) : currentDay.exercises?.length ? (
              <div className="mt-5 flex flex-col gap-1">
                <Button
                  type="button"
                  className="h-12 w-full rounded-xl text-base"
                  onClick={() => onStart(currentDay.id)}
                  disabled={starting}
                >
                  <Play className="mr-2 h-5 w-5 fill-current" />
                  {starting ? 'Começando...' : 'Começar treino'}
                </Button>
                <FreestyleLink onClick={onStartFreestyle} disabled={starting} />
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-1">
                <Button type="button" variant="outline" className="h-12 w-full rounded-xl" onClick={onOpenProgram}>
                  <Plus className="mr-2 h-5 w-5" /> Adicionar exercícios
                </Button>
                <FreestyleLink onClick={onStartFreestyle} disabled={starting} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <LastWorkoutCard session={lastSession} onOpen={onOpenLast} />

      {currentDay.day_type === 'training' && currentDay.exercises?.length ? (
        <Card className="border-border/80 bg-card/35 shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3.5 sm:px-5">
              <p className="text-sm font-semibold">Exercícios de hoje</p>
              <span className="text-xs text-muted-foreground">{currentDay.exercises.length}</span>
            </div>
            <div className="divide-y divide-border/60">
              {currentDay.exercises.map((exercise, index) => (
                <div key={exercise.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/55 text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{exercise.exercise_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{formatWorkoutTarget(exercise).replace(/^(\d+) séries? · /, '$1×')}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {formatSeconds(exercise.rest_seconds)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
