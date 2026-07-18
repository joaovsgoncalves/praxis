import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  Flag,
  History,
  Pause,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { praxisApi } from '@/api/praxisClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import {
  formatClock,
  formatSeconds,
  formatSetResult,
  formatWorkoutTarget,
} from '@/lib/workouts';
import { cn } from '@/lib/utils';

function localRestKey(sessionId) {
  return `praxis:workout-rest:${sessionId}`;
}

function loadRestTimer(sessionId) {
  try {
    const raw = localStorage.getItem(localRestKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.endsAt || parsed.endsAt <= Date.now()) {
      localStorage.removeItem(localRestKey(sessionId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function initialSetForm(exercise) {
  const nextIndex = exercise?.sets?.length || 0;
  const previous = exercise?.previous_sets?.[nextIndex] || exercise?.previous_sets?.[exercise.previous_sets.length - 1] || null;
  return {
    weight_kg: previous?.weight_kg ?? '',
    reps: previous?.reps ?? '',
    duration_seconds: previous?.duration_seconds ?? exercise?.target_duration_seconds ?? '',
    distance_m: previous?.distance_m ?? '',
  };
}

function hasPrimaryResult(form, trackingType) {
  if (trackingType === 'duration') return form.duration_seconds !== '';
  if (trackingType === 'distance') return form.distance_m !== '';
  if (trackingType === 'distance_duration') return form.distance_m !== '' || form.duration_seconds !== '';
  return form.reps !== '';
}

function toOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export default function WorkoutSessionView({ sessionId, onExit }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [now, setNow] = useState(Date.now());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [setForm, setSetForm] = useState({ weight_kg: '', reps: '', duration_seconds: '', distance_m: '' });
  const [restTimer, setRestTimer] = useState(() => loadRestTimer(sessionId));

  const { data: session, isLoading, isError, error } = useQuery({
    queryKey: ['workouts', 'session', sessionId],
    queryFn: () => praxisApi.workouts.sessions.get(sessionId),
    enabled: Boolean(sessionId),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setRestTimer(loadRestTimer(sessionId));
  }, [sessionId]);

  useEffect(() => {
    if (!session?.exercises?.length) return;
    const firstIncomplete = session.exercises.findIndex((exercise) => exercise.sets.length < Number(exercise.target_sets || 1));
    setCurrentIndex((current) => {
      if (current >= 0 && current < session.exercises.length) return current;
      return firstIncomplete >= 0 ? firstIncomplete : 0;
    });
  }, [session?.exercises?.length]);

  const currentExercise = session?.exercises?.[currentIndex] || null;

  useEffect(() => {
    if (currentExercise) setSetForm(initialSetForm(currentExercise));
  }, [currentExercise?.id, currentExercise?.sets?.length]);

  const elapsedSeconds = useMemo(() => {
    if (!session?.started_at) return 0;
    const started = Date.parse(session.started_at);
    if (!Number.isFinite(started)) return 0;
    return Math.max(0, Math.floor((now - started) / 1000));
  }, [now, session?.started_at]);

  const restRemaining = restTimer?.endsAt ? Math.max(0, Math.ceil((restTimer.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (restTimer?.endsAt && restTimer.endsAt <= now) {
      localStorage.removeItem(localRestKey(sessionId));
      setRestTimer(null);
    }
  }, [now, restTimer, sessionId]);

  const sessionProgress = useMemo(() => {
    if (!session?.exercises?.length) return 0;
    const totalTargets = session.exercises.reduce((sum, exercise) => sum + Math.max(1, Number(exercise.target_sets || 1)), 0);
    const done = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    return totalTargets ? Math.min(100, Math.round((done / totalTargets) * 100)) : 0;
  }, [session]);

  const totalCompletedSets = useMemo(
    () => session?.exercises?.reduce((sum, exercise) => sum + exercise.sets.length, 0) || 0,
    [session],
  );

  const updateSessionCache = (updated) => {
    queryClient.setQueryData(['workouts', 'session', sessionId], updated);
    queryClient.invalidateQueries({ queryKey: ['workouts', 'summary'] });
    queryClient.invalidateQueries({ queryKey: ['workouts', 'history'] });
  };

  const startRest = (seconds, exerciseId) => {
    const duration = Number(seconds) || 0;
    if (duration <= 0) return;
    const payload = { endsAt: Date.now() + duration * 1000, exerciseId };
    localStorage.setItem(localRestKey(sessionId), JSON.stringify(payload));
    setRestTimer(payload);
  };

  const adjustRest = (deltaSeconds) => {
    if (!restTimer?.endsAt) return;
    const next = { ...restTimer, endsAt: Math.max(Date.now(), restTimer.endsAt + deltaSeconds * 1000) };
    if (next.endsAt <= Date.now()) {
      localStorage.removeItem(localRestKey(sessionId));
      setRestTimer(null);
      return;
    }
    localStorage.setItem(localRestKey(sessionId), JSON.stringify(next));
    setRestTimer(next);
  };

  const addSet = useMutation({
    mutationFn: (payload) => praxisApi.workouts.sessions.addSet(sessionId, payload),
    onSuccess: (updated) => {
      updateSessionCache(updated);
      startRest(currentExercise?.rest_seconds, currentExercise?.id);
      const updatedExercise = updated.exercises.find((exercise) => exercise.id === currentExercise?.id);
      setSetForm(initialSetForm(updatedExercise));
    },
    onError: (mutationError) => toast({
      title: 'Não deu pra registrar a série',
      description: mutationError?.message || 'Confere os campos e tenta de novo.',
      variant: 'destructive',
    }),
  });

  const deleteSet = useMutation({
    mutationFn: (setId) => praxisApi.workouts.sessions.deleteSet(setId),
    onSuccess: (updated) => {
      updateSessionCache(updated);
      toast({ title: 'Série removida' });
    },
    onError: (mutationError) => toast({ title: 'Não deu pra remover', description: mutationError?.message, variant: 'destructive' }),
  });

  const finishSession = useMutation({
    mutationFn: () => praxisApi.workouts.sessions.finish(sessionId),
    onSuccess: (updated) => {
      localStorage.removeItem(localRestKey(sessionId));
      queryClient.setQueryData(['workouts', 'session', sessionId], updated);
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      toast({
        title: 'Treino concluído',
        description: `${updated.workout_day_name_snapshot} · ${updated.completed_sets || totalCompletedSets} séries registradas.`,
      });
      onExit?.({ completed: true, session: updated });
    },
    onError: (mutationError) => toast({
      title: 'Não deu pra finalizar',
      description: mutationError?.message || 'Tenta novamente.',
      variant: 'destructive',
    }),
  });

  const abandonSession = useMutation({
    mutationFn: () => praxisApi.workouts.sessions.abandon(sessionId),
    onSuccess: (updated) => {
      localStorage.removeItem(localRestKey(sessionId));
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      toast({ title: 'Treino encerrado sem concluir' });
      onExit?.({ completed: false, session: updated });
    },
    onError: (mutationError) => toast({ title: 'Não deu pra encerrar', description: mutationError?.message, variant: 'destructive' }),
  });

  const handleAddSet = () => {
    if (!currentExercise || !hasPrimaryResult(setForm, currentExercise.tracking_type) || addSet.isPending) return;
    addSet.mutate({
      session_exercise_id: currentExercise.id,
      weight_kg: toOptionalNumber(setForm.weight_kg),
      reps: toOptionalNumber(setForm.reps),
      duration_seconds: toOptionalNumber(setForm.duration_seconds),
      distance_m: toOptionalNumber(setForm.distance_m),
    });
  };

  const goToExercise = (nextIndex) => {
    if (!session?.exercises?.length) return;
    const safeIndex = Math.max(0, Math.min(nextIndex, session.exercises.length - 1));
    setCurrentIndex(safeIndex);
  };

  if (isLoading) {
    return (
      <div className="praxis-page max-w-xl space-y-4 pb-28">
        <div className="h-20 animate-pulse rounded-2xl bg-secondary/45" />
        <div className="h-96 animate-pulse rounded-2xl bg-secondary/35" />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="praxis-page max-w-xl pb-28">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center">
            <p className="font-semibold">Não consegui abrir esse treino</p>
            <p className="mt-2 text-sm text-muted-foreground">{error?.message || 'A sessão não foi encontrada.'}</p>
            <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={() => onExit?.()}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (session.status !== 'active') {
    return (
      <div className="praxis-page max-w-xl pb-28">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 text-center">
            <Check className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-semibold">Sessão já encerrada</p>
            <p className="mt-1 text-sm text-muted-foreground">{session.workout_day_name_snapshot}</p>
            <Button type="button" className="mt-4 rounded-full" onClick={() => onExit?.()}>
              Voltar aos treinos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const trackingType = currentExercise?.tracking_type || 'reps';
  const isReps = ['reps', 'weight_reps'].includes(trackingType);
  const isWeight = trackingType === 'weight_reps';
  const isDuration = ['duration', 'distance_duration'].includes(trackingType);
  const isDistance = ['distance', 'distance_duration'].includes(trackingType);
  const canAdd = hasPrimaryResult(setForm, trackingType) && !addSet.isPending;

  return (
    <div className="praxis-page max-w-xl space-y-4 pb-32">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="icon" className="-ml-2 rounded-full" onClick={() => onExit?.({ keepActive: true })} aria-label="Voltar aos treinos">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold">{session.workout_day_name_snapshot}</p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{formatClock(elapsedSeconds)} em andamento</p>
          </div>
          <div className="w-10" aria-hidden />
        </div>
        <Progress value={sessionProgress} className="h-1.5" />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{sessionProgress}% do planejado</span>
          <span>{totalCompletedSets} {totalCompletedSets === 1 ? 'série' : 'séries'} feitas</span>
        </div>
      </header>

      {restRemaining > 0 ? (
        <Card className="border-primary/30 bg-primary/10 shadow-none">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Pause className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Descanso</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{formatClock(restRemaining)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="outline" size="sm" className="h-9 rounded-full px-2.5 text-xs" onClick={() => adjustRest(-15)}>-15s</Button>
              <Button type="button" variant="outline" size="sm" className="h-9 rounded-full px-2.5 text-xs" onClick={() => adjustRest(15)}>+15s</Button>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Pular descanso" onClick={() => adjustRest(-restRemaining)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Exercícios da sessão">
        {session.exercises.map((exercise, index) => {
          const done = exercise.sets.length >= Number(exercise.target_sets || 1);
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => goToExercise(index)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors',
                currentIndex === index
                  ? 'border-primary/50 bg-primary/12 text-foreground'
                  : 'border-border/70 bg-card/30 text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
              {index + 1}. {exercise.exercise_name_snapshot}
            </button>
          );
        })}
      </div>

      {currentExercise ? (
        <Card className="overflow-hidden border-border/80 bg-card/45 shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-border/70 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                    {currentIndex + 1} de {session.exercises.length}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold leading-tight tracking-tight">{currentExercise.exercise_name_snapshot}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatWorkoutTarget(currentExercise)} · {formatSeconds(currentExercise.rest_seconds)} de descanso
                  </p>
                  {currentExercise.notes ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{currentExercise.notes}</p> : null}
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Dumbbell className="h-5 w-5" />
                </div>
              </div>
            </div>

            {currentExercise.previous_sets?.length ? (
              <div className="border-b border-border/60 bg-secondary/20 px-5 py-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Último treino
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {currentExercise.previous_sets.map((set) => (
                    <span key={set.id} className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                      {set.set_number}. {formatSetResult(set, trackingType)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {currentExercise.sets?.length ? (
              <div className="border-b border-border/60 px-5 py-4">
                <p className="text-xs font-semibold text-muted-foreground">Séries registradas</p>
                <div className="mt-2 space-y-2">
                  {currentExercise.sets.map((set) => (
                    <div key={set.id} className="flex items-center gap-3 rounded-xl bg-secondary/35 px-3 py-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold tabular-nums text-primary">
                        {set.set_number}
                      </div>
                      <p className="min-w-0 flex-1 text-sm font-medium tabular-nums">{formatSetResult(set, trackingType)}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
                        aria-label={`Remover série ${set.set_number}`}
                        disabled={deleteSet.isPending}
                        onClick={() => deleteSet.mutate(set.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-4 px-5 py-5">
              <div className={cn('grid gap-3', isWeight || trackingType === 'distance_duration' ? 'grid-cols-2' : 'grid-cols-1')}>
                {isWeight ? (
                  <div className="space-y-1.5">
                    <label htmlFor="session-weight" className="text-xs font-medium text-muted-foreground">Carga (kg)</label>
                    <Input
                      id="session-weight"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.25"
                      value={setForm.weight_kg}
                      onChange={(event) => setSetForm((current) => ({ ...current, weight_kg: event.target.value }))}
                      placeholder="0"
                      className="h-12 text-center text-lg font-semibold tabular-nums"
                    />
                  </div>
                ) : null}

                {isReps ? (
                  <div className="space-y-1.5">
                    <label htmlFor="session-reps" className="text-xs font-medium text-muted-foreground">Repetições</label>
                    <Input
                      id="session-reps"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={setForm.reps}
                      onChange={(event) => setSetForm((current) => ({ ...current, reps: event.target.value }))}
                      placeholder="0"
                      className="h-12 text-center text-lg font-semibold tabular-nums"
                    />
                  </div>
                ) : null}

                {isDistance ? (
                  <div className="space-y-1.5">
                    <label htmlFor="session-distance" className="text-xs font-medium text-muted-foreground">Distância (m)</label>
                    <Input
                      id="session-distance"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="1"
                      value={setForm.distance_m}
                      onChange={(event) => setSetForm((current) => ({ ...current, distance_m: event.target.value }))}
                      placeholder="0"
                      className="h-12 text-center text-lg font-semibold tabular-nums"
                    />
                  </div>
                ) : null}

                {isDuration ? (
                  <div className="space-y-1.5">
                    <label htmlFor="session-duration" className="text-xs font-medium text-muted-foreground">Tempo (segundos)</label>
                    <Input
                      id="session-duration"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={setForm.duration_seconds}
                      onChange={(event) => setSetForm((current) => ({ ...current, duration_seconds: event.target.value }))}
                      placeholder="0"
                      className="h-12 text-center text-lg font-semibold tabular-nums"
                    />
                  </div>
                ) : null}
              </div>

              <Button type="button" className="h-12 w-full rounded-xl text-base" disabled={!canAdd} onClick={handleAddSet}>
                {addSet.isPending ? (
                  'Registrando...'
                ) : (
                  <><Plus className="mr-2 h-5 w-5" /> Registrar série {currentExercise.sets.length + 1}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={currentIndex === 0} onClick={() => goToExercise(currentIndex - 1)}>
          <ChevronLeft className="mr-1.5 h-4 w-4" /> Anterior
        </Button>
        <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={currentIndex >= session.exercises.length - 1} onClick={() => goToExercise(currentIndex + 1)}>
          Próximo <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      <Card className="border-border/70 bg-card/30 shadow-none">
        <CardContent className="space-y-3 p-4">
          <Button
            type="button"
            className="h-12 w-full rounded-xl"
            disabled={!totalCompletedSets || finishSession.isPending}
            onClick={() => {
              const remaining = session.exercises.reduce(
                (sum, exercise) => sum + Math.max(0, Number(exercise.target_sets || 1) - exercise.sets.length),
                0,
              );
              const ok = remaining > 0
                ? window.confirm(`Ainda faltam ${remaining} série(s) do planejado. Finalizar mesmo assim?`)
                : true;
              if (ok) finishSession.mutate();
            }}
          >
            <Flag className="mr-2 h-4 w-4" />
            {finishSession.isPending ? 'Finalizando...' : 'Finalizar treino'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-xl text-muted-foreground hover:text-destructive"
            disabled={abandonSession.isPending}
            onClick={() => {
              const ok = window.confirm('Encerrar este treino sem concluir? As séries já registradas ficam no histórico como sessão abandonada.');
              if (ok) abandonSession.mutate();
            }}
          >
            {abandonSession.isPending ? 'Encerrando...' : 'Abandonar sessão'}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" />
        <span>O treino continua salvo mesmo se você fechar a Praxis.</span>
      </div>
    </div>
  );
}
