import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { fortalezaDateKey } from '@/lib/dates';
import { userKeyOf } from '@/lib/pendingIntent';
import { changeTaskStatus } from '@/lib/taskStatus';
import { isTaskDone } from '@/lib/tasks';

/** Marcar/reabrir tarefa do mesmo jeito em qualquer tela. `onSettled` roda ao fim de cada tentativa. */
export function useTaskStatus({ onSettled } = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userKey = userKeyOf(user);

  const setStatus = useCallback(
    async (task, nextStatus) => {
      const outcome = await changeTaskStatus({
        queryClient,
        task,
        nextStatus,
        today: fortalezaDateKey(),
        userKey,
      });
      if (outcome.kind !== 'ignored') onSettled?.(outcome);
      return outcome;
    },
    [queryClient, userKey, onSettled],
  );

  const toggle = useCallback(
    (task) => setStatus(task, isTaskDone(task) ? 'pending' : 'completed'),
    [setStatus],
  );

  return { setStatus, toggle };
}
