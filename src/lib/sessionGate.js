// Sessão perdida no meio do uso. O primeiro 401 de uma chamada protegida fecha o portão:
// um aviso só, um pedido de login só, e nenhuma outra chamada protegida sai até entrar de novo.
const listeners = new Set();
let lost = false;
let lostReason = null;

export function isSessionLost() {
  return lost;
}

export function sessionLostReason() {
  return lostReason;
}

/** @returns {boolean} true só na primeira vez (as seguintes não avisam de novo). */
export function markSessionLost(reason = null) {
  if (lost) return false;
  lost = true;
  lostReason = reason;
  listeners.forEach((listener) => {
    try {
      listener({ reason });
    } catch {
      // um ouvinte com erro não impede os outros
    }
  });
  return true;
}

export function clearSessionLost() {
  lost = false;
  lostReason = null;
}

export function subscribeSessionLost(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
