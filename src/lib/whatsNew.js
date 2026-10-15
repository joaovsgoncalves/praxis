export const LAST_SEEN_RELEASE_KEY = 'praxis:last-seen-release';
/** Evento que reabre o diálogo (link em Configurações). */
export const OPEN_WHATS_NEW_EVENT = 'praxis:open-whats-new';

/** Mostra a release mais nova para quem ainda não viu o id dela (inclusive quem nunca viu nada). */
export function shouldShowWhatsNew(lastSeenId, release) {
  if (!release?.id) return false;
  return lastSeenId !== release.id;
}

export function readLastSeenRelease() {
  try {
    return localStorage.getItem(LAST_SEEN_RELEASE_KEY);
  } catch {
    return null;
  }
}

export function markReleaseSeen(id) {
  try {
    localStorage.setItem(LAST_SEEN_RELEASE_KEY, id);
  } catch {
    // sem armazenamento: o diálogo pode voltar na próxima visita, sem quebrar nada
  }
}

export function openWhatsNew() {
  window.dispatchEvent(new CustomEvent(OPEN_WHATS_NEW_EVENT));
}
