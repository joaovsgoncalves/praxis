/**
 * Arnês de paridade da fase 3: o mesmo de `httpParity.mjs` (que não se edita) mais duas coisas que
 * as rotas de rotina precisam para a comparação não depender da sorte:
 *
 * - `seed`: linhas de banco antigo (empates, NULL, tipos misturados) gravadas igual nos três motores:
 *   SQL direto no oráculo, repositório do storage nos motores novos, na mesma ordem (ordem de inserção).
 * - `clock`: relógio do teste. A rota nova recebe `now` dele; no oráculo, um gatilho TEMP grava o
 *   mesmo carimbo no `created_date` logo depois do INSERT (o DEFAULT `datetime('now')` com hora
 *   controlada). Sem isso, a ordem por `created_date` muda quando o roteiro cruza um segundo.
 *   O relógio parte da hora real (o oráculo usa `new Date()` em outras contas, ex.: corte do /stats).
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
import { createHabitsService, createHabitLogsService } from '../services/routine/habits.js';
import { createTasksService } from '../services/routine/tasks.js';

export { parityEngines, runParityScript } from './httpParity.mjs';

export const OWNER = 'alice';
const sqlStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

/** Relógio que só anda quando o roteiro manda. `reset()` antes de cada motor. */
export function testClock(start = new Date()) {
  const base = Math.floor(start.getTime() / 1000) * 1000;
  let offset = 0;
  return {
    now: () => new Date(base + offset),
    stamp: () => sqlStamp(new Date(base + offset)),
    advance(seconds) { offset += seconds * 1000; },
    reset() { offset = 0; },
  };
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
 * kind: 'oracle' | 'sqlite' | 'firestore'. Nos motores novos, `as(fn)` roda `fn` no escopo do dono do teste.
 * setup: { mount, dbOptions?, oracle(db), build(storage, clock), seed?: [{ table, domain, rows }],
 *          clock?, clockTables?: ['tabela', ...], mirror?: [{ table, domain }] (só Firestore: copia as
 *          linhas com que o esquema SQLite já nasce) }
 */
export async function makeParityApp(kind, setup) {
  const { mount, dbOptions = {}, oracle, build, seed = [], clock = null, clockTables = [], mirror = [] } = setup;
  const cleanup = [];
  let app, storage = null, db = null, as = null;
  if (kind === 'oracle') {
    db = createTestDb(dbOptions);
    cleanup.push(() => db.close());
    for (const { table, rows } of seed) {
      for (const row of rows) {
        const cols = Object.keys(row);
        db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c]));
      }
    }
    if (clock) {
      db.function('fase3_now', { deterministic: false }, () => clock.stamp());
      for (const table of clockTables) {
        db.exec(`CREATE TEMP TRIGGER fase3_clock_${table} AFTER INSERT ON main.${table} BEGIN
          UPDATE ${table} SET created_date = fase3_now() WHERE rowid = NEW.rowid; END`);
      }
    }
    app = await listen(mount, oracle(db));
  } else {
    const scope = new AsyncLocalStorage();
    let driver;
    if (kind === 'sqlite') {
      db = createTestDb(dbOptions);
      cleanup.push(() => db.close());
      driver = createSqliteDriver({ open: () => db });
    } else {
      const host = process.env.FIRESTORE_EMULATOR_HOST;
      assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
      const client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
      cleanup.push(() => client.terminate());
      driver = createFirestoreDriver({ client, root: client.collection('parityRuns').doc(randomUUID()) });
    }
    storage = createStorage({ driver, currentOwner: () => scope.getStore(), now: clock ? clock.now : undefined });
    as = (fn) => scope.run(OWNER, fn);
    await scope.run(OWNER, async () => {
      // Linhas que o esquema do SQLite já nasce tendo (ex.: conquistas, gamification 'main').
      if (kind === 'firestore' && mirror.length) {
        const fresh = createTestDb(dbOptions);
        try {
          for (const { table, domain } of mirror) for (const row of fresh.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()) await storage[domain].create(row);
        } finally { fresh.close(); }
      }
      for (const { domain, rows } of seed) for (const row of rows) await storage[domain].create(row);
    });
    app = await listen(mount, build(storage, clock), (req, res, next) => scope.run(OWNER, next));
  }
  return { ...app, storage, db, as, dispose: async () => { await app.close(); for (const fn of cleanup) await fn(); } };
}

/** Compara o roteiro passo a passo nos motores novos contra o oráculo; devolve o roteiro do oráculo. */
export async function assertParity(t, setup, script, { runParityScript, parityEngines }) {
  const oracleApp = await makeParityApp('oracle', setup);
  t.after(oracleApp.dispose);
  setup.clock?.reset();
  const expected = await runParityScript(oracleApp, script);
  for (const kind of parityEngines()) {
    const app = await makeParityApp(kind, setup);
    t.after(app.dispose);
    setup.clock?.reset();
    const actual = await runParityScript(app, script);
    for (let i = 0; i < script.length; i += 1) assert.deepEqual(actual[i], expected[i], `${kind}, passo ${i}: ${expected[i].step}`);
  }
  return expected;
}

/**
 * Para os testes existentes das rotas portadas: storage assíncrono sobre o MESMO banco em memória do
 * teste (as rotas ainda legadas, como tarefas e hábitos, seguem no `db`) e o router embrulhado no
 * escopo de um dono. Só o arnês muda; as asserções dos testes ficam como estão.
 */
export function sqliteStorageFor(db, owner = OWNER) {
  const scope = new AsyncLocalStorage();
  const storage = createStorage({ driver: createSqliteDriver({ open: () => db }), currentOwner: () => scope.getStore() });
  return {
    storage,
    scoped: (router) => (req, res, next) => scope.run(owner, () => router(req, res, next)),
    /** Para chamar um serviço direto (sem rota) no escopo do dono. */
    as: (fn) => scope.run(owner, fn),
    /** Para rotas montadas direto no `app`: `app.use(inScope)` antes delas. */
    inScope: (req, res, next) => scope.run(owner, next),
  };
}

/** Serviço de tarefas sobre `storage`, com o que o contexto de rota dos testes já traz (`options` vence). */
export function tasksServiceFor(storage, ctx, options = {}) {
  return createTasksService({
    storage, getLocalDateString: ctx.getLocalDateString, addDaysLocal: ctx.addDaysLocal, stripPriorityPrefix: ctx.stripPriorityPrefix,
    SKIP_REASONS: ctx.SKIP_REASONS, enrichCategory: ctx.enrichCategory, taskNeedsCalendarSync: ctx.taskNeedsCalendarSync ?? null,
    scheduleCalendarDrain: ctx.scheduleCalendarDrain, ...options,
  });
}

/** Serviços de hábitos e registros sobre `storage`, com o que o contexto de rota dos testes já traz. */
export function habitServicesFor(storage, ctx) {
  return {
    habits: createHabitsService({ storage, getLocalDateString: ctx.getLocalDateString, stripPriorityPrefix: ctx.stripPriorityPrefix }),
    habitLogs: createHabitLogsService({ storage, HABIT_OUTCOMES: ctx.HABIT_OUTCOMES, SKIP_REASONS: ctx.SKIP_REASONS }),
  };
}
