import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import HeroDay from '@/components/dashboard/HeroDay';
import NowBlock from '@/components/dashboard/NowBlock';
import TodayTasks from '@/components/dashboard/TodayTasks';
import TodayHabits from '@/components/dashboard/TodayHabits';
import WellnessWidget from '@/components/dashboard/WellnessWidget';
import VoiceCaptureButton from '@/components/shared/VoiceCaptureButton';
import NutritionTodayCard from '@/components/nutrition/NutritionTodayCard';
import TodayCalendar from '@/components/dashboard/TodayCalendar';
import RitualWidget from '@/components/dashboard/RitualWidget';
import XpProgressStrip from '@/components/dashboard/XpProgressStrip';
import CapturePendingBanner from '@/components/dashboard/CapturePendingBanner';
import WeeklyReviewPrompt from '@/components/dashboard/WeeklyReviewPrompt';
import AvoidanceCockpit from '@/components/dashboard/AvoidanceCockpit';
import OfflineBanner from '@/components/shared/OfflineBanner';
import PwaInstallBanner from '@/components/shared/PwaInstallBanner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import TaskForm from '@/components/habits-tasks/TaskForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fortalezaDateKey, buildSnooze15Update, buildSnoozeTomorrowUpdate } from '@/lib/dates';
import { pickNowTask } from '@/lib/nowTask';
import { isHabitDueOnDate } from '@/lib/habits';
import { buildDragOrder } from '@/lib/taskReorder';
import { dispatchPraxisLevelUpFromResponse } from '@/lib/praxisLevelUp';
import { notifyPraxisRecurrenceSpawned } from '@/lib/praxisRecurrenceToast';
import { isTaskCompletedForToday, isTaskDone, isTaskOpen } from '@/lib/tasks';
import {
  countOpenOverdue,
  sortTasksForList,
} from '@/lib/taskListFilters';
import OverdueTasksBanner from '@/components/dashboard/OverdueTasksBanner';
import SuggestedGoalCard from '@/components/dashboard/SuggestedGoalCard';
import OpeningRitualCollapsible from '@/components/dashboard/OpeningRitualCollapsible';

// Lote 7: widgets sem glow de domínio (app mais quieto)
const Slot = ({ children }) => <div>{children}</div>;

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const today = fortalezaDateKey();

  useEffect(() => {
    if (searchParams.get('from') === 'capture') {
      navigate('/captura', { replace: true });
    }
  }, [searchParams, navigate]);

  const { data: allTasks = [] } = useQuery({
    queryKey: ['dashboardTasks', today],
    queryFn: () => forjaApi.tasks.list({ limit: 50, include_overdue: '1', today }),
  });

  const overdueOpenCount = React.useMemo(
    () => countOpenOverdue(allTasks, today),
    [allTasks, today],
  );

  const tasks = React.useMemo(() => {
    return allTasks
      .filter((task) => {
        if (task.status === 'cancelled') return false;
        if (isTaskOpen(task)) {
          const d = (task.date || '').slice(0, 10);
          if (!d) return false;
          return d <= today;
        }
        return isTaskCompletedForToday(task, today);
      })
      .sort((a, b) => sortTasksForList(a, b, today));
  }, [allTasks, today]);
  const { data: habits = [] } = useQuery({
    queryKey: ['habits'],
    queryFn: () => forjaApi.habits.list({ status: 'active' }),
  });
  const { data: habitLogs = [] } = useQuery({
    queryKey: ['habitLogs', today],
    queryFn: () => forjaApi.habitLogs.list({ date: today }),
  });
  const { data: wellnessChecks = [] } = useQuery({
    queryKey: ['wellness', today],
    queryFn: () => forjaApi.wellness.list({ date: today }),
  });
  const { data: settings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => forjaApi.user.getSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const todayCheck = wellnessChecks[0] || null;
  const [editingTask, setEditingTask] = React.useState(null);
  const [showNewTaskForm, setShowNewTaskForm] = React.useState(false);

  const invalidateTaskQueries = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['allTasks'] });
    queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
    queryClient.invalidateQueries({ queryKey: ['gamification'] });
  }, [queryClient]);

  const toggleTaskMutation = useMutation({
    mutationFn: (task) => {
      const newStatus = isTaskDone(task) ? 'pending' : 'completed';
      return forjaApi.tasks.update(task.id, { status: newStatus });
    },
    onSuccess: (updated) => {
      invalidateTaskQueries();
      dispatchPraxisLevelUpFromResponse(updated);
      notifyPraxisRecurrenceSpawned(updated);
      queryClient.invalidateQueries({ queryKey: ['gamification'] });
    },
  });
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => forjaApi.tasks.update(id, data),
    onSuccess: () => {
      invalidateTaskQueries();
      setEditingTask(null);
    },
  });
  const createTaskMutation = useMutation({
    mutationFn: (data) => forjaApi.tasks.create({ ...data, date: data.date || today }),
    onSuccess: () => {
      invalidateTaskQueries();
      setShowNewTaskForm(false);
    },
  });
  const reorderTasksMutation = useMutation({
    mutationFn: (orderedIds) => forjaApi.tasks.reorder(orderedIds),
    onSuccess: invalidateTaskQueries,
  });

  const handleReorderPending = React.useCallback(
    (fromIndex, toIndex) => {
      const pending = tasks.filter((t) => !isTaskDone(t));
      const orderedIds = buildDragOrder(allTasks, pending, fromIndex, toIndex);
      if (orderedIds) reorderTasksMutation.mutate(orderedIds);
    },
    [allTasks, tasks, reorderTasksMutation]
  );

  const toggleHabitMutation = useMutation({
    mutationFn: async ({ habitId, isDone }) => {
      const logs = habitLogs.filter(l => l.habit_id === habitId && l.date === today);
      if (isDone && logs[0]) {
        await forjaApi.habitLogs.delete(logs[0].id);
      } else if (!isDone) {
        await forjaApi.habitLogs.create({ habit_id: habitId, date: today, completed: true });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habitLogs'] }),
  });
  const saveWellnessMutation = useMutation({
    mutationFn: async (data) => forjaApi.wellness.create({ ...data, date: today }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wellness'] }),
  });

  const nowTask = React.useMemo(() => pickNowTask(allTasks, today), [allTasks, today]);

  const essentialHabits = React.useMemo(
    () => habits
      .filter((h) => isHabitDueOnDate(h, today))
      .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
      .slice(0, 5),
    [habits, today],
  );

  const completedTasks = tasks.filter(t => isTaskDone(t)).length;
  const todayLogs = habitLogs.filter(l => l.date === today);
  const completedHabits = essentialHabits.filter(h =>
    todayLogs.some(l => l.habit_id === h.id && l.completed)
  ).length;

  const handleSnooze15 = (task) => {
    const data = buildSnooze15Update(task, today);
    updateTaskMutation.mutate({ id: task.id, data });
  };

  const handleSnoozeTomorrow = (task) => {
    const data = buildSnoozeTomorrowUpdate(task, today);
    updateTaskMutation.mutate({ id: task.id, data });
  };

  return (
    <div className="praxis-page praxis-page--tight flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-2">
        <OfflineBanner />
        <PwaInstallBanner />
      </div>

      <div className="order-1">
        <NowBlock
          task={nowTask}
          today={today}
          busy={updateTaskMutation.isPending || toggleTaskMutation.isPending}
          onComplete={(t) => toggleTaskMutation.mutate(t)}
          onSnooze15={handleSnooze15}
          onSnoozeTomorrow={handleSnoozeTomorrow}
          onVoiceCapture={() => navigate('/captura')}
          onAddTask={() => setShowNewTaskForm(true)}
        />
      </div>

      <div className="order-2 lg:order-3">
        <OverdueTasksBanner count={overdueOpenCount} />
      </div>

      <div className="order-3 lg:order-4">
        <CapturePendingBanner />
      </div>

      <div className="order-4">
        <HeroDay
          habitsDone={completedHabits}
          habitsTotal={essentialHabits.length}
          tasksDone={completedTasks}
          tasksTotal={tasks.length}
          userName={settings?.full_name}
        />
      </div>

      <div className="order-5 lg:order-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)] gap-4 lg:gap-5 items-start">
        <div className="space-y-4 lg:space-y-5">
          <Slot domain="ember">
            <TodayTasks
              tasks={tasks}
              today={today}
              allTasksForRecurrence={allTasks}
              onToggleComplete={(t) => toggleTaskMutation.mutate(t)}
              onEditTask={setEditingTask}
              onReorderPending={handleReorderPending}
              reorderBusy={reorderTasksMutation.isPending}
            />
          </Slot>
          <Slot domain="wellness">
            <TodayHabits
              title="Hábitos essenciais"
              today={today}
              habits={essentialHabits}
              habitLogs={habitLogs}
              onToggleHabit={(habitId, isDone) => toggleHabitMutation.mutate({ habitId, isDone })}
            />
          </Slot>
        </div>
        <div className="space-y-3 sm:space-y-4">
          <NutritionTodayCard />
          <WellnessWidget todayCheck={todayCheck} onSave={(d) => saveWellnessMutation.mutateAsync(d)} />
          <TodayCalendar />
          <RitualWidget />
        </div>
      </div>

      <Collapsible defaultOpen={false} className="order-6 rounded-2xl border border-white/5 bg-black/20">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between rounded-2xl px-4 py-5 h-auto">
            <span className="text-sm font-medium text-left">Sugestões e reflexão</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 px-2 pb-5 sm:px-3">
          <OpeningRitualCollapsible />
          <SuggestedGoalCard />
          <WeeklyReviewPrompt />
          <AvoidanceCockpit />
        </CollapsibleContent>
      </Collapsible>

      <XpProgressStrip className="order-7 mt-2" />

      <Dialog
        open={Boolean(editingTask)}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar tarefa</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm
              initial={editingTask}
              onCancel={() => setEditingTask(null)}
              onSubmit={(data) => updateTaskMutation.mutate({ id: editingTask.id, data })}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showNewTaskForm} onOpenChange={setShowNewTaskForm}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
          </DialogHeader>
          <TaskForm
            initial={{ date: today }}
            onCancel={() => setShowNewTaskForm(false)}
            onSubmit={(data) => createTaskMutation.mutate(data)}
          />
        </DialogContent>
      </Dialog>

      <VoiceCaptureButton />
    </div>
  );
}
