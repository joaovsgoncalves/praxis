import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { praxisApi } from "@/api/praxisClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DayStrip from "@/components/dashboard/DayStrip";
import NowBlock from "@/components/dashboard/NowBlock";
import DayTrack from "@/components/dashboard/DayTrack";
import HabitsGlance from "@/components/dashboard/HabitsGlance";
import ToolsPanel from "@/components/dashboard/ToolsPanel";
import WeekPanel, { WEEK_QUERY_KEY } from "@/components/dashboard/WeekPanel";
import XpProgressStrip from "@/components/dashboard/XpProgressStrip";
import WeeklyReviewPrompt from "@/components/dashboard/WeeklyReviewPrompt";
import AvoidanceWidget from "@/components/dashboard/AvoidanceWidget";
import PwaInstallBanner from "@/components/shared/PwaInstallBanner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { SectionHeader } from "@/components/layout/PraxisPage";
import { DashboardSkeleton } from "@/components/layout/PageSkeletons";
import { markDashboardRevealed, shouldRevealDashboard } from "@/lib/dashboardReveal";
import TaskForm from "@/components/habits-tasks/TaskForm";
import HabitForm from "@/components/habits-tasks/HabitForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fortalezaDateKey, buildSnooze15Update, buildSnoozeTomorrowUpdate } from "@/lib/dates";
import { planNowTasks } from "@/lib/nowTask";
import { computeDayLeft } from "@/lib/dayLeft";
import { useTimeOfDay } from "@/hooks/useTimeOfDay";
import { isHabitDueOnDate } from "@/lib/habits";
import { isTaskCompletedForToday, isTaskOpen, cleanPriorityPrefix } from "@/lib/tasks";
import { addDaysToDateKey, sortTasksForList } from "@/lib/taskListFilters";
import SuggestedGoalCard from "@/components/dashboard/SuggestedGoalCard";
import { toast } from "sonner";
import { useTaskStatus } from "@/hooks/useTaskStatus";
import { useHabitDay } from "@/hooks/useHabitDay";
import { useBusyTasks } from "@/lib/taskBusy";
import { reportTaskWriteFailure } from "@/lib/taskStatus";

export default function Dashboard() {
  // Entrada animada só na primeira visita da sessão; nas seguintes o Hoje aparece direto.
  const [revealOnce] = useState(shouldRevealDashboard);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const today = fortalezaDateKey();
  const { greeting, clock } = useTimeOfDay();

  useEffect(() => {
    if (searchParams.get("from") === "capture") {
      navigate("/captura", { replace: true });
    }
  }, [searchParams, navigate]);

  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["dashboardTasks", today],
    queryFn: () => praxisApi.tasks.list({ limit: 50, include_overdue: "1", today }),
  });

  const tasks = React.useMemo(() => {
    return allTasks
      .filter((task) => {
        if (task.status === "cancelled") return false;
        if (isTaskOpen(task)) {
          const d = (task.date || "").slice(0, 10);
          if (!d) return false;
          return d <= today;
        }
        return isTaskCompletedForToday(task, today);
      })
      .sort((a, b) => sortTasksForList(a, b, today));
  }, [allTasks, today]);

  const { data: habits = [], isLoading: isLoadingHabits } = useQuery({
    queryKey: ["habits", today],
    queryFn: () => praxisApi.habits.list({ status: "active", date: today }),
  });

  const { data: habitLogs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ["habitLogs", today],
    queryFn: () => praxisApi.habitLogs.list({ date: today }),
  });

  const { data: wellnessChecks = [], isLoading: isLoadingWellness } = useQuery({
    queryKey: ["wellness", today],
    queryFn: () => praxisApi.wellness.list({ date: today }),
  });

  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["userSettings"],
    queryFn: () => praxisApi.user.getSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const todayCheck = wellnessChecks[0] || null;
  const [editingTask, setEditingTask] = React.useState(null);
  const [showNewTaskForm, setShowNewTaskForm] = React.useState(false);
  const [taskPendingDelete, setTaskPendingDelete] = React.useState(null);
  const [editingHabit, setEditingHabit] = React.useState(null);

  // A semana em barras conta tarefas e hábitos: muda junto com eles.
  const invalidateWeek = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [WEEK_QUERY_KEY] });
  }, [queryClient]);

  const invalidateTaskQueries = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboardTasks"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["allTasks"] });
    queryClient.invalidateQueries({ queryKey: ["pendingTasks"] });
    queryClient.invalidateQueries({ queryKey: ["gamification"] });
    invalidateWeek();
  }, [queryClient, invalidateWeek]);

  // Marcar/reabrir: caminho único (sessão, rede, item ocupado) em src/lib/taskStatus.js.
  const { toggle: toggleTaskStatus } = useTaskStatus({ onSettled: invalidateWeek });
  const busyTasks = useBusyTasks();

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => praxisApi.tasks.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["dashboardTasks"] });
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      await queryClient.cancelQueries({ queryKey: ["allTasks"] });

      const prevDashboard = queryClient.getQueriesData({ queryKey: ["dashboardTasks"] });
      const prevTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });
      const prevAllTasks = queryClient.getQueriesData({ queryKey: ["allTasks"] });

      const updateList = (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((t) => (t.id === id ? { ...t, ...data } : t));
      };

      queryClient.setQueriesData({ queryKey: ["dashboardTasks"] }, updateList);
      queryClient.setQueriesData({ queryKey: ["tasks"] }, updateList);
      queryClient.setQueriesData({ queryKey: ["allTasks"] }, updateList);

      return { prevDashboard, prevTasks, prevAllTasks };
    },
    onError: (err, _vars, context) => {
      context?.prevDashboard?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      reportTaskWriteFailure(err, { fallback: "Não deu para atualizar a tarefa. Tente de novo." });
    },
    onSuccess: () => {
      setEditingTask(null);
    },
    onSettled: () => {
      invalidateTaskQueries();
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => praxisApi.tasks.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["dashboardTasks"] });
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      await queryClient.cancelQueries({ queryKey: ["allTasks"] });

      const prevDashboard = queryClient.getQueriesData({ queryKey: ["dashboardTasks"] });
      const prevTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });
      const prevAllTasks = queryClient.getQueriesData({ queryKey: ["allTasks"] });

      const filterList = (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((t) => t.id !== id);
      };

      queryClient.setQueriesData({ queryKey: ["dashboardTasks"] }, filterList);
      queryClient.setQueriesData({ queryKey: ["tasks"] }, filterList);
      queryClient.setQueriesData({ queryKey: ["allTasks"] }, filterList);

      return { prevDashboard, prevTasks, prevAllTasks };
    },
    onError: (err, _id, context) => {
      context?.prevDashboard?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      reportTaskWriteFailure(err, { fallback: "Não deu para excluir a tarefa. Tente de novo." });
    },
    onSuccess: () => {
      toast.success("Tarefa excluída");
    },
    onSettled: () => {
      invalidateTaskQueries();
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (data) => praxisApi.tasks.create({ ...data, date: data.date || today }),
    onSuccess: () => {
      invalidateTaskQueries();
      setShowNewTaskForm(false);
    },
  });

  const {
    toggleHabit: toggleHabitMutation,
    quickIncrementHabit: quickIncrementMutation,
    skipHabit: skipHabitMutation,
  } = useHabitDay({
    today,
    habitLogs,
    onSettled: invalidateWeek,
    onSkipSuccess: () => toast("Não rolou — registrado."),
  });

  const updateHabitMutation = useMutation({
    mutationFn: ({ id, data }) => praxisApi.habits.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: ["allHabits"] });
      queryClient.invalidateQueries({ queryKey: ["goalHabits"] });
      invalidateWeek();
      setEditingHabit(null);
    },
    onError: () => toast.error("Não deu pra salvar o hábito."),
  });

  const notTodayTaskMutation = useMutation({
    mutationFn: (taskId) => praxisApi.tasks.notToday(taskId, {}),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ["dashboardTasks"] });
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      await queryClient.cancelQueries({ queryKey: ["allTasks"] });

      const prevDashboard = queryClient.getQueriesData({ queryKey: ["dashboardTasks"] });
      const prevTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });
      const prevAllTasks = queryClient.getQueriesData({ queryKey: ["allTasks"] });

      const updateList = (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "pending",
                date: addDaysToDateKey(today, 1),
                day_outcome: "not_today",
                day_outcome_date: today,
              }
            : t
        );
      };

      queryClient.setQueriesData({ queryKey: ["dashboardTasks"] }, updateList);
      queryClient.setQueriesData({ queryKey: ["tasks"] }, updateList);
      queryClient.setQueriesData({ queryKey: ["allTasks"] }, updateList);

      return { prevDashboard, prevTasks, prevAllTasks };
    },
    onError: (_err, _taskId, context) => {
      context?.prevDashboard?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      toast.error("Erro ao adiar tarefa");
    },
    onSuccess: () => {
      toast("Beleza — fica pra amanhã.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["allTasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardTasks"] });
      invalidateWeek();
    },
  });

  const saveWellnessMutation = useMutation({
    mutationFn: async (data) => praxisApi.wellness.create({ ...data, date: today }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wellness"] }),
  });

  // O relógio da faixa também move o Agora (atualiza a cada 30 s).
  const nowPlan = React.useMemo(() => planNowTasks(allTasks, today, clock), [allTasks, today, clock]);

  const compoundHabits = React.useMemo(
    () => habits.filter((habit) => habit.kind === "compound"),
    [habits],
  );

  const sinceHabits = React.useMemo(
    () => habits.filter((habit) => habit.tracking_mode === "since" && habit.status === "active"),
    [habits],
  );

  const standaloneHabits = React.useMemo(
    () => habits.filter((habit) => habit.kind !== "compound" && habit.tracking_mode !== "since"),
    [habits],
  );

  // O resumo conta apenas folhas: simples avulsos + passos das rotinas.
  const standaloneHabitsDueToday = React.useMemo(
    () => standaloneHabits
      .filter((h) => isHabitDueOnDate(h, today))
      .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
    [standaloneHabits, today],
  );

  const essentialHabits = React.useMemo(
    () => [
      ...standaloneHabitsDueToday,
      ...compoundHabits.flatMap((compound) =>
        (compound.children || []).filter((habit) => isHabitDueOnDate(habit, today))
      ),
    ],
    [compoundHabits, standaloneHabitsDueToday, today],
  );

  const dayLeft = computeDayLeft({ tasks, habits: essentialHabits, habitLogs, today });

  const handleSnooze15 = (task) => {
    const data = buildSnooze15Update(task, today);
    updateTaskMutation.mutate({ id: task.id, data });
  };

  const handleSnoozeTomorrow = (task) => {
    const data = buildSnoozeTomorrowUpdate(task, today);
    updateTaskMutation.mutate({ id: task.id, data });
  };

  const isInitialLoading =
    (isLoadingTasks && allTasks.length === 0) ||
    (isLoadingHabits && habits.length === 0) ||
    (isLoadingLogs && habitLogs.length === 0 && habits.length === 0) ||
    (isLoadingWellness && wellnessChecks.length === 0 && allTasks.length === 0) ||
    (isLoadingSettings && !settings && allTasks.length === 0);

  const showSkeleton = isInitialLoading && allTasks.length === 0 && habits.length === 0;

  useEffect(() => {
    if (!showSkeleton && revealOnce) markDashboardRevealed();
  }, [showSkeleton, revealOnce]);

  if (showSkeleton) {
    // Mesma silhueta do Hoje (e do fallback da rota): faixa, agora, trilha, hábitos; ferramentas e semana.
    return <DashboardSkeleton />;
  }

  return (
    <div
      className="praxis-page praxis-dashboard flex flex-col gap-4 space-y-0 sm:gap-5"
      data-reveal={revealOnce ? "once" : undefined}
    >
      {/* OfflineBanner vive no AppLayout — vale para todas as abas, não só o Hoje. */}
      <PwaInstallBanner />

      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.6fr)] xl:gap-6">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <div className="praxis-dashboard-reveal" style={{ "--praxis-reveal-delay": "0ms" }}>
            <DayStrip
              greeting={greeting}
              clock={clock}
              userName={settings?.full_name}
              left={dayLeft.left}
              total={dayLeft.total}
            />
          </div>

          <div className="praxis-dashboard-reveal" style={{ "--praxis-reveal-delay": "30ms" }}>
            <NowBlock
              task={nowPlan.now}
              next={nowPlan.next}
              today={today}
              busy={Boolean(nowPlan.now && busyTasks.has(nowPlan.now.id))}
              onComplete={toggleTaskStatus}
              onSnooze15={handleSnooze15}
              onSnoozeTomorrow={handleSnoozeTomorrow}
              onAddTask={() => setShowNewTaskForm(true)}
            />
          </div>

          <div className="praxis-dashboard-reveal" style={{ "--praxis-reveal-delay": "60ms" }}>
            <DayTrack
              tasks={tasks}
              today={today}
              clock={clock}
              behind={nowPlan.behind}
              onToggleComplete={toggleTaskStatus}
              onEditTask={setEditingTask}
              onDeleteTask={setTaskPendingDelete}
              onNotToday={(t) => notTodayTaskMutation.mutate(t.id)}
              notTodayBusy={notTodayTaskMutation.isPending}
              onSnooze15={handleSnooze15}
            />
          </div>

          <div className="praxis-dashboard-reveal" style={{ "--praxis-reveal-delay": "90ms" }}>
            <HabitsGlance
              today={today}
              clock={clock}
              compounds={compoundHabits}
              habits={standaloneHabitsDueToday}
              sinceHabits={sinceHabits}
              habitLogs={habitLogs}
              onToggleHabit={(habitId, isDone, value) => toggleHabitMutation.mutate({ habitId, isDone, value })}
              onQuickIncrement={(habit, inc) => quickIncrementMutation.mutateAsync({ habit, increment: inc })}
              onSkipHabit={(habitId, skipReason, skipNote) =>
                skipHabitMutation.mutate({ habitId, skipReason, skipNote })
              }
              onEditHabit={setEditingHabit}
            />
          </div>
        </div>

        {/* Ferramentas: fixa no xl; se passar da tela, rola por dentro. */}
        <aside
          className="praxis-dashboard-reveal praxis-hide-scrollbar min-w-0 space-y-3 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto"
          style={{ "--praxis-reveal-delay": "120ms" }}
          aria-labelledby="tools-title"
          data-testid="day-tools"
        >
          <SectionHeader
            title={<span id="tools-title">Ferramentas</span>}
            icon={LayoutGrid}
            iconClassName="text-domain-gold"
          />
          <ToolsPanel
            today={today}
            clock={clock}
            todayCheck={todayCheck}
            onSaveWellness={(d) => saveWellnessMutation.mutateAsync(d)}
            focusGoalMinutes={settings?.focus_weekly_goal_minutes}
          />
          <WeekPanel today={today} />
        </aside>
      </div>

      <Collapsible
        defaultOpen={false}
        className="praxis-dashboard-reveal rounded-2xl border border-white/[0.055] bg-white/[0.018]"
        style={{ "--praxis-reveal-delay": "120ms" }}
      >
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="h-auto min-h-12 w-full justify-between rounded-2xl px-4 py-3 hover:bg-white/[0.025] sm:px-5">
            <span className="text-left text-sm font-medium">Sugestões e reflexão</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-55" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 px-3 pb-5 sm:px-4">
          {/* A rotina de abertura fica no card de rotinas — sem duplicar a manhã. */}
          <SuggestedGoalCard />
          <WeeklyReviewPrompt />
          <AvoidanceWidget />
        </CollapsibleContent>
      </Collapsible>

      <XpProgressStrip className="praxis-dashboard-reveal" />

      <Dialog
        open={Boolean(editingHabit)}
        onOpenChange={(open) => {
          if (!open) setEditingHabit(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar hábito</DialogTitle>
          </DialogHeader>
          {editingHabit && (
            <HabitForm
              key={editingHabit.id}
              initial={editingHabit}
              onSubmit={(data) => updateHabitMutation.mutate({ id: editingHabit.id, data })}
              onCancel={() => setEditingHabit(null)}
            />
          )}
        </DialogContent>
      </Dialog>

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

      <AlertDialog
        open={Boolean(taskPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setTaskPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              {taskPendingDelete && (
                <>
                  "{cleanPriorityPrefix(taskPendingDelete.title)}"
                  {taskPendingDelete.status === "pending" || taskPendingDelete.status === "in_progress"
                    ? " está aberta e será excluída."
                    : " será excluída."}{" "}
                  Isso não pode ser desfeito.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                if (taskPendingDelete) deleteTaskMutation.mutate(taskPendingDelete.id);
                setTaskPendingDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
