// Um import() por tela. React.lazy e o prefetch usam o MESMO loader, então o chunk
// baixado no hover/idle é o mesmo que a rota renderiza (o navegador não baixa duas vezes).
export const routeLoaders = {
  landing: () => import('@/pages/Landing'),
  login: () => import('@/pages/Login'),
  layout: () => import('@/components/layout/AppLayout'),
  '/': () => import('@/pages/Dashboard'),
  '/habitos-tarefas': () => import('@/pages/HabitsTasks'),
  '/habitos': () => import('@/pages/HabitsTasks'),
  '/tarefas': () => import('@/pages/HabitsTasks'),
  '/ideias': () => import('@/pages/Ideas'),
  '/compras': () => import('@/pages/Compras'),
  '/financas': () => import('@/pages/Financas'),
  '/frentes': () => import('@/pages/Projects'),
  '/foco': () => import('@/pages/Focus'),
  '/metas': () => import('@/pages/Goals'),
  '/historico': () => import('@/pages/History'),
  '/configuracoes': () => import('@/pages/Settings'),
  '/captura': () => import('@/pages/VoiceCapture'),
  '/compartilhar': () => import('@/pages/ShareCapture'),
  '/capturas': () => import('@/pages/CaptureInbox'),
  '/conquistas': () => import('@/pages/Achievements'),
  '/revisao-semanal': () => import('@/pages/WeeklyReview'),
};

const started = new Map();

/** Começa a baixar o chunk de uma rota (ou chave como 'layout'). Idempotente; erro não quebra nada. */
export function prefetchRoute(key) {
  const path = typeof key === 'string' ? key.split(/[?#]/)[0] : '';
  const loader = routeLoaders[path];
  if (!loader) return null;
  if (!started.has(path)) {
    const promise = loader().catch(() => {
      // Falhou (rede caiu): esquece, a navegação de verdade tenta de novo.
      started.delete(path);
      return null;
    });
    started.set(path, promise);
  }
  return started.get(path);
}

/** Pré-carrega depois que a primeira tela assentou (idle), sem disputar banda com ela. */
export function prefetchWhenIdle(keys, timeout = 2500) {
  if (typeof window === 'undefined') return () => {};
  const run = () => keys.forEach((key) => prefetchRoute(key));
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 1200);
  return () => window.clearTimeout(id);
}

/** Props para um link de menu: hover (mouse), foco (teclado) ou toque já começam o download. */
export function prefetchHandlers(path) {
  const go = () => prefetchRoute(path);
  return { onMouseEnter: go, onFocus: go, onTouchStart: go };
}
