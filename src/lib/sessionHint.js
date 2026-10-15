// Pista local de "já entrou neste navegador". Não é segurança (quem decide é o cookie
// na API): só escolhe o que pintar enquanto /api/auth/me responde. Visitante novo vê a
// landing ou o login na hora; quem já usa vê o splash e depois o Hoje, sem piscar a landing.
// O script inline de preload (vite.config.js, publicRoutePreload) repete esta regra: mudou aqui, muda lá.
const KEY = 'praxis:session-hint';
const LEGACY_PREFIXES = ['praxis:offline:', 'forja:offline:'];

export function hasSessionHint() {
  try {
    if (localStorage.getItem(KEY) === '1') return true;
    // Quem já usava antes desta pista tem cache offline das telas logadas.
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
    }
  } catch {
    // localStorage bloqueado: trata como visitante.
  }
  return false;
}

export function setSessionHint(on) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // sem armazenamento, sem pista
  }
}
