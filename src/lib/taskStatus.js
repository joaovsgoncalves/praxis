// Caminho único para marcar/reabrir tarefa, usado por Hoje, lista, quadro, detalhe e Foco.
// Não usa useMutation de propósito: sem rede o React Query deixa a mutação "pausada" depois
// de pintar o otimista, e a tela mostrava Concluída sem nada ter saído do aparelho.
import { toast } from 'sonner';
import { praxisApi } from '@/api/praxisClient';
import { classifyFailure, failureMessage } from '@/lib/apiFailure';
import { isSessionLost } from '@/lib/sessionGate';
import { savePendingIntent } from '@/lib/pendingIntent';
import { clearTaskBusy, getTaskBusy, setTaskBusy } from '@/lib/taskBusy';
import { cleanPriorityPrefix, isTaskDone } from '@/lib/tasks';
import { hapticLight } from '@/lib/haptics';
import { dispatchPraxisLevelUpFromResponse } from '@/lib/praxisLevelUp';
import { notifyPraxisRecurrenceSpawned } from '@/lib/praxisRecurrenceToast';

const LIST_KEYS = [['dashboardTasks'], ['tasks'], ['allTasks']];
const REFRESH_KEYS = [...LIST_KEYS, ['pendingTasks'], ['gamification']];
// Ao concluir, a lista se reorganiza e o segundo toque de um toque duplo cai no item vizinho.
const NEIGHBOR_GUARD_MS = 450;
const VERIFY_DELAYS_MS = [700, 2000, 4000];

let lastTap = { id: null, at: 0 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function patchTaskInCaches(queryClient, id, values) {
  const patchList = (old) =>
    Array.isArray(old) ? old.map((t) => (String(t.id) === String(id) ? { ...t, ...values } : t)) : old;
  LIST_KEYS.forEach((queryKey) => queryClient.setQueriesData({ queryKey }, patchList));
  queryClient.setQueryData(['task', String(id)], (old) => (old ? { ...old, ...values } : old));
}

export function refreshTaskQueries(queryClient) {
  REFRESH_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

/** A resposta se perdeu: pergunta ao servidor como a tarefa ficou. Cache antigo não vale. */
async function verifyTaskStatus(id, nextStatus) {
  for (const delay of VERIFY_DELAYS_MS) {
    await wait(delay);
    try {
      const task = await praxisApi.tasks.getFresh(id);
      const wantDone = nextStatus === 'completed';
      return { state: isTaskDone(task) === wantDone ? 'saved' : 'not_saved', task };
    } catch (err) {
      const kind = classifyFailure(err);
      if (kind === 'not_found') return { state: 'gone' };
      if (kind === 'session') return { state: 'session' };
      // offline/network/servidor: tenta de novo até acabar a paciência
    }
  }
  return { state: 'unknown' };
}

/**
 * @returns {Promise<{ ok: boolean, kind?: string, task?: object, error?: Error }>}
 * Nunca lança: a mensagem certa já foi mostrada aqui.
 */
export async function changeTaskStatus({ queryClient, task, nextStatus, today, userKey = '' }) {
  const id = task?.id;
  if (id == null) return { ok: false, kind: 'ignored' };
  const now = Date.now();
  if (getTaskBusy(id)) return { ok: false, kind: 'ignored' };
  if (lastTap.id !== null && lastTap.id !== String(id) && now - lastTap.at < NEIGHBOR_GUARD_MS) {
    return { ok: false, kind: 'ignored' };
  }
  lastTap = { id: String(id), at: now };

  const title = cleanPriorityPrefix(task.title || '');
  const intent = { taskId: id, title, nextStatus, userKey };

  if (isSessionLost()) {
    savePendingIntent(intent);
    return { ok: false, kind: 'session' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast.error('Sem conexão. A tarefa não foi marcada; tente quando a rede voltar.', { id: 'task-status-offline' });
    return { ok: false, kind: 'offline' };
  }

  const done = nextStatus === 'completed';
  const previous = {
    status: task.status,
    completed_date: task.completed_date ?? null,
    completed_at: task.completed_at ?? null,
  };
  const rollback = () => patchTaskInCaches(queryClient, id, previous);

  setTaskBusy(id, 'saving');
  try {
    await Promise.all(LIST_KEYS.map((queryKey) => queryClient.cancelQueries({ queryKey })));
    if (done) hapticLight();
    patchTaskInCaches(queryClient, id, {
      status: nextStatus,
      completed_date: done ? today : null,
      completed_at: done ? new Date().toISOString() : null,
    });

    try {
      const saved = await praxisApi.tasks.update(id, { status: nextStatus });
      dispatchPraxisLevelUpFromResponse(saved);
      notifyPraxisRecurrenceSpawned(saved);
      return { ok: true, task: saved };
    } catch (err) {
      const kind = classifyFailure(err);

      if (kind === 'network') {
        setTaskBusy(id, 'verifying');
        const toastId = toast.loading('A conexão caiu. Verificando se salvou…');
        const checked = await verifyTaskStatus(id, nextStatus);
        toast.dismiss(toastId);
        if (checked.state === 'saved') {
          toast.success(done ? 'Confirmado: tarefa concluída.' : 'Confirmado: tarefa reaberta.');
          return { ok: true, task: checked.task, verified: true };
        }
        rollback();
        if (checked.state === 'session') savePendingIntent(intent);
        else if (checked.state === 'gone') toast.error(failureMessage({ kind: 'not_found' }));
        else if (checked.state === 'not_saved') toast.error('Não salvou: a tarefa continua como estava. Toque de novo.');
        else toast.error('Sem conexão: não deu para confirmar. Confira a tarefa quando a rede voltar.');
        return { ok: false, kind, error: err };
      }

      rollback();
      // Sessão perdida: quem fala é a tela de login; a intenção fica guardada para depois.
      if (kind === 'session') savePendingIntent(intent);
      else toast.error(failureMessage(err, 'Não deu para atualizar a tarefa. Tente de novo.'));
      return { ok: false, kind, error: err };
    }
  } finally {
    clearTaskBusy(id);
    refreshTaskQueries(queryClient);
  }
}

/** Erro de outras gravações de tarefa (editar, mover no quadro): mesma leitura de causa. */
export function reportTaskWriteFailure(err, { task, nextStatus, userKey = '', fallback } = {}) {
  const kind = classifyFailure(err);
  if (kind === 'session') {
    if (task && nextStatus) {
      savePendingIntent({ taskId: task.id, title: cleanPriorityPrefix(task.title || ''), nextStatus, userKey });
    }
    return kind;
  }
  toast.error(failureMessage(err, fallback));
  return kind;
}
