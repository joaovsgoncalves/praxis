import React, { useState, useEffect, useRef } from 'react';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Play, Pause, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fortalezaDateKey } from '@/lib/dates';
import { toast } from '@/components/ui/use-toast';

const PRESETS = [
  { label: 'Clássico', focus: 25, brk: 5, icon: '🍅' },
  { label: 'Foco profundo', focus: 50, brk: 10, icon: '🧠' },
  { label: 'Rápido', focus: 15, brk: 3, icon: '⚡' },
  { label: 'Maratona', focus: 90, brk: 20, icon: '🏃' },
];

export default function Focus() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialTaskId = urlParams.get('taskId') || '';

  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId);
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [cycles, setCycles] = useState(0);
  const [sessionStart, setSessionStart] = useState(null);
  const [inSession, setInSession] = useState(false);
  const [totalFocusTime, setTotalFocusTime] = useState(0);
  const [lastSessionSummary, setLastSessionSummary] = useState(null);
  const intervalRef = useRef(null);
  const focusTickRef = useRef(null);
  const queryClient = useQueryClient();
  const today = fortalezaDateKey();

  const { data: tasks = [] } = useQuery({
    queryKey: ['pendingTasks'],
    queryFn: () => forjaApi.tasks.list({ status: 'pending' }),
  });

  const { data: todaySessions = [] } = useQuery({
    queryKey: ['todayFocus', today],
    queryFn: () => forjaApi.focus.list({ date: today }),
  });

  const { data: focusStats = [] } = useQuery({
    queryKey: ['focusStats', 30],
    queryFn: () => forjaApi.focus.stats(30),
    staleTime: 60_000,
  });

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  const saveSessionMutation = useMutation({
    mutationFn: (data) => forjaApi.focus.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayFocus'] });
      queryClient.invalidateQueries({ queryKey: ['focusStats'] });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId) => forjaApi.tasks.update(taskId, { status: 'completed' }),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      queryClient.invalidateQueries({ queryKey: ['gamification'] });
      if (task?.xp_sync?.leveled_up) {
        window.dispatchEvent(new CustomEvent('forja-level-up', { detail: task.xp_sync }));
      }
      setLastSessionSummary(summary => summary ? { ...summary, taskCompleted: true } : summary);
      toast({
        title: '✅ Tarefa concluída',
        description: task?.title || 'A tarefa vinculada foi marcada como feita.',
      });
    },
  });

  const applyPreset = (index) => {
    setSelectedPreset(index);
    setFocusDuration(PRESETS[index].focus);
    setBreakDuration(PRESETS[index].brk);
    setTimeLeft(PRESETS[index].focus * 60);
  };

  const startSession = () => {
    setInSession(true);
    setSessionStart(Date.now());
    setTotalFocusTime(0);
    setCycles(0);
    setIsRunning(true);
    setIsBreak(false);
    setTimeLeft(focusDuration * 60);
    setLastSessionSummary(null);
  };

  const endSession = () => {
    const totalSeconds = Math.max(0, Math.round(totalFocusTime));
    const taskToFinish = (selectedTaskId && selectedTaskId !== 'none') ? selectedTask : null;

    setIsRunning(false);
    setIsPaused(false);
    setInSession(false);
    setIsBreak(false);
    clearInterval(intervalRef.current);
    clearInterval(focusTickRef.current);

    if (sessionStart) {
      saveSessionMutation.mutate({
        task_id: taskToFinish?.id || null,
        task_title: taskToFinish?.title || 'Sessão livre',
        date: fortalezaDateKey(),
        duration_seconds: totalSeconds,
      });

      setLastSessionSummary({
        task: taskToFinish,
        focusSeconds: totalSeconds,
        cycles,
        taskCompleted: false,
      });
    }
  };

  useEffect(() => {
    if (isRunning && !isPaused && !isBreak) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setIsBreak(true);
            setTimeLeft(breakDuration * 60);
            setCycles(c => c + 1);
            return breakDuration * 60;
          }
          return prev - 1;
        });
      }, 1000);

      focusTickRef.current = setInterval(() => {
        setTotalFocusTime(t => t + 1);
      }, 1000);
    } else if (isRunning && !isPaused && isBreak) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setIsBreak(false);
            setTimeLeft(focusDuration * 60);
            return focusDuration * 60;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(focusTickRef.current);
    };
  }, [isRunning, isPaused, isBreak, focusDuration, breakDuration]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatMinutes = (seconds) => `${Math.max(1, Math.round(seconds / 60))}min`;

  const progress = isBreak 
    ? ((breakDuration * 60 - timeLeft) / (breakDuration * 60)) * 100
    : ((focusDuration * 60 - timeLeft) / (focusDuration * 60)) * 100;

  const topFocusStats = focusStats.filter(s => s.task_id).slice(0, 5);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Modo Foco</h1>

      {lastSessionSummary && !inSession && (
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1">
              <p className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" /> Sessão salva
              </p>
              <p className="text-sm text-muted-foreground">
                Você registrou {formatMinutes(lastSessionSummary.focusSeconds)} de foco
                {lastSessionSummary.cycles > 0 ? ` e completou ${lastSessionSummary.cycles} ciclo${lastSessionSummary.cycles === 1 ? '' : 's'}` : ''}.
              </p>
            </div>

            {lastSessionSummary.task && !lastSessionSummary.taskCompleted && (
              <div className="rounded-lg border border-border bg-background/70 p-3 space-y-3">
                <p className="text-sm">
                  Tarefa vinculada: <span className="font-medium">{lastSessionSummary.task.title}</span>
                </p>
                <Button
                  className="w-full"
                  onClick={() => completeTaskMutation.mutate(lastSessionSummary.task.id)}
                  disabled={completeTaskMutation.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {completeTaskMutation.isPending ? 'Concluindo...' : 'Marcar tarefa como concluída'}
                </Button>
              </div>
            )}

            {lastSessionSummary.taskCompleted && (
              <p className="text-sm font-medium text-primary">Tarefa concluída e dashboard atualizado.</p>
            )}
          </CardContent>
        </Card>
      )}

      {!inSession && topFocusStats.length > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Foco por tarefa (30 dias)</h2>
              <span className="text-[11px] text-muted-foreground">
                {focusStats.length} tarefa{focusStats.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-2">
              {topFocusStats.map(s => {
                const max = topFocusStats[0].total_minutes || 1;
                const pct = Math.max(4, Math.round((s.total_minutes / max) * 100));
                const hrs = Math.floor(s.total_minutes / 60);
                const mins = s.total_minutes % 60;
                return (
                  <div key={s.task_id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate pr-2">{s.task_title || '(sem tarefa)'}</span>
                      <span className="text-muted-foreground shrink-0">
                        {hrs > 0 ? `${hrs}h${mins ? ' ' + mins + 'm' : ''}` : `${mins}m`} · {s.sessions}x
                      </span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!inSession ? (
        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold">Presets</h2>
              <div className="grid grid-cols-2 gap-3">
                {PRESETS.map((preset, i) => (
                  <button key={i} onClick={() => applyPreset(i)}
                    className={cn(
                      "p-4 rounded-lg border text-left transition-all",
                      selectedPreset === i 
                        ? "border-primary bg-primary/10" 
                        : "border-border bg-secondary/30 hover:bg-secondary/50"
                    )}>
                    <span className="text-2xl">{preset.icon}</span>
                    <p className="font-medium mt-1">{preset.label}</p>
                    <p className="text-sm text-muted-foreground">{preset.focus}min foco / {preset.brk}min pausa</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold">Tarefa (opcional)</h2>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger><SelectValue placeholder="Selecione uma tarefa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (foco livre)</SelectItem>
                  {tasks.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Button onClick={startSession} size="lg" className="w-full">
            <Play className="w-5 h-5 mr-2" />Iniciar foco de {focusDuration} min
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardContent className="py-12 flex flex-col items-center gap-6">
              <Badge className={cn("text-lg px-4 py-1", isBreak ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary")}>
                {isBreak ? '☕ Pausa' : '🧠 Foco'}
              </Badge>
              
              <div className="relative">
                <svg className="w-48 h-48 -rotate-90">
                  <circle cx="96" cy="96" r="90" fill="none" stroke="currentColor" className="text-border" strokeWidth="4" />
                  <circle cx="96" cy="96" r="90" fill="none" 
                    stroke="currentColor" 
                    className={isBreak ? "text-accent" : "text-primary"}
                    strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 90}`}
                    strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress / 100)}`}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-mono font-bold">{formatTime(timeLeft)}</span>
                </div>
              </div>

              {selectedTask && (
                <p className="text-sm text-muted-foreground">Trabalhando em: <span className="text-foreground">{selectedTask.title}</span></p>
              )}

              <div className="flex gap-3">
                <Button onClick={() => setIsPaused(!isPaused)} variant="outline" size="lg">
                  {isPaused ? <Play className="w-5 h-5 mr-2" /> : <Pause className="w-5 h-5 mr-2" />}
                  {isPaused ? 'Continuar' : 'Pausar'}
                </Button>
                <Button onClick={endSession} variant="destructive" size="lg">
                  <Square className="w-5 h-5 mr-2" />Encerrar
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-4 text-center">
            <Card className="bg-card border-border">
              <CardContent className="py-4">
                <p className="text-2xl font-bold text-primary">{cycles}</p>
                <p className="text-xs text-muted-foreground">Ciclos</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="py-4">
                <p className="text-2xl font-bold text-accent">{Math.floor(totalFocusTime / 60)}m</p>
                <p className="text-xs text-muted-foreground">Foco Total</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="py-4">
                <p className="text-2xl font-bold">{todaySessions.length}</p>
                <p className="text-xs text-muted-foreground">Sessões Hoje</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
