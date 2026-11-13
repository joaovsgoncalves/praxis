/**
 * Fase 1A: cada chamada deixa uma linha com método, rota, status, duração, versão, classe,
 * correlação e o motivo do 401, sem dado sensível.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import Database from 'better-sqlite3';
import { SESSION_COOKIE, createApiAuthMiddleware, initAuthSchema, registerAuthRoutes } from './praxisAuth.js';
import { classifyStatus, createRequestLog, routeShape } from './lib/requestLog.js';
import { startTestServer } from './test-support/helpers.mjs';

async function setup(t) {
  const db = new Database(':memory:');
  initAuthSchema(db);
  db.prepare("INSERT INTO praxis_users (id, username, password_hash, display_name) VALUES ('u1', 'jota', 'x', 'Jota')").run();
  const insertSession = db.prepare('INSERT INTO praxis_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)');
  insertSession.run('s-ok', 'u1', 'token-valido', new Date(Date.now() + 3600e3).toISOString());
  insertSession.run('s-old', 'u1', 'token-vencido', new Date(Date.now() - 3600e3).toISOString());

  const lines = [];
  const app = express();
  app.use(createRequestLog({ version: 'abc1234', write: (line) => lines.push(line) }));
  app.use(express.json());
  registerAuthRoutes(app, db, { secureCookie: false });
  app.use(createApiAuthMiddleware({ db, apiKey: '' }));
  app.put('/api/tasks/:id', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  const call = async (method, path, { cookie, headers = {} } = {}) => {
    const response = await fetch(`${server.base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
        ...headers,
      },
      body: method === 'GET' ? undefined : JSON.stringify({ status: 'completed', title: 'segredo do corpo' }),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const entries = () => lines.map((line) => JSON.parse(line.replace(/^\[req\] /, '')));
  return { call, entries, lines };
}

test('401 registra o motivo: sem cookie, sessão vencida e sessão desconhecida', async (t) => {
  const { call, entries } = await setup(t);
  const id = '7b0e1f8a-1c1d-4b7e-9a51-0d6f3f0a9e21';

  const semCookie = await call('PUT', `/api/tasks/${id}`);
  const vencida = await call('PUT', `/api/tasks/${id}`, { cookie: 'token-vencido' });
  const desconhecida = await call('PUT', `/api/tasks/${id}`, { cookie: 'token-que-nao-existe' });
  const me = await call('GET', '/api/auth/me', { cookie: 'token-vencido' });

  assert.equal(semCookie.status, 401);
  assert.equal(semCookie.body.code, 'auth_required');
  assert.deepEqual(
    [semCookie.body.reason, vencida.body.reason, desconhecida.body.reason, me.body.reason],
    ['sem_cookie', 'sessao_expirada', 'sessao_desconhecida', 'sessao_expirada'],
  );
  const logged = entries();
  assert.deepEqual(logged.map((e) => e.reason), ['sem_cookie', 'sessao_expirada', 'sessao_desconhecida', 'sessao_expirada']);
  assert.ok(logged.every((e) => e.class === 'sessao' && e.status === 401 && e.v === 'abc1234'));
  assert.equal(logged[0].route, '/api/tasks/:id');
  assert.equal(logged[0].m, 'PUT');
  assert.equal(typeof logged[0].ms, 'number');
});

test('linha de sucesso traz correlação e versão do cliente, sem corpo, query, cookie ou id', async (t) => {
  const { call, entries, lines } = await setup(t);
  const id = '7b0e1f8a-1c1d-4b7e-9a51-0d6f3f0a9e21';

  const ok = await call('PUT', `/api/tasks/${id}?nota=particular`, {
    cookie: 'token-valido',
    headers: { 'X-Request-Id': 'toque-0001-abcd', 'X-Praxis-Client': 'web-9f3c2aa' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('x-request-id'), 'toque-0001-abcd');
  assert.equal(ok.headers.get('x-praxis-api-version'), 'abc1234');

  const [entry] = entries();
  assert.deepEqual(
    { rid: entry.rid, route: entry.route, status: entry.status, class: entry.class, client: entry.client, auth: entry.auth },
    { rid: 'toque-0001-abcd', route: '/api/tasks/:id', status: 200, class: 'ok', client: 'web-9f3c2aa', auth: 'session' },
  );
  const raw = lines.join('\n');
  for (const secret of ['token-valido', id, 'particular', 'segredo do corpo', 'praxis_sid']) {
    assert.ok(!raw.includes(secret), `o registro não pode conter "${secret}"`);
  }
});

test('correlação inválida é trocada; health saudável não polui o registro', async (t) => {
  const { call, entries } = await setup(t);
  const res = await call('GET', '/api/auth/me', { cookie: 'token-valido', headers: { 'X-Request-Id': 'x y;<script>' } });
  await call('GET', '/api/health');
  assert.match(res.headers.get('x-request-id'), /^[0-9a-f]{16}$/);
  assert.equal(entries().length, 1);
});

test('classes e formato de rota', () => {
  assert.deepEqual([200, 401, 403, 404, 409, 500].map(classifyStatus), ['ok', 'sessao', 'permissao', 'nao_encontrado', 'cliente', 'servidor']);
  assert.equal(routeShape('/api/tasks/abc-123/checklist/9f?x=1'), '/api/tasks/:id/checklist/:id');
  assert.equal(routeShape('/api/tasks/reorder'), '/api/tasks/reorder');
  assert.equal(routeShape('/api/ideas/seneca-bloco-manha-de-foco-profundo/to-task'), '/api/ideas/:id/to-task');
});
