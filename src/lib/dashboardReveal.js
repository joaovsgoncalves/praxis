// A entrada animada do Hoje roda só na primeira visita da sessão do navegador.
export const DASHBOARD_REVEAL_KEY = 'praxis:dashboard-revealed';

export function shouldRevealDashboard(storage = globalThis.sessionStorage) {
  try {
    return !storage?.getItem(DASHBOARD_REVEAL_KEY);
  } catch {
    return false;
  }
}

export function markDashboardRevealed(storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(DASHBOARD_REVEAL_KEY, '1');
  } catch {
    // sessionStorage bloqueado: sem animação nas próximas também não faz falta
  }
}
