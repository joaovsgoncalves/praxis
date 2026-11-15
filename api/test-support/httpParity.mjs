/**
 * Arnês de paridade HTTP: a mesma sequência de requisições contra a rota antiga congelada (oráculo,
 * SQLite síncrono) e contra a rota nova sobre a camada assíncrona (SQLite e emulador Firestore).
 * Normaliza só o que é aleatório por natureza: UUID gerado pelo servidor e carimbo de hora.
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

const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const parityEngines = () => ['sqlite', ...(process.env.FIRESTORE_EMULATOR_HOST ? ['firestore'] : [])];

async function listen(mount, router, scopeMiddleware) {
  const app = express();
  app.use(express.json());
  if (scopeMiddleware) app.use(scopeMiddleware);
  app.use(mount, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}${mount}`, close: () => new Promise((r) => server.close(r)) };
}

/**
 * kind: 'oracle' | 'sqlite' | 'firestore'.
 * oracle(db) monta o router antigo; build(storage) monta o router novo.
 */
export async function makeParityApp(kind, { mount, dbOptions = {}, oracle, build }) {
  const cleanup = [];
  let app;
  if (kind === 'oracle') {
    const db = createTestDb(dbOptions);
    cleanup.push(() => db.close());
    app = await listen(mount, oracle(db));
  } else {
    const scope = new AsyncLocalStorage();
    let driver;
    if (kind === 'sqlite') {
      const db = createTestDb(dbOptions);
      cleanup.push(() => db.close());
      driver = createSqliteDriver({ open: () => db });
    } else {
      const host = process.env.FIRESTORE_EMULATOR_HOST;
      assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
      const client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
      cleanup.push(() => client.terminate());
      driver = createFirestoreDriver({ client, root: client.collection('parityRuns').doc(randomUUID()) });
    }
    const storage = createStorage({ driver, currentOwner: () => scope.getStore() });
    app = await listen(mount, build(storage), (req, res, next) => scope.run('alice', next));
  }
  return { ...app, dispose: async () => { await app.close(); for (const fn of cleanup) await fn(); } };
}

function normalizer() {
  const ids = new Map();
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (key === 'id' && typeof item === 'string' && UUID.test(item)) {
          if (!ids.has(item)) ids.set(item, `#uuid${ids.size + 1}`);
          return [key, ids.get(item)];
        }
        if ((key === 'created_date' || key === 'updated_date') && typeof item === 'string') {
          assert.match(item, STAMP);
          return [key, 'STAMP'];
        }
        return [key, walk(item)];
      }));
    }
    return value;
  };
  return walk;
}

/** Passo: [método, caminho, corpo?, corpoCru?] ou função (idsVistos) => passo. */
export async function runParityScript(app, steps) {
  const walk = normalizer(), seen = [], out = [];
  for (const step of steps) {
    const [method, path, body, raw] = typeof step === 'function' ? step(seen) : step;
    const res = await fetch(app.base + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const type = (res.headers.get('content-type') || '').split(';')[0];
    const text = await res.text();
    let shown;
    if (type === 'application/json') {
      const parsed = JSON.parse(text);
      for (const row of [parsed, parsed?.review, ...(Array.isArray(parsed) ? parsed : [])]) if (row?.id && !seen.includes(row.id)) seen.push(row.id);
      shown = JSON.stringify(walk(parsed));
    } else {
      shown = (text.match(/<pre>([^<]*)/) || [null, text])[1];
    }
    out.push({ step: typeof step === 'function' ? `${method} <id de uma linha anterior>` : `${method} ${path.slice(0, 80)}`, status: res.status, type, body: shown });
  }
  return out;
}
