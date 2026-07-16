import React, { useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, CheckCircle2, Circle, Clock, Flame, Rows3, AlignJustify, Eraser, Archive, ListTodo, Minus } from 'lucide-react';
import { PageHero, StatGrid, StatTile, PraxisEmptyState } from '@/components/layout/PraxisPage';
import { cn } from '@/lib/utils';
import TaskForm from '@/components/habits-tasks/TaskForm';
import TaskRecurrenceBadge from '@/components/habits-tasks/TaskRecurrenceBadge';
import { notifyPraxisRecurrenceSpawned } from '@/lib/praxisRecurrenceToast';
import { dispatchPraxisLevelUpFromResponse } from '@/lib/praxisLevelUp';
import HabitForm from '@/components/habits-tasks/HabitForm';
import RitualWidget from '@/components/dashboard/RitualWidget';
import { TaskRowMenu, HabitRowMenu } from '@/components/habits-tasks/ListRowMenus';
import NoiseCleanupDialog from '@/components/habits-tasks/NoiseCleanupDialog';
import TaskBulkArchiveDialog from '@/components/habits-tasks/TaskBulkArchiveDialog';
import VoiceCaptureButton from '@/components/shared/VoiceCaptureButton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { CATEGORIES, CategoryBadge } from '@/lib/categories';
import { sparkAt } from '@/lib/celebration';
import { fortalezaDateKey } from '@/lib/dates';
import { buildMovedOrder } from '@/lib/taskReorder';
import { isTaskOpen } from '@/lib/tasks';
import { toast } from 'sonner';
import {
  HABIT_STATUS_LABELS,
  SKIP_REASONS,
  SKIP_REASON_LABELS,
  countHabitDayOutcomes,
  formatFrequencyLabel,
  getHabitDayOutcome,
  isHabitDueOnDate,
  isHabitLogDone,
  isQuantitativeHabit,
  todayLogForHabit,
} from '@/lib/habits';
import {
  TASK_SCOPE_CHIPS,
  filterTasksByScope,
  sortTasksForList,
  countOpenOverdue,
  isTaskOverdue,
  addDaysToDateKey,
} from '@/lib/taskListFilters';
import {
  habitTasksTabFromSearchParams,
  setHabitTasksTabInSearchParams,
  taskScopeFromSearchParams,
  setTaskScopeInSearchParams,
} from '@/lib/urlDeepLinks';

function cleanPriorityPrefix(title = '') {
  const cleaned = String(title).replace(/^\s*P\d+\s*(?:[—–-]|:|\.)\s*/i, '').trim();
  return cleaned || title;
}

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

export default function HabitsTasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState(() => habitTasksTabFromSearchParams(searchParams));
  const [habitStatusFilter, setHabitStatusFilter] = useState('active');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showHabitForm, setShowHabitForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [noiseDialogOpen, setNoiseDialogOpen] = useState(false);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [taskSelectionMode, setTaskSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set());
  const [taskScope, setTaskScope] = useState(() => taskScopeFromSearchParams(searchParams));
  const [skipSheetHabit, setSkipSheetHabit] = useState(null);
  const queryClient = useQueryClient();
  const habitRowRefs = useRef(new Map());
  const today = fortalezaDateKey();

  useEffect(() => {
    setView(habitTasksTabFromSearchParams(searchParams));
    setTaskScope(taskScopeFromSearchParams(searchParams));
  }, [searchParams]);

  const handleTaskScopeChange = (scope) => {
    setTaskScope(scope);
    setSearchParams(setTaskScopeInSearchParams(searchParams, scope), { replace: true });
    setSelectedTaskIds(new Set());
  };

  const handleViewChange = (next) => {
    setView(next);
    setSearchParams(setHabitTasksTabInSearchParams(searchParams, next), { replace: true });
  };

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', today],
    queryFn: () => forjaApi.tasks.list({ limit: 50, include_overdue: '1', today }),
  });
  const { data: habits = [] } = useQuery({
    queryKey: ['allHabits', habitStatusFilter],
    queryFn: () => forjaApi.habits.list({ status: habitStatusFilter }),
  });
  const { data: habitLogs = [] } = useQuery({ queryKey: ['habitLogs', today], queryFn: () => forjaApi.habitLogs.list({ date: today }) });
  const { data: activeHabitsList = [] } = useQuery({
    queryKey: ['habits', 'active'],
    queryFn: () => forjaApi.habits.list({ status: 'active' }),
  });
  const { data: activeRituals = [] } = useQuery({
    queryKey: ['rituals', { date: today, status: 'active' }],
    queryFn: () => forjaApi.rituals.list({ status: 'active', date: today }),
  });
  const { data: userSettings } = useQuery({
    queryKey: ['me'],
    queryFn: () => forjaApi.user.getSettings(),
    staleTime: 60_000,
  });
  const compact = userSettings?.list_density === 'compact';

  const updateListDensity = useMutation({
    mutationFn: (list_density) => forjaApi.user.updateSettings({ list_density }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

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

  const updateHabit = useMutation({
    mutationFn: ({ id, data }) => forjaApi.habits.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['goalHabits'] });
      setEditingHabit(null);
    },
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
      status: task.status === 'completed' ? 'pending' : 'completed',
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      dispatchPraxisLevelUpFromResponse(data);
      notifyPraxisRecurrenceSpawned(data);
      queryClient.invalidateQueries({ queryKey: ['gamification'] });
    },
  });

  const toggleHabit = useMutation({
    mutationFn: async ({ habitId, isDone, value }) => {
      const logs = habitLogs.filter(log => log.habit_id === habitId && log.date === today);
      if (isDone && logs[0]) {
        await forjaApi.habitLogs.delete(logs[0].id);
      } else if (!isDone) {
        await forjaApi.habitLogs.create({
          habit_id: habitId,
          date: today,
          outcome: 'done',
          completed: true,
          ...(value !== undefined ? { value } : {}),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habitLogs'] });
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
  });

  const skipHabit = useMutation({
    mutationFn: async ({ habitId, skipReason }) => {
      await forjaApi.habitLogs.create({
        habit_id: habitId,
        date: today,
        outcome: 'skipped',
        ...(skipReason ? { skip_reason: skipReason } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habitLogs'] });
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      toast('Não rolou — registrado.');
      setSkipSheetHabit(null);
    },
  });

  const notTodayTask = useMutation({
    mutationFn: (taskId) => forjaApi.tasks.notToday(taskId, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      toast('Beleza — fica pra amanhã.');
    },
  });

  const isHabitCompletedToday = (habitId) => {
    const log = todayLogForHabit(habitLogs, habitId, today);
    return isHabitLogDone(log);
  };

  const habitDayOutcome = (habitId) => {
    const log = todayLogForHabit(habitLogs, habitId, today);
    return getHabitDayOutcome(log);
  };

  const setHabitStatus = useMutation({
    mutationFn: ({ id, status }) => forjaApi.habits.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allHabits'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
    },
  });

  const bulkArchiveTasks = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await forjaApi.tasks.update(id, { status: 'cancelled' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      setBulkArchiveOpen(false);
      setTaskSelectionMode(false);
      setSelectedTaskIds(new Set());
    },
  });

  const bulkCancelTasks = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await forjaApi.tasks.update(id, { status: 'cancelled' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      setNoiseDialogOpen(false);
    },
  });

  const handleToggleHabit = (habit, isDone, evt) => {
    if (isQuantitativeHabit(habit) && !isDone) {
      const current = todayLogForHabit(habitLogs, habit.id, today);
      const target = Number(habit.target_value);
      const nextDefault = current?.value != null ? Number(current.value) + 1 : 1;
      const raw = window.prompt(
        `Quanto registrou hoje? (meta: ${target}${habit.unit ? ` ${habit.unit}` : ''})`,
        String(nextDefault)
      );
      if (raw === null) return;
      const value = Number(raw);
      if (Number.isNaN(value) || value < 0) return;
      toggleHabit.mutate({ habitId: habit.id, isDone: false, value });
      return;
    }
    if (!isDone) {
      const target = habitRowRefs.current.get(habit.id);
      const rect = (evt?.currentTarget || target)?.getBoundingClientRect?.();
      if (rect) sparkAt(rect.left + 28, rect.top + rect.height / 2);
    }
    toggleHabit.mutate({ habitId: habit.id, isDone });
  };

  const scopedTasks = filterTasksByScope(tasks, taskScope, today);
  const overdueInScope = countOpenOverdue(scopedTasks, today);
  const overdueOpenTotal = countOpenOverdue(tasks, today);

  const filteredTasks = scopedTasks
    .filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      return true;
    })
    .sort((a, b) => sortTasksForList(a, b, today));

  const archivableTasks = filteredTasks.filter((t) => isTaskOpen(t));

  const toggleTaskSelected = (id) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openBulkArchive = () => {
    const pool =
      selectedTaskIds.size > 0
        ? archivableTasks.filter((t) => selectedTaskIds.has(t.id))
        : archivableTasks;
    if (pool.length === 0) return;
    setBulkArchiveOpen(true);
  };

  const filteredHabits = habits.filter(h => {
    if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
    return true;
  });
  const showRituals = habitStatusFilter === 'active' && categoryFilter === 'all' && activeRituals.length > 0;
  const activeRitualHabitIds = new Set(
    activeRituals.flatMap((ritual) => ritual.habits_order || ritual.habits?.map((habit) => habit.id) || []),
  );
  const flatHabits = showRituals
    ? filteredHabits.filter((habit) => !activeRitualHabitIds.has(habit.id))
    : filteredHabits;

  const activeHabitsDueToday = activeHabitsList.filter(
    (h) => isHabitDueOnDate(h, today)
  );
  const habitDayCounts = countHabitDayOutcomes(activeHabitsDueToday, habitLogs, today);
  const completedHabits = habitDayCounts.done;
  const skippedHabitsToday = habitDayCounts.skipped;
  const habitsDayPct = activeHabitsDueToday.length
    ? Math.round((completedHabits / activeHabitsDueToday.length) * 100)
    : 0;

  const noiseTasks = tasks.filter(
    (t) => (t.status === 'pending' || t.status === 'in_progress') && t.date && t.date < today,
  );

  const moveTask = (taskId, direction) => {
    const orderedIds = buildMovedOrder(tasks, filteredTasks, taskId, direction);
    if (orderedIds) reorderTasks.mutate(orderedIds);
  };

  const moveHabit = (habitId, direction) => {
    const orderedIds = buildMovedOrder(habits, flatHabits, habitId, direction);
    if (orderedIds) reorderHabits.mutate(orderedIds);
  };

  const confirmDeleteTask = (task) => {
    const title = cleanPriorityPrefix(task.title);
    const open = task.status === 'pending' || task.status === 'in_progress';
    const message = open
      ? `Excluir a tarefa aberta "${title}"? Isso não pode ser desfeito.`
      : `Excluir a tarefa "${title}"? Isso não pode ser desfeito.`;
    if (window.confirm(message)) deleteTask.mutate(task.id);
  };

  const confirmDeleteHabit = (habit) => {
    const title = cleanPriorityPrefix(habit.title);
    if (!window.confirm(`Excluir permanentemente o hábito "${title}"?`)) return;
    if (!window.confirm(
      'Última confirmação: todos os check-ins e o histórico de streak deste hábito serão apagados para sempre. Continuar?'
    )) return;
    deleteHabit.mutate(habit.id);
  };

  const todayRadarCount = filterTasksByScope(tasks, 'today', today).length;
  const bulkArchivePool =
    selectedTaskIds.size > 0
      ? archivableTasks.filter((t) => selectedTaskIds.has(t.id))
      : archivableTasks;

  return (
    <div className="praxis-page overflow-x-hidden">
      <PageHero
        kicker="Hábitos e tarefas"
        kickerIcon={ListTodo}
        title="Hábitos & Tarefas"
        description="Hoje, semana ou atrasadas — arquive em lote o que não vale mais."
        action={(
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
            <Button onClick={() => setShowTaskForm(true)} className="praxis-touch-target h-11 w-full rounded-full px-4 sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" /> Tarefa
            </Button>
            <Button
              onClick={() => { setEditingHabit(null); setShowHabitForm(true); }}
              className="praxis-touch-target h-11 w-full rounded-full px-4 sm:w-auto"
              variant="outline"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Hábito
            </Button>
          </div>
        )}
      >
        <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
          <StatTile label="Hoje" value={todayRadarCount} tone="cyan" />
          <StatTile label="Hábitos hoje" value={`${completedHabits}/${activeHabitsDueToday.length}`} />
          <StatTile
            label="Área"
            value={categoryFilter === 'all' ? 'Todas' : (CATEGORIES[categoryFilter]?.label || '—')}
          />
        </StatGrid>
      </PageHero>

      <section className="forja-panel rounded-3xl p-3 sm:p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={view} onValueChange={handleViewChange}>
            <TabsList className="praxis-scroll-x h-11 w-full max-w-full justify-start rounded-2xl bg-black/20 p-1 flex-nowrap">
              <TabsTrigger className="rounded-xl px-3 sm:px-4 shrink-0" value="all">Todos</TabsTrigger>
              <TabsTrigger className="rounded-xl px-3 sm:px-4 shrink-0" value="tasks">Tarefas ({filteredTasks.length})</TabsTrigger>
              <TabsTrigger className="rounded-xl px-3 sm:px-4 shrink-0" value="habits">Hábitos ({habits.length})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full gap-1.5"
              disabled={updateListDensity.isPending}
              onClick={() => updateListDensity.mutate(compact ? 'comfortable' : 'compact')}
              title={compact ? 'Modo confortável' : 'Modo compacto'}
            >
              {compact ? <AlignJustify className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
              {compact ? 'Confortável' : 'Compacto'}
            </Button>
            {noiseTasks.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-full gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setNoiseDialogOpen(true)}
              >
                <Eraser className="h-4 w-4" />
                Limpar ruído ({noiseTasks.length})
              </Button>
            )}
          </div>

          <div className="praxis-scroll-x flex w-full max-w-full gap-2 pb-1 xl:justify-end">
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
              <div className="min-w-0">
                {overdueInScope > 0 && taskScope !== 'overdue' && (
                  <p className="text-xs text-destructive">
                    {overdueInScope} atrasada{overdueInScope === 1 ? '' : 's'} neste recorte
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant={taskSelectionMode ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-9 rounded-full"
                  onClick={() => {
                    setTaskSelectionMode((v) => !v);
                    setSelectedTaskIds(new Set());
                  }}
                >
                  {taskSelectionMode ? 'Pronto' : 'Selecionar'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full gap-1"
                  disabled={archivableTasks.length === 0 || bulkArchiveTasks.isPending}
                  onClick={openBulkArchive}
                >
                  <Archive className="h-4 w-4" />
                  Arquivar
                </Button>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-full rounded-full border-white/10 bg-black/20 sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="completed">Concluídas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="praxis-scroll-x flex gap-2 pb-1">
              {TASK_SCOPE_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleTaskScopeChange(chip.id)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors shrink-0',
                    taskScope === chip.id
                      ? 'bg-primary/90 text-primary-foreground'
                      : 'bg-secondary/55 text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {chip.label}
                  {chip.id === 'overdue' && countOpenOverdue(tasks, today) > 0
                    ? ` (${countOpenOverdue(tasks, today)})`
                    : ''}
                </button>
              ))}
            </div>

            {filteredTasks.length === 0 ? (
              <PraxisEmptyState
                icon={ListTodo}
                title="Nenhuma tarefa neste filtro"
                description={
                  taskScope === 'today' && overdueOpenTotal > 0
                    ? `Nada para hoje no calendário. Você tem ${overdueOpenTotal} atrasada${
                        overdueOpenTotal === 1 ? '' : 's'
                      } — vale abrir esse filtro.`
                    : 'Crie uma tarefa ou mude o filtro acima.'
                }
                action={(
                  <>
                    {taskScope === 'today' && overdueOpenTotal > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full praxis-touch-target"
                        onClick={() => handleTaskScopeChange('overdue')}
                      >
                        Ver atrasadas ({overdueOpenTotal})
                      </Button>
                    )}
                    <Button onClick={() => setShowTaskForm(true)} className="rounded-full praxis-touch-target">
                      <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
                    </Button>
                  </>
                )}
              />
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task, index) => (
                  <Card key={task.id} className="border-border/80 bg-card/50 overflow-hidden shadow-none">
                    <CardContent
                      className={cn(
                        'flex items-center gap-2 sm:gap-3',
                        compact ? 'p-2.5 sm:p-3' : 'flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5',
                      )}
                    >
                      {taskSelectionMode && isTaskOpen(task) && (
                        <Checkbox
                          checked={selectedTaskIds.has(task.id)}
                          onCheckedChange={() => toggleTaskSelected(task.id)}
                          className="shrink-0"
                          aria-label="Selecionar para arquivar"
                        />
                      )}
                      <button
                        onClick={() => toggleTask.mutate(task)}
                        className="praxis-touch-target shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={`Alternar ${cleanPriorityPrefix(task.title)}`}
                      >
                        {task.status === 'completed' ? (
                          <CheckCircle2 className={cn(compact ? 'h-4 w-4' : 'h-5 w-5', 'text-accent')} />
                        ) : (
                          <Circle className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', compact && 'gap-1')}>
                          <p
                            className={cn(
                              'font-semibold leading-snug',
                              compact ? 'text-sm truncate max-w-full' : 'text-base',
                              task.status === 'completed' && 'line-through opacity-60',
                            )}
                          >
                            {cleanPriorityPrefix(task.title)}
                          </p>
                          {task.time && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs shrink-0">
                              <Clock className="mr-0.5 h-3 w-3" />
                              {String(task.time).slice(0, 5)}
                            </Badge>
                          )}
                          <Badge className={cn('text-[10px] sm:text-xs shrink-0', priorityStyles[task.priority])}>
                            {priorityLabels[task.priority] || task.priority}
                          </Badge>
                          <CategoryBadge category={task.category} />
                          <TaskRecurrenceBadge task={task} allTasks={tasks} className="shrink-0" />
                          {isTaskOverdue(task, today) && (
                            <Badge variant="destructive" className="text-[10px] shrink-0">
                              Atrasada
                            </Badge>
                          )}
                        </div>
                        {!compact && task.date && (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-xs">{task.date}</Badge>
                            {task.day_outcome === 'not_today'
                              && task.day_outcome_date === addDaysToDateKey(today, -1) && (
                              <Badge variant="outline" className="text-[10px] text-amber-200/90 border-amber-500/25">
                                Empurrada de ontem
                              </Badge>
                            )}
                          </div>
                        )}
                        {!compact && !task.date && task.recurrence && task.recurrence !== 'none' && (
                          <p className="mt-1 text-xs text-amber-400/90">Defina uma data para a recorrência funcionar.</p>
                        )}
                      </div>

                      <TaskRowMenu
                        label={cleanPriorityPrefix(task.title)}
                        busy={reorderTasks.isPending || notTodayTask.isPending}
                        disableUp={index === 0}
                        disableDown={index === filteredTasks.length - 1}
                        onMoveUp={() => moveTask(task.id, -1)}
                        onMoveDown={() => moveTask(task.id, 1)}
                        onEdit={() => setEditingTask(task)}
                        onDelete={() => confirmDeleteTask(task)}
                        showNotToday={isTaskOpen(task) && task.category !== 'ideias'}
                        onNotToday={() => notTodayTask.mutate(task.id)}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {(view === 'all' || view === 'habits') && (
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="forja-kicker">Consistência</p>
                <h2 className="forja-title text-2xl font-semibold">Hábitos</h2>
              </div>
              <Select value={habitStatusFilter} onValueChange={setHabitStatusFilter}>
                <SelectTrigger className="h-10 w-full rounded-full border-white/10 bg-black/20 sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="paused">Pausados</SelectItem>
                  <SelectItem value="archived">Arquivados</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {habitStatusFilter === 'active' && activeHabitsDueToday.length > 0 && (
              <div className="space-y-1.5 rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Hábitos de hoje</span>
                  <span>
                    {completedHabits} feitos
                    {skippedHabitsToday > 0 ? ` · ${skippedHabitsToday} não rolou` : ''}
                    {habitDayCounts.open > 0 ? ` · ${habitDayCounts.open} abertos` : ''}
                    {' · '}{habitsDayPct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary rail-inset">
                  <div
                    className="h-full rounded-full transition-[width] duration-200 ease-out"
                    style={{
                      width: `${habitsDayPct}%`,
                      background: 'linear-gradient(90deg, hsl(var(--domain-wellness)), hsl(var(--domain-ember)))',
                    }}
                  />
                </div>
              </div>
            )}

            {showRituals && (
              <RitualWidget collapsible today={today} status="active" />
            )}

            {flatHabits.length === 0 ? (
              !showRituals && (
                <PraxisEmptyState
                  icon={Flame}
                  title="Nenhum hábito ainda"
                  description="Cadastre hábitos essenciais — eles aparecem no Hoje e nos rituais."
                  action={(
                    <Button
                      onClick={() => { setEditingHabit(null); setShowHabitForm(true); }}
                      className="rounded-full praxis-touch-target"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> Novo hábito
                    </Button>
                  )}
                />
              )
            ) : (
              <div className="space-y-3">
                {showRituals && (
                  <p className="pt-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Outros hábitos
                  </p>
                )}
                {flatHabits.map((habit, index) => {
                  const outcome = habitDayOutcome(habit.id);
                  const done = outcome === 'done';
                  const skipped = outcome === 'skipped';
                  const dueToday = isHabitDueOnDate(habit, today);
                  const canCheckIn = habit.status === 'active' && dueToday;
                  const todayLog = todayLogForHabit(habitLogs, habit.id, today);
                  const quant = isQuantitativeHabit(habit);
                  return (
                    <Card
                      key={habit.id}
                      ref={el => { if (el) habitRowRefs.current.set(habit.id, el); else habitRowRefs.current.delete(habit.id); }}
                      className={cn(
                        'card-domain domain-wellness overflow-hidden bg-card/75 transition-colors',
                        done && 'border-domain-wellness/30 bg-domain-wellness/10',
                        skipped && 'border-amber-500/25 bg-amber-500/[0.08]',
                      )}
                    >
                      <CardContent
                        className={cn(
                          'flex items-center gap-2 sm:gap-3',
                          compact ? 'p-2.5 sm:p-3' : 'flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5',
                        )}
                      >
                        {canCheckIn ? (
                          <button
                            type="button"
                            onClick={(evt) => {
                              if (skipped) {
                                toggleHabit.mutate({ habitId: habit.id, isDone: true });
                                return;
                              }
                              handleToggleHabit(habit, done, evt);
                            }}
                            disabled={toggleHabit.isPending || skipHabit.isPending}
                            className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            aria-label={
                              skipped
                                ? `Desfazer não rolou — ${cleanPriorityPrefix(habit.title)}`
                                : `${done ? 'Desmarcar' : 'Concluir'} ${cleanPriorityPrefix(habit.title)}`
                            }
                          >
                            {done ? (
                              <CheckCircle2 className={cn(compact ? 'h-4 w-4' : 'h-5 w-5', 'text-domain-wellness')} />
                            ) : skipped ? (
                              <span className={cn(
                                'flex items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400',
                                compact ? 'h-4 w-4' : 'h-5 w-5',
                              )}>
                                <Minus className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                              </span>
                            ) : (
                              <Circle className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                            )}
                          </button>
                        ) : (
                          <div className={cn('shrink-0', compact ? 'h-4 w-4' : 'h-5 w-5')} aria-hidden />
                        )}
                        {!compact && (
                          <Flame className={cn(
                            'shrink-0 h-5 w-5 text-primary',
                            done && 'text-domain-wellness',
                            skipped && 'text-amber-400/80',
                          )} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', compact && 'gap-1')}>
                            <p
                              className={cn(
                                'font-semibold leading-snug',
                                compact ? 'text-sm truncate' : 'text-base',
                                done && 'text-domain-wellness line-through opacity-80',
                                skipped && 'text-muted-foreground opacity-75',
                              )}
                            >
                              {cleanPriorityPrefix(habit.title)}
                            </p>
                            <CategoryBadge category={habit.category} />
                            {skipped && (
                              <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-200/90">
                                Não rolou
                                {todayLog?.skip_reason
                                  ? ` · ${SKIP_REASON_LABELS[todayLog.skip_reason] || todayLog.skip_reason}`
                                  : ''}
                              </Badge>
                            )}
                            {habit.current_streak > 0 && (
                              <span className="text-[10px] text-orange-400 shrink-0">🔥{habit.current_streak}</span>
                            )}
                            {habit.status !== 'active' && (
                              <Badge variant="outline" className="text-[10px]">
                                {HABIT_STATUS_LABELS[habit.status]}
                              </Badge>
                            )}
                          </div>
                          {!compact && (
                            <>
                              <Badge variant="outline" className="mt-1.5 text-xs">
                                {formatFrequencyLabel(habit)}
                              </Badge>
                              {quant && todayLog?.value != null && done && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Hoje: {todayLog.value}
                                  {habit.unit ? ` ${habit.unit}` : ''}
                                </p>
                              )}
                              {!dueToday && habit.status === 'active' && (
                                <p className="text-xs text-muted-foreground">Não previsto para hoje</p>
                              )}
                            </>
                          )}
                        </div>
                        <HabitRowMenu
                          label={cleanPriorityPrefix(habit.title)}
                          habit={habit}
                          busy={reorderHabits.isPending || skipHabit.isPending}
                          canCheckIn={canCheckIn}
                          dayOutcome={outcome}
                          disableUp={index === 0}
                          disableDown={index === flatHabits.length - 1}
                          onMoveUp={() => moveHabit(habit.id, -1)}
                          onMoveDown={() => moveHabit(habit.id, 1)}
                          onEdit={() => { setShowHabitForm(false); setEditingHabit(habit); }}
                          onDelete={() => confirmDeleteHabit(habit)}
                          onSetStatus={(status) => setHabitStatus.mutate({ id: habit.id, status })}
                          onNaoRolou={() => setSkipSheetHabit(habit)}
                          onUndoDayOutcome={() => toggleHabit.mutate({ habitId: habit.id, isDone: true })}
                        />
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Hábito</DialogTitle></DialogHeader>
          <HabitForm
            key="habit-create"
            onSubmit={(data) => createHabit.mutate(data)}
            onCancel={() => setShowHabitForm(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingHabit)} onOpenChange={(open) => { if (!open) setEditingHabit(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar hábito</DialogTitle></DialogHeader>
          {editingHabit && (
            <HabitForm
              key={editingHabit.id}
              initial={editingHabit}
              onSubmit={(data) => updateHabit.mutate({ id: editingHabit.id, data })}
              onCancel={() => setEditingHabit(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <TaskBulkArchiveDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        tasks={bulkArchivePool}
        busy={bulkArchiveTasks.isPending}
        onConfirm={(ids) => bulkArchiveTasks.mutate(ids)}
      />

      <NoiseCleanupDialog
        open={noiseDialogOpen}
        onOpenChange={setNoiseDialogOpen}
        tasks={noiseTasks}
        busy={bulkCancelTasks.isPending}
        onConfirm={(ids) => bulkCancelTasks.mutate(ids)}
      />

      <Sheet open={Boolean(skipSheetHabit)} onOpenChange={(open) => { if (!open) setSkipSheetHabit(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl border-white/10 bg-card">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base">
              {skipSheetHabit ? cleanPriorityPrefix(skipSheetHabit.title) : 'Hábito'}
            </SheetTitle>
            <SheetDescription>
              Motivo opcional — um toque. Pode pular.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-wrap gap-2 pb-4">
            {SKIP_REASONS.map((r) => (
              <Button
                key={r.value}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full border-amber-500/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                disabled={skipHabit.isPending}
                onClick={() => skipHabit.mutate({ habitId: skipSheetHabit.id, skipReason: r.value })}
              >
                {r.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={skipHabit.isPending}
              onClick={() => skipHabit.mutate({ habitId: skipSheetHabit.id, skipReason: null })}
            >
              Sem motivo
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <VoiceCaptureButton />
    </div>
  );
}
