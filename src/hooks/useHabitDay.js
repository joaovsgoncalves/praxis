import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { praxisApi } from '@/api/praxisClient';
import { failureMessage } from '@/lib/apiFailure';
import { hapticLight } from '@/lib/haptics';
import { dispatchPraxisLevelUpFromResponse } from '@/lib/praxisLevelUp';
import {
  SKIPPED_PLAN,
  applyPlanToHabitList,
  applyPlanToLogs,
  findHabitInLists,
  planHabitIncrement,
  planHabitToggle,
} from '@/lib/habitDay';

const HABIT_LIST_KEYS = ['habits', 'allHabits'];

/**
 * Marcar, registrar quantidade, "Não rolou" e desfazer um hábito do mesmo jeito no Hoje e na aba.
 * A tela muda na hora a partir da meta do próprio hábito e volta ao que era se a API recusar.
 */
export function useHabitDay({ today, habitLogs = [], onSettled, onSkipSuccess } = {}) {
  const queryClient = useQueryClient();

  const cachedHabitLists = () =>
    HABIT_LIST_KEYS.flatMap((key) => queryClient.getQueriesData({ queryKey: [key] }).map(([, data]) => data));

  const snapshot = async () => {
    await Promise.all(
      ['habitLogs', ...HABIT_LIST_KEYS].map((key) => queryClient.cancelQueries({ queryKey: [key] })),
    );
    return ['habitLogs', ...HABIT_LIST_KEYS].flatMap((key) => queryClient.getQueriesData({ queryKey: [key] }));
  };

  const applyPlan = (habitId, plan, extra) => {
    queryClient.setQueriesData({ queryKey: ['habitLogs'] }, (old) =>
      applyPlanToLogs(old, { habitId, date: today, plan, tempId: `temp-${Date.now()}`, extra }),
    );
    for (const key of HABIT_LIST_KEYS) {
      queryClient.setQueriesData({ queryKey: [key] }, (old) => applyPlanToHabitList(old, habitId, plan));
    }
  };

  const rollback = (previous, err, fallback) => {
    previous?.forEach(([key, value]) => queryClient.setQueryData(key, value));
    // A API explica a recusa de quantidade inválida; as outras causas têm mensagem própria.
    const refused = err?.status === 400 && typeof err?.data?.error === 'string' ? err.data.error : null;
    toast.error(refused || failureMessage(err, fallback));
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['habitLogs'] });
    for (const key of HABIT_LIST_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
    queryClient.invalidateQueries({ queryKey: ['gamification'] });
    onSettled?.();
  };

  const toggleHabit = useMutation({
    mutationFn: async ({ habitId, isDone, value }) => {
      if (isDone) {
        // Quem não tem a lista de registros na tela (rotinas) pergunta à API qual apagar.
        const realLog =
          habitLogs.find(
            (log) => log.habit_id === habitId && log.date === today && log.id && !String(log.id).startsWith('temp-'),
          ) || (await praxisApi.habitLogs.list({ habit_id: habitId, date: today }))?.[0];
        if (realLog?.id) await praxisApi.habitLogs.delete(realLog.id);
        return null;
      }
      return praxisApi.habitLogs.create({
        habit_id: habitId,
        date: today,
        outcome: 'done',
        completed: true,
        ...(value !== undefined ? { value } : {}),
      });
    },
    onMutate: async ({ habitId, isDone, value }) => {
      const previous = await snapshot();
      const habit = findHabitInLists(cachedHabitLists(), habitId);
      const plan = planHabitToggle({ habit, isDone, value });
      if (plan.completed) hapticLight();
      applyPlan(habitId, plan);
      return { previous };
    },
    onError: (err, _vars, context) => rollback(context?.previous, err, 'Não deu para atualizar o hábito. Tente de novo.'),
    onSuccess: (data) => dispatchPraxisLevelUpFromResponse(data),
    onSettled: refresh,
  });

  const quickIncrementHabit = useMutation({
    mutationFn: ({ habit, increment }) =>
      praxisApi.habitLogs.create({
        habit_id: habit.id,
        date: today,
        increment: increment ?? habit.quick_increment ?? 0.5,
      }),
    onMutate: async ({ habit, increment }) => {
      const previous = await snapshot();
      const currentLog = habitLogs.find((log) => log.habit_id === habit.id && log.date === today);
      const plan = planHabitIncrement({ habit, currentValue: currentLog?.value ?? habit.value_today, increment });
      if (plan.completed) hapticLight();
      applyPlan(habit.id, plan);
      return { previous };
    },
    onError: (err, _vars, context) => rollback(context?.previous, err, 'Não deu para registrar. Tente de novo.'),
    onSuccess: (data) => dispatchPraxisLevelUpFromResponse(data),
    onSettled: refresh,
  });

  const skipHabit = useMutation({
    mutationFn: ({ habitId, skipReason, skipNote }) =>
      praxisApi.habitLogs.create({
        habit_id: habitId,
        date: today,
        outcome: 'skipped',
        ...(skipReason ? { skip_reason: skipReason } : {}),
        ...(skipNote ? { note: skipNote } : {}),
      }),
    onMutate: async ({ habitId, skipReason, skipNote }) => {
      const previous = await snapshot();
      applyPlan(habitId, SKIPPED_PLAN, { skip_reason: skipReason || null, note: skipNote || null });
      return { previous };
    },
    onError: (err, _vars, context) => rollback(context?.previous, err, 'Não deu para registrar. Tente de novo.'),
    onSuccess: () => onSkipSuccess?.(),
    onSettled: refresh,
  });

  return { toggleHabit, quickIncrementHabit, skipHabit };
}
