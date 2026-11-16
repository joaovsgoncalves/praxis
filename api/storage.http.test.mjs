/**
 * Rotas já servidas pela camada nova (revisões semanais, compras, foco, bem-estar, metas, gamificação, hábitos e tarefas), no servidor de verdade: cópia isolada da API (banco novo,
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
      OPENAI_API_KEY: '',
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

  await t.test('metas pela camada nova: contas separadas, vínculo inicial, exclusão solta a tarefa e goals.list do Alfred', async () => {
    const ga = await call(proc, 'POST', '/api/goals', { cookie: A, body: { title: 'Meta do Jota', initial_link: { type: 'task', title: 'Primeiro passo', date: '2026-11-20' } } });
    const gb = await call(proc, 'POST', '/api/goals', { cookie: B, body: { title: 'Meta da Bia', initial_link: { type: 'habit' } } });
    assert.equal(ga.status, 201, ga.text); assert.equal(gb.status, 201, gb.text);
    assert.equal(ga.json.linked.type, 'task'); assert.equal(gb.json.linked.type, 'habit');
    assert.deepEqual((await call(proc, 'GET', '/api/goals', { key: API_KEY })).json.map((g) => g.title), ['Meta do Jota'], 'goals.list do Alfred: só as do dono legado');
    assert.equal((await call(proc, 'GET', `/api/goals/${ga.json.goal.id}`, { cookie: B })).status, 404);
    assert.equal((await call(proc, 'DELETE', `/api/goals/${ga.json.goal.id}`, { cookie: B })).status, 404, 'a outra conta não apaga');
    const task = (await call(proc, 'GET', '/api/tasks?date=2026-11-20', { cookie: A })).json.find((r) => r.id === ga.json.linked.id);
    assert.equal(task?.goal_id, ga.json.goal.id, 'a rota legada de tarefas vê a tarefa criada pela camada nova');
    const upd = await call(proc, 'PUT', `/api/goals/${ga.json.goal.id}`, { cookie: A, body: { deadline: '2026-12-31', manual_progress: 30 } });
    assert.equal(upd.status, 200, upd.text); assert.equal(upd.json.deadline, '2026-12-31');
    const del = await call(proc, 'DELETE', `/api/goals/${ga.json.goal.id}`, { cookie: A });
    assert.deepEqual(del.json, { success: true, unlinked: { tasks: 1, habits: 0 } });
    const after = (await call(proc, 'GET', '/api/tasks?date=2026-11-20', { cookie: A })).json.find((r) => r.id === ga.json.linked.id);
    assert.equal(after?.goal_id, null, 'tarefa preservada, sem vínculo');
  });

  await t.test('gamificação pela camada nova: contas separadas, XP da tarefa legada, conquista com bônus e chave do agente', async () => {
    const made = await call(proc, 'POST', '/api/tasks', { cookie: A, body: { title: 'Tarefa do XP', date: '2026-11-16' } });
    assert.equal(made.status, 201, made.text);
    assert.equal((await call(proc, 'PUT', `/api/tasks/${made.json.id}`, { cookie: A, body: { status: 'completed' } })).status, 200);
    // O XP da tarefa saiu da rota legada (conexão do servidor); a rota nova o enxerga pela conexão dedicada.
    assert.equal((await call(proc, 'GET', '/api/gamification', { cookie: A })).json.xp_total, 10);
    assert.equal((await call(proc, 'GET', '/api/gamification', { cookie: B })).json.xp_total, 0, 'a outra conta não recebe');
    const checked = await call(proc, 'POST', '/api/gamification/check-achievements', { cookie: A });
    assert.deepEqual(checked.json.new_achievements.map((a) => a.id), ['first_task']);
    assert.equal(checked.json.bonus_xp, 10);
    const add = await call(proc, 'POST', '/api/gamification/add-xp', { cookie: A, body: { amount: 25, reason: 'Pelo teste' } });
    assert.equal(add.status, 200, add.text); assert.equal(add.json.xp_total, 45);
    assert.equal((await call(proc, 'POST', '/api/gamification/add-xp', { cookie: B, body: { amount: 5 } })).json.xp_total, 5);
    assert.equal((await call(proc, 'POST', '/api/gamification/add-xp', { cookie: A, body: { amount: -1 } })).status, 400);
    assert.deepEqual((await call(proc, 'POST', '/api/gamification/check-achievements', { cookie: B })).json, { new_achievements: [], bonus_xp: 0 });
    assert.deepEqual((await call(proc, 'POST', '/api/gamification/check-achievements', { cookie: A })).json, { new_achievements: [], bonus_xp: 0 }, 'idempotente');
    const mine = (await call(proc, 'GET', '/api/gamification', { cookie: A })).json;
    assert.equal(mine.xp_total, 45); assert.equal(mine.xp_week, 45);
    assert.ok(mine.achievements.find((a) => a.id === 'first_task').unlocked_date);
    assert.deepEqual((await call(proc, 'GET', '/api/gamification', { key: API_KEY })).json, mine, 'chave do agente = conta do dono legado');
    assert.equal((await call(proc, 'GET', '/api/gamification', { cookie: B })).json.achievements.some((a) => a.unlocked_date), false);
    assert.equal((await call(proc, 'GET', '/api/gamification')).status, 401);
    // Estorno pela rota legada de tarefas volta o total que a rota nova lê.
    assert.equal((await call(proc, 'PUT', `/api/tasks/${made.json.id}`, { cookie: A, body: { status: 'pending' } })).status, 200);
    assert.equal((await call(proc, 'GET', '/api/gamification', { cookie: A })).json.xp_total, 35);
  });

  await t.test('hábitos pela camada nova: contas separadas, composto com passos, registro por dia, exclusão e rituais', async () => {
    const ha = await call(proc, 'POST', '/api/habits', { cookie: A, body: { title: 'P1 - Beber água', target_value: 2, unit: 'L' } });
    const hb = await call(proc, 'POST', '/api/habits', { cookie: B, body: { title: 'Ler da Bia' } });
    assert.equal(ha.status, 201, ha.text); assert.equal(hb.status, 201, hb.text);
    assert.equal(ha.json.title, 'Beber água', 'prefixo de prioridade sai');
    assert.deepEqual((await call(proc, 'GET', '/api/habits', { cookie: B })).json.map((h) => h.title).sort(), ['Ler da Bia', 'Meta da Bia'], 'só os hábitos da Bia (o outro veio do vínculo de meta)');
    assert.deepEqual((await call(proc, 'GET', '/api/habits', { key: API_KEY })).json.map((h) => h.title), ['Beber água'], 'chave do agente: conta do dono legado');
    const comp = await call(proc, 'POST', '/api/habits', { cookie: A, body: { title: 'Manhã', kind: 'compound', emoji: '🌅', children: [{ title: 'Alongar', preferred_time: '6:30' }, { title: 'Meditar', preferred_time: '07:00' }] } });
    assert.equal(comp.status, 201, comp.text); assert.equal(comp.json.total_steps, 2); assert.equal(comp.json.time_of_day, 'morning');
    const [step1, step2] = comp.json.children;
    const today = '2026-11-10';
    // registro: água com meta de 2 L; 0,5 + 0,5 não completa, 1,5 depois completa
    const part = await call(proc, 'POST', '/api/habit-logs', { cookie: A, body: { habit_id: ha.json.id, date: today, increment: 0.5 } });
    assert.equal(part.status, 201, part.text); assert.equal(part.json.completed, 0);
    const more = await call(proc, 'POST', '/api/habit-logs', { cookie: A, body: { habit_id: ha.json.id, date: today, increment: 1.5 } });
    assert.equal(more.status, 200, more.text); assert.equal(more.json.completed, 1); assert.equal(more.json.value, 2); assert.equal(more.json.id, part.json.id);
    assert.equal((await call(proc, 'POST', '/api/habit-logs', { cookie: B, body: { habit_id: ha.json.id, date: today } })).status, 404, 'a outra conta não registra no meu hábito');
    assert.equal((await call(proc, 'POST', '/api/habit-logs', { cookie: A, body: { habit_id: comp.json.id, date: today } })).status, 400);
    for (const step of [step1, step2]) assert.equal((await call(proc, 'POST', '/api/habit-logs', { cookie: A, body: { habit_id: step.id, date: today } })).status, 201);
    assert.deepEqual((await call(proc, 'GET', `/api/habit-logs?date=${today}`, { cookie: B })).json, []);
    const tree = (await call(proc, 'GET', `/api/habits?date=${today}`, { cookie: A })).json;
    assert.equal(tree.find((h) => h.id === comp.json.id).day_outcome, 'done');
    assert.equal(tree.find((h) => h.id === ha.json.id).completed_today, true);
    const rituals = (await call(proc, 'GET', `/api/rituals?date=${today}`, { cookie: A })).json;
    assert.deepEqual(rituals.map((r) => [r.name, r.completed, r.total]), [['Manhã', 2, 2]]);
    assert.equal((await call(proc, 'POST', '/api/rituals', { cookie: A, body: {} })).status, 410);
    assert.equal((await call(proc, 'GET', `/api/habits/${ha.json.id}/streak`, { cookie: A })).json.current_streak, 0, 'o dia do registro não é o dia de hoje do servidor');
    // editar e apagar o composto: passos arquivados, registros do hábito apagado somem
    const upd = await call(proc, 'PUT', `/api/habits/${comp.json.id}`, { cookie: A, body: { status: 'paused' } });
    assert.equal(upd.status, 200); assert.deepEqual(upd.json.children.map((c) => c.status), ['paused', 'paused']);
    assert.deepEqual((await call(proc, 'DELETE', `/api/habits/${comp.json.id}`, { cookie: A })).json, { success: true });
    const after = (await call(proc, 'GET', '/api/habits?status=all', { cookie: A })).json;
    assert.deepEqual(after.map((h) => [h.title, h.status]).sort(), [['Alongar', 'archived'], ['Beber água', 'active'], ['Meditar', 'archived']]);
    assert.equal((await call(proc, 'GET', `/api/habit-logs?habit_id=${step1.id}`, { cookie: A })).json.length, 1, 'registro do passo arquivado continua');
    assert.deepEqual((await call(proc, 'DELETE', `/api/habit-logs/${part.json.id}`, { cookie: B })).json, { success: true }, 'mesmo envelope; a outra conta não apaga');
    assert.equal((await call(proc, 'GET', `/api/habit-logs?habit_id=${ha.json.id}`, { cookie: A })).json.length, 1);
    assert.equal((await call(proc, 'GET', '/api/habits')).status, 401);
  });

  await t.test('tarefas pela camada nova: conta própria, XP, série, checklist, adiar, ideia, excluir e chave do agente', async () => {
    const made = spawnSync(process.execPath, ['scripts/create-user.mjs', 'Caio.Teste', 'Caio'], { cwd: apiDir, env: { ...process.env, PRAXIS_NEW_USER_PASSWORD: PASS_B }, encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    const C = (await call(proc, 'POST', '/api/auth/login', { body: { username: 'caio.teste', password: PASS_B } })).cookie;
    assert.ok(C);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
    const t1 = await call(proc, 'POST', '/api/tasks', { cookie: C, body: { title: 'P1 - Série do Caio', date: today, recurrence: 'daily', sort_order: 5 } });
    assert.equal(t1.status, 201, t1.text); assert.equal(t1.json.title, 'Série do Caio'); assert.deepEqual(t1.json.calendar_sync, { skipped: true }, 'conta sem agenda ligada');
    assert.equal((await call(proc, 'POST', '/api/tasks', { cookie: C, body: { title: 'Meta que não existe', goal_id: 'nada' } })).status, 400);
    // Alfred (chave) grava na conta do dono legado, não na do Caio.
    const alfred = await call(proc, 'POST', '/api/tasks', { key: API_KEY, body: { title: 'Pelo Alfred', date: today } });
    assert.equal(alfred.status, 201, alfred.text);
    assert.deepEqual((await call(proc, 'GET', '/api/tasks', { cookie: C })).json.map((r) => r.title), ['Série do Caio']);
    assert.ok((await call(proc, 'GET', '/api/tasks?limit=500', { key: API_KEY })).json.some((r) => r.id === alfred.json.id));
    assert.equal((await call(proc, 'PUT', `/api/tasks/${t1.json.id}`, { cookie: B, body: { title: 'invadida' } })).status, 404, 'a outra conta não edita');
    assert.equal((await call(proc, 'DELETE', `/api/tasks/${t1.json.id}`, { cookie: B })).status, 404);
    assert.equal((await call(proc, 'GET', `/api/tasks/${alfred.json.id}`, { cookie: C })).status, 404);

    // checklist: contagens na lista e no detalhe
    const c1 = await call(proc, 'POST', `/api/tasks/${t1.json.id}/checklist`, { cookie: C, body: { title: 'Passo 1' } });
    const c2 = await call(proc, 'POST', `/api/tasks/${t1.json.id}/checklist`, { cookie: C, body: { title: 'Passo 2' } });
    assert.equal(c1.status, 201, c1.text); assert.equal(c2.json.sort_order, 1);
    assert.equal((await call(proc, 'PATCH', `/api/tasks/${t1.json.id}/checklist/${c1.json.id}`, { cookie: C, body: { done: true } })).json.done, true);
    assert.deepEqual((await call(proc, 'GET', `/api/tasks/${t1.json.id}`, { cookie: C })).json.checklist_done, 1);
    assert.equal((await call(proc, 'GET', `/api/tasks/${t1.json.id}/checklist`, { cookie: B })).status, 404);

    // concluir: XP uma vez e próxima ocorrência; reabrir estorna e não duplica a série
    const done = await call(proc, 'PUT', `/api/tasks/${t1.json.id}`, { cookie: C, body: { status: 'completed' } });
    assert.equal(done.status, 200, done.text); assert.equal(done.json.xp_sync.awarded, 10); assert.equal(done.json.next_occurrence.created, true);
    assert.equal((await call(proc, 'GET', '/api/gamification', { cookie: C })).json.xp_total, 10);
    const reopened = await call(proc, 'PUT', `/api/tasks/${t1.json.id}`, { cookie: C, body: { status: 'pending' } });
    assert.equal(reopened.json.xp_sync.awarded, -10);
    const again = await call(proc, 'PUT', `/api/tasks/${t1.json.id}`, { cookie: C, body: { status: 'completed' } });
    assert.equal(again.json.next_occurrence.created, false, 'a segunda conclusão acha a ocorrência que já existe'); assert.equal(again.json.next_occurrence.id, done.json.next_occurrence.id);

    // adiar, ideia e posição
    const later = await call(proc, 'POST', '/api/tasks', { cookie: C, body: { title: 'Adiar', date: today } });
    const pushed = await call(proc, 'POST', `/api/tasks/${later.json.id}/not-today`, { cookie: C, body: { reason: 'Energy' } });
    assert.equal(pushed.status, 200, pushed.text); assert.equal(pushed.json.day_outcome, 'not_today'); assert.equal(pushed.json.day_outcome_reason, 'energy'); assert.ok(pushed.json.date > today);
    const idea = await call(proc, 'POST', '/api/tasks', { cookie: C, body: { title: 'Ideia solta', category: 'ideias' } });
    assert.equal(idea.json.idea_status, 'capturada');
    const promoted = await call(proc, 'POST', `/api/ideas/${idea.json.id}/to-task`, { cookie: C, body: {} });
    assert.equal(promoted.status, 201, promoted.text); assert.equal(promoted.json.idea.idea_status, 'virou_tarefa'); assert.equal(promoted.json.task.source_idea_id, idea.json.id);
    assert.equal((await call(proc, 'POST', `/api/ideas/${idea.json.id}/to-task`, { cookie: C, body: {} })).status, 409);
    const reordered = await call(proc, 'PATCH', '/api/tasks/reorder', { cookie: C, body: { ordered_ids: [promoted.json.task.id, later.json.id] } });
    assert.equal(reordered.json.updated, 2); assert.deepEqual(reordered.json.tasks.slice(0, 2).map((r) => r.id), [promoted.json.task.id, later.json.id]);

    // excluir: o XP da tarefa concluída é estornado, o checklist some e nada vaza para a outra conta
    assert.deepEqual((await call(proc, 'DELETE', `/api/tasks/${t1.json.id}`, { cookie: C })).json.xp_sync.awarded, -10);
    assert.equal((await call(proc, 'GET', '/api/gamification', { cookie: C })).json.xp_total, 0);
    assert.equal((await call(proc, 'GET', `/api/tasks/${t1.json.id}/checklist`, { cookie: C })).status, 404);
    assert.equal((await call(proc, 'GET', '/api/tasks')).status, 401);
    const bad = await fetch(`${proc.base}/api/tasks?limit=1.5`, { headers: { cookie: C }, signal: AbortSignal.timeout(3000) });
    assert.equal(bad.status, 500); assert.match(await bad.text(), /datatype mismatch/);
  });

  await t.test('configurações pela camada nova (fase 4): cada conta grava a sua linha, no arquivo dela', async () => {
    const sa = await call(proc, 'PUT', '/api/user/settings', { cookie: A, body: { full_name: 'Jota', focus_weekly_goal_minutes: 300 } });
    assert.equal(sa.status, 200, sa.text);
    assert.equal((await call(proc, 'PUT', '/api/user/settings', { cookie: B, body: { list_density: 'compact' } })).status, 200);
    const gb = (await call(proc, 'GET', '/api/user/settings', { cookie: B })).json;
    assert.deepEqual([gb.full_name, gb.list_density, gb.focus_weekly_goal_minutes], ['João Victor', 'compact', null], 'a da Bia não pegou a do Jota');
    const ga = (await call(proc, 'GET', '/api/user/settings', { key: API_KEY })).json;
    assert.deepEqual(ga, sa.json, 'chave do agente lê a linha do dono legado');
    assert.equal((await call(proc, 'PUT', '/api/user/settings', { cookie: A, body: { list_density: 'bad' } })).status, 400);
    assert.equal((await fetch(`${proc.base}/api/user/settings`, { method: 'PUT', headers: { cookie: A, 'content-type': 'application/json' }, body: '{"full_name":true}', signal: AbortSignal.timeout(3000) })).status, 500, 'erro de ligação responde, não pendura');
    const control = new Database(path.join(apiDir, 'praxis.db'), { readonly: true });
    const idB = control.prepare("SELECT id FROM praxis_users WHERE username = 'bia.teste'").pluck().get();
    const other = new Database(path.join(apiDir, 'data', 'users', `${idB}.db`), { readonly: true });
    try {
      assert.deepEqual(control.prepare('SELECT full_name, focus_weekly_goal_minutes FROM user_settings').all(), [{ full_name: 'Jota', focus_weekly_goal_minutes: 300 }]);
      assert.deepEqual(other.prepare('SELECT full_name, list_density FROM user_settings').all(), [{ full_name: 'João Victor', list_density: 'compact' }]);
    } finally { control.close(); other.close(); }
  });

  await t.test('frentes pela camada nova (fase 4): contas separadas e fluxo do Alfred com revisão', async () => {
    const la = (await call(proc, 'GET', '/api/projects', { cookie: A })).json;
    assert.equal(la.length, 9, 'semente só no banco do dono legado');
    assert.deepEqual((await call(proc, 'GET', '/api/projects', { cookie: B })).json, []);
    const mine = await call(proc, 'POST', '/api/projects', { cookie: B, body: { slug: 'frente-da-bia', name: 'Da Bia', next_step: 'Começar' } });
    assert.equal(mine.status, 201, mine.text);
    assert.equal((await call(proc, 'GET', '/api/projects/frente-da-bia', { cookie: A })).status, 404);
    assert.equal((await call(proc, 'PATCH', '/api/projects/praxis', { cookie: B, body: { name: 'invadida' } })).status, 404);
    const read = (await call(proc, 'GET', '/api/projects/praxis', { key: API_KEY })).json;
    const ok = await call(proc, 'PATCH', '/api/projects/praxis', { key: API_KEY, body: { next_step: 'Pelo Alfred', expected_revision: read.revision } });
    assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.revision, read.revision + 1);
    const stale = await call(proc, 'PATCH', '/api/projects/praxis', { key: API_KEY, body: { next_step: 'velho', expected_revision: read.revision } });
    assert.deepEqual([stale.status, stale.json], [409, { error: 'REVISION_CHANGED', current_revision: read.revision + 1 }]);
    const done = await call(proc, 'POST', '/api/projects/praxis/complete-next-step', { key: API_KEY, body: { expected_step: 'Pelo Alfred' } });
    assert.equal(done.status, 200, done.text); assert.equal(done.json.update.summary, 'Concluído: Pelo Alfred');
    assert.equal((await call(proc, 'GET', '/api/projects/praxis/updates', { cookie: A })).json.length, 1);
    assert.equal((await call(proc, 'GET', '/api/projects/frente-da-bia/updates', { cookie: B })).json.length, 0);
    const control = new Database(path.join(apiDir, 'praxis.db'), { readonly: true });
    const idB = control.prepare("SELECT id FROM praxis_users WHERE username = 'bia.teste'").pluck().get();
    const other = new Database(path.join(apiDir, 'data', 'users', `${idB}.db`), { readonly: true });
    try {
      assert.deepEqual(control.prepare("SELECT next_step, revision FROM projects WHERE slug = 'praxis'").get(), { next_step: '', revision: read.revision + 2 });
      assert.deepEqual(other.prepare('SELECT slug FROM projects').pluck().all(), ['frente-da-bia']);
      assert.equal(control.prepare("SELECT COUNT(*) FROM projects WHERE slug = 'frente-da-bia'").pluck().get(), 0);
    } finally { control.close(); other.close(); }
  });

  await t.test('orientação do dia pela camada nova (fase 4): trava do Alfred e contas separadas', async () => {
    const today = (await call(proc, 'GET', '/api/projects/guidance/today', { key: API_KEY })).json;
    const body = { source: 'alfred', generated_at: `${today.date}T07:50:00-03:00`, summary: 'Do Jota', priorities: [{ rank: 1, action: 'Revisar', reason_code: 'manual', reason: 'hoje', project_slug: 'praxis' }] };
    const first = await call(proc, 'PUT', `/api/projects/guidance/${today.date}`, { key: API_KEY, body: { ...body, expected_generated_at: today.generated_at } });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.json.priorities[0].project.name, 'Praxis');
    const blind = await call(proc, 'PUT', `/api/projects/guidance/${today.date}`, { key: API_KEY, body: { ...body, expected_generated_at: null } });
    assert.deepEqual([blind.status, blind.json.error], [409, 'GUIDANCE_CHANGED']);
    assert.deepEqual((await call(proc, 'GET', '/api/projects/guidance/today', { cookie: A })).json, first.json);
    assert.equal((await call(proc, 'GET', '/api/projects/guidance/today', { cookie: B })).json.fresh, false, 'a da Bia continua vazia');
    const bia = await call(proc, 'PUT', `/api/projects/guidance/${today.date}`, { cookie: B, body: { ...body, summary: 'Da Bia', expected_generated_at: null, priorities: [{ rank: 1, action: 'a', reason_code: 'manual', reason: 'b', project_slug: 'frente-da-bia' }] } });
    assert.equal(bia.status, 200, bia.text);
    const notMine = await call(proc, 'PUT', `/api/projects/guidance/${today.date}`, { cookie: B, body: { ...body, expected_generated_at: body.generated_at } });
    assert.deepEqual([notMine.status, notMine.json.error], [400, 'project_slug not found: praxis'], 'frente de outra conta não existe aqui');
    const control = new Database(path.join(apiDir, 'praxis.db'), { readonly: true });
    try { assert.deepEqual(control.prepare('SELECT summary FROM continuity_guidance').pluck().all(), ['Do Jota']); } finally { control.close(); }
  });

  await t.test('insights de leitura pela camada nova (fase 4): cada conta lê só os seus dados', async () => {
    const made = await call(proc, 'POST', '/api/tasks', { cookie: A, body: { title: 'Declarar imposto', date: '2026-01-10', category: 'pessoal', priority: 'high' } });
    assert.ok([200, 201].includes(made.status), made.text);
    const titles = (res) => res.json.items.map((item) => item.title);
    const mine = await call(proc, 'GET', '/api/insights/avoidance?date=2026-11-16', { cookie: A });
    assert.equal(mine.status, 200, mine.text);
    assert.ok(titles(mine).includes('Declarar imposto'));
    assert.ok(!titles(await call(proc, 'GET', '/api/insights/avoidance?date=2026-11-16', { cookie: B })).includes('Declarar imposto'), 'a Bia não vê a tarefa do Jota');
    assert.ok(titles(await call(proc, 'GET', '/api/insights/avoidance?date=2026-11-16', { key: API_KEY })).includes('Declarar imposto'), 'chave do agente lê a conta do dono legado');
    const weekA = (await call(proc, 'GET', '/api/insights/weekly?week_start=2026-02-02', { cookie: A })).json;
    const weekB = (await call(proc, 'GET', '/api/insights/weekly?week_start=2026-02-02', { cookie: B })).json;
    assert.deepEqual([weekA.bottlenecks.overdue_tasks_count, weekB.bottlenecks.overdue_tasks_count], [1, 0]);
    for (const url of ['/api/insights/best-hours', '/api/insights/correlation']) {
      assert.equal((await call(proc, 'GET', url, { cookie: B })).status, 200, url);
    }
    const mirror = await call(proc, 'POST', '/api/praxia/confront', { cookie: A, body: { date: '2026-11-16' } });
    assert.deepEqual([mirror.status, mirror.json.source], [200, 'rules'], 'sem chave da OpenAI responde com as regras, sem rede');
    const bad = await fetch(`${proc.base}/api/insights/avoidance?date=lixo`, { headers: { cookie: A }, signal: AbortSignal.timeout(3000) });
    assert.deepEqual([bad.status, (await bad.json()).error], [500, 'Invalid time value'], 'erro responde em JSON, não pendura');
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
    assert.deepEqual(control.prepare('SELECT source_type, amount, reversed_date IS NOT NULL FROM xp_events ORDER BY source_type, amount').raw().all(),
      [['achievement', 10, 0], ['manual', 25, 0], ['task', 10, 1]], 'eventos de XP do dono: tarefa estornada, conquista e prêmio manual');
    assert.deepEqual(other.prepare('SELECT source_type, amount FROM xp_events').raw().all(), [['manual', 5]]);
    assert.deepEqual([control, other].map((db) => db.prepare("SELECT xp_total FROM gamification WHERE id = 'main'").pluck().get()), [35, 5], 'espelho em cada conta');
    assert.deepEqual(control.prepare('SELECT title, status FROM habits WHERE source NOT LIKE \'goal_wizard\' ORDER BY title').raw().all(), [['Alongar', 'archived'], ['Beber água', 'active'], ['Meditar', 'archived']]);
    assert.deepEqual(other.prepare("SELECT title FROM habits WHERE source = 'manual'").pluck().all(), ['Ler da Bia']);
    assert.equal(control.prepare('SELECT COUNT(*) FROM habit_logs').pluck().get(), 3, 'água e os dois passos');
    assert.equal(other.prepare('SELECT COUNT(*) FROM habit_logs').pluck().get(), 0);
    assert.equal(control.prepare('SELECT COUNT(*) FROM goals').pluck().get(), 0);
    assert.deepEqual(other.prepare('SELECT title FROM goals').pluck().all(), ['Meta da Bia']);
    assert.deepEqual(other.prepare("SELECT title, goal_id IS NOT NULL FROM habits WHERE source = 'goal_wizard'").raw().all(), [['Meta da Bia', 1]]);
    assert.deepEqual(control.prepare("SELECT title, goal_id FROM tasks WHERE source = 'goal_wizard'").raw().all(), [['Primeiro passo', null]]);
    const idC = control.prepare("SELECT id FROM praxis_users WHERE username = 'caio.teste'").pluck().get();
    const third = new Database(path.join(apiDir, 'data', 'users', `${idC}.db`), { readonly: true });
    t.after(() => third.close());
    assert.deepEqual(third.prepare('SELECT title FROM tasks ORDER BY title').pluck().all(), ['Adiar', 'Ideia solta', 'Ideia solta', 'Série do Caio'], 'conta do Caio: a série seguiu, a tarefa excluída saiu');
    assert.equal(third.prepare('SELECT COUNT(*) FROM task_checklist_items').pluck().get(), 0, 'checklist apagado com a tarefa');
    assert.equal(third.prepare('SELECT COUNT(*) FROM task_calendar_queue').pluck().get(), 0, 'conta sem agenda não grava intenção');
    assert.deepEqual(third.prepare('SELECT amount, reversed_date IS NOT NULL FROM xp_events').raw().all().sort(), [[10, 1], [10, 1]], 'dois prêmios da mesma origem, os dois estornados');
    assert.equal(control.prepare("SELECT COUNT(*) FROM tasks WHERE title = 'Pelo Alfred'").pluck().get(), 1, 'a tarefa do Alfred ficou no banco do dono legado');
    assert.equal(fs.existsSync(path.join(apiDir, 'praxis.db-wal')) ? fs.statSync(path.join(apiDir, 'praxis.db-wal')).size : 0, 0, 'WAL consolidado no fechamento');
  });
});

test('virada do dia no servidor: na subida fecha as vencidas de cada conta, uma vez, e a repetição não duplica', async (t) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const control = new Database(path.join(apiDir, 'praxis.db'));
  const idC = control.prepare("SELECT id FROM praxis_users WHERE username = 'caio.teste'").pluck().get();
  const files = [path.join(apiDir, 'praxis.db'), path.join(apiDir, 'data', 'users', `${idC}.db`)];
  control.close();
  for (const file of files) {
    const db = new Database(file);
    db.prepare(`INSERT INTO tasks (id, title, date, time, status, priority, category, sort_order, recurrence)
      VALUES ('rv-1', 'Vencida de janeiro', '2026-01-01', '07:00', 'pending', 'medium', 'pessoal', 500, 'daily')`).run();
    db.close();
  }
  const closedOn = (file) => {
    const db = new Database(file, { readonly: true });
    try {
      return {
        old: db.prepare("SELECT status, day_outcome, day_outcome_date FROM tasks WHERE id = 'rv-1'").get(),
        children: db.prepare("SELECT date, status FROM tasks WHERE recurrence_parent_id = 'rv-1'").all(),
        runs: db.prepare('SELECT day, closed FROM day_rollover_runs ORDER BY day').all(),
      };
    } finally { db.close(); }
  };
  for (const boot of [1, 2]) {
    const proc = start();
    t.after(() => { if (proc.child.exitCode === null) proc.child.kill('SIGKILL'); });
    await ready(proc);
    proc.child.kill('SIGTERM');
    assert.equal((await proc.exited).code, 0, proc.log.slice(-800));
    for (const file of files) {
      const got = closedOn(file);
      assert.deepEqual(got.old, { status: 'cancelled', day_outcome: 'missed', day_outcome_date: '2026-01-01' }, `subida ${boot}: a vencida fechou como não rolou (${path.basename(file)})`);
      assert.deepEqual(got.children, [{ date: today, status: 'pending' }], `subida ${boot}: uma só ocorrência de hoje, sem filho no passado`);
      assert.equal(got.runs.at(-1).day, today);
      assert.equal(got.runs.at(-1).closed >= 1, true, 'o dia registra o que fechou');
    }
    // O log só fala quando algo fechou ou o dia começou: a segunda subida do mesmo dia fica calada.
    if (boot === 1) assert.match(proc.log, /\[virada-do-dia\] \d{4}-\d\d-\d\d \(subida\)/);
    else assert.doesNotMatch(proc.log, /\[virada-do-dia\]/);
  }
});
