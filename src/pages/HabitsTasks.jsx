import React, { useRef, useState } from 'react';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, CheckCircle2, Circle, Clock, Trash2, Flame, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskForm from '@/components/habits-tasks/TaskForm';
import HabitForm from '@/components/habits-tasks/HabitForm';
import VoiceCaptureButton from '@/components/shared/VoiceCaptureButton';
import { CATEGORIES, CategoryBadge } from '@/lib/categories';
import { sparkAt } from '@/lib/celebration';
import { fortalezaDateKey } from '@/lib/dates';
import { buildMovedOrder } from '@/lib/taskReorder';
import { isTaskRelevantForTodayList } from '@/lib/tasks';

const priorityStyles = {
  high: 'bg-destructive/15 text-destructive border-destructive/20',
  medium: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const priorityLabels = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

function cleanPriorityPrefix(title = '') {
  const cleaned = String(title).replace(/^\s*P\d+\s*(?:[—–-]|:|\.)\s*/i, '').trim();
  return cleaned || title;
}

function ReorderControls({ onMoveUp, onMoveDown, disableUp, disableDown, busy, label }) {
  return (
    <div className="flex gap-1" aria-label={`Reordenar ${label}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
        onClick={onMoveUp}
        disabled={busy || disableUp}
        aria-label={`Subir ${label}`}
        title="Subir"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
        onClick={onMoveDown}
        disabled={busy || disableDown}
        aria-label={`Descer ${label}`}
        title="Descer"
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
    </div>
  );
}

const statusLabels = { pending: 'Pendente', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };
// categoryLabels replaced by CATEGORIES from @/lib/categories

export default function HabitsTasks() {
  const [view, setView] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showHabitForm, setShowHabitForm] = useState(false);
  const queryClient = useQueryClient();
  const habitRowRefs = useRef(new Map());
  const today = fortalezaDateKey();

  const { data: tasks = [] } = useQuery({ queryKey: ['allTasks', today], queryFn: () => forjaApi.tasks.list({ limit: 100 }) });
  const { data: habits = [] } = useQuery({ queryKey: ['allHabits'], queryFn: () => forjaApi.habits.list({}) });
  const { data: habitLogs = [] } = useQuery({ queryKey: ['habitLogs', today], queryFn: () => forjaApi.habitLogs.list({ date: today }) });

  const createTask = useMutation({
    mutationFn: (data) => forjaApi.tasks.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allTasks'] }); queryClient.invalidateQueries({ queryKey: ['tasks'] }); setShowTaskForm(false); },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }) => forjaApi.tasks.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      setEditingTask(null);
    },
  });

  const createHabit = useMutation({
    mutationFn: (data) => forjaApi.habits.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allHabits'] }); queryClient.invalidateQueries({ queryKey: ['habits'] }); setShowHabitForm(false); },
  });

  const deleteTask = useMutation({
    mutationFn: (id) => forjaApi.tasks.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allTasks'] }),
  });

  const deleteHabit = useMutation({
    mutationFn: (id) => forjaApi.habits.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allHabits'] }),
  });

  const reorderTasks = useMutation({
    mutationFn: (orderedIds) => forjaApi.tasks.reorder(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const reorderHabits = useMutation({
    mutationFn: (orderedIds) => forjaApi.habits.reorder(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
  });

  const toggleTask = useMutation({
    mutationFn: (task) => forjaApi.tasks.update(task.id, { 
      status: task.status === 'completed' ? 'pending' : 'completed' 
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allTasks'] }),
  });

  const toggleHabit = useMutation({
    mutationFn: async ({ habitId, isDone }) => {
      const logs = habitLogs.filter(log => log.habit_id === habitId && log.date === today);
      if (isDone && logs[0]) {
        await forjaApi.habitLogs.delete(logs[0].id);
      } else if (!isDone) {
        await forjaApi.habitLogs.create({ habit_id: habitId, date: today, completed: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habitLogs'] });
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
  });

  const isHabitCompletedToday = (habitId) =>
    habitLogs.some(log => log.habit_id === habitId && log.date === today && log.completed);

  const handleToggleHabit = (habit, isDone, evt) => {
    if (!isDone) {
      const target = habitRowRefs.current.get(habit.id);
      const rect = (evt?.currentTarget || target)?.getBoundingClientRect?.();
      if (rect) sparkAt(rect.left + 28, rect.top + rect.height / 2);
    }
    toggleHabit.mutate({ habitId: habit.id, isDone });
  };

  const currentTasks = tasks.filter(t => isTaskRelevantForTodayList(t, today));

  const filteredTasks = currentTasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  });

  const filteredHabits = habits.filter(h => {
    if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
    return true;
  });

  const completedHabits = habits.filter(h => isHabitCompletedToday(h.id)).length;

  const moveTask = (taskId, direction) => {
    const orderedIds = buildMovedOrder(tasks, filteredTasks, taskId, direction);
    if (orderedIds) reorderTasks.mutate(orderedIds);
  };

  const moveHabit = (habitId, direction) => {
    const orderedIds = buildMovedOrder(habits, filteredHabits, habitId, direction);
    if (orderedIds) reorderHabits.mutate(orderedIds);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="glass-surface rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="forja-kicker">Painel operacional</p>
            <h1 className="forja-title text-3xl font-bold sm:text-4xl">Hábitos & Tarefas</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Só o dia de hoje no radar — pendentes com data de hoje e o que você concluiu agora.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button onClick={() => setShowTaskForm(true)} className="h-10 rounded-full px-4 shadow-lg shadow-primary/20">
              <Plus className="mr-1.5 h-4 w-4" /> Tarefa
            </Button>
            <Button onClick={() => setShowHabitForm(true)} className="h-10 rounded-full px-4" variant="outline">
              <Plus className="mr-1.5 h-4 w-4" /> Hábito
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Hoje</p>
            <p className="mt-1 text-2xl font-semibold">{currentTasks.length}</p>
            <p className="text-xs text-muted-foreground">tarefas no radar</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Rotina</p>
            <p className="mt-1 text-2xl font-semibold">{completedHabits}/{habits.length}</p>
            <p className="text-xs text-muted-foreground">hábitos concluídos hoje</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
            <p className="forja-kicker">Filtro</p>
            <p className="mt-1 truncate text-lg font-semibold">
              {categoryFilter === 'all' ? 'Todas as áreas' : CATEGORIES[categoryFilter]?.label}
            </p>
            <p className="text-xs text-muted-foreground">contexto selecionado</p>
          </div>
        </div>
      </section>

      <section className="forja-panel rounded-3xl p-3 sm:p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={view} onValueChange={setView}>
            <TabsList className="h-11 rounded-2xl bg-black/20 p-1">
              <TabsTrigger className="rounded-xl px-4" value="all">Todos</TabsTrigger>
              <TabsTrigger className="rounded-xl px-4" value="tasks">Tarefas ({currentTasks.length})</TabsTrigger>
              <TabsTrigger className="rounded-xl px-4" value="habits">Hábitos ({habits.length})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter('all')}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                categoryFilter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-secondary/55 text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              Todos
            </button>
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  categoryFilter === key
                    ? `${cat.color} ring-1 ring-current`
                    : 'bg-secondary/55 text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className={cn('grid gap-6', view === 'all' && 'xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start')}>
        {(view === 'all' || view === 'tasks') && (
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="forja-kicker">Execução</p>
                <h2 className="forja-title text-2xl font-semibold">Tarefas</h2>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-full rounded-full border-white/10 bg-black/20 sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="completed">Concluídas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredTasks.length === 0 ? (
              <Card className="bg-secondary/30"><CardContent className="py-10 text-center text-muted-foreground">Nenhuma tarefa encontrada</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task, index) => (
                  <Card key={task.id} className="card-domain domain-ember overflow-hidden bg-card/75">
                    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                      <button
                        onClick={() => toggleTask.mutate(task)}
                        className="mt-0.5 shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground sm:mt-0"
                        aria-label={`Alternar ${cleanPriorityPrefix(task.title)}`}
                      >
                        {task.status === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-accent" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1 space-y-2">
                        <p className={cn('text-base font-semibold leading-snug', task.status === 'completed' && 'line-through opacity-60')}>
                          {cleanPriorityPrefix(task.title)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {task.date && <Badge variant="outline" className="text-xs">{task.date}</Badge>}
                          {task.time && <Badge variant="outline" className="text-xs"><Clock className="mr-1 h-3 w-3" />{task.time}</Badge>}
                          <Badge className={cn('text-xs', priorityStyles[task.priority])}>{priorityLabels[task.priority] || task.priority}</Badge>
                          <CategoryBadge category={task.category} />
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 self-end rounded-full border border-white/5 bg-black/20 p-1 sm:self-center">
                        <ReorderControls
                          label={cleanPriorityPrefix(task.title)}
                          busy={reorderTasks.isPending}
                          disableUp={index === 0}
                          disableDown={index === filteredTasks.length - 1}
                          onMoveUp={() => moveTask(task.id, -1)}
                          onMoveDown={() => moveTask(task.id, 1)}
                        />
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          aria-label={`Editar ${cleanPriorityPrefix(task.title)}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteTask.mutate(task.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Excluir ${cleanPriorityPrefix(task.title)}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {(view === 'all' || view === 'habits') && (
          <section className="space-y-3">
            <div>
              <p className="forja-kicker">Consistência</p>
              <h2 className="forja-title text-2xl font-semibold">Hábitos</h2>
            </div>

            {filteredHabits.length === 0 ? (
              <Card className="bg-secondary/30"><CardContent className="py-10 text-center text-muted-foreground">Nenhum hábito registrado</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {filteredHabits.map((habit, index) => {
                  const done = isHabitCompletedToday(habit.id);
                  return (
                    <Card
                      key={habit.id}
                      ref={el => { if (el) habitRowRefs.current.set(habit.id, el); else habitRowRefs.current.delete(habit.id); }}
                      className={cn(
                        'card-domain domain-wellness overflow-hidden bg-card/75 transition-colors',
                        done && 'border-domain-wellness/30 bg-domain-wellness/10'
                      )}
                    >
                      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5 xl:items-start">
                        <button
                          type="button"
                          onClick={(evt) => handleToggleHabit(habit, done, evt)}
                          disabled={toggleHabit.isPending}
                          className="mt-0.5 shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 sm:mt-0"
                          aria-label={`${done ? 'Desmarcar' : 'Concluir'} ${cleanPriorityPrefix(habit.title)}`}
                          title={done ? 'Desmarcar hábito de hoje' : 'Concluir hábito de hoje'}
                        >
                          {done ? (
                            <CheckCircle2 className="h-5 w-5 text-domain-wellness" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>
                        <Flame className={cn('mt-0.5 h-5 w-5 shrink-0 text-primary', done && 'text-domain-wellness')} />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={cn('text-base font-semibold leading-snug', done && 'text-domain-wellness line-through opacity-80')}>
                              {cleanPriorityPrefix(habit.title)}
                            </p>
                            <CategoryBadge category={habit.category} />
                            {done && (
                              <Badge className="border-domain-wellness/30 bg-domain-wellness/15 text-domain-wellness">
                                Feito hoje
                              </Badge>
                            )}
                            {habit.current_streak > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-500/20 px-2 py-0.5 text-xs text-orange-400">
                                🔥 {habit.current_streak}
                              </span>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {habit.frequency === 'daily' ? 'Diário' : habit.frequency === 'weekdays' ? 'Dias úteis' : habit.frequency}
                          </Badge>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 self-end rounded-full border border-white/5 bg-black/20 p-1 sm:self-center xl:self-start">
                          <ReorderControls
                            label={cleanPriorityPrefix(habit.title)}
                            busy={reorderHabits.isPending}
                            disableUp={index === 0}
                            disableDown={index === filteredHabits.length - 1}
                            onMoveUp={() => moveHabit(habit.id, -1)}
                            onMoveDown={() => moveHabit(habit.id, 1)}
                          />
                          <button
                            onClick={() => deleteHabit.mutate(habit.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Excluir ${cleanPriorityPrefix(habit.title)}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          <TaskForm onSubmit={(data) => createTask.mutate(data)} onCancel={() => setShowTaskForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingTask)} onOpenChange={(open) => { if (!open) setEditingTask(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar tarefa</DialogTitle></DialogHeader>
          {editingTask && (
            <TaskForm
              initial={editingTask}
              onSubmit={(data) => updateTask.mutate({ id: editingTask.id, data })}
              onCancel={() => setEditingTask(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showHabitForm} onOpenChange={setShowHabitForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Hábito</DialogTitle></DialogHeader>
          <HabitForm onSubmit={(data) => createHabit.mutate(data)} onCancel={() => setShowHabitForm(false)} />
        </DialogContent>
      </Dialog>

      <VoiceCaptureButton />
    </div>
  );
}
