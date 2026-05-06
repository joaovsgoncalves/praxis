import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, CheckCircle2, Circle, Clock, Timer, Trash2, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import TaskForm from '@/components/habits-tasks/TaskForm';
import HabitForm from '@/components/habits-tasks/HabitForm';
import VoiceCaptureButton from '@/components/shared/VoiceCaptureButton';

const priorityStyles = {
  high: 'bg-destructive/15 text-destructive border-destructive/20',
  medium: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const statusLabels = { pending: 'Pendente', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };
const categoryLabels = { work: 'Trabalho', personal: 'Pessoal', health: 'Saúde', learning: 'Aprendizado', finance: 'Financeiro', other: 'Outro' };

export default function HabitsTasks() {
  const [view, setView] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showHabitForm, setShowHabitForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({ queryKey: ['allTasks'], queryFn: () => base44.entities.Task.list('-created_date', 100) });
  const { data: habits = [] } = useQuery({ queryKey: ['allHabits'], queryFn: () => base44.entities.Habit.list('-created_date', 100) });
  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: () => base44.entities.Goal.filter({ status: 'active' }) });

  const createTask = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allTasks'] }); queryClient.invalidateQueries({ queryKey: ['tasks'] }); setShowTaskForm(false); },
  });

  const createHabit = useMutation({
    mutationFn: (data) => base44.entities.Habit.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allHabits'] }); queryClient.invalidateQueries({ queryKey: ['habits'] }); setShowHabitForm(false); },
  });

  const deleteTask = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allTasks'] }); queryClient.invalidateQueries({ queryKey: ['tasks'] }); },
  });

  const toggleTask = useMutation({
    mutationFn: (task) => base44.entities.Task.update(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allTasks'] }); queryClient.invalidateQueries({ queryKey: ['tasks'] }); },
  });

  const deleteHabit = useMutation({
    mutationFn: (id) => base44.entities.Habit.update(id, { status: 'archived' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allHabits'] }); queryClient.invalidateQueries({ queryKey: ['habits'] }); },
  });

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  });

  const filteredHabits = habits.filter(h => {
    if (h.status === 'archived') return false;
    if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Hábitos & Tarefas</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowTaskForm(true)} className="bg-primary hover:bg-primary/90" size="sm">
            <Plus className="w-4 h-4 mr-1" />Tarefa
          </Button>
          <Button onClick={() => setShowHabitForm(true)} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-1" />Hábito
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="bg-secondary">
            <TabsTrigger value="all">Tudo</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas</TabsTrigger>
            <TabsTrigger value="habits">Hábitos</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 bg-secondary"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {view !== 'habits' && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 bg-secondary"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        {(view === 'all' || view === 'tasks') && filteredTasks.map(task => (
          <Card key={task.id} className="bg-card border-border hover:bg-secondary/30 transition-colors">
            <CardContent className="flex items-center gap-3 p-4">
              <button onClick={() => toggleTask.mutate(task)}>
                {task.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-accent" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", task.status === 'completed' && "line-through text-muted-foreground")}>{task.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {task.date && <span className="text-xs text-muted-foreground">{format(new Date(task.date + 'T12:00:00'), 'dd/MM')}</span>}
                  {task.time && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{task.time}</span>}
                  <Badge variant="outline" className="text-[10px]">{categoryLabels[task.category] || task.category}</Badge>
                </div>
              </div>
              <Badge variant="outline" className={cn('text-[10px] border', priorityStyles[task.priority || 'medium'])}>
                {task.priority || 'medium'}
              </Badge>
              <Link to={`/foco?taskId=${task.id}`}><Timer className="w-4 h-4 text-muted-foreground hover:text-primary" /></Link>
              <button onClick={() => deleteTask.mutate(task.id)}><Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
            </CardContent>
          </Card>
        ))}

        {(view === 'all' || view === 'habits') && filteredHabits.map(habit => (
          <Card key={habit.id} className="bg-card border-border hover:bg-secondary/30 transition-colors">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                <Flame className="w-3 h-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{habit.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">{habit.frequency === 'daily' ? 'Diário' : habit.frequency === 'weekdays' ? 'Dias úteis' : habit.frequency}</Badge>
                  <Badge variant="outline" className="text-[10px]">{categoryLabels[habit.category] || habit.category}</Badge>
                </div>
              </div>
              {habit.current_streak > 0 && (
                <div className="flex items-center gap-1 text-chart-4 text-xs font-medium">
                  <Flame className="w-3.5 h-3.5" />{habit.current_streak} dias
                </div>
              )}
              <button onClick={() => deleteHabit.mutate(habit.id)}><Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent className="bg-card border-border"><DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          <TaskForm onSubmit={(d) => createTask.mutate(d)} onCancel={() => setShowTaskForm(false)} goals={goals} />
        </DialogContent>
      </Dialog>

      <Dialog open={showHabitForm} onOpenChange={setShowHabitForm}>
        <DialogContent className="bg-card border-border"><DialogHeader><DialogTitle>Novo Hábito</DialogTitle></DialogHeader>
          <HabitForm onSubmit={(d) => createHabit.mutate(d)} onCancel={() => setShowHabitForm(false)} goals={goals} />
        </DialogContent>
      </Dialog>

      <VoiceCaptureButton />
    </div>
  );
}