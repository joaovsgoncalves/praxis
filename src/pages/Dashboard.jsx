import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { praxisApi } from "@/api/praxisClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DayStrip from "@/components/dashboard/DayStrip";
import NowBlock from "@/components/dashboard/NowBlock";
import DayTrack from "@/components/dashboard/DayTrack";
import TodayHabits from "@/components/dashboard/TodayHabits";
import DayBento from "@/components/dashboard/DayBento";
import WeekDots, { WEEK_DOTS_QUERY_KEY } from "@/components/dashboard/WeekDots";
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
import { hapticLight } from "@/lib/haptics";
import { useTimeOfDay } from "@/hooks/useTimeOfDay";
import { isHabitDueOnDate } from "@/lib/habits";
import { dispatchPraxisLevelUpFromResponse } from "@/lib/praxisLevelUp";
import { notifyPraxisRecurrenceSpawned } from "@/lib/praxisRecurrenceToast";
import { isTaskCompletedForToday, isTaskDone, isTaskOpen, cleanPriorityPrefix } from "@/lib/tasks";
import { addDaysToDateKey, sortTasksForList } from "@/lib/taskListFilters";
import SuggestedGoalCard from "@/components/dashboard/SuggestedGoalCard";
import { toast } from "sonner";

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
  const [habitPendingDelete, setHabitPendingDelete] = React.useState(null);
  const [editingHabit, setEditingHabit] = React.useState(null);

  // A semana em 7 pontos conta tarefas e hábitos: muda junto com eles.
  const invalidateWeek = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [WEEK_DOTS_QUERY_KEY] });
  }, [queryClient]);

  const invalidateTaskQueries = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboardTasks"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["allTasks"] });
    queryClient.invalidateQueries({ queryKey: ["pendingTasks"] });
    queryClient.invalidateQueries({ queryKey: ["gamification"] });
    invalidateWeek();
  }, [queryClient, invalidateWeek]);

  const toggleTaskMutation = useMutation({
    mutationFn: (task) => {
      const newStatus = isTaskDone(task) ? "pending" : "completed";
      return praxisApi.tasks.update(task.id, { status: newStatus });
    },
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: ["dashboardTasks"] });
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      await queryClient.cancelQueries({ queryKey: ["allTasks"] });

      const prevDashboard = queryClient.getQueriesData({ queryKey: ["dashboardTasks"] });
      const prevTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });
      const prevAllTasks = queryClient.getQueriesData({ queryKey: ["allTasks"] });

      const nextStatus = isTaskDone(task) ? "pending" : "completed";
      const updateList = (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: nextStatus,
                completed_date: nextStatus === "completed" ? today : null,
                completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
              }
            : t
        );
      };

      queryClient.setQueriesData({ queryKey: ["dashboardTasks"] }, updateList);
      queryClient.setQueriesData({ queryKey: ["tasks"] }, updateList);
      queryClient.setQueriesData({ queryKey: ["allTasks"] }, updateList);

      return { prevDashboard, prevTasks, prevAllTasks };
    },
    onError: (_err, _task, context) => {
      context?.prevDashboard?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      toast.error("Erro ao atualizar tarefa");
    },
    onSuccess: (updated) => {
      dispatchPraxisLevelUpFromResponse(updated);
      notifyPraxisRecurrenceSpawned(updated);
    },
    onSettled: () => {
      invalidateTaskQueries();
    },
  });

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
    onError: (_err, _vars, context) => {
      context?.prevDashboard?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      toast.error("Erro ao atualizar tarefa");
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
    onError: (_err, _id, context) => {
      context?.prevDashboard?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllTasks?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      toast.error("Erro ao excluir tarefa");
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

  const toggleHabitMutation = useMutation({
    mutationFn: async ({ habitId, isDone, value }) => {
      const logs = habitLogs.filter((l) => l.habit_id === habitId && l.date === today);
      const realLog = logs.find((l) => l.id && !String(l.id).startsWith("temp-"));
      if (isDone && realLog) {
        await praxisApi.habitLogs.delete(realLog.id);
      } else if (!isDone) {
        await praxisApi.habitLogs.create({
          habit_id: habitId,
          date: today,
          outcome: "done",
          completed: true,
          ...(value !== undefined ? { value } : {}),
        });
      }
    },
    onMutate: async ({ habitId, isDone, value }) => {
      await queryClient.cancelQueries({ queryKey: ["habitLogs"] });
      await queryClient.cancelQueries({ queryKey: ["habits"] });
      await queryClient.cancelQueries({ queryKey: ["allHabits"] });

      const prevLogs = queryClient.getQueriesData({ queryKey: ["habitLogs"] });
      const prevHabits = queryClient.getQueriesData({ queryKey: ["habits"] });
      const prevAllHabits = queryClient.getQueriesData({ queryKey: ["allHabits"] });

      const allActive = queryClient.getQueryData(["habits", "active", today]) || [];
      const targetHabit = allActive.find((h) => h.id === habitId);
      const targetVal = Number(targetHabit?.target_value) || 0;
      const isCompleted = isDone ? false : (value !== undefined && targetVal > 0 ? value >= targetVal : true);

      if (!isDone && isCompleted) hapticLight();

      queryClient.setQueriesData({ queryKey: ["habitLogs"] }, (old) => {
        if (!Array.isArray(old)) return old;
        if (isDone) {
          return old.filter((l) => !(l.habit_id === habitId && l.date === today));
        }
        const filtered = old.filter((l) => !(l.habit_id === habitId && l.date === today));
        return [
          ...filtered,
          {
            id: `temp-${Date.now()}`,
            habit_id: habitId,
            date: today,
            outcome: isCompleted ? "done" : null,
            completed: isCompleted ? 1 : 0,
            value: isDone ? null : (value !== undefined ? value : (targetVal > 0 ? targetVal : null)),
          },
        ];
      });

      const updateHabitItems = (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((h) => {
          if (h.id === habitId) {
            return {
              ...h,
              value_today: isDone ? null : (value !== undefined ? value : (targetVal > 0 ? targetVal : null)),
              completed_today: isCompleted,
              skipped_today: false,
              day_outcome: isDone ? "open" : (isCompleted ? "done" : "open"),
            };
          }
          if (h.children && Array.isArray(h.children)) {
            return {
              ...h,
              children: h.children.map((child) =>
                child.id === habitId
                  ? {
                      ...child,
                      value_today: isDone ? null : (value !== undefined ? value : (targetVal > 0 ? targetVal : null)),
                      completed_today: isCompleted,
                      skipped_today: false,
                      day_outcome: isDone ? "open" : (isCompleted ? "done" : "open"),
                    }
                  : child
              ),
            };
          }
          return h;
        });
      };

      queryClient.setQueriesData({ queryKey: ["habits"] }, updateHabitItems);
      queryClient.setQueriesData({ queryKey: ["allHabits"] }, updateHabitItems);

      return { prevLogs, prevHabits, prevAllHabits };
    },
    onError: (_err, _vars, context) => {
      context?.prevLogs?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevHabits?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllHabits?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      toast.error("Erro ao atualizar hábito");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["habitLogs"] });
      queryClient.invalidateQueries({ queryKey: ["gamification"] });
      invalidateWeek();
    },
  });

  const quickIncrementMutation = useMutation({
    mutationFn: async ({ habit, increment }) => {
      return praxisApi.habitLogs.create({
        habit_id: habit.id,
        date: today,
        increment: increment ?? habit.quick_increment ?? 0.5,
      });
    },
    onMutate: async ({ habit, increment }) => {
      await queryClient.cancelQueries({ queryKey: ["habitLogs"] });
      await queryClient.cancelQueries({ queryKey: ["habits"] });
      await queryClient.cancelQueries({ queryKey: ["allHabits"] });

      const prevLogs = queryClient.getQueriesData({ queryKey: ["habitLogs"] });
      const prevHabits = queryClient.getQueriesData({ queryKey: ["habits"] });
      const prevAllHabits = queryClient.getQueriesData({ queryKey: ["allHabits"] });

      const currentLog = habitLogs.find((l) => l.habit_id === habit.id && l.date === today);
      const prevVal = (currentLog && currentLog.value != null && Number.isFinite(Number(currentLog.value)))
        ? Number(currentLog.value)
        : 0;
      const inc = Number(increment ?? habit.quick_increment ?? 0.5);
      const nextVal = Math.round((prevVal + inc) * 1000) / 1000;
      const target = Number(habit.target_value) || 0;
      const willBeDone = target > 0 && nextVal >= target;

      if (willBeDone) hapticLight();

      queryClient.setQueriesData({ queryKey: ["habitLogs"] }, (old) => {
        if (!Array.isArray(old)) return old;
        const filtered = old.filter((l) => !(l.habit_id === habit.id && l.date === today));
        return [
          ...filtered,
          {
            id: currentLog?.id || `temp-${Date.now()}`,
            habit_id: habit.id,
            date: today,
            outcome: willBeDone ? "done" : null,
            completed: willBeDone ? 1 : 0,
            value: nextVal,
          },
        ];
      });

      const updateHabitItems = (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((h) => {
          if (h.id === habit.id) {
            return {
              ...h,
              value_today: nextVal,
              completed_today: willBeDone,
              skipped_today: false,
              day_outcome: willBeDone ? "done" : "open",
            };
          }
          if (h.children && Array.isArray(h.children)) {
            return {
              ...h,
              children: h.children.map((child) =>
                child.id === habit.id
                  ? {
                      ...child,
                      value_today: nextVal,
                      completed_today: willBeDone,
                      skipped_today: false,
                      day_outcome: willBeDone ? "done" : "open",
                    }
                  : child
              ),
            };
          }
          return h;
        });
      };

      queryClient.setQueriesData({ queryKey: ["habits"] }, updateHabitItems);
      queryClient.setQueriesData({ queryKey: ["allHabits"] }, updateHabitItems);

      return { prevLogs, prevHabits, prevAllHabits };
    },
    onError: (_err, _vars, context) => {
      context?.prevLogs?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevHabits?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllHabits?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      toast.error("Erro ao registrar incremento");
    },
    onSuccess: (data) => {
      dispatchPraxisLevelUpFromResponse(data);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["habitLogs"] });
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: ["allHabits"] });
      queryClient.invalidateQueries({ queryKey: ["gamification"] });
      invalidateWeek();
    },
  });

  const skipHabitMutation = useMutation({
    mutationFn: async ({ habitId, skipReason, skipNote }) => {
      await praxisApi.habitLogs.create({
        habit_id: habitId,
        date: today,
        outcome: "skipped",
        ...(skipReason ? { skip_reason: skipReason } : {}),
        ...(skipNote ? { note: skipNote } : {}),
      });
    },
    onMutate: async ({ habitId, skipReason, skipNote }) => {
      await queryClient.cancelQueries({ queryKey: ["habitLogs"] });
      await queryClient.cancelQueries({ queryKey: ["habits"] });
      await queryClient.cancelQueries({ queryKey: ["allHabits"] });

      const prevLogs = queryClient.getQueriesData({ queryKey: ["habitLogs"] });
      const prevHabits = queryClient.getQueriesData({ queryKey: ["habits"] });
      const prevAllHabits = queryClient.getQueriesData({ queryKey: ["allHabits"] });

      queryClient.setQueriesData({ queryKey: ["habitLogs"] }, (old) => {
        if (!Array.isArray(old)) return old;
        const filtered = old.filter((l) => !(l.habit_id === habitId && l.date === today));
        return [
          ...filtered,
          {
            id: `temp-${Date.now()}`,
            habit_id: habitId,
            date: today,
            outcome: "skipped",
            skip_reason: skipReason || null,
            note: skipNote || null,
            completed: false,
          },
        ];
      });

      const updateHabitItems = (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((h) => {
          if (h.id === habitId) {
            return {
              ...h,
              completed_today: false,
              skipped_today: true,
              day_outcome: "skipped",
            };
          }
          if (h.children && Array.isArray(h.children)) {
            return {
              ...h,
              children: h.children.map((child) =>
                child.id === habitId
                  ? {
                      ...child,
                      completed_today: false,
                      skipped_today: true,
                      day_outcome: "skipped",
                    }
                  : child
              ),
            };
          }
          return h;
        });
      };

      queryClient.setQueriesData({ queryKey: ["habits"] }, updateHabitItems);
      queryClient.setQueriesData({ queryKey: ["allHabits"] }, updateHabitItems);

      return { prevLogs, prevHabits, prevAllHabits };
    },
    onError: (_err, _vars, context) => {
      context?.prevLogs?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevHabits?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllHabits?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      toast.error("Erro ao registrar");
    },
    onSuccess: () => {
      toast("Não rolou — registrado.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["habitLogs"] });
      invalidateWeek();
    },
  });

  const deleteHabitMutation = useMutation({
    mutationFn: (id) => praxisApi.habits.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["habits"] });
      await queryClient.cancelQueries({ queryKey: ["allHabits"] });
      await queryClient.cancelQueries({ queryKey: ["habitLogs"] });

      const prevHabits = queryClient.getQueriesData({ queryKey: ["habits"] });
      const prevAllHabits = queryClient.getQueriesData({ queryKey: ["allHabits"] });
      const prevLogs = queryClient.getQueriesData({ queryKey: ["habitLogs"] });

      const filterHabitList = (old) => {
        if (!Array.isArray(old)) return old;
        return old
          .filter((h) => h.id !== id)
          .map((h) => ({
            ...h,
            children: Array.isArray(h.children)
              ? h.children.filter((c) => c.id !== id)
              : h.children,
          }));
      };

      queryClient.setQueriesData({ queryKey: ["habits"] }, filterHabitList);
      queryClient.setQueriesData({ queryKey: ["allHabits"] }, filterHabitList);
      queryClient.setQueriesData({ queryKey: ["habitLogs"] }, (old) =>
        Array.isArray(old) ? old.filter((l) => l.habit_id !== id) : old
      );

      return { prevHabits, prevAllHabits, prevLogs };
    },
    onError: (_err, _id, context) => {
      context?.prevHabits?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevAllHabits?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      context?.prevLogs?.forEach(([key, val]) => queryClient.setQueryData(key, val));
      toast.error("Erro ao excluir hábito");
    },
    onSuccess: () => {
      toast.success("Hábito excluído");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: ["allHabits"] });
      queryClient.invalidateQueries({ queryKey: ["habitLogs"] });
      invalidateWeek();
    },
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
    // Mesma silhueta do Hoje (e do fallback da rota): faixa, agora, trilha, hábitos; no xl, o bento.
    return <DashboardSkeleton />;
  }

  return (
    <div
      className="praxis-page praxis-dashboard flex flex-col gap-4 space-y-0 sm:gap-5"
      data-reveal={revealOnce ? "once" : undefined}
    >
      {/* OfflineBanner vive no AppLayout — vale para todas as abas, não só o Hoje. */}
      <PwaInstallBanner />

      <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-6">
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
              onComplete={(t) => toggleTaskMutation.mutate(t)}
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
              onToggleComplete={(t) => toggleTaskMutation.mutate(t)}
              onEditTask={setEditingTask}
              onDeleteTask={setTaskPendingDelete}
              onNotToday={(t) => notTodayTaskMutation.mutate(t.id)}
              notTodayBusy={notTodayTaskMutation.isPending}
              onSnooze15={handleSnooze15}
            />
          </div>

          <div className="praxis-dashboard-reveal" style={{ "--praxis-reveal-delay": "90ms" }}>
            <TodayHabits
              today={today}
              clock={clock}
              habits={standaloneHabitsDueToday}
              compounds={compoundHabits}
              sinceHabits={sinceHabits}
              summaryHabits={essentialHabits}
              habitLogs={habitLogs}
              onToggleHabit={(habitId, isDone, value) => toggleHabitMutation.mutate({ habitId, isDone, value })}
              onQuickIncrement={(habit, inc) => quickIncrementMutation.mutateAsync({ habit, increment: inc })}
              onSkipHabit={(habitId, skipReason, skipNote) =>
                skipHabitMutation.mutate({ habitId, skipReason, skipNote })
              }
              onEditHabit={setEditingHabit}
              onDeleteHabit={setHabitPendingDelete}
            />
          </div>
        </div>

        {/* Dia em um olhar: fixa no xl; se passar da tela, rola por dentro. */}
        <aside
          className="praxis-dashboard-reveal praxis-hide-scrollbar min-w-0 space-y-3 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto"
          style={{ "--praxis-reveal-delay": "120ms" }}
          aria-labelledby="day-glance-title"
          data-testid="day-glance"
        >
          {/* No celular os cards se explicam sozinhos; o título só aparece na coluna do xl. */}
          <SectionHeader
            className="hidden xl:block"
            title={<span id="day-glance-title">Dia em um olhar</span>}
            icon={LayoutGrid}
            iconClassName="text-domain-gold"
          />
          <DayBento
            today={today}
            clock={clock}
            todayCheck={todayCheck}
            onSaveWellness={(d) => saveWellnessMutation.mutateAsync(d)}
          />
          <WeekDots today={today} />
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

      <AlertDialog
        open={Boolean(habitPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setHabitPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir hábito?</AlertDialogTitle>
            <AlertDialogDescription>
              {habitPendingDelete && (
                <>
                  "{cleanPriorityPrefix(habitPendingDelete.title)}" será excluído permanentemente, junto com todos
                  os check-ins e o histórico de streak. Isso não pode ser desfeito.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                if (habitPendingDelete) deleteHabitMutation.mutate(habitPendingDelete.id);
                setHabitPendingDelete(null);
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
