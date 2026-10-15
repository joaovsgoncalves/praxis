/** Movimento reduzido ligado no sistema: nada de confete, nada de entrada animada. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

// canvas-confetti só desce na primeira comemoração; ninguém paga por ele ao abrir o app.
let confettiModule = null;
function loadConfetti() {
  if (!confettiModule) {
    confettiModule = import('canvas-confetti')
      .then((mod) => mod.default)
      .catch((err) => {
        confettiModule = null;
        throw err;
      });
  }
  return confettiModule;
}

/** Dispara o confete (opções do canvas-confetti). Com movimento reduzido, não faz nada. */
export function fireConfetti(options) {
  if (prefersReducedMotion()) return Promise.resolve(false);
  return loadConfetti()
    .then((confetti) => {
      confetti({ disableForReducedMotion: true, ...options });
      return true;
    })
    .catch(() => false);
}

/** Pequena explosão no ponto do toque — hábitos e tarefas. */
export function sparkAt(x, y, palette = 'gold') {
  const colors =
    palette === 'ember'
      ? ['#FB923C', '#F59E0B', '#FFC857', '#FFFFFF']
      : ['#FFC857', '#F59E0B', '#34D399', '#FFFFFF'];
  return fireConfetti({
    particleCount: 16,
    spread: 42,
    startVelocity: 24,
    gravity: 0.85,
    ticks: 95,
    scalar: 0.75,
    origin: { x: x / window.innerWidth, y: y / window.innerHeight },
    colors,
  });
}

export function sparkFromElement(el, palette = 'gold') {
  const rect = el?.getBoundingClientRect?.();
  if (!rect) return Promise.resolve(false);
  return sparkAt(rect.left + rect.width / 2, rect.top + rect.height / 2, palette);
}
