import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initAuthSchema,
  ensureDefaultUser,
  registerAuthRoutes,
  createApiAuthMiddleware,
  LEGACY_OWNER,
} from './praxisAuth.js';
import { initializeDatabase, resolveDbPath } from './lib/dbInit.js';
import { CATEGORIES, enrichCategory } from './lib/categories.js';
import { createCalendarServices } from './lib/calendarSync.js';
import { createTaskCalendarQueue, initTaskCalendarQueueSchema } from './lib/taskCalendarQueue.js';
import { createDayRollover, initDayRolloverSchema } from './lib/dayRollover.js';
import { createRequestLog, resolveApiVersion } from './lib/requestLog.js';
import { createTenantDb } from './lib/tenantDb.js';
import { createUserDbs } from './lib/userDbs.js';
import { createTasksRouter, registerIdeaToTaskRoute } from './routes/tasks.js';
import { createHabitsRouter, registerHabitLogRoutes } from './routes/habits.js';
import { createWellnessRouter } from './routes/wellness.js';
import { createFocusRouter } from './routes/focus.js';
import { createGoalsRouter } from './routes/goals.js';
import { createRitualsRouter } from './routes/rituals.js';
import { createPurchasesRouter } from './routes/purchases.js';
import { createSettingsRouter } from './routes/settings.js';
import { createGamificationRouter } from './routes/gamification.js';
import { createInsightsRouter, registerPraxiaRoutes } from './routes/insights.js';
import { createWeeklyReviewsRouter } from './routes/weeklyReviews.js';
import { registerParseVoiceRoutes } from './routes/parseVoice.js';
import { registerOpsRoutes, createCategoriesRouter } from './routes/ops.js';
import { registerCaptureRoutes } from './routes/captures.js';
import { initCaptureQueueSchema } from './captureQueue.js';
import { initPurchaseSchema } from './purchaseList.js';
import { initFinanceSchema, seedFinanceIfEmpty } from './finance.js';
import { createFinanceRouter } from './routes/finance.js';
import { initProjectsSchema, seedProjectsIfEmpty } from './projects.js';
import { initContinuityGuidanceSchema } from './continuityGuidance.js';
import { createProjectsRouter } from './routes/projects.js';
import { createStorageRuntime, storageEngineFromEnv } from './storage/runtime.js';
import { createWeeklyReviewsService } from './services/weeklyReviews.js';
import { createPurchasesService } from './services/purchases.js';
import { createFocusService, createWellnessService } from './services/routine/focusWellness.js';
import { createGoalsService } from './services/routine/goals.js';
import { createGamificationService } from './services/routine/gamification.js';
import { createHabitsService, createHabitLogsService } from './services/routine/habits.js';
import { createTasksService } from './services/routine/tasks.js';
import { installGracefulShutdown } from './lib/shutdown.js';

function loadEnvFile(filePath, allowedPrefixes = []) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      if (allowedPrefixes.length && !allowedPrefixes.some(prefix => key.startsWith(prefix))) continue;
      if (process.env[key]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch { /* optional files */ }
}

// Production VPS absolute paths first (must keep for deploy zero-touch)
loadEnvFile('/root/.openclaw/secrets/gog.env', ['GOG_']);
loadEnvFile('/root/.hermes/secrets/gog.env', ['GOG_']);
loadEnvFile('/root/.hermes/secrets/forja-api.env', ['PRAXIS_', 'FORJA_']);

let OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  try {
    const envFile = fs.readFileSync('/root/.hermes/secrets/api_keys.env', 'utf-8');
    const match = envFile.match(/OPENAI_API_KEY\s*=\s*(.+)/);
    if (match) OPENAI_API_KEY = match[1].trim();
  } catch { /* optional */ }
}

// Load Forja API key. Server/automation only — never VITE_*.
let FORJA_API_KEY = process.env.FORJA_API_KEY;
if (!FORJA_API_KEY) {
  try {
    const envFile = fs.readFileSync('/root/.hermes/secrets/api_keys.env', 'utf-8');
    const match = envFile.match(/FORJA_API_KEY\s*=\s*(.+)/);
    if (match) FORJA_API_KEY = match[1].trim();
    const passMatch = envFile.match(/(?:PRAXIS_APP_PASSWORD|FORJA_APP_PASSWORD)\s*=\s*(.+)/);
    if (passMatch && !process.env.PRAXIS_APP_PASSWORD && !process.env.FORJA_APP_PASSWORD) {
      process.env.PRAXIS_APP_PASSWORD = passMatch[1].trim();
    }
  } catch { /* optional */ }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local .env fallback (dev). Does not override existing process.env.
loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '..', '.env'));
if (!OPENAI_API_KEY && process.env.OPENAI_API_KEY) OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!FORJA_API_KEY && process.env.FORJA_API_KEY) FORJA_API_KEY = process.env.FORJA_API_KEY;

// Motor da camada nova escolhido antes de abrir qualquer banco: valor desconhecido não sobe o servidor.
const STORAGE_ENGINE = storageEngineFromEnv();

const app = express();
const PORT = process.env.PORT || 18556;
const APP_TIME_ZONE = process.env.FORJA_TIME_ZONE || 'America/Fortaleza';

function getLocalDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysLocal(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return getLocalDateString(date);
}

const HABIT_OUTCOMES = new Set(['done', 'skipped']);
const SKIP_REASONS = new Set(['time', 'energy', 'context', 'other']);

app.use(cors({ origin: true, credentials: true, exposedHeaders: ['X-Praxis-Account', 'X-Request-Id', 'X-Praxis-Api-Version'] }));
app.use(createRequestLog({ version: resolveApiVersion(__dirname) }));
app.use(express.json());

const COOKIE_SECURE = !['0', 'false', 'no'].includes(
  String(process.env.PRAXIS_COOKIE_SECURE ?? '1').toLowerCase(),
);

// O banco de sempre: dados do dono legado e controle de usuários e sessões.
const controlDbPath = resolveDbPath(__dirname);
const controlDb = new Database(controlDbPath);
controlDb.pragma('journal_mode = WAL');

/** Esquema e linhas padrão. As sementes pessoais (finanças e frentes do João) só no banco dele. */
function prepareUserData(target, { personalSeeds }) {
  initializeDatabase(target);
  initCaptureQueueSchema(target);
  initPurchaseSchema(target);
  initFinanceSchema(target);
  if (personalSeeds) seedFinanceIfEmpty(target);
  initProjectsSchema(target);
  initContinuityGuidanceSchema(target);
  // Fila da agenda e virada do dia moram no storage: a tabela precisa existir em TODO banco de conta.
  initTaskCalendarQueueSchema(target);
  initDayRolloverSchema(target);
  if (personalSeeds) seedProjectsIfEmpty(target);
}

prepareUserData(controlDb, { personalSeeds: true });
initAuthSchema(controlDb);
ensureDefaultUser(controlDb);

// Um banco por pessoa: as rotas recebem `db`, que sempre aponta para o banco de quem o servidor
// identificou na requisição. Enquanto o servidor sobe (sem requisição), aponta para o banco legado.
const userDbs = createUserDbs({
  controlDb,
  dataDir: process.env.PRAXIS_DATA_DIR || path.join(__dirname, 'data'),
  prepare: (target) => prepareUserData(target, { personalSeeds: false }),
});
const tenant = createTenantDb({ bootDb: controlDb, open: userDbs.open });
const db = tenant.db;
const isLegacyScope = () => tenant.currentUserId() === LEGACY_OWNER;

// Camada de persistência assíncrona (migração): conexão dedicada por dono, mesmo arquivo do banco
// dele. O preparo (criar/alinhar o banco) continua com a fachada legada; o dono vem do mesmo escopo.
const storageRuntime = createStorageRuntime({
  engine: STORAGE_ENGINE,
  currentOwner: tenant.currentUserId,
  sqlite: {
    pathFor: (owner) => (owner === LEGACY_OWNER ? controlDbPath : userDbs.fileFor(owner)),
    prepare: (owner) => { tenant.dbFor(owner); },
  },
});
const weeklyReviews = createWeeklyReviewsService({ storage: storageRuntime.storage });
const purchases = createPurchasesService({ storage: storageRuntime.storage });
const focus = createFocusService({ storage: storageRuntime.storage });
const wellness = createWellnessService({ storage: storageRuntime.storage });
const goals = createGoalsService({ storage: storageRuntime.storage, getLocalDateString });
const gamification = createGamificationService({ storage: storageRuntime.storage, getLocalDateString });
const habits = createHabitsService({ storage: storageRuntime.storage, getLocalDateString, stripPriorityPrefix });
const habitLogs = createHabitLogsService({ storage: storageRuntime.storage, HABIT_OUTCOMES, SKIP_REASONS });

/** Trabalho de relógio (sem requisição): roda uma vez para cada dono, no banco dele. */
function forEachOwner(label, fn) {
  for (const owner of userDbs.ownerKeys()) {
    try {
      tenant.runAs(owner, fn);
    } catch (error) {
      console.error(`[contas] ${label} falhou para ${owner === LEGACY_OWNER ? 'o dono legado' : `a conta ${owner.slice(0, 8)}…`}:`, error?.message || error);
    }
  }
}

/**
 * O que é pessoal do dono legado e está ligado ao servidor (agenda do Google, banco pelo Pierre,
 * dados de partida escritos no código) não existe para as outras contas.
 */
const legacyOnly = (code, message) => (req, res, next) => {
  if (isLegacyScope()) return next();
  return res.status(404).json({ error: message, code });
};

registerAuthRoutes(app, controlDb, { secureCookie: COOKIE_SECURE });
app.use(createApiAuthMiddleware({ db: controlDb, runAs: tenant.runAs, apiKey: FORJA_API_KEY }));

function stripPriorityPrefix(title) {
  if (typeof title !== 'string') return title;
  const cleaned = title.replace(/^\s*P\d+\s*(?:[—–-]|:|\.)\s*/i, '').trim();
  return cleaned || title.trim();
}

function nextSortOrder(table) {
  if (!['tasks', 'habits'].includes(table)) throw new Error('Invalid sortable table');
  const row = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM ${table}`).get();
  return Number(row?.next_order || 0);
}

// A agenda do Google ligada ao servidor é a do dono legado. Para as outras contas, nada sai daqui:
// nem evento criado, nem fila, nem leitura da agenda dele.
const calendarServices = createCalendarServices({ db, getLocalDateString });
const { createCalendarRouter } = calendarServices;
const CALENDAR_NOT_LINKED = { skipped: true, reason: 'agenda não ligada a esta conta' };
const syncTaskToCalendar = (...args) => (isLegacyScope() ? calendarServices.syncTaskToCalendar(...args) : CALENDAR_NOT_LINKED);
const taskNeedsCalendarSync = (...args) => isLegacyScope() && calendarServices.taskNeedsCalendarSync(...args);
const runCalendarMaintenance = () => tenant.runAs(LEGACY_OWNER, () => calendarServices.runCalendarMaintenance());

// Agenda fora da transação da tarefa: as rotas gravam a intenção, a fila sincroniza depois.
const legacyCalendarQueue = createTaskCalendarQueue({ db, syncTaskToCalendar });
const calendarQueue = {
  enqueue: (...args) => (isLegacyScope() ? legacyCalendarQueue.enqueue(...args) : { queued: false }),
  drain: (...args) => (isLegacyScope() ? legacyCalendarQueue.drain(...args) : { processed: 0, done: 0, retry: 0, failed: 0 }),
  stats: (...args) => (isLegacyScope() ? legacyCalendarQueue.stats(...args) : { pending: 0, failed: 0 }),
};

// Tarefas pela camada assíncrona: status, XP, próxima ocorrência e a intenção de agenda na mesma transação;
// depois do commit a fila é drenada fora dela (e só o dono legado tem agenda ligada).
const tasks = createTasksService({
  storage: storageRuntime.storage,
  getLocalDateString,
  addDaysLocal,
  stripPriorityPrefix,
  enrichCategory,
  SKIP_REASONS,
  taskNeedsCalendarSync,
  calendarEnabled: isLegacyScope,
  scheduleCalendarDrain: () => setImmediate(() => calendarQueue.drain()),
});

// --- Domain routes ---
app.use('/api/categories', createCategoriesRouter(CATEGORIES));
registerOpsRoutes(app, { apiDir: __dirname });
app.use('/api/purchases', createPurchasesRouter({ purchases }));
app.use('/api/projects', createProjectsRouter({ db, getLocalDateString }));
app.post('/api/finance/seed', legacyOnly('personal_seed', 'Dados de partida não existem para esta conta'));
app.post('/api/finance/sync', legacyOnly('bank_not_linked', 'Banco não ligado a esta conta'));
app.use('/api/finance', createFinanceRouter({ db, getLocalDateString }));
registerCaptureRoutes(app, { db, apiDir: __dirname });
app.use('/api/tasks', createTasksRouter({ tasks }));
registerIdeaToTaskRoute(app, { tasks });
app.use('/api/habits', createHabitsRouter({ habits }));
registerHabitLogRoutes(app, { habitLogs });
app.use('/api/wellness', createWellnessRouter({ wellness }));
app.use('/api/focus', createFocusRouter({ focus }));
app.use('/api/goals', createGoalsRouter({ goals }));
app.use('/api/user', createSettingsRouter({ db }));
registerParseVoiceRoutes(app, {
  getLocalDateString,
  addDaysLocal,
  openaiApiKey: OPENAI_API_KEY,
  appTimeZone: APP_TIME_ZONE,
});
// Conta sem agenda ligada: o dia dela simplesmente não tem eventos (a tela não precisa tratar erro).
app.get('/api/calendar/today', (req, res, next) => (isLegacyScope() ? next() : res.json([])));
app.use('/api/calendar', legacyOnly('calendar_not_linked', 'Agenda não ligada a esta conta'), createCalendarRouter());
app.use('/api/rituals', createRitualsRouter({ habits, getLocalDateString }));
app.use('/api/insights', createInsightsRouter({ db, getLocalDateString }));
registerPraxiaRoutes(app, { db, getLocalDateString, openaiApiKey: OPENAI_API_KEY });
app.use('/api/gamification', createGamificationRouter({ gamification }));
app.use('/api/weekly-reviews', createWeeklyReviewsRouter({ weeklyReviews }));

const HOST = process.env.HOST || '127.0.0.1';

// Virada do dia: fecha as vencidas antes de atender e segue conferindo a cada minuto.
const dayRollover = createDayRollover({ db, getLocalDateString, nextSortOrder });
forEachOwner('virada do dia', () => dayRollover.run('subida'));

// Daqui em diante, banco sem dono no escopo não responde: nenhuma rota cai nos dados de outra pessoa.
tenant.seal();

const clocks = [];
const server = app.listen(PORT, HOST, () => {
  console.log(`🔥 Praxis API running on ${HOST}:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  setImmediate(() => {
    runCalendarMaintenance();
    tenant.runAs(LEGACY_OWNER, () => calendarQueue.drain());
  });
  // Retentativa das intenções de agenda que falharam (a espera entre tentativas fica na fila).
  clocks.push(setInterval(() => tenant.runAs(LEGACY_OWNER, () => calendarQueue.drain()), 60 * 1000).unref());
  clocks.push(setInterval(() => forEachOwner('virada do dia', () => dayRollover.run('tick')), 60 * 1000).unref());
});

installGracefulShutdown({
  server,
  steps: [
    ['relógios', () => { for (const clock of clocks) clearInterval(clock); }],
    ['camada de persistência', () => storageRuntime.close()],
    ['bancos das contas', () => tenant.closeAll()],
    ['banco de controle', () => { if (controlDb.open) controlDb.close(); }],
  ],
});
