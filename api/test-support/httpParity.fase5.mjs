/**
 * Arnês de paridade HTTP de finanças (fase 5). Mesmo princípio de test-support/httpParity.mjs, com o
 * que finanças precisa a mais:
 * - cabeçalhos por passo (Idempotency-Key);
 * - carimbos ISO (`created_at`, `updated_at`...) gerados pelo relógio do servidor;
 * - UUID gerado pelo servidor em QUALQUER campo (conta referenciada por `account_id`);
 * - roteador novo recebe a camada assíncrona E o banco legado (rotas ainda não migradas);
 * - pausa curta entre passos: o carimbo tem milissegundos e a ordem `created_at DESC` não pode
 *   depender de dois passos caírem no mesmo milissegundo num motor e não no outro.
 * Normaliza só o que é aleatório ou de relógio; todo o resto é comparado byte a byte.
 */
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import express from 'express';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './helpers.mjs';
import { createStorage } from '../storage/index.js';
import { createSqliteDriver } from '../storage/sqlite/driver.js';
import { createFirestoreDriver } from '../storage/firestore/driver.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SQL_STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const parityEngines = () => ['sqlite', ...(process.env.FIRESTORE_EMULATOR_HOST ? ['firestore'] : [])];

/** Camada assíncrona SQLite sobre a MESMA conexão de um teste (só para arnês de teste). */
export function sqliteTestStorage(db, owner = 'finance-test') {
  return createStorage({ driver: createSqliteDriver({ open: () => db }), currentOwner: () => owner });
}

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
 * kind: 'oracle' | 'sqlite' | 'firestore'. oracle(db) monta o router antigo; build({ storage, db })
 * monta o novo. `db` (legado) também existe para as rotas que ainda não migraram.
 * Devolve também `db` (SQLite do oráculo/legado) e `storage` para conferências diretas.
 */
export async function makeFinanceParityApp(kind, { mount = '/api/finance', dbOptions = { withFinance: true }, oracle, build }) {
  const cleanup = [];
  const db = createTestDb(dbOptions);
  cleanup.push(() => db.close());
  let app, storage = null;
  if (kind === 'oracle') {
    app = await listen(mount, oracle(db));
  } else {
    const scope = new AsyncLocalStorage();
    let driver;
    if (kind === 'sqlite') {
      driver = createSqliteDriver({ open: () => db });
    } else {
      const host = process.env.FIRESTORE_EMULATOR_HOST;
      assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
      const client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
      cleanup.push(() => client.terminate());
      driver = createFirestoreDriver({ client, root: client.collection('financeParityRuns').doc(randomUUID()) });
    }
    storage = createStorage({ driver, currentOwner: () => scope.getStore() });
    app = await listen(mount, build({ storage, db }), (req, res, next) => scope.run('alice', next));
  }
  return { ...app, db, storage, dispose: async () => { await app.close(); for (const fn of cleanup) await fn(); } };
}

function normalizer() {
  const ids = new Map();
  const walk = (value, key) => {
    if (Array.isArray(value)) return value.map((item) => walk(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, item]) => [k, walk(item, k)]));
    if (typeof value === 'string') {
      if (UUID.test(value)) {
        if (!ids.has(value)) ids.set(value, `#uuid${ids.size + 1}`);
        return ids.get(value);
      }
      if (ISO.test(value)) return 'ISO';
      if ((key === 'created_date' || key === 'updated_date') && SQL_STAMP.test(value)) return 'STAMP';
    }
    return value;
  };
  return (value) => walk(value);
}

/**
 * Passo: [método, caminho, corpo?, { raw?, headers? }?] ou função (idsVistos) => passo.
 * `idsVistos` acumula o `id` de toda linha devolvida (objeto, lista ou `row`).
 */
export async function runFinanceScript(app, steps, { pauseMs = 3 } = {}) {
  const walk = normalizer(), seen = [], out = [];
  for (const step of steps) {
    const [method, path, body, options = {}] = typeof step === 'function' ? step(seen) : step;
    await sleep(pauseMs);
    const headers = { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(options.headers || {}) };
    const res = await fetch(app.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : options.raw ? body : JSON.stringify(body),
    });
    const type = (res.headers.get('content-type') || '').split(';')[0];
    const text = await res.text();
    let shown;
    if (type === 'application/json' && text !== '') {
      const parsed = JSON.parse(text);
      for (const row of [parsed, parsed?.row, ...(Array.isArray(parsed) ? parsed : [])]) if (row?.id && !seen.includes(row.id)) seen.push(row.id);
      shown = JSON.stringify(walk(parsed));
    } else {
      shown = (text.match(/<pre>([^<]*)/) || [null, text])[1];
    }
    out.push({ step: typeof step === 'function' ? `${method} <id de uma linha anterior>` : `${method} ${path.slice(0, 80)}`, status: res.status, type, body: shown });
  }
  return out;
}
