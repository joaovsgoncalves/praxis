import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Square, RotateCcw, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function Focus() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialTaskId = urlParams.get('taskId') || '';

  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId);
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [cycles, setCycles] = useState(0);
  const [sessionStart, setSessionStart] = useState(null);
  const [inSession, setInSession] = useState(false);
  const intervalRef = useRef(null);
  const audioRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ['pendingTasks'],
    queryFn: () => base44.entities.Task.filter({ status: 'pending' }),
  });

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  const playNotification = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const saveFocusSession = useMutation({
    mutationFn: (data) => base44.entities.FocusSession.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['focusSessions'] }),
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
              setIsRunning(true);
            } else {
              setIsBreak(false);
              setTimeLeft(focusDuration * 60);
              setIsRunning(true);
            }
            return isBreak ? focusDuration * 60 : breakDuration * 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, isPaused, isBreak, focusDuration, breakDuration, playNotification]);

  const startSession = () => {
    setInSession(true);
    setIsRunning(true);
    setIsPaused(false);
    setIsBreak(false);
    setTimeLeft(focusDuration * 60);
    setCycles(0);
    setSessionStart(Date.now());
  };

  const togglePause = () => setIsPaused(!isPaused);

  const endSession = async () => {
    clearInterval(intervalRef.current);
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
    setTimeLeft(isBreak ? breakDuration * 60 : focusDuration * 60);
    setIsPaused(true);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = isBreak
    ? 1 - timeLeft / (breakDuration * 60)
    : 1 - timeLeft / (focusDuration * 60);

  if (inSession) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6">
        <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdGCYkYB4d3V0fImVmZmLgHd1d36KlZmZjoR6dnd+i5eZm4+Ee3V2fYuXmZuQhXt0dX2Ll5mcj4V8dHR9jJeZm4+Fe3R0fYyXmZuOhXt0dH2Ml5mbjYV7c3N9jJeZm42Fe3NzfYyXmZqNhXtzc32Ml5mbjYV7c3N9i5eZm42GfHR0fYuXmZuMhnx0dH2Ll5mbjIZ8dHR9i5eZm4yGfHR0fYuXmZuMhnx0dH2Ll5mbjIZ8dHR9i5eZm4yGfHR0fYuXmZuMhnx0dH2Ll5mbi4Z8dHR9i5eZm4uGfHR0fYuXmZqLhnxzdH2Ll5mai4Z8c3R9i5eZmouGfHN0fYuXmZqLh3x0dX2Kl5mai4d8dHV8ipeZmouHfHR1fIqXmZqKh3x0dXyKl5mZiod8dHV8ipeZmYqHfHR1fIqXmZmKh3x0dXyKl5mZiod9dXV8ipeZmYmIf3Z2fImWmJiIiH92dnyJlpiYiIh/dnZ8iZaYmIiIf3Z2fImWmJiIiH92dnyJlpiYiIh/dnd8iJaYl4eIf3Z3fIiWmJeHiYB3d3yIlpiXh4mAd3d8iJaYl4eJgHd3fIiWmJeHiYB3d3yIlpiXh4mAd3d8iJaYl4eJgHd3fIiWmJeHiYB3d3yIlpiXh4mAd3d8h5aYl4aJgHd3fIeWmJeGiYB3d3yHlpiXhomAd3d8h5aYl4aJgHd3fIeWl5eGiYB3d3yHlpeXhomAd3d8h5aXl4aJgHd4fIeWl5eGiYB3eHyHlpeXhomAd3h8h5aXl4aJgHd4fIeWl5eGiYB3eHyHlpeXhomAd3h8h5aXl4aJgXd4fIeWl5eGiYF3eHyHlpeWhomBd3h8h5aXloaKgXd4fIaWl5aGioF3eHyGlpeWhYqBd3h8hpaXloWKgXd4fIaWl5aFioF4eXyGlpeWhYqBd3h8hpaXloWKgXd4fIaWl5aFioF3eHyGlpeWhYqBd3h8hpaXloWKgXd4fIaWl5aFioF3eHuGlpeWhYqBd3h7hpaXloWKgXd4e4aWl5aFioF4eHuGlpeWhYqBd3h7hpaXloWKgXd4e4aWl5aFioF4eHuGlpeWhYqBd3h7hpaXloWKgXd4e4aWlpaFi4F4eXuGlpaWhYuBeHl7hpaWloWLgXh5e4aWlpaFi4F4eXuFlpaWhYuBeHl7hZaWloWLgXh5e4WWlpaFi4F4eXuFlpaWhYuBeHl7hZaWloWLgXh5e4WWlpaEi4F4eXuFlpaWhIuBeHl7hZaWloSLgXh5e4WWlpWEi4F4eXuFlpaVhIuBeHl7hZaWlYSLgXh5e4WWlpWEi4F4eXuFlpaVhIuBeHl7hZaWlYSLgXh5e4WWlpWEi4F4eXuFlpaVhIuCeHl7hZaWlYSLgnh5e4WWlpWEi4J4enuFlpaVhIuCeHp7hZaWlYSMgnh6e4WWlpWEjIJ4enuFlZaVhIyCeHp7hZWWlYSMgnh6e4WVlpWEjIJ4enuFlZaVhIyCeHp7hZWWlYSMgnh6e4WVlpWEjIJ5enuFlZaVhIyCeHp7hZWWlIONgnh6e4WVlpSDjYJ5enuFlZaUg42CeXp7hZWWlIONgnh6e4WVlpSDjYJ5enuFlZaUg42CeXp6hZWWlIONgnh6eoWVlpSDjYJ5enqFlZaUg42CeXp6hZWWlIONgnh6eoWVlpSDjYJ5enqFlZaUg42CeXp6hZWVlIONgnl6eoWVlZSDjYJ5enqFlZWUg42CeXp6hZWVlIONgnl6eoWVlZSDjYJ5enqFlZWUg42CeXp6hZWVlIONgnl6eoWVlZSDjYJ5enqFlZWUg42CeXp6hZWVlIONgnl6eoWVlZSDjYJ5enqFlZWUg42CeXp6hZWVlIONgnl6eoSVlZSDjYJ5enqElZWUg42CeXp6hJWVk4ONgnl6eoSVlZODjYJ5enqElZWTg42CeXp6hJWVk4ONgnl6eoSVlZODjoJ5enqElZWTg46CeXp6hJWVk4OOgnl6eoSVlZODjoJ5enqElZWTg46CeXp6hJSVk4OOgnl6eoSUlZODjoJ5enqElJWTg46CeXp6hJSVk4OOg3l6eoSUlZODjoJ5enqElJWTg46DeXt6hJSVk4OOg3l7eoSUlZODjoN5e3qElJWTg46DeXt6hJSUk4OOg3p7eoSUlJODjoN5e3qEk5STg46DeXt5hJOUk4OOg3p7eYSTlJODjoN6e3mEk5STg46Dent5hJOUk4OOg3p7eYSTlJODjoN6e3mEk5STg46Dent5hJOUk4OPg3p7eYSTlJODj4N6e3mEk5STg4+Dent5hJOUk4OPg3p7eYSTlJODj4N6e3mEk5STg4+Dent5hJOUkw==" />
        
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={cn(
            "absolute inset-0 opacity-20 transition-all duration-1000",
            isBreak ? "bg-gradient-to-br from-accent/30 via-transparent to-accent/10" : "bg-gradient-to-br from-primary/30 via-transparent to-primary/10"
          )} />
        </div>

        <p className="text-muted-foreground text-sm mb-2">
          {isBreak ? 'Pausa' : `Ciclo ${cycles + 1}`}
        </p>
        <p className="text-lg font-medium text-foreground mb-8">
          {selectedTask?.title || 'Foco Livre'}
        </p>

        <div className="relative w-64 h-64 mb-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
            <circle cx="50" cy="50" r="45" fill="none" stroke={isBreak ? "hsl(var(--accent))" : "hsl(var(--primary))"} strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 45}`} strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress)}`}
              strokeLinecap="round" className="transition-all duration-1000" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-mono font-bold tabular-nums">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button onClick={togglePause} variant="outline" size="lg" className="rounded-full w-14 h-14">
            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
          </Button>
          <Button onClick={resetTimer} variant="ghost" size="lg" className="rounded-full w-14 h-14">
            <RotateCcw className="w-5 h-5" />
          </Button>
          <Button onClick={endSession} variant="destructive" size="lg" className="rounded-full px-6">
            <Square className="w-4 h-4 mr-2" />Encerrar
          </Button>
        </div>

        {cycles > 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            {cycles} ciclo{cycles > 1 ? 's' : ''} concluído{cycles > 1 ? 's' : ''}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Modo Foco</h1>

      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Tarefa (opcional)</label>
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Foco livre — sem tarefa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Foco livre</SelectItem>
              {tasks.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Foco (min)</label>
            <Select value={String(focusDuration)} onValueChange={v => { setFocusDuration(Number(v)); setTimeLeft(Number(v) * 60); }}>
              <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[15, 20, 25, 30, 45, 60].map(v => <SelectItem key={v} value={String(v)}>{v} min</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Pausa (min)</label>
            <Select value={String(breakDuration)} onValueChange={v => setBreakDuration(Number(v))}>
              <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 5, 10, 15].map(v => <SelectItem key={v} value={String(v)}>{v} min</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={startSession} className="w-full bg-primary hover:bg-primary/90 h-14 text-lg" size="lg">
          <Play className="w-5 h-5 mr-2" />Iniciar Foco
        </Button>
      </div>
    </div>
  );
}