import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { praxisApi } from '@/api/praxisClient';
import { dispatchPraxisLevelUpFromResponse } from '@/lib/praxisLevelUp';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { tweenFast } from '@/lib/motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Brain,
  CheckCircle2,
  Coffee,
  Play,
  Pause,
  Square,
  Timer,
  Zap,
  Hourglass,
} from 'lucide-react';
import { PageHero, StatGrid, StatTile, SectionHeading } from '@/components/layout/PraxisPage';
import FocusWeeklyGoal from '@/components/focus/FocusWeeklyGoal';
import { weekRange } from '@/lib/taskLenses';
import { cn } from '@/lib/utils';
import { buildSnoozeTomorrowUpdate, fortalezaDateKey } from '@/lib/dates';
import { toast } from 'sonner';

const PRESETS = [
  { label: 'Pomodoro clássico', shortLabel: 'Clássico', focus: 25, brk: 5, Icon: Timer },
  { label: 'Foco profundo', shortLabel: 'Profundo', focus: 50, brk: 10, Icon: Brain },
  { label: 'Sprint rápido', shortLabel: 'Rápido', focus: 15, brk: 3, Icon: Zap },
  { label: 'Maratona', shortLabel: 'Maratona', focus: 90, brk: 20, Icon: Hourglass },
];

const PRESS = 'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';

const STORAGE_KEY = 'praxis:focus:active-v1';
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.inSession || !data.sessionStart) return null;
    if (Date.now() - Number(data.sessionStart) > MAX_SESSION_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeStoredSession(payload) {
  try {
    if (!payload?.inSession) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function remainingFromEndsAt(endsAt) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((Number(endsAt) - Date.now()) / 1000));
}

function projectSlugFromTaskSource(source) {
  const value = String(source || '');
  return value.startsWith('project_focus:') ? value.slice('project_focus:'.length).trim() : '';
}

export default function Focus() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialTaskId = urlParams.get('taskId') || '';
  const stored = useMemo(() => readStoredSession(), []);

  const [selectedTaskId, setSelectedTaskId] = useState(
    () => (stored?.selectedTaskId != null ? stored.selectedTaskId : initialTaskId) || '',
  );
  const [focusDuration, setFocusDuration] = useState(() => stored?.focusDuration || 25);
  const [breakDuration, setBreakDuration] = useState(() => stored?.breakDuration || 5);
  const [selectedPreset, setSelectedPreset] = useState(() => stored?.selectedPreset ?? 0);
  const [isRunning, setIsRunning] = useState(() => Boolean(stored?.isRunning && !stored?.isPaused));
  const [isPaused, setIsPaused] = useState(() => Boolean(stored?.isPaused));
  const [isBreak, setIsBreak] = useState(() => Boolean(stored?.isBreak));
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!stored?.inSession) return 25 * 60;
    if (stored.isRunning && !stored.isPaused && stored.endsAt) {
      return remainingFromEndsAt(stored.endsAt) || stored.remainingSec || 0;
    }
    return stored.remainingSec ?? stored.focusDuration * 60 ?? 25 * 60;
  });
  const [cycles, setCycles] = useState(() => stored?.cycles || 0);
  const [sessionStart, setSessionStart] = useState(() => stored?.sessionStart || null);
  const [inSession, setInSession] = useState(() => Boolean(stored?.inSession));
  const [totalFocusTime, setTotalFocusTime] = useState(() =>
    Math.round((stored?.focusAccumMs || 0) / 1000),
  );
  const [postSessionOpen, setPostSessionOpen] = useState(false);
  const [postSession, setPostSession] = useState(null);
  const [hydrated] = useState(true);
  const reduceMotion = useReducedMotion();

  const endsAtRef = useRef(stored?.isRunning && !stored?.isPaused ? stored.endsAt || null : null);
  const remainingSecRef = useRef(
    stored?.inSession
      ? (stored.isRunning && !stored.isPaused && stored.endsAt
        ? remainingFromEndsAt(stored.endsAt)
        : stored.remainingSec) ?? 0
      : 25 * 60,
  );
  const focusAccumMsRef = useRef(stored?.focusAccumMs || 0);
  const focusSegmentStartRef = useRef(
    stored?.isRunning && !stored?.isPaused && !stored?.isBreak
      ? stored.focusSegmentStart || Date.now()
      : null,
  );
  const isBreakRef = useRef(Boolean(stored?.isBreak));
  const focusDurationRef = useRef(stored?.focusDuration || 25);
  const breakDurationRef = useRef(stored?.breakDuration || 5);
  const queryClient = useQueryClient();
  const today = fortalezaDateKey();

  useEffect(() => {
    isBreakRef.current = isBreak;
  }, [isBreak]);
  useEffect(() => {
    focusDurationRef.current = focusDuration;
  }, [focusDuration]);
  useEffect(() => {
    breakDurationRef.current = breakDuration;
  }, [breakDuration]);

  const { data: tasks = [] } = useQuery({
    queryKey: ['pendingTasks'],
    queryFn: () => praxisApi.tasks.list({ status: 'pending' }),
  });

  const { data: todaySessions = [] } = useQuery({
    queryKey: ['todayFocus', today],
    queryFn: () => praxisApi.focus.list({ date: today }),
  });

  const { data: focusStats = [] } = useQuery({
    queryKey: ['focusStats', 30],
    queryFn: () => praxisApi.focus.stats(30),
    staleTime: 60_000,
  });

  // Meta semanal opcional: sem meta, nem a semana é buscada.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => praxisApi.user.getSettings() });
  const focusGoalMinutes = me?.focus_weekly_goal_minutes ?? null;
  const weekStart = weekRange(today).start;
  const { data: weekInsights } = useQuery({
    queryKey: ['weeklyInsights', weekStart],
    queryFn: () => praxisApi.insights.weekly(weekStart),
    enabled: focusGoalMinutes != null,
    staleTime: 60_000,
  });

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const activePreset = PRESETS[selectedPreset] || PRESETS[0];

  const persist = useCallback(() => {
    if (!inSession || !sessionStart) {
      clearStoredSession();
      return;
    }
    const running = isRunning && !isPaused;
    writeStoredSession({
      v: 1,
      inSession: true,
      selectedTaskId: selectedTaskId || '',
      focusDuration,
      breakDuration,
      selectedPreset,
      isRunning: Boolean(isRunning),
      isPaused: Boolean(isPaused),
      isBreak: Boolean(isBreak),
      remainingSec: remainingSecRef.current,
      endsAt: running ? endsAtRef.current : null,
      cycles,
      sessionStart,
      focusAccumMs: focusAccumMsRef.current,
      focusSegmentStart: running && !isBreak ? focusSegmentStartRef.current : null,
    });
  }, [
    inSession,
    sessionStart,
    selectedTaskId,
    focusDuration,
    breakDuration,
    selectedPreset,
    isRunning,
    isPaused,
    isBreak,
    cycles,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    persist();
  }, [persist, hydrated, timeLeft, totalFocusTime]);

  const saveSessionMutation = useMutation({
    mutationFn: (data) => praxisApi.focus.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayFocus'] });
      queryClient.invalidateQueries({ queryKey: ['focusStats'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyInsights'] });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId) => {
      const originalTask = tasks.find((item) => item.id === taskId) || postSession?.task || null;
      const task = await praxisApi.tasks.update(taskId, { status: 'completed' });
      const projectSlug = projectSlugFromTaskSource(originalTask?.source);
      let projectSync = null;
      let projectSyncError = null;

      if (projectSlug && originalTask?.title) {
        try {
          projectSync = await praxisApi.projects.completeNextStep(projectSlug, {
            expected_step: originalTask.title,
            summary: originalTask.title,
            source: 'conclusao',
            created_by: 'joao',
          });
        } catch (err) {
          projectSyncError = err;
        }
      }

      return { task, projectSlug, projectSync, projectSyncError };
    },
    onSuccess: (result) => {
      const task = result?.task;
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      queryClient.invalidateQueries({ queryKey: ['gamification'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (result?.projectSlug) {
        queryClient.invalidateQueries({ queryKey: ['project-updates'] });
      }
      dispatchPraxisLevelUpFromResponse(task);
      setPostSessionOpen(false);

      if (result?.projectSync) {
        toast.success('Tarefa e avanço concluídos', {
          description: 'A Continuidade já registrou esse passo. O Sêneca recalcula o próximo no ciclo seguinte.',
        });
      } else if (result?.projectSlug && result?.projectSyncError) {
        toast.success('Tarefa concluída', {
          description: 'O passo mudou na Continuidade enquanto você focava. O Sêneca reconcilia sem apagar o estado novo.',
        });
      } else {
        toast.success('Tarefa concluída', { description: task?.title || 'Marcada como feita no Praxis.' });
      }
    },
  });

  const snoozeTaskMutation = useMutation({
    mutationFn: ({ id, data }) => praxisApi.tasks.update(id, data),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      setPostSessionOpen(false);
      toast.success('Adiada para amanhã', { description: task?.title ? `"${task.title}" volta amanhã.` : 'Tarefa reagendada.' });
    },
  });

  const applyPreset = (index) => {
    if (inSession) return;
    setSelectedPreset(index);
    setFocusDuration(PRESETS[index].focus);
    setBreakDuration(PRESETS[index].brk);
    setTimeLeft(PRESETS[index].focus * 60);
    remainingSecRef.current = PRESETS[index].focus * 60;
  };

  const startSession = () => {
    const secs = focusDuration * 60;
    focusAccumMsRef.current = 0;
    focusSegmentStartRef.current = Date.now();
    endsAtRef.current = Date.now() + secs * 1000;
    remainingSecRef.current = secs;
    isBreakRef.current = false;
    setInSession(true);
    setSessionStart(Date.now());
    setTotalFocusTime(0);
    setCycles(0);
    setIsRunning(true);
    setIsPaused(false);
    setIsBreak(false);
    setTimeLeft(secs);
    setPostSessionOpen(false);
    setPostSession(null);
  };

  const endSession = useCallback(() => {
    let finalFocusMs = focusAccumMsRef.current;
    if (!isBreakRef.current && isRunning && !isPaused && focusSegmentStartRef.current) {
      finalFocusMs += Date.now() - focusSegmentStartRef.current;
    }
    const totalSeconds = Math.max(0, Math.round(finalFocusMs / 1000));
    const taskToFinish = selectedTaskId && selectedTaskId !== 'none'
      ? tasks.find((t) => t.id === selectedTaskId) || selectedTask
      : null;

    setIsRunning(false);
    setIsPaused(false);
    setInSession(false);
    setIsBreak(false);
    focusAccumMsRef.current = 0;
    focusSegmentStartRef.current = null;
    endsAtRef.current = null;
    remainingSecRef.current = focusDuration * 60;
    clearStoredSession();

    if (sessionStart && totalSeconds > 0) {
      saveSessionMutation.mutate({
        task_id: taskToFinish?.id || null,
        task_title: taskToFinish?.title || 'Sessão livre',
        date: fortalezaDateKey(),
        duration_seconds: totalSeconds,
      });

      setPostSession({
        task: taskToFinish,
        focusSeconds: totalSeconds,
        cycles,
      });
      setPostSessionOpen(true);
    } else if (sessionStart && totalSeconds === 0) {
      toast('Sessão descartada', { description: 'Menos de 1 segundo de foco — nada foi salvo.' });
    }
    setSessionStart(null);
    setTimeLeft(focusDuration * 60);
  }, [
    isRunning,
    isPaused,
    selectedTaskId,
    selectedTask,
    tasks,
    sessionStart,
    cycles,
    focusDuration,
    saveSessionMutation,
  ]);

  const togglePause = () => {
      if (!inSession) return;
      if (!isPaused) {
        // going to pause: freeze remaining from wall clock
        if (endsAtRef.current) {
          remainingSecRef.current = remainingFromEndsAt(endsAtRef.current);
          setTimeLeft(remainingSecRef.current);
        }
        if (!isBreakRef.current && focusSegmentStartRef.current) {
          focusAccumMsRef.current += Date.now() - focusSegmentStartRef.current;
          focusSegmentStartRef.current = null;
          setTotalFocusTime(Math.round(focusAccumMsRef.current / 1000));
        }
        endsAtRef.current = null;
        setIsPaused(true);
        setIsRunning(true);
      } else {
        // resume
        const secs = Math.max(0, remainingSecRef.current);
        endsAtRef.current = Date.now() + secs * 1000;
        if (!isBreakRef.current) {
          focusSegmentStartRef.current = Date.now();
        }
        setIsPaused(false);
        setIsRunning(true);
        setTimeLeft(secs);
      }
    };

  // Wall-clock ticker + phase transitions (survives background tabs)
  useEffect(() => {
    if (!inSession || !isRunning || isPaused) return undefined;

    if (!endsAtRef.current) {
      const secs = Math.max(0, remainingSecRef.current || timeLeft);
      endsAtRef.current = Date.now() + secs * 1000;
    }
    if (!isBreakRef.current && focusSegmentStartRef.current == null) {
      focusSegmentStartRef.current = Date.now();
    }

    const tick = () => {
      let endsAt = endsAtRef.current;
      if (!endsAt) return;

      let remainingMs = endsAt - Date.now();

      // Catch up multiple phase flips if tab was backgrounded a long time
      let guard = 0;
      while (remainingMs <= 0 && guard < 20) {
        guard += 1;
        if (!isBreakRef.current) {
          if (focusSegmentStartRef.current) {
            focusAccumMsRef.current += Math.max(
              0,
              (endsAtRef.current || Date.now()) - focusSegmentStartRef.current,
            );
            focusSegmentStartRef.current = null;
          }
          setTotalFocusTime(Math.round(focusAccumMsRef.current / 1000));
          setCycles((c) => c + 1);
          isBreakRef.current = true;
          setIsBreak(true);
          const brkSecs = breakDurationRef.current * 60;
          remainingSecRef.current = brkSecs;
          endsAt = Date.now() + brkSecs * 1000;
          endsAtRef.current = endsAt;
          remainingMs = endsAt - Date.now();
        } else {
          isBreakRef.current = false;
          setIsBreak(false);
          const focusSecs = focusDurationRef.current * 60;
          remainingSecRef.current = focusSecs;
          endsAt = Date.now() + focusSecs * 1000;
          endsAtRef.current = endsAt;
          focusSegmentStartRef.current = Date.now();
          remainingMs = endsAt - Date.now();
        }
      }

      const secs = Math.max(0, Math.ceil(remainingMs / 1000));
      remainingSecRef.current = secs;
      setTimeLeft(secs);

      if (!isBreakRef.current) {
        const elapsedMs =
          focusAccumMsRef.current +
          (focusSegmentStartRef.current ? Date.now() - focusSegmentStartRef.current : 0);
        setTotalFocusTime(Math.round(elapsedMs / 1000));
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
      // freeze remaining into ref for pause/unmount persistence
      if (endsAtRef.current) {
        remainingSecRef.current = remainingFromEndsAt(endsAtRef.current);
      }
    };
  }, [inSession, isRunning, isPaused]);

  // Keep storage fresh while running (endsAt moves only on phase change; remaining ticks)
  useEffect(() => {
    if (!inSession) return undefined;
    const id = setInterval(() => persist(), 5000);
    return () => clearInterval(id);
  }, [inSession, persist]);

  const formatTime = (seconds) => {
    const m = Math.floor(Math.max(0, seconds) / 60);
    const s = Math.max(0, seconds) % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatMinutes = (seconds) => `${Math.max(1, Math.round(seconds / 60))} min`;

  const phaseTotal = (isBreak ? breakDuration : focusDuration) * 60;
  const progress = phaseTotal > 0
    ? Math.min(100, Math.max(0, ((phaseTotal - timeLeft) / phaseTotal) * 100))
    : 0;

  const topFocusStats = focusStats.filter((s) => s.task_id).slice(0, 5);
  const phaseKey = isBreak ? 'break' : isPaused ? 'paused' : 'focus';

  const todayFocusMinutes = useMemo(
    () => Math.round(todaySessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 60),
    [todaySessions],
  );

  const dismissPostSession = () => {
    setPostSessionOpen(false);
    toast.success('Tempo registrado', { description: 'A sessão ficou salva no histórico de foco.' });
  };

  return (
    <div className="praxis-page max-w-2xl">
      <PageHero
        kicker="Foco"
        kickerIcon={Timer}
        title="Modo Foco"
        description="Pomodoro com tarefa opcional. O tempo fica no histórico."
      >
        {!inSession && (
          <StatGrid className="sm:grid-cols-3">
            <StatTile label="Minutos hoje" value={`${todayFocusMinutes} min`} tone="amber" valueClassName="tabular-nums" />
            <StatTile label="Sessões hoje" value={String(todaySessions.length)} valueClassName="tabular-nums" />
            <StatTile
              label="Tarefas (30 dias)"
              value={String(focusStats.filter((s) => s.task_id).length)}
              valueClassName="tabular-nums"
            />
          </StatGrid>
        )}
        {!inSession && weekInsights ? (
          <FocusWeeklyGoal
            className="mt-4"
            goalMinutes={focusGoalMinutes}
            doneMinutes={weekInsights.victories?.focus_minutes}
            weekStart={weekStart}
            today={today}
          />
        ) : null}
      </PageHero>

      <Dialog open={postSessionOpen} onOpenChange={(open) => !open && dismissPostSession()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Sessão registrada
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1 text-left text-sm text-muted-foreground">
                <p>
                  Você registrou <strong className="text-foreground">{formatMinutes(postSession?.focusSeconds || 0)}</strong> de foco
                  {postSession?.cycles > 0
                    ? ` e completou ${postSession.cycles} ciclo${postSession.cycles === 1 ? '' : 's'}.`
                    : '.'}
                </p>
                {postSession?.task && (
                  <p>
                    Tarefa vinculada:{' '}
                    <span className="font-medium text-foreground">{postSession.task.title}</span>
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            {postSession?.task ? (
              <>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => completeTaskMutation.mutate(postSession.task.id)}
                  disabled={completeTaskMutation.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {completeTaskMutation.isPending ? 'Concluindo…' : 'Concluir tarefa'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={snoozeTaskMutation.isPending}
                  onClick={() =>
                    snoozeTaskMutation.mutate({
                      id: postSession.task.id,
                      data: buildSnoozeTomorrowUpdate(postSession.task, today),
                    })
                  }
                >
                  Adiar para amanhã
                </Button>
              </>
            ) : null}
            <Button type="button" variant="outline" className="w-full" onClick={dismissPostSession}>
              Só registrar tempo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!inSession ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionHeading title="Nova sessão" />
            <Card>
              <CardContent className="space-y-5 p-4 sm:p-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground" id="focus-duration-label">Duração</p>
                  <div role="group" aria-labelledby="focus-duration-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PRESETS.map((preset, i) => {
                      const PresetIcon = preset.Icon;
                      const selected = selectedPreset === i;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          aria-pressed={selected}
                          aria-label={`${preset.label}: ${preset.focus} min de foco, ${preset.brk} de pausa`}
                          onClick={() => applyPreset(i)}
                          className={cn(
                            'relative rounded-xl p-3.5 text-left outline-none praxis-touch-target',
                            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            PRESS,
                            selected
                              ? 'text-foreground'
                              : 'bg-white/[0.02] text-muted-foreground shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.07)] hover:bg-white/[0.045] hover:text-foreground',
                          )}
                        >
                          {selected ? (
                            <motion.span
                              layoutId="praxis-focus-preset"
                              aria-hidden
                              className="absolute inset-0 rounded-xl bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.55)]"
                              transition={reduceMotion ? { duration: 0 } : tweenFast}
                            />
                          ) : null}
                          <span className="relative flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">{preset.shortLabel}</span>
                            <PresetIcon className={cn('h-4 w-4', selected ? 'text-primary' : 'opacity-70')} aria-hidden />
                          </span>
                          <span className="relative mt-3 block font-display text-2xl font-semibold leading-none tabular-nums text-foreground">
                            {preset.focus}
                            <span className="ml-1 text-xs font-medium text-muted-foreground">min</span>
                          </span>
                          <span className="relative mt-1.5 block text-xs tabular-nums">pausa de {preset.brk} min</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="focus-task" className="text-xs font-medium text-muted-foreground">
                    Tarefa (opcional)
                  </Label>
                  <Select value={selectedTaskId || 'none'} onValueChange={setSelectedTaskId}>
                    <SelectTrigger id="focus-task" className="h-11 w-full">
                      <SelectValue placeholder="Selecione uma tarefa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma (foco livre)</SelectItem>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 border-t border-white/[0.06] pt-4">
                  <p className="text-xs leading-relaxed text-muted-foreground tabular-nums [text-wrap:pretty]">
                    {focusDuration} min de foco, depois {breakDuration} de pausa
                    {selectedTask ? ` · ${selectedTask.title}` : ' · foco livre'}
                  </p>
                  <Button onClick={startSession} size="lg" className={cn('h-12 w-full gap-2 rounded-full', PRESS)}>
                    <Play className="h-5 w-5" aria-hidden />
                    Iniciar {activePreset.label} ({focusDuration} min)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {topFocusStats.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Foco por tarefa · últimos 30 dias</h2>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {focusStats.filter((s) => s.task_id).length} tarefa
                    {focusStats.filter((s) => s.task_id).length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {topFocusStats.map((s) => {
                    const max = topFocusStats[0].total_minutes || 1;
                    const pct = Math.max(4, Math.round((s.total_minutes / max) * 100));
                    const hrs = Math.floor(s.total_minutes / 60);
                    const mins = s.total_minutes % 60;
                    return (
                      <div key={s.task_id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate pr-2">{s.task_title || '(sem tarefa)'}</span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {hrs > 0 ? `${hrs}h${mins ? ` ${mins}m` : ''}` : `${mins}m`} · {s.sessions}x
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div className="praxis-progress-fill rounded-full bg-primary/80" style={{ '--p': Math.min(100, pct) / 100 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-col items-center gap-6 px-5 py-8 sm:py-10">
              <div className="flex h-8 items-center" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={phaseKey}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-medium',
                      isBreak ? 'bg-accent/15 text-accent' : isPaused ? 'bg-white/[0.06] text-muted-foreground' : 'bg-primary/15 text-primary',
                    )}
                  >
                    {isBreak ? (
                      <>
                        <Coffee className="h-4 w-4" aria-hidden /> Pausa
                      </>
                    ) : isPaused ? (
                      <>
                        <Pause className="h-4 w-4" aria-hidden /> Pausado
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4" aria-hidden /> Foco
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
              </div>

              <div className="relative mx-auto aspect-square w-56 shrink-0 sm:w-64">
                <svg
                  viewBox="0 0 192 192"
                  className="absolute inset-0 h-full w-full -rotate-90"
                  aria-hidden
                >
                  <circle
                    cx="96"
                    cy="96"
                    r="90"
                    fill="none"
                    stroke="currentColor"
                    className="text-white/[0.07]"
                    strokeWidth="4"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="90"
                    fill="none"
                    stroke="currentColor"
                    className={cn(
                      'transition-[stroke-dashoffset,color] duration-300 ease-linear motion-reduce:transition-none',
                      isBreak ? 'text-accent' : isPaused ? 'text-muted-foreground/60' : 'text-primary',
                    )}
                    strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 90}`}
                    style={{ strokeDashoffset: 2 * Math.PI * 90 * (1 - progress / 100) }}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <span
                    className={cn(
                      'font-display text-6xl font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-7xl',
                      isPaused && 'text-muted-foreground',
                    )}
                    role="timer"
                    aria-label={`Faltam ${formatTime(timeLeft)}`}
                  >
                    {formatTime(timeLeft)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {isBreak ? `pausa de ${breakDuration} min` : `de ${focusDuration} min de foco`}
                  </span>
                </div>
              </div>

              {selectedTask && (
                <p className="max-w-sm px-4 text-center text-sm text-muted-foreground [text-wrap:balance]">
                  Trabalhando em: <span className="font-medium text-foreground">{selectedTask.title}</span>
                </p>
              )}

              <div className="flex w-full max-w-sm gap-3">
                <Button onClick={togglePause} size="lg" className={cn('h-12 flex-1 rounded-full', PRESS)}>
                  {isPaused ? <Play className="mr-2 h-5 w-5" /> : <Pause className="mr-2 h-5 w-5" />}
                  {isPaused ? 'Continuar' : 'Pausar'}
                </Button>
                <Button
                  onClick={endSession}
                  variant="outline"
                  size="lg"
                  className={cn('h-12 flex-1 rounded-full border-white/10', PRESS)}
                >
                  <Square className="mr-2 h-4 w-4" />
                  Encerrar
                </Button>
              </div>
            </CardContent>
          </Card>

          <StatGrid className="grid-cols-3">
            <StatTile label="Ciclos" value={String(cycles)} valueClassName="tabular-nums" />
            <StatTile
              label="Foco total"
              value={`${Math.floor(totalFocusTime / 60)} min`}
              tone="amber"
              valueClassName="tabular-nums"
            />
            <StatTile label="Sessões hoje" value={String(todaySessions.length)} valueClassName="tabular-nums" />
          </StatGrid>
        </div>
      )}
    </div>
  );
}
