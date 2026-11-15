/**
 * Extras do arnês de paridade para a fase 4 (test-support/httpParity.mjs fica intocado):
 *
 * - relógio de teste compartilhado: o oráculo lê `datetime('now')` do SQLite e a rota nova lê
 *   `now()` do serviço. Os dois passam a ler o mesmo relógio, que anda por requisição; assim
 *   `created_at` (que entra na ordem da timeline) sai igual e determinístico nos três motores;
 * - semente: as mesmas linhas no banco do oráculo e na camada nova (Firestore recebe a cópia das
 *   linhas que o preparo do banco legado grava, na mesma ordem de inserção).
 */
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './helpers.mjs';
import { createStorage } from '../storage/index.js';
import { createSqliteDriver } from '../storage/sqlite/driver.js';
import { createFirestoreDriver } from '../storage/firestore/driver.js';

const pad = (n) => String(n).padStart(2, '0');

/** Relógio que anda 1 s a cada `every` requisições (every > 1 cria empates de carimbo de propósito). */
export function createTestClock({ start = Date.UTC(2030, 0, 1, 9, 0, 0), every = 1 } = {}) {
  let requests = 0;
  const current = () => new Date(start + Math.floor(requests / every) * 1000);
  return {
    tick() { requests += 1; },
    now: current,
    stamp() {
      const d = current();
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    },
  };
}

/** `datetime('now')` do banco passa a ser o relógio de teste; qualquer outro uso de datetime falha alto. */
export function useClockInSqlite(db, clock) {
  db.function('datetime', { varargs: true, deterministic: false }, (...args) => {
    if (args.length === 1 && args[0] === 'now') return clock.stamp();
    throw new Error(`datetime fora do relógio de teste: ${JSON.stringify(args)}`);
  });
  return db;
}

async function listen(mount, router, before) {
  const app = express();
  app.use(express.json());
  app.use(before);
  app.use(mount, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}${mount}`, close: () => new Promise((r) => server.close(r)) };
}

/**
 * kind: 'oracle' | 'sqlite' | 'firestore'.
 * oracle(db) monta o router antigo; build(storage, { clock, db }) monta o router novo.
 * seedSqlite(db): semente gravada direto no SQLite (oráculo e motor sqlite).
 * seedStorage(storage): semente do Firestore pela camada nova (só dados, sem regra).
 */
export async function makeClockedParityApp(kind, { mount, dbOptions = {}, oracle, build, seedSqlite, seedStorage, every = 1, owner = 'alice' }) {
  const clock = createTestClock({ every });
  const cleanup = [];
  let app;
  const tick = (req, res, next) => { clock.tick(); next(); };
  if (kind === 'oracle') {
    const db = useClockInSqlite(createTestDb(dbOptions), clock);
    cleanup.push(() => db.close());
    if (seedSqlite) seedSqlite(db);
    app = await listen(mount, oracle(db), tick);
    return { ...app, clock, db, dispose: async () => { await app.close(); for (const fn of cleanup) await fn(); } };
  }
  const scope = new AsyncLocalStorage();
  let driver, db = null;
  if (kind === 'sqlite') {
    db = useClockInSqlite(createTestDb(dbOptions), clock);
    cleanup.push(() => db.close());
    if (seedSqlite) seedSqlite(db);
    driver = createSqliteDriver({ open: () => db });
  } else {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    const client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    cleanup.push(() => client.terminate());
    driver = createFirestoreDriver({ client, root: client.collection('parityRuns').doc(randomUUID()) });
  }
  const storage = createStorage({ driver, currentOwner: () => scope.getStore() });
  if (kind === 'firestore' && seedStorage) await scope.run(owner, () => seedStorage(storage));
  app = await listen(mount, build(storage, { clock, db }), (req, res, next) => { clock.tick(); scope.run(owner, next); });
  return { ...app, clock, db, storage, as: (fn) => scope.run(owner, fn), dispose: async () => { await app.close(); for (const fn of cleanup) await fn(); } };
}

/** Linhas de uma tabela em ordem de inserção (rowid), para copiar a semente para outro motor. */
export function rowsInInsertOrder(db, table) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
}
