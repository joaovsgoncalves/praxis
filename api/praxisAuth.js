/**
 * Praxis session auth — browser cookie + Bearer FORJA_API_KEY for automation.
 */
import { randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';

export const SESSION_COOKIE = 'praxis_sid';
/** Dono dos dados que já existiam antes das contas: o banco de sempre é dele. */
export const LEGACY_OWNER = 'legacy';
const DEFAULT_USERNAME = 'jota';
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;

/** Chave que escolhe o banco da pessoa. Sai do usuário que o servidor verificou, nunca do cliente. */
export function ownerKeyOf(user) {
  if (!user) return null;
  return user.legacy_owner ? LEGACY_OWNER : (user.user_id || user.id || null);
}

export function normalizeUsername(value) {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return USERNAME_PATTERN.test(name) ? name : '';
}
const SESSION_DAYS = 30;

export function isWebAuthEnabled() {
  const raw = String(process.env.PRAXIS_WEB_AUTH ?? '1').toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function loadAppPassword() {
  return (
    process.env.PRAXIS_APP_PASSWORD ||
    process.env.FORJA_APP_PASSWORD ||
    ''
  ).trim();
}

export function initAuthSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS praxis_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      created_date TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS praxis_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_date TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES praxis_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_praxis_sessions_token ON praxis_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_praxis_sessions_expires ON praxis_sessions(expires_at);
  `);
  const columns = db.prepare('PRAGMA table_info(praxis_users)').all().map((column) => column.name);
  if (!columns.includes('legacy_owner')) {
    db.exec('ALTER TABLE praxis_users ADD COLUMN legacy_owner INTEGER NOT NULL DEFAULT 0');
  }
  // Quem já usava a Praxis antes das contas segue dono do banco de sempre.
  db.prepare(`
    UPDATE praxis_users SET legacy_owner = 1
    WHERE username = ? AND NOT EXISTS (SELECT 1 FROM praxis_users WHERE legacy_owner = 1)
  `).run(DEFAULT_USERNAME);
}

/** Cria uma conta do beta. Os dados dela nascem vazios, em banco próprio, no primeiro acesso. */
export function createUser(db, { username, password, displayName = '' }) {
  const name = normalizeUsername(username);
  if (!name) throw new Error('usuário inválido: use de 2 a 32 letras minúsculas, números, ponto, hífen ou sublinhado');
  const secret = typeof password === 'string' ? password.trim() : '';
  if (secret.length < 10) throw new Error('senha curta: use pelo menos 10 caracteres');
  if (db.prepare('SELECT 1 FROM praxis_users WHERE lower(username) = ?').get(name)) {
    throw new Error('já existe uma conta com esse usuário');
  }
  const id = randomBytes(16).toString('hex');
  db.prepare(
    'INSERT INTO praxis_users (id, username, password_hash, display_name, legacy_owner) VALUES (?, ?, ?, ?, 0)'
  ).run(id, name, bcrypt.hashSync(secret, 12), String(displayName || name).slice(0, 80));
  return { id, username: name };
}

export function ensureDefaultUser(db) {
  const password = loadAppPassword();
  if (!password) {
    console.warn('[praxis-auth] PRAXIS_APP_PASSWORD not set — browser login disabled until configured');
    return;
  }
  const existing = db.prepare('SELECT id, password_hash FROM praxis_users WHERE username = ?').get(DEFAULT_USERNAME);
  const hash = bcrypt.hashSync(password, 12);
  if (!existing) {
    const hasLegacyOwner = Boolean(db.prepare('SELECT 1 FROM praxis_users WHERE legacy_owner = 1').get());
    db.prepare(
      'INSERT INTO praxis_users (id, username, password_hash, display_name, legacy_owner) VALUES (?, ?, ?, ?, ?)'
    ).run(randomBytes(16).toString('hex'), DEFAULT_USERNAME, hash, 'João Victor', hasLegacyOwner ? 0 : 1);
    console.log('[praxis-auth] Default user "jota" created from env password');
    return;
  }
  if (!bcrypt.compareSync(password, existing.password_hash)) {
    db.prepare('UPDATE praxis_users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
    console.log('[praxis-auth] Password hash updated from env');
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function getSessionFromRequest(db, req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.id AS session_id, s.user_id, s.expires_at, u.username, u.display_name, u.legacy_owner
    FROM praxis_sessions s
    JOIN praxis_users u ON u.id = s.user_id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
  `).get(token);
  return row || null;
}

/**
 * Por que a sessão foi recusada. Só para o registro e para o cliente explicar o que houve.
 * "sessao_desconhecida" cobre revogada, apagada (o login limpa as vencidas) ou de outro ambiente.
 */
export function describeSessionFailure(db, req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return 'sem_cookie';
  const row = db.prepare('SELECT expires_at FROM praxis_sessions WHERE token = ?').get(token);
  if (!row) return 'sessao_desconhecida';
  return 'sessao_expirada';
}

function rejectSession(db, req, res) {
  const reason = describeSessionFailure(db, req);
  res.locals.authFailure = reason;
  return res.status(401).json({ error: 'Unauthorized', code: 'auth_required', reason });
}

function purgeExpiredSessions(db) {
  db.prepare("DELETE FROM praxis_sessions WHERE datetime(expires_at) <= datetime('now')").run();
}

export function createSession(db, userId, res, { secureCookie }) {
  purgeExpiredSessions(db);
  const token = randomBytes(32).toString('hex');
  const sessionId = randomBytes(16).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO praxis_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, userId, token, expires);

  const cookieParts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (secureCookie) cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
  return token;
}

export function clearSessionCookie(res, { secureCookie }) {
  const cookieParts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secureCookie) cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

export function revokeSession(db, req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    db.prepare('DELETE FROM praxis_sessions WHERE token = ?').run(token);
  }
}

export const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/config',
  '/api/webhooks/capture-text',
]);

/** Rotas públicas que gravam dado: entram sempre na conta do dono legado (captura do Telegram do João). */
const PUBLIC_LEGACY_PATHS = new Set(['/api/webhooks/capture-text']);

/**
 * @param {object} options
 * @param {import('better-sqlite3').Database} options.db banco de controle (usuários e sessões)
 * @param {string} [options.apiKey] chave dos agentes; vale pela conta do dono legado
 * @param {(owner: string, fn: Function) => any} [options.runAs] abre o escopo de dados da pessoa
 */
export function createApiAuthMiddleware({ db, apiKey, runAs = null }) {
  const scoped = (req, owner, next) => {
    req.praxisOwner = owner;
    return runAs ? runAs(owner, next) : next();
  };
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    if (PUBLIC_LEGACY_PATHS.has(req.path)) return scoped(req, LEGACY_OWNER, next);
    if (PUBLIC_API_PATHS.has(req.path)) return next();

    if (!isWebAuthEnabled()) {
      if (apiKey && ['1', 'true', 'yes'].includes(String(process.env.FORJA_AUTH_REQUIRED || '').toLowerCase())) {
        const header = req.headers.authorization || '';
        const provided = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-forja-key'];
        if (!provided || !safeEqual(provided, apiKey)) {
          res.locals.authFailure = 'chave_invalida';
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }
      return scoped(req, LEGACY_OWNER, next);
    }

    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-forja-key'];
    if (apiKey && bearer && safeEqual(bearer, apiKey)) {
      req.praxisAuth = { type: 'api_key', user: { username: 'automation' } };
      return scoped(req, LEGACY_OWNER, next);
    }

    const session = getSessionFromRequest(db, req);
    if (session) {
      req.praxisAuth = {
        type: 'session',
        user: { id: session.user_id, username: session.username, display_name: session.display_name },
      };
      // A tela confere se a resposta é da conta que ela acha que está aberta (troca em outra aba).
      res.setHeader('X-Praxis-Account', session.user_id);
      return scoped(req, ownerKeyOf(session), next);
    }

    return rejectSession(db, req, res);
  };
}

const UNKNOWN_USER_HASH = bcrypt.hashSync(randomBytes(18).toString('hex'), 12);

/**
 * Limite de tentativas erradas por conta, não por endereço: a API fica atrás de mais de um
 * intermediário, o endereço que chega aqui é o deles, e cabeçalho de origem pode ser forjado.
 * Assim, forçar a senha de uma conta não trava a entrada das outras, e entrar certo não gasta tentativa.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const typed = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (!typed) return `conta:${LEGACY_OWNER}`;
    return `conta:${normalizeUsername(typed) || 'invalida'}`;
  },
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many login attempts. Try again later.' },
});

export function registerAuthRoutes(app, db, { secureCookie = true } = {}) {
  app.get('/api/auth/config', (_req, res) => {
    res.json({
      webAuthEnabled: isWebAuthEnabled(),
      loginAvailable: Boolean(db.prepare('SELECT id FROM praxis_users LIMIT 1').get()),
    });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!isWebAuthEnabled()) {
      return res.json({ user: { username: 'local', display_name: 'Local dev' }, auth: 'open' });
    }
    const session = getSessionFromRequest(db, req);
    if (!session) return rejectSession(db, req, res);
    res.json({
      user: { id: session.user_id, username: session.username, display_name: session.display_name },
      auth: 'session',
    });
  });

  app.post('/api/auth/login', loginRateLimiter, (req, res) => {
    if (!isWebAuthEnabled()) {
      return res.status(400).json({ error: 'Web auth is disabled on this server' });
    }
    const { password, username } = req.body || {};
    const normalized = typeof password === 'string' ? password.trim() : '';
    if (!normalized) {
      return res.status(400).json({ error: 'Password is required' });
    }
    // Sem usuário no pedido, vale o dono legado: quem já usava segue entrando só com a senha.
    const typedName = typeof username === 'string' ? username.trim() : '';
    let user;
    if (typedName) {
      const name = normalizeUsername(typedName);
      user = name ? db.prepare('SELECT * FROM praxis_users WHERE lower(username) = ?').get(name) : null;
    } else {
      user = db.prepare('SELECT * FROM praxis_users WHERE legacy_owner = 1').get();
      if (!user) {
        return res.status(503).json({ error: 'Login not configured. Set PRAXIS_APP_PASSWORD on the server.' });
      }
    }
    // Mesma resposta e mesmo custo para usuário que não existe e para senha errada.
    const matches = bcrypt.compareSync(normalized, user ? user.password_hash : UNKNOWN_USER_HASH);
    if (!user || !matches) {
      res.locals.authFailure = 'senha_incorreta';
      return res.status(401).json({ error: 'Invalid password' });
    }
    createSession(db, user.id, res, { secureCookie });
    res.json({
      user: { id: user.id, username: user.username, display_name: user.display_name },
      auth: 'session',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    revokeSession(db, req);
    clearSessionCookie(res, { secureCookie });
    res.json({ success: true });
  });
}