import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { praxisApi } from '@/api/praxisClient';
import { useAuth } from '@/lib/AuthContext';
import { classifyFailure } from '@/lib/apiFailure';
import { clearPendingIntent, readPendingIntent, userKeyOf } from '@/lib/pendingIntent';
import { cleanPriorityPrefix, isTaskDone } from '@/lib/tasks';
import { useTaskStatus } from '@/hooks/useTaskStatus';

/**
 * Volta do login depois de sessão perdida: se havia um toque de concluir/reabrir no ar,
 * relê a tarefa no servidor e pergunta. Nada é aplicado sozinho, nem para outra conta.
 */
export default function PendingIntentPrompt() {
  const { user } = useAuth();
  const { setStatus } = useTaskStatus();
  const [pending, setPending] = useState(null);
  const userKey = userKeyOf(user);

  useEffect(() => {
    const intent = readPendingIntent();
    if (!intent) return undefined;
    if (intent.userKey && intent.userKey !== userKey) {
      clearPendingIntent();
      return undefined;
    }
    let cancelled = false;
    const wantDone = intent.nextStatus === 'completed';
    praxisApi.tasks
      .getFresh(intent.taskId)
      .then((task) => {
        if (cancelled) return;
        const title = cleanPriorityPrefix(task.title || intent.title);
        if (task.status === 'cancelled') {
          clearPendingIntent();
          toast.message(`"${title}" foi arquivada. Nada foi alterado.`);
        } else if (isTaskDone(task) === wantDone) {
          clearPendingIntent();
          toast.success(wantDone ? `"${title}" já está concluída.` : `"${title}" já está aberta.`);
        } else {
          setPending({ intent, task, title });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const kind = classifyFailure(err);
        if (kind === 'session') return; // caiu de novo: a intenção continua guardada
        clearPendingIntent();
        if (kind === 'not_found') toast.error(`A tarefa "${intent.title}" não existe mais.`);
        else toast.error(`Não consegui conferir a tarefa "${intent.title}". Ela não foi alterada.`);
      });
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  if (!pending) return null;
  const wantDone = pending.intent.nextStatus === 'completed';

  const dismiss = () => {
    clearPendingIntent();
    setPending(null);
  };
  const confirm = () => {
    const { task, intent } = pending;
    dismiss();
    setStatus(task, intent.nextStatus);
  };

  return (
    <AlertDialog open onOpenChange={(open) => (!open ? dismiss() : null)}>
      <AlertDialogContent data-testid="pending-intent-prompt">
        <AlertDialogHeader>
          <AlertDialogTitle>Continuar de onde parou?</AlertDialogTitle>
          <AlertDialogDescription>
            {wantDone
              ? `Você ia concluir "${pending.title}" quando a sessão terminou. Ela continua pendente.`
              : `Você ia reabrir "${pending.title}" quando a sessão terminou. Ela continua concluída.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Deixar como está</AlertDialogCancel>
          <AlertDialogAction onClick={confirm}>{wantDone ? 'Concluir agora' : 'Reabrir agora'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
