import React, { useState } from 'react';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Plus, Target, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const timeframeLabels = { short: 'Curto prazo', medium: 'Médio prazo', long: 'Longo prazo' };
const categoryLabels = { personal: 'Pessoal', professional: 'Profissional', health: 'Saúde', finance: 'Financeiro', learning: 'Aprendizado', other: 'Outro' };
const statusLabels = { active: 'Ativa', paused: 'Pausada', completed: 'Concluída', abandoned: 'Abandonada' };

export default function Goals() {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ title: '', description: '', deadline: '', timeframe: 'short', category: 'personal' });

  const { data: goals = [] } = useQuery({ queryKey: ['allGoals'], queryFn: () => forjaApi.goals.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ['goalTasks'], queryFn: () => forjaApi.tasks.list() });
  const { data: habits = [] } = useQuery({ queryKey: ['goalHabits'], queryFn: () => forjaApi.habits.list() });

  const createGoal = useMutation({
    mutationFn: (data) => forjaApi.goals.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allGoals'] }); setShowForm(false); setForm({ title: '', description: '', deadline: '', timeframe: 'short', category: 'personal' }); },
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, data }) => forjaApi.goals.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allGoals'] }),
  });

  const deleteGoal = useMutation({
    mutationFn: (id) => forjaApi.goals.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allGoals'] }),
  });

  const getGoalProgress = (goal) => {
    const linkedTasks = tasks.filter(t => t.goal_id === goal.id);
    const linkedHabits = habits.filter(h => h.goal_id === goal.id);
    const totalItems = linkedTasks.length + linkedHabits.length;
    if (totalItems === 0) return goal.manual_progress || 0;
    const completedTasks = linkedTasks.filter(t => t.status === 'completed').length;
    const auto = Math.round((completedTasks / totalItems) * 100);
    return Math.max(auto, goal.manual_progress || 0);
  };

  const filtered = goals.filter(g => filter === 'all' || g.timeframe === filter);
  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');
  const averageProgress = goals.length
    ? Math.round(goals.reduce((sum, goal) => sum + getGoalProgress(goal), 0) / goals.length)
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
              Objetivos com progresso visível, prazo e vínculo com tarefas/hábitos — sem deixar a página parecer vazia quando ainda não tem meta.
            </p>
          </div>
          <Button onClick={() => setShowForm(true)} className="h-10 self-start rounded-full px-4 shadow-lg shadow-primary/20 lg:self-auto">
            <Plus className="mr-1.5 h-4 w-4" /> Nova Meta
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Ativas</p>
            <p className="mt-1 text-2xl font-semibold">{activeGoals.length}</p>
            <p className="text-xs text-muted-foreground">metas em execução</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Progresso médio</p>
            <p className="mt-1 text-2xl font-semibold">{averageProgress}%</p>
            <p className="text-xs text-muted-foreground">entre metas criadas</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Concluídas</p>
            <p className="mt-1 text-2xl font-semibold">{completedGoals.length}</p>
            <p className="text-xs text-muted-foreground">vitórias registradas</p>
          </div>
        </div>
      </section>

      <section className="forja-panel rounded-3xl p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {['all', 'short', 'medium', 'long'].map(f => (
            <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm"
              onClick={() => setFilter(f)} className={cn('rounded-full', filter === f && 'bg-primary')}>
              {f === 'all' ? 'Todas' : timeframeLabels[f]}
            </Button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <Card className="border-primary/15 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-3 px-5 py-12 text-center sm:py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Target className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold">Nenhuma meta encontrada</p>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Crie uma meta curta e conecte tarefas/hábitos depois. A primeira meta deve ser simples o bastante para virar ação hoje.
              </p>
            </div>
            <Button onClick={() => setShowForm(true)} className="rounded-full">
              <Plus className="mr-1.5 h-4 w-4" /> Criar primeira meta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map(goal => {
          const progress = getGoalProgress(goal);
          const linkedTasks = tasks.filter(t => t.goal_id === goal.id);
          const linkedHabits = habits.filter(h => h.goal_id === goal.id);

          return (
            <Card key={goal.id} className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="w-4 h-4 text-primary" />
                      <CardTitle className="text-base">{goal.title}</CardTitle>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{timeframeLabels[goal.timeframe]}</Badge>
                      <Badge variant="outline" className="text-[10px]">{categoryLabels[goal.category]}</Badge>
                      <Badge variant="outline" className={cn("text-[10px]",
                        goal.status === 'active' && "bg-accent/15 text-accent",
                        goal.status === 'completed' && "bg-primary/15 text-primary"
                      )}>{statusLabels[goal.status]}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {goal.status === 'active' && (
                      <button onClick={() => updateGoal.mutate({ id: goal.id, data: { status: 'completed' } })}>
                        <CheckCircle2 className="w-4 h-4 text-muted-foreground hover:text-accent" />
                      </button>
                    )}
                    <button onClick={() => deleteGoal.mutate(goal.id)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
                {goal.deadline && <p className="text-xs text-muted-foreground">Prazo: {format(new Date(goal.deadline + 'T12:00:00'), 'dd/MM/yyyy')}</p>}

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-medium text-primary">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-2">Progresso manual:</p>
                  <Slider value={[goal.manual_progress || 0]} min={0} max={100} step={5}
                    onValueChange={([v]) => updateGoal.mutate({ id: goal.id, data: { manual_progress: v } })} />
                </div>

                {(linkedTasks.length > 0 || linkedHabits.length > 0) && (
                  <div className="text-xs text-muted-foreground">
                    {linkedTasks.length > 0 && <span>{linkedTasks.filter(t => t.status === 'completed').length}/{linkedTasks.length} tarefas</span>}
                    {linkedTasks.length > 0 && linkedHabits.length > 0 && <span> · </span>}
                    {linkedHabits.length > 0 && <span>{linkedHabits.length} hábitos</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createGoal.mutate(form); }} className="space-y-4">
            <Input placeholder="Título da meta" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="bg-secondary/50" />
            <Textarea placeholder="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-secondary/50 h-20 resize-none" />
            <Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} className="bg-secondary/50" />
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.timeframe} onValueChange={v => setForm(f => ({ ...f, timeframe: v }))}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Curto prazo</SelectItem>
                  <SelectItem value="medium">Médio prazo</SelectItem>
                  <SelectItem value="long">Longo prazo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Pessoal</SelectItem>
                  <SelectItem value="professional">Profissional</SelectItem>
                  <SelectItem value="health">Saúde</SelectItem>
                  <SelectItem value="finance">Financeiro</SelectItem>
                  <SelectItem value="learning">Aprendizado</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Criar Meta</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}