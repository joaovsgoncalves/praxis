import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Dumbbell,
  History,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import {
  PageHero,
  PraxisEmptyState,
  PraxisListSkeleton,
} from '@/components/layout/PraxisPage';
import WorkoutProgramDialog from '@/components/workouts/WorkoutProgramDialog';
import WorkoutProgramEditor from '@/components/workouts/WorkoutProgramEditor';
import WorkoutSessionView from '@/components/workouts/WorkoutSessionView';
import WorkoutHistory from '@/components/workouts/WorkoutHistory';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatSeconds, formatWorkoutTarget, workoutDayShortLabel } from '@/lib/workouts';

const TABS = [
  { id: 'hoje', label: 'Hoje', icon: Play },
  { id: 'programa', label: 'Programa', icon: ListChecks },
  { id: 'historico', label: 'Histórico', icon: History },
];

export default function Treinos() {
  const [tab, setTab] = useState('hoje');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [programDialogOpen, setProgramDialogOpen] = useState(false);
  const queryClient = useQueryClient();

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
    onError: (mutationError) => {
      if (mutationError?.status === 409 && mutationError?.body?.session?.id) {
        setActiveSessionId(mutationError.body.session.id);
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

  return (
    <div className="praxis-page max-w-xl space-y-6 pb-24">
      <PageHero
        kicker="Corpo"
        kickerIcon={Dumbbell}
        title="Treinos"
        description="Monta teu programa, executa série por série e carrega o histórico pra próxima sessão."
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

      {!isLoading && !isError && !program ? (
        <>
          <PraxisEmptyState
            icon={Dumbbell}
            title="Monta teu primeiro programa"
            description="Cria o ciclo, adiciona os dias e define exercícios, séries, repetições e descanso."
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
      ) : null}

      {program ? (
        <>
          {activeSession ? (
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
            className="grid grid-cols-3 gap-1 rounded-full bg-secondary/40 p-1"
            role="tablist"
            aria-label="Seções de treinos"
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
                    'flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-medium transition-colors sm:text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    tab === item.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" className="space-y-5">
            {tab === 'hoje' ? (
              <TodayWorkout
                program={program}
                currentDay={currentDay}
                totalCompleted={summary?.total_completed || 0}
                onStart={(dayId) => startSession.mutate(dayId)}
                starting={startSession.isPending}
                onAdvanceRest={() => advanceRest.mutate({ programId: program.id, dayId: currentDay.id })}
                advancingRest={advanceRest.isPending}
                onOpenProgram={() => setTab('programa')}
              />
            ) : null}

            {tab === 'programa' ? <WorkoutProgramEditor program={program} programs={programs} /> : null}
            {tab === 'historico' ? <WorkoutHistory /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function TodayWorkout({
  program,
  currentDay,
  totalCompleted,
  onStart,
  starting,
  onAdvanceRest,
  advancingRest,
  onOpenProgram,
}) {
  if (!currentDay) {
    return (
      <PraxisEmptyState
        icon={ListChecks}
        title="Teu programa ainda não tem dias"
        description="Adiciona Pull, Push, Legs, descanso ou qualquer divisão que você usa."
        action={<Button type="button" className="rounded-full" onClick={onOpenProgram}><Plus className="mr-1.5 h-4 w-4" /> Montar programa</Button>}
      />
    );
  }

  const days = program.days || [];
  const currentIndex = days.findIndex((day) => day.id === currentDay.id);
  const cycleProgress = days.length ? Math.round(((currentIndex + 1) / days.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-border/80 bg-card/35 shadow-none">
        <CardContent className="p-0">
          <div className="px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  {currentDay.day_type === 'rest' ? 'Hoje é descanso' : 'Próximo treino'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{currentDay.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{workoutDayShortLabel(currentDay)}</p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                {currentDay.day_type === 'rest' ? <RotateCcw className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
              </div>
            </div>

            {currentDay.notes ? (
              <p className="mt-4 rounded-xl bg-background/45 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{currentDay.notes}</p>
            ) : null}

            {currentDay.day_type === 'rest' ? (
              <Button type="button" className="mt-5 h-12 w-full rounded-xl" onClick={onAdvanceRest} disabled={advancingRest}>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {advancingRest ? 'Avançando...' : 'Concluir descanso'}
              </Button>
            ) : currentDay.exercises?.length ? (
              <Button type="button" className="mt-5 h-12 w-full rounded-xl text-base" onClick={() => onStart(currentDay.id)} disabled={starting}>
                <Play className="mr-2 h-5 w-5 fill-current" />
                {starting ? 'Começando...' : 'Começar treino'}
              </Button>
            ) : (
              <Button type="button" variant="outline" className="mt-5 h-12 w-full rounded-xl" onClick={onOpenProgram}>
                <Plus className="mr-2 h-5 w-5" /> Adicionar exercícios
              </Button>
            )}
          </div>

          <div className="border-t border-border/60 bg-background/25 px-5 py-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Ciclo · dia {currentIndex + 1} de {days.length}</span>
              <span>{totalCompleted} {totalCompleted === 1 ? 'treino concluído' : 'treinos concluídos'}</span>
            </div>
            <Progress value={cycleProgress} className="mt-2 h-1" />
          </div>
        </CardContent>
      </Card>

      {currentDay.day_type === 'training' && currentDay.exercises?.length ? (
        <Card className="border-border/80 bg-card/35 shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3.5 sm:px-5">
              <div>
                <p className="text-sm font-semibold">Exercícios de hoje</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Na ordem do treino.</p>
              </div>
              <span className="text-xs text-muted-foreground">{currentDay.exercises.length}</span>
            </div>
            <div className="divide-y divide-border/60">
              {currentDay.exercises.map((exercise, index) => (
                <div key={exercise.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/55 text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{exercise.exercise_name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatWorkoutTarget(exercise)}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {formatSeconds(exercise.rest_seconds)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Teu ciclo</p>
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={onOpenProgram}>Editar</Button>
        </div>
        <div className="space-y-1.5">
          {days.map((day, index) => {
            const isCurrent = day.id === currentDay.id;
            return (
              <div
                key={day.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3.5 py-3',
                  isCurrent ? 'border-primary/40 bg-primary/8' : 'border-border/60 bg-card/25',
                )}
              >
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums',
                  isCurrent ? 'bg-primary/15 text-primary' : 'bg-secondary/45 text-muted-foreground',
                )}>
                  {day.day_type === 'rest' ? <RotateCcw className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{day.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{workoutDayShortLabel(day)}</p>
                </div>
                {isCurrent ? <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Agora</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
