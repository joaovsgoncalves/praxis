// O que o usuário estava tentando fazer quando a sessão caiu. Fica só nesta aba
// (sessionStorage) e por pouco tempo. Depois do login nada é aplicado sozinho:
// a Praxis relê o item e pergunta.
const KEY = 'praxis:pending-intent';
const TTL_MS = 30 * 60 * 1000;

export function userKeyOf(user) {
  return user ? String(user.id || user.username || '') : '';
}

export function savePendingIntent({ taskId, title, nextStatus, userKey }) {
  if (taskId == null || !nextStatus) return;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        kind: 'task-status',
        taskId: String(taskId),
        title: String(title || '').slice(0, 200),
        nextStatus,
        userKey: userKey || '',
        route: `${window.location.pathname}${window.location.search}`,
        at: Date.now(),
      }),
    );
  } catch {
    // sem armazenamento: o usuário refaz o toque depois de entrar
  }
}

export function readPendingIntent() {
  try {
    const intent = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!intent || intent.kind !== 'task-status' || !intent.taskId) return null;
    if (Date.now() - Number(intent.at || 0) > TTL_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return intent;
  } catch {
    return null;
  }
}

export function clearPendingIntent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}
