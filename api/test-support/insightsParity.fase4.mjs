/**
 * Montagem dos insights de leitura para os testes (paridade e testes antigos nos dois motores).
 *
 * - `insightsSetup({ seed })`: rota antiga congelada (oráculo) e rota nova, montadas na raiz (`/api/insights/*` e
 *   `/api/praxia/confront`), com a mesma massa no SQLite do oráculo, no do motor sqlite e, copiada como
 *   documentos crus, no Firestore.
 * - `seedRecent(db, now)`: foco e bem-estar relativos a "agora" (best-hours e correlação cortam por `new Date()`).
 * - `readerFor(t, kind, db)`: repositório `insightsRead` do motor sobre uma base já semeada pelo teste.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './helpers.mjs';
import { createStorage } from '../storage/index.js';
import { createSqliteDriver } from '../storage/sqlite/driver.js';
import { createFirestoreDriver } from '../storage/firestore/driver.js';
import { createInsightsRouter as createOracleRouter, registerPraxiaRoutes as registerOraclePraxia } from './oracles/insightsRoute.bcbadad.js';
import { createInsightsRouter, registerPraxiaRoutes } from '../routes/insights.js';
import { createInsightsService } from '../services/personal/insights.js';
import { buildWeeklyInsights } from '../lib/weeklyInsights.js';
import { buildAvoidanceInsights } from '../lib/avoidanceInsights.js';
import { copyToFirestore, INSIGHTS_TABLES, TODAY } from './insightsFixture.fase4.mjs';

const OPTIONS = { withProjects: true, withCaptureQueue: true };

export function insightsSetup({ seed, getLocalDateString = () => TODAY, openaiApiKey } = {}) {
  return {
    mount: '',
    dbOptions: OPTIONS,
    seedSqlite: (db) => seed?.(db),
    seedStorage: async (storage, { userDoc }) => {
      const scratch = createTestDb(OPTIONS);
      try { seed?.(scratch); await copyToFirestore(userDoc, scratch); } finally { scratch.close(); }
    },
    oracle: (db) => {
      const router = Router();
      router.use('/api/insights', createOracleRouter({ db, getLocalDateString }));
      registerOraclePraxia(router, { db, getLocalDateString, openaiApiKey });
      return router;
    },
    build: (storage) => {
      const insights = createInsightsService({ storage });
      const router = Router();
      router.use('/api/insights', createInsightsRouter({ insights, getLocalDateString }));
      registerPraxiaRoutes(router, { insights, getLocalDateString, openaiApiKey });
      return router;
    },
  };
}

/** Foco e bem-estar dos últimos dias contados de `now` (datas UTC, como a rota antiga corta). */
export function seedRecent(db, now) {
  const at = (daysAgo, hour, minute = 20) => {
    const d = new Date(now.getTime() - daysAgo * 86400000);
    d.setUTCHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const focus = db.prepare('INSERT INTO focus_sessions (id, date, duration_seconds, created_date) VALUES (?, ?, ?, ?)');
  const sessions = [[1, 7, 1500], [1, 9, 1500], [2, 9, 1200], [2, 14, 1500], [3, 14, 900], [5, 14, 1800], [8, 21, 600], [13, 21, 1500], [20, 10, 3000], [29, 10, 1500], [31, 10, 1500], [45, 10, 1500], [2, 14, 0], [4, 9, null]];
  sessions.forEach(([daysAgo, hour, seconds], i) => focus.run(`rf${i}`, at(daysAgo, hour).slice(0, 10), seconds, at(daysAgo, hour)));
  focus.run('rf-null', null, 100, null);
  focus.run('rf-bad', null, 100, 'lixo');
  focus.run('rf-future', null, 1500, at(-3, 8));
  // Bem-estar: um dia sim, outro não, de 1 a 70 dias atrás; hábitos concluídos em quantidade que alterna os dois grupos.
  const well = db.prepare('INSERT INTO wellness_checks (id, date, sleep_hours, sleep_quality, mood, productivity) VALUES (?, ?, ?, ?, ?, ?)');
  const log = db.prepare("INSERT OR IGNORE INTO habit_logs (id, habit_id, date, completed, outcome) VALUES (?, ?, ?, 1, 'done')");
  const habits = db.prepare("SELECT id FROM habits WHERE status = 'active' ORDER BY rowid").all().map((h) => h.id);
  for (let daysAgo = 1; daysAgo <= 70; daysAgo += 1) {
    if (daysAgo % 5 === 4) continue;
    const date = at(daysAgo, 12).slice(0, 10);
    well.run(`rw${daysAgo}`, date, 5 + (daysAgo % 7) * 0.7, 1 + (daysAgo % 5), 1 + (daysAgo % 5), 1 + ((daysAgo * 3) % 5));
    const done = [habits.length, 2, habits.length - 1, 0, 3][daysAgo % 5];
    habits.slice(0, done).forEach((id, i) => log.run(`rl${daysAgo}-${i}`, id, date));
  }
  // Dois registros de bem-estar no mesmo dia (não há índice único): o último não pode sumir nem duplicar a conta.
  well.run('rw-dup', at(7, 12).slice(0, 10), 8, 4, 5, 5);
}

/** `insightsRead` sobre o banco já semeado: SQLite direto, ou copiado como documentos no Firestore. */
export async function readerFor(t, kind, db) {
  const scope = new AsyncLocalStorage();
  let driver;
  if (kind === 'sqlite') driver = createSqliteDriver({ open: () => db });
  else {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    const client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    t.after(() => client.terminate());
    const root = client.collection('storageContractRuns').doc(randomUUID());
    const tables = INSIGHTS_TABLES.filter((name) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
    await copyToFirestore(root.collection('users').doc('alice'), db, tables);
    driver = createFirestoreDriver({ client, root });
  }
  const storage = createStorage({ driver, currentOwner: () => scope.getStore() ?? 'alice' });
  return { storage, read: storage.insightsRead, insights: createInsightsService({ storage }) };
}

/** Roda o teste nos dois motores (Firestore só com o emulador); `fn(t, kind)`. */
export function testEngines(name, fn) {
  for (const kind of ['sqlite', 'firestore']) {
    test(`${kind}: ${name}`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, (t) => fn(t, kind));
  }
}
export async function weeklyOn(t, kind, db, ...args) { return buildWeeklyInsights((await readerFor(t, kind, db)).read, ...args); }
export async function avoidanceOn(t, kind, db, ...args) { return buildAvoidanceInsights((await readerFor(t, kind, db)).read, ...args); }
