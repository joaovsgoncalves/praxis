import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  Flag,
  Flame,
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
import { toast } from 'sonner';
import {
  formatClock,
  formatPurpose,
  formatSeconds,
  formatSetResult,
  formatSetRir,
  formatTargetRir,
  formatTechnicalQuality,
  formatWorkoutTarget,
  isWarmupSet,
  trackingUsesBand,
  trackingUsesRir,
  trackingUsesWeight,
  WORKOUT_BAND_LEVELS,
  WORKOUT_RIR_MAX_CHIP,
  WORKOUT_RIR_OPTIONS,
  WORKOUT_TECHNICAL_QUALITIES,
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

const EMPTY_SET_FORM = {
  weight_kg: '',
  reps: '',
  duration_seconds: '',
  distance_m: '',
  band_level: '',
  set_role: 'work',
  rir: '',
  technical_quality: '',
  note: '',
};

function workSetsOf(exercise) {
  return (exercise?.sets || []).filter((set) => !isWarmupSet(set));
}

function warmupSetsOf(exercise) {
  return (exercise?.sets || []).filter((set) => isWarmupSet(set));
}

/** Prefill the next working set from the same slot of the last session (warmups excluded upstream). */
function initialSetForm(exercise, role = 'work') {
  const previousList = exercise?.previous_sets || [];
  const workDone = workSetsOf(exercise).length;
  const previous = role === 'warmup'
    ? null
    : previousList[workDone] || previousList[previousList.length - 1] || null;
  return {
    ...EMPTY_SET_FORM,
    weight_kg: previous?.weight_kg ?? '',
    reps: previous?.reps ?? '',
    duration_seconds: previous?.duration_seconds ?? exercise?.target_duration_seconds ?? '',
    distance_m: previous?.distance_m ?? '',
    band_level: previous?.band_level ?? '',
    set_role: role,
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
  const [now, setNow] = useState(Date.now());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [setForm, setSetForm] = useState(EMPTY_SET_FORM);
  const [showDetails, setShowDetails] = useState(false);
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
    setShowDetails(false);
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
    const done = session.exercises.reduce((sum, exercise) => sum + workSetsOf(exercise).length, 0);
    return totalTargets ? Math.min(100, Math.round((done / totalTargets) * 100)) : 0;
  }, [session]);

  const totalWorkSets = useMemo(
    () => session?.exercises?.reduce((sum, exercise) => sum + workSetsOf(exercise).length, 0) || 0,
    [session],
  );

  const totalWarmupSets = useMemo(
    () => session?.exercises?.reduce((sum, exercise) => sum + warmupSetsOf(exercise).length, 0) || 0,
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
    onSuccess: (updated, variables) => {
      updateSessionCache(updated);
      // Warmups don't trigger the rest timer — only working sets do.
      if (variables?.set_role !== 'warmup') {
        startRest(currentExercise?.rest_seconds, currentExercise?.id);
      }
      const updatedExercise = updated.exercises.find((exercise) => exercise.id === currentExercise?.id);
      setSetForm(initialSetForm(updatedExercise));
      setShowDetails(false);
    },
    onError: (mutationError) => toast.error('Não deu pra registrar a série', { description: mutationError?.message || 'Confere os campos e tenta de novo.' }),
  });

  const deleteSet = useMutation({
    mutationFn: (setId) => praxisApi.workouts.sessions.deleteSet(setId),
    onSuccess: (updated) => {
      updateSessionCache(updated);
      toast('Série removida');
    },
    onError: (mutationError) => toast.error('Não deu pra remover', { description: mutationError?.message }),
  });

  const finishSession = useMutation({
    mutationFn: () => praxisApi.workouts.sessions.finish(sessionId),
    onSuccess: (updated) => {
      localStorage.removeItem(localRestKey(sessionId));
      queryClient.setQueryData(['workouts', 'session', sessionId], updated);
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      toast.success('Treino concluído', { description: `${updated.workout_day_name_snapshot} · ${updated.completed_work_sets ?? totalWorkSets} séries de trabalho.` });
      onExit?.({ completed: true, session: updated });
    },
    onError: (mutationError) => toast.error('Não deu pra finalizar', { description: mutationError?.message || 'Tenta novamente.' }),
  });

  const abandonSession = useMutation({
    mutationFn: () => praxisApi.workouts.sessions.abandon(sessionId),
    onSuccess: (updated) => {
      localStorage.removeItem(localRestKey(sessionId));
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      toast('Treino encerrado sem concluir');
      onExit?.({ completed: false, session: updated });
    },
    onError: (mutationError) => toast.error('Não deu pra encerrar', { description: mutationError?.message }),
  });

  const handleAddSet = () => {
    if (!currentExercise || !hasPrimaryResult(setForm, currentExercise.tracking_type) || addSet.isPending) return;
    const payload = {
      session_exercise_id: currentExercise.id,
      weight_kg: toOptionalNumber(setForm.weight_kg),
      reps: toOptionalNumber(setForm.reps),
      duration_seconds: toOptionalNumber(setForm.duration_seconds),
      distance_m: toOptionalNumber(setForm.distance_m),
      set_role: setForm.set_role === 'warmup' ? 'warmup' : 'work',
    };
    if (trackingUsesBand(currentExercise.tracking_type) && setForm.band_level) {
      payload.band_level = setForm.band_level;
    }
    if (trackingUsesRir(currentExercise.tracking_type) && setForm.rir !== '') {
      payload.rir = Number(setForm.rir);
    }
    if (setForm.technical_quality) payload.technical_quality = setForm.technical_quality;
    if (setForm.note?.trim()) payload.notes = setForm.note.trim();
    addSet.mutate(payload);
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
  const isWeight = trackingUsesWeight(trackingType);
  const isBand = trackingUsesBand(trackingType);
  const isRir = trackingUsesRir(trackingType);
  const isDuration = ['duration', 'distance_duration'].includes(trackingType);
  const isDistance = ['distance', 'distance_duration'].includes(trackingType);
  const canAdd = hasPrimaryResult(setForm, trackingType) && !addSet.isPending;
  const loadColumnLabel = isWeight ? 'Kg' : isBand ? 'Elástico' : '—';

  const isWarmup = setForm.set_role === 'warmup';
  const purpose = currentExercise?.purpose || 'strength';
  const isSkill = purpose === 'skill';
  const purposeLabel = formatPurpose(purpose);
  const targetRirLabel = formatTargetRir(currentExercise || {});
  const currentWorkCount = workSetsOf(currentExercise).length;
  const currentWarmupCount = warmupSetsOf(currentExercise).length;
  const nextWorkNumber = currentWorkCount + 1;
  const nextWarmupNumber = currentWarmupCount + 1;
  const nextSetLabel = isWarmup ? `A${nextWarmupNumber}` : `${nextWorkNumber}`;

  // Stable per-set display labels: warmups get A1/A2…, working sets keep their ordinal.
  const setLabels = new Map();
  let warmupSeen = 0;
  let workSeen = 0;
  for (const set of currentExercise?.sets || []) {
    if (isWarmupSet(set)) {
      warmupSeen += 1;
      setLabels.set(set.id, { label: `A${warmupSeen}`, warmup: true });
    } else {
      workSeen += 1;
      setLabels.set(set.id, { label: `${workSeen}`, warmup: false });
    }
  }

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
          <span>
            {totalWorkSets} {totalWorkSets === 1 ? 'série' : 'séries'} de trabalho
            {totalWarmupSets ? <span className="text-muted-foreground/70"> · {totalWarmupSets} aquec.</span> : null}
          </span>
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

      <div className="flex gap-2 overflow-x-auto pb-1 praxis-hide-scrollbar praxis-scroll-x" aria-label="Exercícios da sessão">
        {session.exercises.map((exercise, index) => {
          const done = workSetsOf(exercise).length >= Number(exercise.target_sets || 1);
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
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                      {currentIndex + 1} de {session.exercises.length}
                    </p>
                    {purposeLabel ? (
                      <span className="rounded-full border border-border/70 bg-secondary/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {purposeLabel}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold leading-tight tracking-tight">{currentExercise.exercise_name_snapshot}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isSkill
                      ? 'Skill · tentativas de qualidade · parar por técnica'
                      : `${formatWorkoutTarget(currentExercise)} · ${formatSeconds(currentExercise.rest_seconds)} de descanso`}
                    {!isSkill && targetRirLabel ? <span className="text-muted-foreground/80"> · {targetRirLabel}</span> : null}
                  </p>
                  {currentExercise.notes ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{currentExercise.notes}</p> : null}
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Dumbbell className="h-5 w-5" />
                </div>
              </div>
            </div>

            {currentExercise.previous_sets?.length ? (
              <div className="border-b border-border/60 bg-secondary/15 px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Última
                  <span className="font-normal tabular-nums text-muted-foreground/90">
                    {currentExercise.previous_sets.map((set) => formatSetResult(set, trackingType)).join(' · ')}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="px-3 py-3 sm:px-4">
              {/* Logbook table — direction A */}
              <div className="overflow-hidden rounded-xl border border-border/70">
                <div
                  className={cn(
                    'grid gap-2 border-b border-border/60 bg-secondary/25 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground',
                    isDuration || isDistance ? 'grid-cols-[2rem_1fr_1fr_2.5rem]' : 'grid-cols-[2rem_1fr_1fr_2.5rem]',
                  )}
                >
                  <span className="tabular-nums">#</span>
                  <span>{isDuration && !isReps ? 'Tempo' : isDistance && !isReps ? 'Dist.' : 'Reps'}</span>
                  <span>{isDuration && isDistance ? 'Dist.' : loadColumnLabel}</span>
                  <span className="sr-only">Ação</span>
                </div>

                <div className="divide-y divide-border/50">
                  {currentExercise.sets?.map((set) => {
                    const meta = setLabels.get(set.id) || { label: `${set.set_number}`, warmup: isWarmupSet(set) };
                    const rirLabel = formatSetRir(set.rir);
                    const qualityLabel = formatTechnicalQuality(set.technical_quality);
                    const extras = [];
                    if (rirLabel) extras.push(rirLabel);
                    if (qualityLabel) extras.push(qualityLabel);
                    return (
                      <div
                        key={set.id}
                        className={cn('px-3 py-2.5', meta.warmup && 'bg-secondary/10')}
                      >
                        <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums',
                              meta.warmup ? 'text-muted-foreground' : 'text-primary',
                            )}
                          >
                            {meta.warmup ? <Flame className="h-3 w-3" aria-hidden /> : null}
                            {meta.label}
                          </span>
                          <span className="text-sm font-medium tabular-nums">
                            {isReps && set.reps != null
                              ? set.reps
                              : isDuration && !isReps && set.duration_seconds != null
                                ? formatSeconds(set.duration_seconds)
                                : isDistance && set.distance_m != null
                                  ? set.distance_m
                                  : formatSetResult(set, trackingType)}
                          </span>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {isWeight && set.weight_kg != null
                              ? `${Number(set.weight_kg).toLocaleString('pt-BR')} kg`
                              : isBand && set.band_level
                                ? (WORKOUT_BAND_LEVELS.find((b) => b.value === set.band_level)?.label || set.band_level)
                                : isDistance && isDuration && set.distance_m != null
                                  ? `${set.distance_m} m`
                                  : '—'}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 justify-self-end rounded-full text-muted-foreground hover:text-destructive"
                            aria-label={`Remover série ${meta.label}`}
                            disabled={deleteSet.isPending}
                            onClick={() => deleteSet.mutate(set.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {(meta.warmup || extras.length || set.notes) ? (
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-8 text-[11px] text-muted-foreground">
                            {meta.warmup ? <span className="font-medium uppercase tracking-wide text-muted-foreground/80">Aquecimento</span> : null}
                            {extras.map((chip) => <span key={chip} className="tabular-nums">{chip}</span>)}
                            {set.notes ? <span className="italic text-muted-foreground/80">“{set.notes}”</span> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {/* Input row */}
                  <div className="space-y-3 bg-secondary/10 px-3 py-3">
                    {/* Warmup / work toggle — default Trabalho */}
                    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Tipo da série">
                      {[
                        { value: 'work', label: 'Trabalho' },
                        { value: 'warmup', label: 'Aquecimento' },
                      ].map((option) => {
                        const active = setForm.set_role === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSetForm((current) => ({ ...current, set_role: option.value }))}
                            className={cn(
                              'flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors',
                              active
                                ? option.value === 'warmup'
                                  ? 'border-amber-500/50 bg-amber-500/10 text-foreground'
                                  : 'border-primary/50 bg-primary/15 text-foreground'
                                : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {option.value === 'warmup' ? <Flame className="h-4 w-4" aria-hidden /> : null}
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-end gap-2">
                      <span className="pb-2.5 text-sm font-semibold tabular-nums text-muted-foreground">{nextSetLabel}</span>

                      {isReps ? (
                        <div className="space-y-1">
                          <label htmlFor="session-reps" className="sr-only">Repetições</label>
                          <Input
                            id="session-reps"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={setForm.reps}
                            onChange={(event) => setSetForm((current) => ({ ...current, reps: event.target.value }))}
                            placeholder="0"
                            className="h-11 text-center text-base font-semibold tabular-nums"
                          />
                        </div>
                      ) : isDuration ? (
                        <div className="space-y-1">
                          <label htmlFor="session-duration" className="sr-only">Tempo (s)</label>
                          <Input
                            id="session-duration"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={setForm.duration_seconds}
                            onChange={(event) => setSetForm((current) => ({ ...current, duration_seconds: event.target.value }))}
                            placeholder="s"
                            className="h-11 text-center text-base font-semibold tabular-nums"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label htmlFor="session-distance" className="sr-only">Distância (m)</label>
                          <Input
                            id="session-distance"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={setForm.distance_m}
                            onChange={(event) => setSetForm((current) => ({ ...current, distance_m: event.target.value }))}
                            placeholder="m"
                            className="h-11 text-center text-base font-semibold tabular-nums"
                          />
                        </div>
                      )}

                      {isWeight ? (
                        <div className="space-y-1">
                          <label htmlFor="session-weight" className="sr-only">Carga (kg)</label>
                          <Input
                            id="session-weight"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.25"
                            value={setForm.weight_kg}
                            onChange={(event) => setSetForm((current) => ({ ...current, weight_kg: event.target.value }))}
                            placeholder="kg"
                            className="h-11 text-center text-base font-semibold tabular-nums"
                          />
                        </div>
                      ) : isDistance && isDuration ? (
                        <div className="space-y-1">
                          <label htmlFor="session-distance-b" className="sr-only">Distância (m)</label>
                          <Input
                            id="session-distance-b"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={setForm.distance_m}
                            onChange={(event) => setSetForm((current) => ({ ...current, distance_m: event.target.value }))}
                            placeholder="m"
                            className="h-11 text-center text-base font-semibold tabular-nums"
                          />
                        </div>
                      ) : isBand ? (
                        <div className="flex h-11 items-center text-xs text-muted-foreground">
                          {setForm.band_level
                            ? WORKOUT_BAND_LEVELS.find((b) => b.value === setForm.band_level)?.label
                            : '—'}
                        </div>
                      ) : (
                        <div className="h-11" />
                      )}

                      <Button
                        type="button"
                        size="icon"
                        className="h-11 w-11 justify-self-end rounded-xl"
                        disabled={!canAdd}
                        aria-label={`Registrar série ${nextSetLabel}`}
                        onClick={handleAddSet}
                      >
                        {addSet.isPending ? <Clock3 className="h-4 w-4 animate-pulse" /> : <Check className="h-5 w-5" />}
                      </Button>
                    </div>

                    {isRir ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">RIR <span className="font-normal">(opcional)</span></p>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="RIR da série">
                          {WORKOUT_RIR_OPTIONS.map((value) => {
                            const active = setForm.rir !== '' && Number(setForm.rir) === value;
                            const label = value >= WORKOUT_RIR_MAX_CHIP ? `${WORKOUT_RIR_MAX_CHIP}+` : `${value}`;
                            return (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setSetForm((current) => ({
                                  ...current,
                                  rir: current.rir !== '' && Number(current.rir) === value ? '' : String(value),
                                }))}
                                className={cn(
                                  'min-h-10 min-w-10 rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors',
                                  active
                                    ? 'border-primary/50 bg-primary/15 text-foreground'
                                    : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground',
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {isBand ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Elástico</p>
                        <div className="flex flex-wrap gap-1.5">
                          {WORKOUT_BAND_LEVELS.map((band) => {
                            const active = setForm.band_level === band.value;
                            return (
                              <button
                                key={band.value}
                                type="button"
                                onClick={() => setSetForm((current) => ({
                                  ...current,
                                  band_level: current.band_level === band.value ? '' : band.value,
                                }))}
                                className={cn(
                                  'min-h-10 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                  active
                                    ? 'border-primary/50 bg-primary/15 text-foreground'
                                    : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground',
                                )}
                              >
                                {band.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Optional details: technical quality + short per-set note (all tracking types) */}
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowDetails((value) => !value)}
                        aria-expanded={showDetails}
                        className="flex min-h-9 items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showDetails && 'rotate-180')} />
                        Detalhes {(setForm.technical_quality || setForm.note) ? '·' : '(opcional)'}
                        {setForm.technical_quality ? <span className="text-foreground">{formatTechnicalQuality(setForm.technical_quality)}</span> : null}
                      </button>
                      {showDetails ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qualidade técnica">
                            {WORKOUT_TECHNICAL_QUALITIES.map((option) => {
                              const active = setForm.technical_quality === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => setSetForm((current) => ({
                                    ...current,
                                    technical_quality: current.technical_quality === option.value ? '' : option.value,
                                  }))}
                                  className={cn(
                                    'min-h-10 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                    active
                                      ? 'border-primary/50 bg-primary/15 text-foreground'
                                      : 'border-border/70 bg-background/40 text-muted-foreground hover:text-foreground',
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="space-y-1">
                            <label htmlFor="session-set-note" className="sr-only">Nota da série</label>
                            <Input
                              id="session-set-note"
                              type="text"
                              value={setForm.note}
                              onChange={(event) => setSetForm((current) => ({ ...current, note: event.target.value }))}
                              placeholder="Nota rápida (lado, parede, dor...)"
                              maxLength={140}
                              className="h-10 text-sm"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                className="mt-3 h-12 w-full rounded-xl text-base"
                disabled={!canAdd}
                onClick={handleAddSet}
              >
                {addSet.isPending ? (
                  'Registrando...'
                ) : (
                  <><Plus className="mr-2 h-5 w-5" /> Registrar {isWarmup ? 'aquecimento' : 'série'} {nextSetLabel}</>
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
            disabled={!totalWorkSets || finishSession.isPending}
            onClick={() => {
              const remaining = session.exercises.reduce(
                (sum, exercise) => sum + Math.max(0, Number(exercise.target_sets || 1) - workSetsOf(exercise).length),
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
