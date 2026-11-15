/**
 * Rotas já servidas pela camada nova (revisões semanais, compras, foco e bem-estar), no servidor de verdade: cópia isolada da API (banco novo,
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

  await t.test('compras pela camada nova: contas separadas e fluxo purchases.* do Alfred', async () => {
    const pa = await call(proc, 'POST', '/api/purchases', { cookie: A, body: { title: 'Fone do Jota', horizon: 'short' } });
    const pb = await call(proc, 'POST', '/api/purchases', { cookie: B, body: { title: 'Livro da Bia' } });
    assert.equal(pa.status, 201, pa.text); assert.equal(pb.status, 201, pb.text);
    assert.equal(pa.json.sort_order, 1); assert.equal(pb.json.sort_order, 1, 'posição conta por conta');
    assert.deepEqual((await call(proc, 'GET', '/api/purchases?status=all', { cookie: B })).json.map((r) => r.title), ['Livro da Bia']);
    assert.equal((await call(proc, 'PATCH', `/api/purchases/${pa.json.id}`, { cookie: B, body: { title: 'invadida' } })).status, 404);
    assert.equal((await call(proc, 'DELETE', `/api/purchases/${pa.json.id}`, { cookie: B })).status, 404);
    // purchases.create/update/delete do Alfred e a releitura que ele faz (status=all).
    const made = await call(proc, 'POST', '/api/purchases', { key: API_KEY, body: { title: 'Pelo Alfred', notes: 'n', horizon: 'long', status: 'want', price_estimate: '150', url: 'https://exemplo.invalid' } });
    assert.equal(made.status, 201, made.text); assert.equal(made.json.sort_order, 2);
    const upd = await call(proc, 'PATCH', `/api/purchases/${made.json.id}`, { key: API_KEY, body: { status: 'bought' } });
    assert.equal(upd.json.status, 'bought');
    const rows = (await call(proc, 'GET', '/api/purchases?status=all', { key: API_KEY })).json;
    assert.deepEqual(rows.map((r) => r.title), ['Fone do Jota', 'Pelo Alfred']);
    assert.deepEqual(rows[1], upd.json, 'releitura igual à resposta');
    assert.equal((await call(proc, 'DELETE', `/api/purchases/${made.json.id}`, { key: API_KEY })).status, 204);
    assert.equal((await call(proc, 'GET', '/api/purchases', { cookie: A })).json.length, 1);
  });

  await t.test('foco e bem-estar pela camada nova: contas separadas e fluxos wellness.set/focus.create do Alfred', async () => {
    const wa = await call(proc, 'POST', '/api/wellness', { cookie: A, body: { date: '2026-11-15', sleep_hours: 6.5, mood: 4 } });
    const wb = await call(proc, 'POST', '/api/wellness', { cookie: B, body: { date: '2026-11-15', mood: 2 } });
    assert.equal(wa.status, 201, wa.text); assert.equal(wb.status, 201, wb.text);
    // wellness.set do Alfred: todos os campos, upsert do dia do dono legado, releitura por ?date=.
    const set = await call(proc, 'POST', '/api/wellness', { key: API_KEY, body: { date: '2026-11-15', sleep_hours: 8, sleep_quality: 5, mood: 5, productivity: 4, note: 'Pelo Alfred' } });
    assert.equal(set.status, 200, set.text); assert.equal(set.json.id, wa.json.id, 'atualiza o dia do dono, não cria outro');
    assert.deepEqual((await call(proc, 'GET', '/api/wellness?date=2026-11-15', { key: API_KEY })).json, [set.json]);
    assert.deepEqual((await call(proc, 'GET', '/api/wellness?date=2026-11-15', { cookie: B })).json.map((r) => r.mood), [2]);
    // focus.create do Alfred e releitura por ?date=; a outra conta não vê.
    const fa = await call(proc, 'POST', '/api/focus', { key: API_KEY, body: { date: '2026-11-15', duration_seconds: 1500, task_title: 'Pelo Alfred' } });
    const fb = await call(proc, 'POST', '/api/focus', { cookie: B, body: { date: '2026-11-15', duration_seconds: 600 } });
    assert.equal(fa.status, 201, fa.text); assert.equal(fb.status, 201, fb.text);
    assert.deepEqual((await call(proc, 'GET', '/api/focus?date=2026-11-15', { cookie: A })).json, [fa.json]);
    assert.deepEqual((await call(proc, 'GET', '/api/focus/stats?days=7', { cookie: B })).json.map((r) => r.total_seconds), [600]);
    const bad = await fetch(`${proc.base}/api/focus`, { method: 'POST', headers: { cookie: A, 'content-type': 'application/json' }, body: JSON.stringify({ duration_seconds: 1.5 }), signal: AbortSignal.timeout(3000) });
    assert.equal(bad.status, 500); assert.match(await bad.text(), /sqlite_coercion_unsupported/);
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
    assert.deepEqual(control.prepare('SELECT title FROM purchase_items').pluck().all(), ['Fone do Jota']);
    assert.deepEqual(other.prepare('SELECT title FROM purchase_items').pluck().all(), ['Livro da Bia']);
    assert.deepEqual(control.prepare('SELECT note FROM wellness_checks').pluck().all(), ['Pelo Alfred']);
    assert.deepEqual(other.prepare('SELECT mood FROM wellness_checks').pluck().all(), [2]);
    assert.deepEqual(control.prepare('SELECT duration_seconds FROM focus_sessions').pluck().all(), [1500]);
    assert.deepEqual(other.prepare('SELECT duration_seconds FROM focus_sessions').pluck().all(), [600]);
    assert.equal(fs.existsSync(path.join(apiDir, 'praxis.db-wal')) ? fs.statSync(path.join(apiDir, 'praxis.db-wal')).size : 0, 0, 'WAL consolidado no fechamento');
  });
});
