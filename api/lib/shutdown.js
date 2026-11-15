/**
 * Desligamento gracioso: para de aceitar conexões, espera as requisições em andamento terminarem,
 * roda os passos de limpeza (relógios, camada de persistência, bancos) e sai. Se travar, sai à força
 * depois de `timeoutMs` para o supervisor (systemd/Cloud Run) não ficar esperando.
 */
export function installGracefulShutdown({ server, steps = [], timeoutMs = 10_000, log = console, exit = (code) => process.exit(code), signals = ['SIGTERM', 'SIGINT'] }) {
  let running = null;
  function shutdown(signal) {
    running ??= (async () => {
      log.log(`[desligamento] ${signal}: parando de aceitar conexões`);
      const timer = setTimeout(() => { log.error('[desligamento] tempo esgotado, saindo à força'); exit(1); }, timeoutMs);
      timer.unref();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
      });
      let failed = false;
      for (const [label, step] of steps) {
        try { await step(); } catch (error) { failed = true; log.error(`[desligamento] ${label} falhou:`, error?.message || error); }
      }
      clearTimeout(timer);
      log.log(`[desligamento] concluído${failed ? ' com falhas' : ''}`);
      exit(failed ? 1 : 0);
    })();
    return running;
  }
  for (const signal of signals) process.once(signal, () => shutdown(signal));
  return shutdown;
}
