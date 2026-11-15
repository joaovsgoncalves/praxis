/**
 * Revisões semanais no servidor de verdade, já pela camada nova: cópia isolada da API (banco novo,
 * sem agenda, sem segredo de produção), duas contas, chave do agente no fluxo do Alfred, conferência
 * no arquivo de cada conta e desligamento gracioso.
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
let sandbox; let apiDir;

function copyApi() {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-revisoes-'));
  apiDir = path.join(sandbox, 'api');
  fs.cpSync(here, apiDir, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      return name !== 'node_modules' && name !== '.env' && name !== 'uploads' && name !== 'data' && !/\.db(-shm|-wal)?$/.test(name);
    },
  });
  fs.symlinkSync(fs.realpathSync(path.join(here, 'node_modules')), path.join(apiDir, 'node_modules'));
}

function start(extraEnv = {}) {
  const port = 19000 + Math.floor(Math.random() * 900);
  const proc = { base: `http://127.0.0.1:${port}`, log: '' };
  proc.child = spawn(process.execPath, ['server.js'], {
    cwd: apiDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port), HOST: '127.0.0.1',
      PRAXIS_WEB_AUTH: '1', PRAXIS_APP_PASSWORD: PASS_A, FORJA_APP_PASSWORD: PASS_A,
      PRAXIS_COOKIE_SECURE: '0', FORJA_CALENDAR_SYNC_ENABLED: '0', FORJA_API_KEY: API_KEY,
      PRAXIS_CAPTURE_WEBHOOK_SECRET: `gancho-${port}`, PRAXIS_API_VERSION: 'teste-revisoes',
      FORJA_TRANSCRIBE_PYTHON: '/bin/false', PRAXIS_DATA_DIR: path.join(apiDir, 'data'),
      ...extraEnv,
    },
  });
  proc.child.stdout.on('data', (chunk) => { proc.log += chunk; });
  proc.child.stderr.on('data', (chunk) => { proc.log += chunk; });
  proc.exited = new Promise((resolve) => proc.child.once('exit', (code, signal) => resolve({ code, signal })));
  return proc;
}
async function ready(proc) {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${proc.base}/api/health`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`API não subiu:\n${proc.log.slice(-1500)}`);
}
async function call(proc, method, url, { cookie, key, body } = {}) {
  const res = await fetch(proc.base + url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* não é JSON */ }
  return { status: res.status, json, text, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

test.before(copyApi);
test.after(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }); });

test('PRAXIS_STORAGE desconhecido ou firestore não sobe o servidor', async () => {
  const proc = start({ PRAXIS_STORAGE: 'firestore' });
  const { code } = await proc.exited;
  assert.notEqual(code, 0);
  assert.match(proc.log, /PRAXIS_STORAGE=firestore não está disponível/);
  assert.equal(fs.existsSync(path.join(apiDir, 'praxis.db')), false, 'recusa antes de abrir qualquer banco');
});

test('revisões semanais pela camada nova: duas contas, agente, disco e desligamento', async (t) => {
  const proc = start();
  t.after(() => { if (proc.child.exitCode === null) proc.child.kill('SIGKILL'); });
  await ready(proc);
  const made = spawnSync(process.execPath, ['scripts/create-user.mjs', 'Bia.Teste', 'Bia'], {
    cwd: apiDir, env: { ...process.env, PRAXIS_NEW_USER_PASSWORD: PASS_B }, encoding: 'utf8',
  });
  assert.equal(made.status, 0, made.stderr);
  const A = (await call(proc, 'POST', '/api/auth/login', { body: { password: PASS_A } })).cookie;
  const B = (await call(proc, 'POST', '/api/auth/login', { body: { username: 'bia.teste', password: PASS_B } })).cookie;
  assert.ok(A && B);

  const ra = await call(proc, 'POST', '/api/weekly-reviews', { cookie: A, body: { week_start: '2026-11-11', highlights: 'Do Jota', overall_score: 4 } });
  const rb = await call(proc, 'POST', '/api/weekly-reviews', { cookie: B, body: { week_start: '2026-11-11', highlights: 'Da Bia', overall_score: 2 } });
  assert.equal(ra.status, 201, ra.text); assert.equal(rb.status, 201, rb.text);
  assert.equal(ra.json.week_start, '2026-11-09');

  await t.test('cada conta vê e mexe só na sua semana', async () => {
    assert.equal((await call(proc, 'GET', '/api/weekly-reviews/current?date=2026-11-13', { cookie: A })).json.review.highlights, 'Do Jota');
    assert.equal((await call(proc, 'GET', '/api/weekly-reviews/current?date=2026-11-13', { cookie: B })).json.review.highlights, 'Da Bia');
    assert.deepEqual((await call(proc, 'GET', '/api/weekly-reviews', { cookie: B })).json.map((r) => r.id), [rb.json.id]);
    const cross = await call(proc, 'DELETE', `/api/weekly-reviews/${ra.json.id}`, { cookie: B });
    assert.deepEqual(cross.json, { success: true }, 'mesmo envelope de sempre');
    assert.equal((await call(proc, 'GET', '/api/weekly-reviews/current?date=2026-11-13', { cookie: A })).json.review.id, ra.json.id, 'a da outra conta continua lá');
    assert.equal((await call(proc, 'GET', '/api/weekly-reviews')).status, 401);
  });

  await t.test('fluxo do Alfred pela chave do agente cai na conta do dono legado', async () => {
    const set = await call(proc, 'POST', '/api/weekly-reviews', { key: API_KEY, body: { week_start: '2026-11-11', highlights: 'Pelo Alfred', blockers: 'b', learnings: 'l', next_week_focus: 'n', overall_score: 5 } });
    assert.equal(set.status, 200, set.text);
    assert.equal(set.json.id, ra.json.id, 'substitui a semana do dono, não cria outra');
    const readback = (await call(proc, 'GET', '/api/weekly-reviews/current?date=2026-11-11', { key: API_KEY })).json.review;
    assert.deepEqual({ ...readback, updated_date: 'X' }, { ...set.json, updated_date: 'X' });
    assert.equal((await call(proc, 'GET', '/api/weekly-reviews/current?date=2026-11-13', { cookie: B })).json.review.highlights, 'Da Bia');
    // reviews.delete: prévia confere a semana, apaga e relê vazio.
    const del = await call(proc, 'DELETE', `/api/weekly-reviews/${readback.id}`, { key: API_KEY });
    assert.deepEqual(del.json, { success: true });
    assert.equal((await call(proc, 'GET', '/api/weekly-reviews/current?date=2026-11-11', { key: API_KEY })).json.review, null);
    const again = await call(proc, 'POST', '/api/weekly-reviews', { key: API_KEY, body: { week_start: '2026-11-11', highlights: 'Depois de apagar' } });
    assert.equal(again.status, 201, 'a semana ficou livre de novo');
  });

  await t.test('erro assíncrono responde 500 em vez de pendurar', async () => {
    const res = await fetch(`${proc.base}/api/weekly-reviews/current?date=lixo`, { headers: { cookie: A }, signal: AbortSignal.timeout(3000) });
    assert.equal(res.status, 500);
    assert.match(await res.text(), /RangeError: Invalid time value/);
  });

  await t.test('desligamento: termina limpo e o que foi gravado está no arquivo de cada conta', async () => {
    proc.child.kill('SIGTERM');
    const { code } = await proc.exited;
    assert.equal(code, 0, proc.log.slice(-800));
    assert.match(proc.log, /\[desligamento\] concluído\n/);
    const control = new Database(path.join(apiDir, 'praxis.db'), { readonly: true });
    const idB = control.prepare("SELECT id FROM praxis_users WHERE username = 'bia.teste'").pluck().get();
    const other = new Database(path.join(apiDir, 'data', 'users', `${idB}.db`), { readonly: true });
    t.after(() => { control.close(); other.close(); });
    assert.deepEqual(control.prepare('SELECT highlights FROM weekly_reviews ORDER BY week_start').pluck().all(), ['Depois de apagar']);
    assert.deepEqual(other.prepare('SELECT highlights FROM weekly_reviews').pluck().all(), ['Da Bia']);
    assert.equal(fs.existsSync(path.join(apiDir, 'praxis.db-wal')) ? fs.statSync(path.join(apiDir, 'praxis.db-wal')).size : 0, 0, 'WAL consolidado no fechamento');
  });
});
