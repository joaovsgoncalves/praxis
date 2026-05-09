import React, { useState } from 'react';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, CheckCircle2, Circle, Clock, Trash2, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskForm from '@/components/habits-tasks/TaskForm';
import HabitForm from '@/components/habits-tasks/HabitForm';
import VoiceCaptureButton from '@/components/shared/VoiceCaptureButton';
import { CATEGORIES, CategoryBadge } from '@/lib/categories';

const priorityStyles = {
  high: 'bg-destructive/15 text-destructive border-destructive/20',
  medium: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const statusLabels = { pending: 'Pendente', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };
// categoryLabels replaced by CATEGORIES from @/lib/categories

export default function HabitsTasks() {
  const [view, setView] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showHabitForm, setShowHabitForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({ queryKey: ['allTasks'], queryFn: () => forjaApi.tasks.list({ limit: 100 }) });
  const { data: habits = [] } = useQuery({ queryKey: ['allHabits'], queryFn: () => forjaApi.habits.list({}) });

  const createTask = useMutation({
    mutationFn: (data) => forjaApi.tasks.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allTasks'] }); queryClient.invalidateQueries({ queryKey: ['tasks'] }); setShowTaskForm(false); },
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

  const toggleTask = useMutation({
    mutationFn: (task) => forjaApi.tasks.update(task.id, { 
      status: task.status === 'completed' ? 'pending' : 'completed' 
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allTasks'] }),
  });

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  });

  const filteredHabits = habits.filter(h => {
    if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hábitos & Tarefas</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowTaskForm(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" />Tarefa
          </Button>
          <Button onClick={() => setShowHabitForm(true)} size="sm" variant="outline">
            <Plus className="w-4 h-4 mr-1" />Hábito
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="tasks">Tarefas ({tasks.length})</TabsTrigger>
          <TabsTrigger value="habits">Hábitos ({habits.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${categoryFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}
        >
          Todos
        </button>
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <button
            key={key}
            onClick={() => setCategoryFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${categoryFilter === key ? `${cat.color} ring-1 ring-current` : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {(view === 'all' || view === 'tasks') && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Tarefas</h2>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="completed">Concluídas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <SelectItem key={key} value={key}>{cat.emoji} {cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredTasks.length === 0 ? (
            <Card className="bg-secondary/30"><CardContent className="py-8 text-center text-muted-foreground">Nenhuma tarefa encontrada</CardContent></Card>
          ) : (
            filteredTasks.map(task => (
              <Card key={task.id} className="bg-card border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <button onClick={() => toggleTask.mutate(task)}>
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-accent" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    )}
                  </button>
                  <div className="flex-1">
                    <p className={cn("font-medium", task.status === 'completed' && "line-through opacity-60")}>{task.title}</p>
                    <div className="flex gap-2 mt-1">
                      {task.date && <Badge variant="outline" className="text-xs">{task.date}</Badge>}
                      {task.time && <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />{task.time}</Badge>}
                      <Badge className={cn("text-xs", priorityStyles[task.priority])}>{task.priority}</Badge>
                      <CategoryBadge category={task.category} />
                    </div>
                  </div>
                  <button onClick={() => deleteTask.mutate(task.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {(view === 'all' || view === 'habits') && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Hábitos</h2>
          {filteredHabits.length === 0 ? (
            <Card className="bg-secondary/30"><CardContent className="py-8 text-center text-muted-foreground">Nenhum hábito registrado</CardContent></Card>
          ) : (
            filteredHabits.map(habit => (
              <Card key={habit.id} className="bg-card border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <Flame className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{habit.title}</p>
                      <CategoryBadge category={habit.category} />
                      {habit.current_streak > 0 && (
                        <span className="inline-flex items-center gap-1 bg-orange-500/20 text-orange-400 text-xs px-2 py-0.5 rounded-full shrink-0">
                          🔥 {habit.current_streak}
                        </span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs mt-1">
                      {habit.frequency === 'daily' ? 'Diário' : habit.frequency === 'weekdays' ? 'Dias úteis' : habit.frequency}
                    </Badge>
                  </div>
                  <button onClick={() => deleteHabit.mutate(habit.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          <TaskForm onSubmit={(data) => createTask.mutate(data)} onCancel={() => setShowTaskForm(false)} />
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
