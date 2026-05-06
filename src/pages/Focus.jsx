import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Square, RotateCcw, Timer, Zap, Target, Coffee, CheckCircle2, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const PRESETS = [
  { label: 'Clássico', focus: 25, brk: 5, icon: '🍅' },
  { label: 'Deep Work', focus: 50, brk: 10, icon: '🧠' },
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
  const intervalRef = useRef(null);
  const focusTickRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ['pendingTasks'],
    queryFn: () => base44.entities.Task.filter({ status: 'pending' }),
  });

  const { data: todaySessions = [] } = useQuery({
    queryKey: ['todayFocus'],
    queryFn: () => base44.entities.FocusSession.filter({ date: format(new Date(), 'yyyy-MM-dd') }),
  });

  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const todayFocusMinutes = Math.round(todaySessions.reduce((s, x) => s + (x.duration_seconds || 0), 0) / 60);
  const todayCycles = todaySessions.reduce((s, x) => s + (x.cycles_completed || 0), 0);

  const playNotification = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  const saveFocusSession = useMutation({
    mutationFn: (data) => base44.entities.FocusSession.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focusSessions'] });
      queryClient.invalidateQueries({ queryKey: ['todayFocus'] });
    },
  });

  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            playNotification();
            if (!isBreak) {
              setCycles(c => c + 1);
              setIsBreak(true);
              setTimeLeft(breakDuration * 60);
              setTimeout(() => setIsRunning(true), 0);
            } else {
              setIsBreak(false);
              setTimeLeft(focusDuration * 60);
              setTimeout(() => setIsRunning(true), 0);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // track actual focus time
      if (!isBreak) {
        focusTickRef.current = setInterval(() => {
          setTotalFocusTime(t => t + 1);
        }, 1000);
      }
    }
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(focusTickRef.current);
    };
  }, [isRunning, isPaused, isBreak, focusDuration, breakDuration, playNotification]);

  const selectPreset = (idx) => {
    const p = PRESETS[idx];
    setSelectedPreset(idx);
    setFocusDuration(p.focus);
    setBreakDuration(p.brk);
    setTimeLeft(p.focus * 60);
  };

  const startSession = () => {
    setInSession(true);
    setIsRunning(true);
    setIsPaused(false);
    setIsBreak(false);
    setTimeLeft(focusDuration * 60);
    setCycles(0);
    setTotalFocusTime(0);
    setSessionStart(Date.now());
  };

  const togglePause = () => {
    setIsPaused(p => !p);
    if (!isPaused) setIsRunning(true);
  };

  const endSession = async () => {
    clearInterval(intervalRef.current);
    clearInterval(focusTickRef.current);
    setIsRunning(false);
    setIsPaused(false);
    setInSession(false);

    const duration = Math.round((Date.now() - sessionStart) / 1000);
    await saveFocusSession.mutateAsync({
      task_id: selectedTaskId || undefined,
      task_title: selectedTask?.title || 'Foco livre',
      date: format(new Date(), 'yyyy-MM-dd'),
      duration_seconds: duration,
      cycles_completed: cycles,
      focus_duration: focusDuration,
      break_duration: breakDuration,
      type: selectedTaskId ? 'task' : 'free',
    });
  };

  const resetTimer = () => {
    clearInterval(intervalRef.current);
    clearInterval(focusTickRef.current);
    setTimeLeft(isBreak ? breakDuration * 60 : focusDuration * 60);
    setIsPaused(true);
    setIsRunning(false);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const totalSecs = isBreak ? breakDuration * 60 : focusDuration * 60;
  const progress = 1 - timeLeft / totalSecs;
  const circumference = 2 * Math.PI * 54;

  // Active session screen
  if (inSession) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-y-auto">
        {/* Ambient gradient */}
        <div className={cn(
          "absolute inset-0 pointer-events-none transition-all duration-2000",
          isBreak
            ? "bg-[radial-gradient(ellipse_at_center,hsl(160_80%_50%/0.08)_0%,transparent_70%)]"
            : "bg-[radial-gradient(ellipse_at_center,hsl(265_85%_65%/0.08)_0%,transparent_70%)]"
        )} />

        <div className="relative flex flex-col items-center justify-center flex-1 p-6 gap-8">
          {/* Phase badge */}
          <motion.div
            key={isBreak ? 'break' : 'focus'}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium border",
              isBreak
                ? "bg-accent/15 text-accent border-accent/30"
                : "bg-primary/15 text-primary border-primary/30"
            )}
          >
            {isBreak ? '☕ Pausa' : `🍅 Ciclo ${cycles + 1}`}
          </motion.div>

          {/* Task name */}
          <p className="text-base text-foreground/70 font-medium text-center">
            {selectedTask?.title || 'Foco Livre'}
          </p>

          {/* Timer ring */}
          <div className="relative w-72 h-72">
            {/* Glow ring */}
            <div className={cn(
              "absolute inset-0 rounded-full blur-3xl opacity-20 scale-75 transition-colors duration-1000",
              isBreak ? "bg-accent" : "bg-primary"
            )} />

            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              {/* Track */}
              <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
              {/* Progress */}
              <circle
                cx="60" cy="60" r="54" fill="none"
                stroke={isBreak ? "hsl(var(--accent))" : "hsl(var(--primary))"}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
              {/* Inner glow track */}
              <circle
                cx="60" cy="60" r="54" fill="none"
                stroke={isBreak ? "hsl(160 80% 50% / 0.15)" : "hsl(265 85% 65% / 0.15)"}
                strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                key={`${minutes}${seconds}`}
                className="text-6xl font-mono font-bold tabular-nums tracking-tight"
              >
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </motion.span>
              <span className="text-xs text-muted-foreground mt-1 uppercase tracking-widest">
                {isBreak ? 'pausa' : 'foco'}
              </span>
            </div>
          </div>

          {/* Cycle dots */}
          <div className="flex gap-2">
            {Array.from({ length: Math.max(cycles + 1, 4) }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i < cycles ? "bg-primary scale-100" : i === cycles ? "bg-primary/40 scale-110 ring-2 ring-primary/30" : "bg-secondary"
                )}
              />
            ))}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 text-center">
            <div>
              <p className="text-xl font-bold">{Math.floor(totalFocusTime / 60)}min</p>
              <p className="text-xs text-muted-foreground">foco hoje</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-xl font-bold">{cycles}</p>
              <p className="text-xs text-muted-foreground">ciclos</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-xl font-bold">{focusDuration}min</p>
              <p className="text-xs text-muted-foreground">por ciclo</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <Button
              onClick={resetTimer}
              variant="ghost"
              size="lg"
              className="rounded-full w-13 h-13 border border-border"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={togglePause}
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center text-white shadow-2xl transition-all",
                isBreak ? "bg-accent shadow-accent/30" : "bg-primary shadow-primary/30"
              )}
            >
              {isPaused ? <Play className="w-8 h-8 ml-1" /> : <Pause className="w-8 h-8" />}
            </motion.button>
            <Button
              onClick={endSession}
              variant="ghost"
              size="lg"
              className="rounded-full w-13 h-13 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30"
            >
              <Square className="w-5 h-5" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {isPaused ? '⏸ Pausado' : isBreak ? '☕ Descanse um pouco' : '💪 Mantenha o foco!'}
          </p>
        </div>
      </div>
    );
  }

  // Setup screen
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Modo Foco</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure sua sessão Pomodoro</p>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="py-4 text-center">
            <Timer className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{todayFocusMinutes}min</p>
            <p className="text-[10px] text-muted-foreground">hoje</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="py-4 text-center">
            <Zap className="w-4 h-4 text-chart-4 mx-auto mb-1" />
            <p className="text-xl font-bold">{todayCycles}</p>
            <p className="text-[10px] text-muted-foreground">ciclos</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="py-4 text-center">
            <CheckCircle2 className="w-4 h-4 text-accent mx-auto mb-1" />
            <p className="text-xl font-bold">{todaySessions.length}</p>
            <p className="text-[10px] text-muted-foreground">sessões</p>
          </CardContent>
        </Card>
      </div>

      {/* Presets */}
      <div>
        <p className="text-sm text-muted-foreground mb-3">Presets</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => selectPreset(i)}
              className={cn(
                "p-4 rounded-xl border text-left transition-all",
                selectedPreset === i
                  ? "bg-primary/15 border-primary/40 ring-1 ring-primary/30"
                  : "bg-card border-border hover:bg-secondary/60"
              )}
            >
              <div className="text-2xl mb-2">{p.icon}</div>
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.focus}min / {p.brk}min</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom durations */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium mb-4">Personalizar</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Foco</label>
              <Select value={String(focusDuration)} onValueChange={v => { setFocusDuration(Number(v)); setTimeLeft(Number(v) * 60); setSelectedPreset(-1); }}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 15, 20, 25, 30, 45, 50, 60, 90].map(v => <SelectItem key={v} value={String(v)}>{v} min</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Pausa</label>
              <Select value={String(breakDuration)} onValueChange={v => { setBreakDuration(Number(v)); setSelectedPreset(-1); }}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 5, 10, 15, 20].map(v => <SelectItem key={v} value={String(v)}>{v} min</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task select */}
      <div>
        <p className="text-sm font-medium mb-2">Tarefa (opcional)</p>
        <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
          <SelectTrigger className="bg-secondary/50 h-12">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <SelectValue placeholder="Foco livre — sem tarefa vinculada" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Foco livre</SelectItem>
            {tasks.map(t => (
              <SelectItem key={t.id} value={t.id}>
                <div className="flex items-center gap-2">
                  <span>{t.title}</span>
                  {t.priority === 'high' && <Badge className="text-[9px] py-0 h-4 bg-destructive/20 text-destructive">urgente</Badge>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTask && (
          <div className="mt-2 px-3 py-2 bg-primary/10 rounded-lg border border-primary/20 text-sm text-primary flex items-center gap-2">
            <Target className="w-3.5 h-3.5" />
            {selectedTask.title}
          </div>
        )}
      </div>

      {/* Preview + start */}
      <div className="flex items-center gap-4 p-5 bg-card border border-border rounded-2xl">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
            <circle cx="20" cy="20" r="16" fill="none" stroke="hsl(var(--primary))" strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 16}`} strokeDashoffset={`${2 * Math.PI * 16 * 0.15}`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-mono font-bold">{focusDuration}:00</span>
          </div>
        </div>
        <div className="flex-1">
          <p className="font-semibold">{focusDuration}min foco · {breakDuration}min pausa</p>
          <p className="text-sm text-muted-foreground">
            {selectedTask?.title || 'Sessão livre'}
          </p>
        </div>
        <Button onClick={startSession} className="bg-primary hover:bg-primary/90 h-12 px-6 rounded-xl font-semibold">
          <Play className="w-4 h-4 mr-2" />Iniciar
        </Button>
      </div>
    </div>
  );
}