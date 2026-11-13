// Uma falha de API tem causas bem diferentes e cada uma pede uma mensagem diferente.
// "offline" = a escrita nem saiu do aparelho. "network" = saiu e a resposta não voltou:
// não dá para saber se gravou sem perguntar de novo ao servidor.

export function kindFromStatus(status) {
  if (status === 401) return 'session';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server';
  if (status >= 400) return 'client';
  return 'unknown';
}

/** @returns {'session'|'forbidden'|'offline'|'network'|'not_found'|'server'|'client'|'unknown'} */
export function classifyFailure(err) {
  if (!err) return 'unknown';
  if (err.kind) return err.kind;
  if (err.status) return kindFromStatus(err.status);
  return 'unknown';
}

const MESSAGES = {
  session: 'Sua sessão terminou. Entre de novo para continuar.',
  forbidden: 'Você não tem permissão para alterar isso.',
  offline: 'Sem conexão. Nada foi salvo; tente quando a rede voltar.',
  network: 'A conexão caiu no meio. Confira se a mudança ficou antes de repetir.',
  not_found: 'Esse item não existe mais. Atualizei a lista.',
  server: 'O servidor falhou ao salvar. Tente de novo.',
};

/** Mensagem para o usuário. `fallback` cobre o que não tem causa conhecida. */
export function failureMessage(err, fallback = 'Não deu para salvar. Tente de novo.') {
  const kind = classifyFailure(err);
  const base = MESSAGES[kind] || fallback;
  // O código curto casa com a linha [req] do log da API (campo rid).
  if (kind === 'server' && err?.requestId) return `${base} (ref. ${String(err.requestId).slice(0, 8)})`;
  return base;
}
