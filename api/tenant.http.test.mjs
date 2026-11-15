/**
 * Fase 4: duas pessoas no servidor de verdade. Sobe a API numa cópia isolada (banco novo, sem
 * agenda, sem segredo de produção), cria a conta B e confere que nada de uma aparece para a outra.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));
const PASS_A = `a-${Math.random().toString(36).slice(2)}-senha`;
const PASS_B = `b-${Math.random().toString(36).slice(2)}-senha`;
const API_KEY = `chave-${Math.random().toString(36).slice(2)}`;
const WEBHOOK = `gancho-${Math.random().toString(36).slice(2)}`;

let sandbox; let apiDir; let server; let base; let log = '';

async function call(method, url, { cookie, key, body, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* corpo não é JSON */ }
  return { status: res.status, json, text, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

async function login(password, username) {
  const res = await call('POST', '/api/auth/login', { body: username ? { username, password } : { password } });
  return res;
}

test.before(async () => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-contas-'));
  apiDir = path.join(sandbox, 'api');
  fs.cpSync(here, apiDir, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      return name !== 'node_modules' && name !== '.env' && name !== 'uploads' && name !== 'data' && !/\.db(-shm|-wal)?$/.test(name);
    },
  });
  fs.symlinkSync(fs.realpathSync(path.join(here, 'node_modules')), path.join(apiDir, 'node_modules'));
  const port = 19000 + Math.floor(Math.random() * 900);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: apiDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      PRAXIS_WEB_AUTH: '1',
      PRAXIS_APP_PASSWORD: PASS_A,
      FORJA_APP_PASSWORD: PASS_A,
      PRAXIS_COOKIE_SECURE: '0',
      FORJA_CALENDAR_SYNC_ENABLED: '0',
      FORJA_API_KEY: API_KEY,
      PRAXIS_CAPTURE_WEBHOOK_SECRET: WEBHOOK,
      PRAXIS_API_VERSION: 'teste-contas',
      PRAXIS_DATA_DIR: path.join(apiDir, 'data'),
    },
  });
  server.stdout.on('data', (chunk) => { log += chunk; });
  server.stderr.on('data', (chunk) => { log += chunk; });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`API não subiu:\n${log.slice(-1500)}`);
});

test.after(() => {
  server?.kill('SIGTERM');
  if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
});

test('duas contas: cada uma só vê e só mexe no que é seu', async (t) => {
  const made = spawnSync(process.execPath, ['scripts/create-user.mjs', 'Bia.Teste', 'Bia'], {
    cwd: apiDir, env: { ...process.env, PRAXIS_NEW_USER_PASSWORD: PASS_B }, encoding: 'utf8',
  });
  assert.equal(made.status, 0, made.stderr);
  assert.match(made.stdout, /conta criada: bia\.teste/);

  const inA = await login(PASS_A);
  const inB = await login(PASS_B, 'bia.teste');
  assert.equal(inA.status, 200, inA.text);
  assert.equal(inB.status, 200, inB.text);
  const A = inA.cookie; const B = inB.cookie;
  assert.notEqual(inA.json.user.id, inB.json.user.id);

  await t.test('login: senha de um não abre a conta do outro, e usuário inexistente responde igual', async () => {
    assert.equal((await login(PASS_A, 'bia.teste')).status, 401);
    assert.equal((await login(PASS_B)).status, 401);
    assert.equal((await login(PASS_B, 'jota')).status, 401);
    const ghost = await login(PASS_B, 'ninguem');
    const wrong = await login('senha-errada-qualquer', 'bia.teste');
    assert.equal(ghost.status, 401);
    assert.deepEqual(ghost.json, wrong.json);
    assert.equal((await call('GET', '/api/auth/me', { cookie: B })).json.user.username, 'bia.teste');
    assert.equal((await call('GET', '/api/auth/me', { cookie: A })).json.user.username, 'jota');
  });

  await t.test('a conta nova nasce vazia, sem as frentes e as finanças do dono', async () => {
    const projectsA = (await call('GET', '/api/projects', { cookie: A })).json;
    const projectsB = (await call('GET', '/api/projects', { cookie: B })).json;
    const count = (value) => (Array.isArray(value) ? value : (value?.projects || value?.items || [])).length;
    assert.ok(count(projectsA) > 0, 'o dono legado recebeu as frentes de partida');
    assert.equal(count(projectsB), 0);
    const overviewB = (await call('GET', '/api/finance/overview', { cookie: B })).json;
    assert.equal(JSON.stringify(overviewB).includes('debt-carro'), false);
    assert.deepEqual((await call('GET', '/api/tasks', { cookie: B })).json, []);
  });

  let taskA; let taskB;
  await t.test('tarefas: criar, listar, ler por id, alterar e apagar não cruzam', async () => {
    taskA = (await call('POST', '/api/tasks', { cookie: A, body: { title: 'Segredo do Jota', date: '2026-11-20', time: '09:00' } })).json;
    taskB = (await call('POST', '/api/tasks', { cookie: B, body: { title: 'Compromisso da Bia', date: '2026-11-20', time: '09:00' } })).json;
    assert.ok(taskA?.id && taskB?.id, JSON.stringify([taskA, taskB]).slice(0, 300));
    const listA = (await call('GET', '/api/tasks', { cookie: A })).json.map((task) => task.title);
    const listB = (await call('GET', '/api/tasks', { cookie: B })).json.map((task) => task.title);
    assert.deepEqual(listB, ['Compromisso da Bia']);
    assert.ok(listA.includes('Segredo do Jota') && !listA.includes('Compromisso da Bia'));

    assert.equal((await call('GET', `/api/tasks/${taskA.id}`, { cookie: B })).status, 404);
    const patch = await call('PUT', `/api/tasks/${taskA.id}`, { cookie: B, body: { title: 'invadida' } });
    assert.ok([404, 405].includes(patch.status), `PUT cruzado respondeu ${patch.status}`);
    await call('DELETE', `/api/tasks/${taskA.id}`, { cookie: B });
    const still = (await call('GET', `/api/tasks/${taskA.id}`, { cookie: A })).json;
    assert.equal(still.title, 'Segredo do Jota');
  });

  await t.test('finanças: lançamento, mês e chave de intenção são de cada conta', async () => {
    const intent = 'mesma-chave-nas-duas-contas';
    const a = await call('POST', '/api/finance/transactions', {
      cookie: A, headers: { 'idempotency-key': intent },
      body: { amount: -111.11, merchant: 'Mercado do Jota', posted_on: '2026-11-10', category: 'Mercado' },
    });
    const b = await call('POST', '/api/finance/transactions', {
      cookie: B, headers: { 'idempotency-key': intent },
      body: { amount: -222.22, merchant: 'Farmácia da Bia', posted_on: '2026-11-10', category: 'Saúde' },
    });
    assert.ok(a.status < 300, a.text.slice(0, 300));
    assert.ok(b.status < 300, `a mesma chave em outra conta não pode dar conflito: ${b.status} ${b.text.slice(0, 200)}`);
    assert.notEqual(b.json?.replayed, true);
    const monthA = (await call('GET', '/api/finance/transactions?from=2026-11-01&to=2026-11-30', { cookie: A })).text;
    const monthB = (await call('GET', '/api/finance/transactions?from=2026-11-01&to=2026-11-30', { cookie: B })).text;
    const summaryB = (await call('GET', '/api/finance/month?month=2026-11', { cookie: B })).text;
    assert.ok(summaryB.includes('222.22') && !summaryB.includes('111.11'), 'o resumo do mês da Bia só soma o que é dela');
    assert.ok(monthA.includes('Mercado do Jota') && !monthA.includes('Farmácia da Bia'));
    assert.ok(monthB.includes('Farmácia da Bia') && !monthB.includes('Mercado do Jota'));
  });

  await t.test('chave do agente e captura do Telegram caem na conta do dono legado', async () => {
    const viaKey = (await call('GET', '/api/tasks', { key: API_KEY })).json.map((task) => task.title);
    assert.ok(viaKey.includes('Segredo do Jota') && !viaKey.includes('Compromisso da Bia'));
    const hook = await call('POST', '/api/webhooks/capture-text', { key: WEBHOOK, body: { text: 'ideia capturada pelo telegram' } });
    assert.ok(hook.status < 300, hook.text.slice(0, 300));
    const capturesB = (await call('GET', '/api/captures', { cookie: B })).text;
    assert.equal(capturesB.includes('ideia capturada pelo telegram'), false);
  });

  await t.test('agenda, banco e dados de partida do dono não existem para a outra conta', async () => {
    const res = await call('GET', '/api/calendar/events', { cookie: B });
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'calendar_not_linked');
    const seed = await call('POST', '/api/finance/seed', { cookie: B, body: { force: true } });
    assert.equal(seed.status, 404);
    assert.equal(seed.json.code, 'personal_seed');
    const sync = await call('POST', '/api/finance/sync', { cookie: B, body: {} });
    assert.equal(sync.status, 404);
    assert.equal(sync.json.code, 'bank_not_linked');
    assert.equal((await call('GET', '/api/finance/debts', { cookie: B })).text, '[]');
  });

  await t.test('exportação e arquivos: cada conta em seu banco, com o mesmo esquema', async () => {
    const control = new Database(path.join(apiDir, 'praxis.db'), { readonly: true });
    const idB = control.prepare("SELECT id FROM praxis_users WHERE username = 'bia.teste'").pluck().get();
    const fileB = path.join(apiDir, 'data', 'users', `${idB}.db`);
    assert.ok(fs.existsSync(fileB));
    assert.equal((fs.statSync(fileB).mode & 0o077), 0, 'o arquivo da conta não é legível por outros usuários do sistema');
    const other = new Database(fileB, { readonly: true });
    t.after(() => { control.close(); other.close(); });
    const shape = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('praxis_users','praxis_sessions') ORDER BY name")
      .pluck().all().map((name) => `${name}(${db.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name).sort().join(',')})`);
    assert.deepEqual(shape(other), shape(control));
    assert.deepEqual(other.prepare('SELECT title FROM tasks').pluck().all(), ['Compromisso da Bia']);
    assert.equal(control.prepare("SELECT count(*) FROM tasks WHERE title = 'Compromisso da Bia'").pluck().get(), 0);
    assert.equal(other.prepare("SELECT count(*) FROM sqlite_master WHERE name IN ('praxis_users','praxis_sessions')").pluck().get(), 0);
    assert.equal(other.prepare('SELECT count(*) FROM finance_debts').pluck().get(), 0);
  });

  await t.test('sair de uma conta não derruba a outra, e sem sessão nada responde', async () => {
    assert.equal((await call('POST', '/api/auth/logout', { cookie: B })).status, 200);
    assert.equal((await call('GET', '/api/tasks', { cookie: B })).status, 401);
    assert.equal((await call('GET', '/api/tasks', { cookie: A })).status, 200);
    assert.equal((await call('GET', '/api/tasks')).status, 401);
  });

  assert.equal(/tenant_scope_missing|fora do escopo/.test(log), false, `banco usado sem dono:\n${log.slice(-800)}`);
});
