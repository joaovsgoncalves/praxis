export const LAST_SEEN_RELEASE_KEY = 'praxis:last-seen-release';
/** Evento que reabre o diálogo (link em Configurações). */
export const OPEN_WHATS_NEW_EVENT = 'praxis:open-whats-new';

/** Mostra a release mais nova para quem ainda não viu o id dela (inclusive quem nunca viu nada). */
export function shouldShowWhatsNew(lastSeenId, release) {
  if (!release?.id) return false;
  return lastSeenId !== release.id;
}

/** Sem digitar por este tempo, a pessoa parou de editar. */
export const EDIT_QUIET_MS = 8000;

/**
 * A pessoa está no meio de alguma coisa? Painel aberto, cursor num campo ou digitou há pouco.
 * O aviso automático espera: abrir por cima de um formulário rouba o toque em Salvar.
 */
export function isUserBusy({ overlayOpen = false, focusInField = false, msSinceLastInput = null } = {}) {
  if (overlayOpen || focusInField) return true;
  return msSinceLastInput !== null && msSinceLastInput < EDIT_QUIET_MS;
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
