/**
 * Express 4 não entrega promessa rejeitada ao tratador de erro: a requisição fica pendurada e o
 * processo recebe `unhandledRejection`. Este embrulho leva o erro assíncrono pelo mesmo caminho do
 * erro síncrono de hoje (`next(err)`), então status, tipo e corpo continuam os mesmos para quem chama.
 */
export function asyncRoute(handler) {
  if (typeof handler !== 'function') throw new TypeError('asyncRoute: handler precisa ser função');
  return function asyncRouteHandler(req, res, next) {
    let result;
    try {
      result = handler(req, res, next);
    } catch (error) {
      return next(error);
    }
    if (result && typeof result.then === 'function') {
      result.then(undefined, (error) => {
        // `next()` sem argumento passaria para a próxima rota como se nada tivesse falhado.
        next(error ?? new Error('rota assíncrona rejeitou sem motivo'));
      });
    }
    return undefined;
  };
}
