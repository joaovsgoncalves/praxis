/**
 * Registro de requisições da API: uma linha JSON por chamada, para investigar incidentes
 * (ex.: cinco 401 seguidos) sem adivinhar. Não grava corpo, query, cookie, token nem IP.
 */
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';

const SAFE_ID = /^[A-Za-z0-9_.:-]{6,64}$/;

/** Troca identificadores por ":id" para a rota não carregar dado de registro. */
export function routeShape(path) {
  return String(path || '')
    .split('?')[0]
    .split('/')
    .map((segment) => (/\d/.test(segment) || segment.length > 24 ? ':id' : segment))
    .join('/');
}

export function classifyStatus(status) {
  if (status === 401) return 'sessao';
  if (status === 403) return 'permissao';
  if (status === 404) return 'nao_encontrado';
  if (status >= 500) return 'servidor';
  if (status >= 400) return 'cliente';
  return 'ok';
}

export function resolveApiVersion(apiDir) {
  if (process.env.PRAXIS_API_VERSION) return String(process.env.PRAXIS_API_VERSION).slice(0, 40);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: apiDir,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || 'dev';
  } catch {
    return 'dev';
  }
}

function safeHeader(value) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && SAFE_ID.test(text) ? text : null;
}

/**
 * @param {{ version?: string, write?: (line: string) => void }} [options]
 */
export function createRequestLog({ version = 'dev', write = (line) => console.log(line) } = {}) {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const started = process.hrtime.bigint();
    // Correlação: o navegador manda um id por toque; sem ele a API cria um.
    const requestId = safeHeader(req.headers['x-request-id']) || randomBytes(8).toString('hex');
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Praxis-Api-Version', version);

    res.on('finish', () => {
      const status = res.statusCode;
      // Health do vigia a cada minuto só interessa quando falha.
      if (req.path === '/api/health' && status < 400) return;
      const entry = {
        t: new Date().toISOString(),
        rid: requestId,
        m: req.method,
        route: routeShape(req.path),
        status,
        ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
        class: classifyStatus(status),
        v: version,
        client: safeHeader(req.headers['x-praxis-client']),
        auth: req.praxisAuth?.type || 'none',
      };
      if (status === 401 && res.locals.authFailure) entry.reason = res.locals.authFailure;
      try {
        write(`[req] ${JSON.stringify(entry)}`);
      } catch {
        // registro nunca derruba requisição
      }
    });
    next();
  };
}
