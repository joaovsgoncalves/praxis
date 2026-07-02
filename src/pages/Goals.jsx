import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Plus, Target, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import GoalWizard from '@/components/goals/GoalWizard';
import { computeGoalProgress, goalProgressDetail } from '@/lib/goalProgress';
import { fortalezaDateKey } from '@/lib/dates';
import {
  GOAL_STARTER_TEMPLATES,
  goalPayloadFromStarter,
} from '@/lib/goalStarterTemplates';

const timeframeLabels = { short: 'Curto prazo', medium: 'Médio prazo', long: 'Longo prazo' };
const categoryLabels = { personal: 'Pessoal', professional: 'Profissional', health: 'Saúde', finance: 'Financeiro', learning: 'Aprendizado', other: 'Outro' };
const statusLabels = { active: 'Ativa', paused: 'Pausada', completed: 'Concluída', abandoned: 'Abandonada' };

export default function Goals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardPreset, setWizardPreset] = useState(null);
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();
  const today = fortalezaDateKey();

  const { data: goals = [] } = useQuery({ queryKey: ['allGoals'], queryFn: () => forjaApi.goals.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ['goalTasks'], queryFn: () => forjaApi.tasks.list() });
  const { data: habits = [] } = useQuery({ queryKey: ['goalHabits'], queryFn: () => forjaApi.habits.list() });
  const { data: habitLogs = [] } = useQuery({
    queryKey: ['goalHabitLogs', today],
    queryFn: () => forjaApi.habitLogs.list({ from: addDays(today, -6), to: today }),
  });

  const createGoal = useMutation({
    mutationFn: (data) => forjaApi.goals.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allGoals'] });
      queryClient.invalidateQueries({ queryKey: ['goalTasks'] });
      queryClient.invalidateQueries({ queryKey: ['goalHabits'] });
      setShowWizard(false);
      setWizardPreset(null);
    },
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, data }) => forjaApi.goals.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allGoals'] }),
  });

  const deleteGoal = useMutation({
    mutationFn: (id) => forjaApi.goals.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allGoals'] }),
  });

  const filtered = goals.filter((g) => filter === 'all' || g.timeframe === filter);
  const activeGoals = goals.filter((g) => g.status === 'active');

  useEffect(() => {
    const starter = searchParams.get('starter');
    const payload = starter ? goalPayloadFromStarter(starter) : null;
    if (!payload) return;
    setWizardPreset(payload);
    setShowWizard(true);
    const next = new URLSearchParams(searchParams);
    next.delete('starter');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const completedGoals = goals.filter((g) => g.status === 'completed');
  const averageProgress = goals.length
    ? Math.round(
        goals.reduce((sum, goal) => sum + computeGoalProgress(goal, tasks, habits, habitLogs), 0) / goals.length,
      )
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="glass-surface rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="forja-kicker flex items-center gap-2 text-primary">
              <Target className="h-4 w-4" /> Estratégia
            </p>
            <h1 className="forja-title text-3xl font-bold sm:text-4xl">Metas Pessoais</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Meta com prazo + primeira tarefa ou hábito — nada de objetivo solto no vácuo.
            </p>
          </div>
          <Button onClick={() => setShowWizard(true)} className="h-10 self-start rounded-full px-4 shadow-lg shadow-primary/20 lg:self-auto">
            <Plus className="mr-1.5 h-4 w-4" /> Nova meta (wizard)
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Ativas</p>
            <p className="mt-1 text-2xl font-semibold">{activeGoals.length}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Progresso médio</p>
            <p className="mt-1 text-2xl font-semibold">{averageProgress}%</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Concluídas</p>
            <p className="mt-1 text-2xl font-semibold">{completedGoals.length}</p>
          </div>
        </div>
      </section>

      <section className="forja-panel rounded-3xl p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {['all', 'short', 'medium', 'long'].map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className={cn('rounded-full', filter === f && 'bg-primary')}
            >
              {f === 'all' ? 'Todas' : timeframeLabels[f]}
            </Button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <Card className="border-primary/15 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-3 px-5 py-12 text-center sm:py-16">
            <Target className="h-10 w-10 text-primary" />
            <p className="text-lg font-semibold">Primeira meta em 3 passos</p>
            <p className="max-w-md text-sm text-muted-foreground">Meta → prazo → tarefa ou hábito. Ou use um template abaixo.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {GOAL_STARTER_TEMPLATES.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    setWizardPreset(goalPayloadFromStarter(t.id));
                    setShowWizard(true);
                  }}
                >
                  {t.emoji} {t.label}
                </Button>
              ))}
            </div>
            <Button onClick={() => { setWizardPreset(null); setShowWizard(true); }} className="rounded-full">
              <Plus className="mr-1.5 h-4 w-4" /> Começar wizard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((goal) => {
            const detail = goalProgressDetail(goal, tasks, habits, habitLogs);
            const progress = detail.percent;
            return (
              <Card key={goal.id} className="border-border bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">{goal.title}</CardTitle>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-[10px]">{timeframeLabels[goal.timeframe]}</Badge>
                        <Badge variant="outline" className="text-[10px]">{statusLabels[goal.status]}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {goal.status === 'active' && (
                        <button type="button" onClick={() => updateGoal.mutate({ id: goal.id, data: { status: 'completed' } })}>
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground hover:text-accent" />
                        </button>
                      )}
                      <button type="button" onClick={() => deleteGoal.mutate(goal.id)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {goal.deadline && (
                    <p className="text-xs text-muted-foreground">Prazo: {format(new Date(`${goal.deadline}T12:00:00`), 'dd/MM/yyyy')}</p>
                  )}
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-muted-foreground">Progresso (vínculos)</span>
                      <span className="font-medium text-primary">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    {(detail.tasksLabel || detail.habitsLabel) && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {[detail.tasksLabel, detail.habitsLabel].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">Ajuste manual (opcional)</p>
                    <Slider
                      value={[goal.manual_progress || 0]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={([v]) => updateGoal.mutate({ id: goal.id, data: { manual_progress: v } })}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showWizard} onOpenChange={(v) => { setShowWizard(v); if (!v) setWizardPreset(null); }}>
        <DialogContent className="border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova meta guiada</DialogTitle>
          </DialogHeader>
          <GoalWizard
            busy={createGoal.isPending}
            preset={wizardPreset}
            onCancel={() => { setShowWizard(false); setWizardPreset(null); }}
            onSubmit={(payload) => createGoal.mutate(payload)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}