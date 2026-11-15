import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../lib/dbInit.js';
import { createSqliteConnections } from './connections.js';
import { createStorageRuntime, storageEngineFromEnv } from '../runtime.js';

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-conn-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = (owner) => path.join(dir, `${owner}.db`);
  const prepared = [];
  // O papel da fachada legada: criar o arquivo e o esquema antes da conexão dedicada abrir.
  const prepare = (owner) => {
    prepared.push(owner);
    if (fs.existsSync(file(owner))) return;
    const db = new Database(file(owner)); db.pragma('journal_mode = WAL'); initializeDatabase(db); db.close();
  };
  return { dir, file, prepare, prepared };
}
function runtime(box, scope, extra = {}) {
  return createStorageRuntime({ engine: 'sqlite', currentOwner: () => scope.getStore(), now: () => new Date('2026-11-15T12:00:00Z'), sqlite: { pathFor: box.file, prepare: box.prepare, ...extra } });
}

test('conexão dedicada só abre arquivo existente, depois do preparo, uma por dono', (t) => {
  const box = sandbox(t);
  const noPrepare = createSqliteConnections({ pathFor: box.file });
  assert.throws(() => noPrepare.get('ninguem'), /unable to open|does not exist|SQLITE_CANTOPEN/i);
  assert.equal(fs.existsSync(box.file('ninguem')), false, 'a camada nova não cria banco');
  const conns = createSqliteConnections({ pathFor: box.file, prepare: box.prepare });
  const a = conns.get('alice');
  assert.equal(conns.get('alice'), a);
  assert.notEqual(conns.get('bob'), a);
  assert.deepEqual(box.prepared, ['alice', 'bob']);
  assert.throws(() => conns.get('../x'), { code: 'tenant_scope_missing' });
  assert.equal(conns.closeAll(), 2);
  assert.throws(() => conns.get('alice'), { code: 'storage_closed' });
  assert.equal(a.open, false);
});

test('transação da camada nova não deixa código legado síncrono rodar no meio', async (t) => {
  const box = sandbox(t), scope = new AsyncLocalStorage(), rt = runtime(box, scope);
  t.after(() => rt.close());
  box.prepare('alice');
  const legacy = new Database(box.file('alice'), { timeout: 50 });
  t.after(() => legacy.close());
  const order = [];
  await scope.run('alice', () => rt.storage.transaction(async (tx) => {
    setImmediate(() => order.push('macrotarefa legada'));
    await tx.weeklyReviews.getByWeek('2026-11-09');
    await tx.weeklyReviews.create({ id: 'r1', week_start: '2026-11-09' });
    await tx.weeklyReviews.create({ id: 'r2', week_start: '2026-11-16' });
    order.push('commit');
  }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, ['commit', 'macrotarefa legada']);
  assert.equal(legacy.prepare('SELECT COUNT(*) n FROM weekly_reviews').get().n, 2, 'a conexão legada vê o que foi confirmado');
});

test('contraprova: esperar timer dentro da transação trava a escrita legada (por isso é proibido)', async (t) => {
  const box = sandbox(t), scope = new AsyncLocalStorage(), rt = runtime(box, scope);
  t.after(() => rt.close());
  box.prepare('alice');
  const legacy = new Database(box.file('alice'), { timeout: 50 });
  t.after(() => legacy.close());
  let legacyError = null, seenByLegacy = null;
  await scope.run('alice', () => rt.storage.transaction(async (tx) => {
    await tx.weeklyReviews.create({ id: 'r1', week_start: '2026-11-09' });
    await new Promise((resolve) => setTimeout(() => {
      seenByLegacy = legacy.prepare('SELECT COUNT(*) n FROM weekly_reviews').get().n;
      try { legacy.prepare("INSERT INTO weekly_reviews (id, week_start) VALUES ('x', '2026-12-07')").run(); } catch (error) { legacyError = error; }
      resolve();
    }, 5));
  }));
  assert.equal(seenByLegacy, 0, 'leitura legada não enxerga a escrita não confirmada');
  assert.equal(legacyError?.code, 'SQLITE_BUSY');
});

test('desligamento espera o que está em andamento, fecha e recusa chamadas novas', async (t) => {
  const box = sandbox(t), scope = new AsyncLocalStorage(), rt = runtime(box, scope);
  let release;
  const gate = new Promise((r) => { release = r; });
  const running = scope.run('alice', () => rt.storage.transaction(async (tx) => {
    await tx.weeklyReviews.create({ id: 'r1', week_start: '2026-11-09' });
    await gate;
    return 'confirmou';
  }));
  await new Promise((r) => setImmediate(r));
  const closing = rt.close();
  await assert.rejects(() => scope.run('alice', () => rt.storage.weeklyReviews.list()), { code: 'storage_closed' });
  let closed = false;
  closing.then(() => { closed = true; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(closed, false, 'não fecha com transação em andamento');
  release();
  assert.equal(await running, 'confirmou');
  assert.equal(await closing, 1);
  assert.equal(await rt.close(), 1, 'segundo close devolve o mesmo resultado');
  await assert.rejects(() => scope.run('alice', () => rt.storage.transaction(async () => {})), { code: 'storage_closed' });
  const check = new Database(box.file('alice'), { readonly: true });
  assert.equal(check.prepare('SELECT COUNT(*) n FROM weekly_reviews').get().n, 1);
  check.close();
});

test('motor pelo ambiente: só sqlite nesta versão; firestore só injetado', () => {
  assert.equal(storageEngineFromEnv({}), 'sqlite');
  assert.equal(storageEngineFromEnv({ PRAXIS_STORAGE: 'sqlite' }), 'sqlite');
  for (const value of ['firestore', 'Firestore', '', 'postgres']) assert.throws(() => storageEngineFromEnv({ PRAXIS_STORAGE: value }), /não está disponível/);
  assert.throws(() => createStorageRuntime({ engine: 'firestore', currentOwner: () => 'a' }), /injetado/);
  assert.throws(() => createStorageRuntime({ engine: 'mongo', currentOwner: () => 'a' }), /desconhecido/);
});
