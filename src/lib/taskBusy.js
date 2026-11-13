// Quais tarefas estão com gravação em andamento, para qualquer tela travar só o item certo.
import { useSyncExternalStore } from 'react';

const listeners = new Set();
let busy = new Map(); // id -> 'saving' | 'verifying'

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTaskBusy(id) {
  return busy.get(String(id)) || null;
}

export function setTaskBusy(id, state) {
  const next = new Map(busy);
  next.set(String(id), state);
  busy = next;
  emit();
}

export function clearTaskBusy(id) {
  if (!busy.has(String(id))) return;
  const next = new Map(busy);
  next.delete(String(id));
  busy = next;
  emit();
}

/** Estado de um item: null, 'saving' ou 'verifying'. */
export function useTaskBusy(id) {
  return useSyncExternalStore(subscribe, () => getTaskBusy(id), () => null);
}

/** Mapa inteiro, para listas que desenham as linhas no próprio map(). */
export function useBusyTasks() {
  const snapshot = useSyncExternalStore(subscribe, () => busy, () => busy);
  return { has: (id) => snapshot.has(String(id)), get: (id) => snapshot.get(String(id)) || null };
}
