/** Finanças — schema, seed da conversa 12/08 e queries da aba. */

import { randomUUID } from 'crypto';

export const ACCOUNT_KINDS = ['checking', 'prepaid', 'credit', 'cash', 'other'];
export const AMOUNT_KINDS = ['available', 'invested', 'used_limit', 'official_bill', 'projected_bill'];
export const SOURCES = ['pierre', 'pluggy', 'joao', 'agent', 'seed'];
export const DEBT_KINDS = ['card', 'loan', 'installment', 'family', 'other'];
export const DEBT_STATUSES = ['open', 'min_paid', 'clean', 'waiting', 'blocked'];
export const APR_LABELS = ['high', 'medium', 'low', 'none'];
export const SUB_LANES = ['work', 'personal'];
export const SUB_CADENCES = ['monthly', 'yearly', 'installment', 'service'];
export const SUB_STATUSES = ['active', 'keep', 'cancel', 'cancelled', 'installment'];
export const INST_STATUSES = ['open', 'done'];
export const TX_DIRECTIONS = ['inflow', 'outflow', 'internal'];
export const GOAL_STATUSES = ['active', 'done', 'paused'];
export const FINANCE_CATEGORIES = [
  'Moradia',
  'Alimentação',
  'Mercado',
  'Transporte',
  'Saúde',
  'Educação',
  'Fitness',
  'Assinaturas',
  'Impostos',
  'Dívidas',
  'Lazer',
  'Trabalho',
  'Família',
  'Reserva',
  'Compras',
  'Transferência',
  'Pagamento de fatura',
  'Receita',
  'Outros',
];
/** Dinheiro que só muda de lugar: fica fora de gráfico, orçamento e /month. */
export const OFF_BUDGET_CATEGORIES = ['Pagamento de fatura', 'Transferência'];
/** Quem lança à mão (app ou Midas falando com o João). */
export const MANUAL_SOURCES = ['joao', 'agent'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const INVEST_PATTERN = /invest|auto-?invest|cdb|aplic[aäã]?[çc]|aplic[aä]c|investimento/i;

export function detectAmountKind(balanceOrAccount) {
  if (!balanceOrAccount || typeof balanceOrAccount !== 'object') {
    return 'available';
  }
  const fields = [
    balanceOrAccount.type,
    balanceOrAccount.name,
    balanceOrAccount.product,
    balanceOrAccount.subtype,
    balanceOrAccount.kind,
    balanceOrAccount.amount_kind,
  ];
  for (const f of fields) {
    if (f && typeof f === 'string' && INVEST_PATTERN.test(f)) {
      return 'invested';
    }
  }
  if (
    balanceOrAccount.isOfficialBillAmount ||
    balanceOrAccount.valueIsExact ||
    balanceOrAccount.is_official ||
    balanceOrAccount.official ||
    balanceOrAccount.amount_kind === 'official_bill'
  ) {
    return 'official_bill';
  }
  if (
    balanceOrAccount.isOfficialBillAmount === false ||
    balanceOrAccount.projected_bill !== undefined ||
    balanceOrAccount.calculated_bill_amount !== undefined ||
    balanceOrAccount.amount_kind === 'projected_bill'
  ) {
    return 'projected_bill';
  }
  if (balanceOrAccount.amount_kind === 'used_limit') {
    return 'used_limit';
  }
  return 'available';
}

export function isValidDateString(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function todayFortaleza(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(date);
}

export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function formatBrl(value) {
  return money(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function daysUntil(ymd, today) {
  if (!isValidDateString(ymd) || !isValidDateString(today)) return null;
  const a = Date.parse(`${ymd}T12:00:00Z`);
  const b = Date.parse(`${today}T12:00:00Z`);
  return Math.round((a - b) / 86400000);
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

export function initFinanceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      reserved_car REAL DEFAULT 0,
      reserved_live REAL DEFAULT 0,
      snapshot_label TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finance_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT DEFAULT 'checking',
      institution TEXT DEFAULT '',
      mask TEXT DEFAULT '',
      pierre_account_id TEXT,
      is_operational INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_balances (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      as_of TEXT NOT NULL,
      amount REAL NOT NULL,
      amount_kind TEXT DEFAULT 'available',
      source TEXT DEFAULT 'joao',
      locked INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_debts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      account_id TEXT,
      kind TEXT DEFAULT 'card',
      balance REAL DEFAULT 0,
      min_payment REAL,
      apr_label TEXT DEFAULT 'none',
      due_day INTEGER,
      due_date TEXT,
      status TEXT DEFAULT 'open',
      queue INTEGER DEFAULT 99,
      source TEXT DEFAULT 'joao',
      locked INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_payments (
      id TEXT PRIMARY KEY,
      debt_id TEXT NOT NULL,
      account_id TEXT,
      amount REAL NOT NULL,
      paid_on TEXT NOT NULL,
      method TEXT DEFAULT 'pix',
      confirmed INTEGER DEFAULT 1,
      note TEXT DEFAULT '',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lane TEXT DEFAULT 'personal',
      amount REAL DEFAULT 0,
      cadence TEXT DEFAULT 'monthly',
      charge_day INTEGER,
      account_id TEXT,
      status TEXT DEFAULT 'active',
      next_charge TEXT,
      vendor_hint TEXT DEFAULT '',
      source TEXT DEFAULT 'joao',
      locked INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_transactions (
      id TEXT PRIMARY KEY,
      pierre_tx_id TEXT,
      account_id TEXT,
      posted_on TEXT NOT NULL,
      amount REAL NOT NULL,
      direction TEXT DEFAULT 'outflow',
      raw_description TEXT DEFAULT '',
      merchant TEXT DEFAULT '',
      category TEXT DEFAULT 'Outros',
      subscription_id TEXT,
      debt_id TEXT,
      source TEXT DEFAULT 'joao',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      target_amount REAL DEFAULT 0,
      current_amount REAL DEFAULT 0,
      due_date TEXT,
      debt_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_installments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      account_id TEXT,
      monthly REAL DEFAULT 0,
      remaining REAL DEFAULT 0,
      paid_n INTEGER DEFAULT 0,
      total_n INTEGER DEFAULT 0,
      last_due TEXT,
      status TEXT DEFAULT 'open',
      source TEXT DEFAULT 'pierre',
      locked INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_sync_log (
      id TEXT PRIMARY KEY,
      started_at TEXT,
      finished_at TEXT,
      ok INTEGER DEFAULT 0,
      accounts_n INTEGER DEFAULT 0,
      tx_n INTEGER DEFAULT 0,
      error TEXT DEFAULT '',
      actor TEXT DEFAULT 'system'
    );

    -- estado do cartão vindo do banco (Pluggy via Midas): uma linha por conta
    CREATE TABLE IF NOT EXISTS finance_card_status (
      account_id TEXT PRIMARY KEY,
      institution TEXT NOT NULL,
      last4 TEXT,
      brand TEXT,
      used REAL,
      limit_total REAL,
      limit_available REAL,
      bill_total REAL,
      bill_minimum REAL,
      bill_paid REAL,
      bill_remaining REAL,
      bill_due TEXT,
      bill_closing TEXT,
      bank_updated_at TEXT,
      updated_at TEXT,
      source TEXT DEFAULT 'pluggy'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_tx_pierre
      ON finance_transactions(pierre_tx_id)
      WHERE pierre_tx_id IS NOT NULL AND pierre_tx_id != '';
  `);

  // carteira (fase 3): cor do cartão, final do cartão e ocultar valores — só aditivo
  const accountCols = db.prepare('PRAGMA table_info(finance_accounts)').all().map((c) => c.name);
  if (!accountCols.includes('brand_color')) {
    db.exec('ALTER TABLE finance_accounts ADD COLUMN brand_color TEXT');
  }
  if (!accountCols.includes('card_last4')) {
    db.exec('ALTER TABLE finance_accounts ADD COLUMN card_last4 TEXT');
  }
  const settingsCols = db.prepare('PRAGMA table_info(finance_settings)').all().map((c) => c.name);
  if (!settingsCols.includes('hide_values')) {
    db.exec('ALTER TABLE finance_settings ADD COLUMN hide_values INTEGER DEFAULT 0');
  }

  // fase 4: despesas fixas, orçamento, dia do salário e transações do banco — só aditivo
  if (!settingsCols.includes('salary_day')) {
    db.exec('ALTER TABLE finance_settings ADD COLUMN salary_day INTEGER DEFAULT 12');
  }
  const txCols = db.prepare('PRAGMA table_info(finance_transactions)').all().map((c) => c.name);
  if (!txCols.includes('external_id')) {
    db.exec('ALTER TABLE finance_transactions ADD COLUMN external_id TEXT');
  }
  // lançamento manual que o banco depois confirmou: aponta para a linha do banco e sai das somas
  if (!txCols.includes('matched_tx_id')) {
    db.exec('ALTER TABLE finance_transactions ADD COLUMN matched_tx_id TEXT');
  }
  if (!txCols.includes('note')) {
    db.exec("ALTER TABLE finance_transactions ADD COLUMN note TEXT DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_fixed_expenses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      due_day INTEGER,
      category TEXT DEFAULT 'Outros',
      lane TEXT DEFAULT 'personal',
      active INTEGER DEFAULT 1,
      last_paid_month TEXT,
      note TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS finance_budgets (
      category TEXT PRIMARY KEY,
      monthly_limit REAL NOT NULL,
      updated_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_tx_external
      ON finance_transactions(external_id)
      WHERE external_id IS NOT NULL AND external_id != '';

    CREATE INDEX IF NOT EXISTS idx_finance_tx_posted
      ON finance_transactions(posted_on);
  `);
}

/** Ids da paleta do cartão — espelha src/lib/financeBrand.js. */
export const BRAND_COLOR_IDS = [
  'inter',
  'c6',
  'nubank',
  'mp',
  'santander',
  'picpay',
  'carteira',
  'petroleo',
  'vinho',
  'neutro',
];
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const LAST4_RE = /^\d{4}$/;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/** null/'' limpa (volta à cor do banco); hex #rrggbb ou id da paleta; o resto é 400. */
export function normalizeBrandColor(value) {
  if (value === null || value === '') return null;
  const str = String(value).trim();
  if (HEX_COLOR_RE.test(str)) return str.toLowerCase();
  if (BRAND_COLOR_IDS.includes(str)) return str;
  throw badRequest('brand_color inválido: use #rrggbb ou um id da paleta');
}

/** null/'' limpa; senão exatamente 4 dígitos. */
export function normalizeCardLast4(value) {
  if (value === null || value === '') return null;
  const str = String(value).trim();
  if (LAST4_RE.test(str)) return str;
  throw badRequest('card_last4 inválido: use 4 dígitos');
}

function insertAccount(db, row) {
  db.prepare(`
    INSERT OR IGNORE INTO finance_accounts
      (id, name, kind, institution, mask, is_operational, status, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    row.id,
    row.name,
    row.kind,
    row.institution,
    row.mask || '',
    row.is_operational ? 1 : 0,
    row.sort_order,
    row.created_at,
    row.updated_at,
  );
}

function insertDebt(db, row) {
  db.prepare(`
    INSERT OR IGNORE INTO finance_debts
      (id, title, account_id, kind, balance, min_payment, apr_label, due_day, due_date,
       status, queue, source, locked, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 0, ?, ?, ?)
  `).run(
    row.id,
    row.title,
    row.account_id,
    row.kind,
    row.balance,
    row.min_payment,
    row.apr_label,
    row.due_day ?? null,
    row.due_date ?? null,
    row.status,
    row.queue,
    row.note || '',
    row.created_at,
    row.updated_at,
  );
}

function insertSub(db, row) {
  db.prepare(`
    INSERT OR IGNORE INTO finance_subscriptions
      (id, name, lane, amount, cadence, charge_day, account_id, status, next_charge,
       vendor_hint, source, locked, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 0, ?, ?, ?)
  `).run(
    row.id,
    row.name,
    row.lane,
    row.amount,
    row.cadence,
    row.charge_day ?? null,
    row.account_id,
    row.status,
    row.next_charge ?? null,
    row.vendor_hint || '',
    row.note || '',
    row.created_at,
    row.updated_at,
  );
}

/** Semente da conversa 2026-08-12. Idempotente: só preenche se não houver conta. */
export function seedFinanceIfEmpty(db, { force = false } = {}) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM finance_accounts').get();
  if (existing.n > 0 && !force) return { seeded: false, reason: 'already_present' };

  const created = '2026-08-12T18:00:00.000Z';
  const asOf = '2026-08-12';

  const run = db.transaction(() => {
    if (force) {
      db.exec(`
        DELETE FROM finance_payments;
        DELETE FROM finance_transactions;
        DELETE FROM finance_balances;
        DELETE FROM finance_goals;
        DELETE FROM finance_subscriptions;
        DELETE FROM finance_debts;
        DELETE FROM finance_accounts;
        DELETE FROM finance_settings;
        DELETE FROM finance_sync_log;
        DELETE FROM finance_card_status;
        DELETE FROM finance_fixed_expenses;
        DELETE FROM finance_budgets;
      `);
    }

    db.prepare(`
      INSERT OR REPLACE INTO finance_settings (id, reserved_car, reserved_live, snapshot_label, updated_at)
      VALUES ('default', 1270, 600, 'foto 12/08', ?)
    `).run(created);

    const accounts = [
      { id: 'acc-inter', name: 'Inter', kind: 'checking', institution: 'inter', is_operational: 1, sort_order: 1 },
      { id: 'acc-c6', name: 'C6', kind: 'checking', institution: 'c6', is_operational: 0, sort_order: 2 },
      { id: 'acc-mp', name: 'Mercado Pago', kind: 'prepaid', institution: 'mp', is_operational: 0, sort_order: 3 },
      { id: 'acc-santander', name: 'Santander', kind: 'checking', institution: 'santander', is_operational: 0, sort_order: 4 },
      { id: 'acc-nubank', name: 'Nubank', kind: 'checking', institution: 'nubank', is_operational: 0, sort_order: 5 },
      { id: 'acc-picpay', name: 'PicPay', kind: 'prepaid', institution: 'picpay', is_operational: 0, sort_order: 6 },
    ];
    for (const acc of accounts) {
      insertAccount(db, { ...acc, mask: '', created_at: created, updated_at: created });
    }

    db.prepare(`
      INSERT INTO finance_balances (id, account_id, as_of, amount, amount_kind, source, locked, note, created_at)
      VALUES (?, 'acc-inter', ?, 1103.62, 'available', 'seed', 0, 'saldo depois de Santander + PicPay', ?)
    `).run(randomUUID(), asOf, created);

    insertDebt(db, {
      id: 'debt-carro',
      title: 'Carro',
      account_id: null,
      kind: 'installment',
      balance: 1270,
      min_payment: 1270,
      apr_label: 'none',
      due_day: 23,
      due_date: '2026-08-23',
      status: 'open',
      queue: 0,
      note: 'Vence dia 23. Sem o tio (250) o Inter não fecha.',
      created_at: created,
      updated_at: created,
    });
    insertDebt(db, {
      id: 'debt-mp',
      title: 'Mercado Pago',
      account_id: 'acc-mp',
      kind: 'card',
      balance: 3782,
      min_payment: null,
      apr_label: 'high',
      due_day: 15,
      due_date: null,
      status: 'blocked',
      queue: 1,
      note: 'Monstro 1. Quitar no valor real. Sem parcelamento 15%.',
      created_at: created,
      updated_at: created,
    });
    insertDebt(db, {
      id: 'debt-nubank',
      title: 'Nubank',
      account_id: 'acc-nubank',
      kind: 'card',
      balance: 3227,
      min_payment: null,
      apr_label: 'high',
      due_day: null,
      due_date: null,
      status: 'blocked',
      queue: 2,
      note: 'Fora do Pierre. Monstro 2.',
      created_at: created,
      updated_at: created,
    });
    insertDebt(db, {
      id: 'debt-inter',
      title: 'Inter resto',
      account_id: 'acc-inter',
      kind: 'card',
      balance: 2162,
      min_payment: 0,
      apr_label: 'medium',
      due_day: 12,
      due_date: null,
      status: 'min_paid',
      queue: 3,
      note: 'Mínimo já pago nesta rodada.',
      created_at: created,
      updated_at: created,
    });
    insertDebt(db, {
      id: 'debt-c6',
      title: 'C6 resto',
      account_id: 'acc-c6',
      kind: 'card',
      balance: 1371,
      min_payment: 0,
      apr_label: 'medium',
      due_day: 15,
      due_date: null,
      status: 'min_paid',
      queue: 3,
      note: 'Mínimo já pago. Sem compra nova.',
      created_at: created,
      updated_at: created,
    });
    insertDebt(db, {
      id: 'debt-pai-consorcio',
      title: 'Pai consórcio',
      account_id: null,
      kind: 'family',
      balance: 1000,
      min_payment: 1000,
      apr_label: 'none',
      due_day: null,
      due_date: null,
      status: 'waiting',
      queue: 8,
      note: 'Recorrente R$ 1.000/mês. Pode esperar.',
      created_at: created,
      updated_at: created,
    });
    insertDebt(db, {
      id: 'debt-pai-celular',
      title: 'Pai celular',
      account_id: null,
      kind: 'family',
      balance: 3200,
      min_payment: 400,
      apr_label: 'none',
      due_day: null,
      due_date: null,
      status: 'waiting',
      queue: 9,
      note: '8×400 restantes, estimativa da conversa.',
      created_at: created,
      updated_at: created,
    });

    const subs = [
      { id: 'sub-chatgpt', name: 'ChatGPT', lane: 'work', amount: 100, charge_day: 1, account_id: 'acc-inter', status: 'keep' },
      { id: 'sub-waba', name: 'WhatsApp Business', lane: 'work', amount: 54.9, charge_day: 1, account_id: null, status: 'keep' },
      { id: 'sub-uazapi', name: 'Uazapi', lane: 'work', amount: 37, charge_day: 25, account_id: 'acc-inter', status: 'keep' },
      { id: 'sub-workspace', name: 'Google Workspace', lane: 'work', amount: 36, charge_day: 1, account_id: 'acc-inter', status: 'keep' },
      { id: 'sub-meli', name: 'Meli+', lane: 'personal', amount: 75, charge_day: 1, account_id: 'acc-c6', status: 'keep' },
      { id: 'sub-icloud', name: 'iCloud', lane: 'personal', amount: 66.9, charge_day: 1, account_id: null, status: 'keep' },
      { id: 'sub-tim', name: 'TIM', lane: 'personal', amount: 46, charge_day: 1, account_id: 'acc-c6', status: 'keep' },
    ];
    for (const sub of subs) {
      insertSub(db, {
        ...sub,
        cadence: 'monthly',
        next_charge: null,
        vendor_hint: '',
        note: '',
        created_at: created,
        updated_at: created,
      });
    }

    db.prepare(`
      INSERT OR IGNORE INTO finance_goals
        (id, title, target_amount, current_amount, due_date, debt_id, status, created_at, updated_at)
      VALUES
        ('goal-carro', 'Carro em dia', 1270, 0, '2026-08-23', 'debt-carro', 'active', ?, ?),
        ('goal-mp', 'Quitar Mercado Pago', 3782, 0, NULL, 'debt-mp', 'active', ?, ?),
        ('goal-oculos', 'Óculos → Mercado Pago', 3000, 0, NULL, 'debt-mp', 'active', ?, ?)
    `).run(created, created, created, created, created, created);

    db.prepare(`
      INSERT INTO finance_sync_log (id, started_at, finished_at, ok, accounts_n, tx_n, error, actor)
      VALUES (?, ?, ?, 1, 6, 0, 'foto da conversa 2026-08-12 — não é saldo vivo', 'seed')
    `).run(randomUUID(), created, created);
  });

  run();
  return { seeded: true };
}

export const DEFAULT_SALARY_DAY = 12;

function settingsRow(row) {
  const salaryDay = Number(row.salary_day);
  return {
    ...row,
    hide_values: Number(row.hide_values) === 1,
    salary_day: Number.isInteger(salaryDay) && salaryDay >= 1 && salaryDay <= 31 ? salaryDay : DEFAULT_SALARY_DAY,
  };
}

/** Dia do mês 1..31 (inteiro). Usado no salário e nas despesas fixas. */
function parseMonthDay(value, field) {
  if (typeof value === 'string' && value.trim() !== '') value = Number(value);
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw badRequest(`${field} precisa ser um dia de 1 a 31`);
  }
  return value;
}

export function getSettings(db) {
  const row = db.prepare('SELECT * FROM finance_settings WHERE id = ?').get('default');
  if (row) return settingsRow(row);
  db.prepare(`
    INSERT INTO finance_settings (id, reserved_car, reserved_live, snapshot_label, updated_at)
    VALUES ('default', 0, 0, '', ?)
  `).run(nowIso());
  return settingsRow(db.prepare('SELECT * FROM finance_settings WHERE id = ?').get('default'));
}

export function updateSettings(db, body = {}) {
  const current = getSettings(db);
  const reservedCar = body.reserved_car !== undefined ? money(body.reserved_car) : current.reserved_car;
  const reservedLive = body.reserved_live !== undefined ? money(body.reserved_live) : current.reserved_live;
  const label = body.snapshot_label !== undefined ? String(body.snapshot_label) : current.snapshot_label;
  let hideValues = current.hide_values;
  if (body.hide_values !== undefined) {
    if (typeof body.hide_values !== 'boolean' && ![0, 1].includes(body.hide_values)) {
      throw badRequest('hide_values precisa ser booleano');
    }
    hideValues = Boolean(body.hide_values);
  }
  const salaryDay = body.salary_day !== undefined ? parseMonthDay(body.salary_day, 'salary_day') : current.salary_day;
  db.prepare(`
    UPDATE finance_settings
    SET reserved_car = ?, reserved_live = ?, snapshot_label = ?, hide_values = ?, salary_day = ?, updated_at = ?
    WHERE id = 'default'
  `).run(reservedCar, reservedLive, label, hideValues ? 1 : 0, salaryDay, nowIso());
  return getSettings(db);
}

export function latestBalance(db, accountId, amountKind = 'available') {
  return db.prepare(`
    SELECT * FROM finance_balances
    WHERE account_id = ? AND amount_kind = ?
    ORDER BY as_of DESC, created_at DESC
    LIMIT 1
  `).get(accountId, amountKind);
}

export function listAccounts(db, { status = 'active' } = {}) {
  let q = 'SELECT * FROM finance_accounts WHERE 1=1';
  const params = [];
  if (status && status !== 'all') {
    q += ' AND status = ?';
    params.push(status);
  }
  q += ' ORDER BY sort_order ASC, name ASC';
  const rows = db.prepare(q).all(...params);
  return rows.map((acc) => {
    const available = latestBalance(db, acc.id, 'available');
    const invested = latestBalance(db, acc.id, 'invested');
    const official = latestBalance(db, acc.id, 'official_bill');
    const projected = latestBalance(db, acc.id, 'projected_bill');
    return {
      ...acc,
      brand_color: acc.brand_color || null,
      card_last4: acc.card_last4 || null,
      is_operational: Number(acc.is_operational) === 1,
      available: available ? money(available.amount) : 0,
      available_as_of: available?.as_of || null,
      available_source: available?.source || null,
      invested: invested ? money(invested.amount) : 0,
      invested_as_of: invested?.as_of || null,
      invested_source: invested?.source || null,
      official_bill: official ? money(official.amount) : null,
      projected_bill: projected ? money(projected.amount) : null,
    };
  });
}

export function createAccount(db, body) {
  const name = String(body.name || '').trim();
  if (!name) {
    const err = new Error('name required');
    err.status = 400;
    throw err;
  }
  const id = body.id || randomUUID();
  const now = nowIso();
  const sort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM finance_accounts').get();
  db.prepare(`
    INSERT INTO finance_accounts
      (id, name, kind, institution, mask, pierre_account_id, is_operational, status, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    pick(body.kind, ACCOUNT_KINDS, 'checking'),
    String(body.institution || ''),
    String(body.mask || '').slice(-4),
    body.pierre_account_id || null,
    body.is_operational ? 1 : 0,
    body.status === 'archived' ? 'archived' : 'active',
    Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : (sort.m || 0) + 1,
    now,
    now,
  );
  if (body.amount !== undefined) {
    createBalance(db, {
      account_id: id,
      amount: body.amount,
      amount_kind: 'available',
      source: pick(body.source, SOURCES, 'joao'),
      as_of: body.as_of,
      locked: body.locked,
    });
  }
  return listAccounts(db, { status: 'all' }).find((a) => a.id === id);
}

export function updateAccount(db, id, body = {}) {
  const existing = db.prepare('SELECT * FROM finance_accounts WHERE id = ?').get(id);
  if (!existing) return null;
  // valida antes de gravar qualquer coisa
  const brandColor = body.brand_color !== undefined ? normalizeBrandColor(body.brand_color) : existing.brand_color;
  const cardLast4 = body.card_last4 !== undefined ? normalizeCardLast4(body.card_last4) : existing.card_last4;
  db.prepare(`
    UPDATE finance_accounts SET
      name = COALESCE(?, name),
      kind = ?,
      institution = COALESCE(?, institution),
      mask = COALESCE(?, mask),
      is_operational = ?,
      status = ?,
      brand_color = ?,
      card_last4 = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    body.name !== undefined ? String(body.name).trim() : null,
    body.kind !== undefined ? pick(body.kind, ACCOUNT_KINDS, existing.kind) : existing.kind,
    body.institution !== undefined ? String(body.institution) : null,
    body.mask !== undefined ? String(body.mask).slice(-4) : null,
    body.is_operational !== undefined ? (body.is_operational ? 1 : 0) : existing.is_operational,
    body.status !== undefined ? (body.status === 'archived' ? 'archived' : 'active') : existing.status,
    brandColor ?? null,
    cardLast4 ?? null,
    nowIso(),
    id,
  );
  return listAccounts(db, { status: 'all' }).find((a) => a.id === id);
}

export function listBalances(db, { account_id } = {}) {
  if (account_id) {
    return db.prepare(
      'SELECT * FROM finance_balances WHERE account_id = ? ORDER BY as_of DESC, created_at DESC',
    ).all(account_id);
  }
  return db.prepare('SELECT * FROM finance_balances ORDER BY as_of DESC, created_at DESC LIMIT 200').all();
}

export function createBalance(db, body) {
  const accountId = String(body.account_id || '');
  const account = db.prepare('SELECT id FROM finance_accounts WHERE id = ?').get(accountId);
  if (!account) {
    const err = new Error('account not found');
    err.status = 400;
    throw err;
  }
  const amount = money(body.amount);
  const asOf = isValidDateString(body.as_of) ? body.as_of : todayFortaleza();
  const id = body.id || randomUUID();
  db.prepare(`
    INSERT INTO finance_balances (id, account_id, as_of, amount, amount_kind, source, locked, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    accountId,
    asOf,
    amount,
    pick(body.amount_kind, AMOUNT_KINDS, 'available'),
    pick(body.source, SOURCES, 'joao'),
    body.locked ? 1 : 0,
    String(body.note || ''),
    nowIso(),
  );
  if (body.source === 'joao' || body.locked) {
    updateSettings(db, { snapshot_label: '' });
  }
  return db.prepare('SELECT * FROM finance_balances WHERE id = ?').get(id);
}

export function listDebts(db, { status } = {}) {
  let q = 'SELECT * FROM finance_debts WHERE 1=1';
  const params = [];
  if (status && status !== 'all') {
    q += ' AND status = ?';
    params.push(status);
  }
  q += ' ORDER BY queue ASC, balance DESC';
  return db.prepare(q).all(...params).map((d) => ({
    ...d,
    balance: money(d.balance),
    min_payment: d.min_payment == null ? null : money(d.min_payment),
    locked: Number(d.locked) === 1,
  }));
}

export function createDebt(db, body) {
  const title = String(body.title || '').trim();
  if (!title) {
    const err = new Error('title required');
    err.status = 400;
    throw err;
  }
  const id = body.id || randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO finance_debts
      (id, title, account_id, kind, balance, min_payment, apr_label, due_day, due_date,
       status, queue, source, locked, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    body.account_id || null,
    pick(body.kind, DEBT_KINDS, 'card'),
    money(body.balance),
    body.min_payment === undefined || body.min_payment === null ? null : money(body.min_payment),
    pick(body.apr_label, APR_LABELS, 'none'),
    Number.isFinite(Number(body.due_day)) ? Number(body.due_day) : null,
    isValidDateString(body.due_date) ? body.due_date : null,
    pick(body.status, DEBT_STATUSES, 'open'),
    Number.isFinite(Number(body.queue)) ? Number(body.queue) : 50,
    pick(body.source, SOURCES, 'joao'),
    body.locked ? 1 : 0,
    String(body.note || ''),
    now,
    now,
  );
  return listDebts(db, { status: 'all' }).find((d) => d.id === id);
}

export function updateDebt(db, id, body = {}) {
  const existing = db.prepare('SELECT * FROM finance_debts WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE finance_debts SET
      title = COALESCE(?, title),
      account_id = COALESCE(?, account_id),
      kind = ?,
      balance = ?,
      min_payment = ?,
      apr_label = ?,
      due_day = ?,
      due_date = ?,
      status = ?,
      queue = ?,
      source = ?,
      locked = ?,
      note = COALESCE(?, note),
      updated_at = ?
    WHERE id = ?
  `).run(
    body.title !== undefined ? String(body.title).trim() : null,
    body.account_id !== undefined ? body.account_id : null,
    body.kind !== undefined ? pick(body.kind, DEBT_KINDS, existing.kind) : existing.kind,
    body.balance !== undefined ? money(body.balance) : existing.balance,
    body.min_payment !== undefined
      ? (body.min_payment === null ? null : money(body.min_payment))
      : existing.min_payment,
    body.apr_label !== undefined ? pick(body.apr_label, APR_LABELS, existing.apr_label) : existing.apr_label,
    body.due_day !== undefined
      ? (Number.isFinite(Number(body.due_day)) ? Number(body.due_day) : null)
      : existing.due_day,
    body.due_date !== undefined
      ? (isValidDateString(body.due_date) ? body.due_date : null)
      : existing.due_date,
    body.status !== undefined ? pick(body.status, DEBT_STATUSES, existing.status) : existing.status,
    body.queue !== undefined ? Number(body.queue) : existing.queue,
    body.source !== undefined ? pick(body.source, SOURCES, existing.source) : existing.source,
    body.locked !== undefined ? (body.locked ? 1 : 0) : existing.locked,
    body.note !== undefined ? String(body.note) : null,
    nowIso(),
    id,
  );
  return listDebts(db, { status: 'all' }).find((d) => d.id === id);
}

/**
 * Lançamento (gasto do João, Midas, pagamento ou sync). Saída fica negativa e entrada positiva,
 * seja qual for o sinal recebido; sem direction, o sinal decide.
 */
export function createTransaction(db, body) {
  const postedOn = isValidDateString(body.posted_on) ? body.posted_on : todayFortaleza();
  const raw = typeof body.amount === 'string' ? body.amount.trim().replace(',', '.') : body.amount;
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw))) {
    throw badRequest('amount precisa ser número');
  }
  const signed = money(raw);
  const id = body.id || randomUUID();
  const direction = pick(body.direction, TX_DIRECTIONS, signed < 0 ? 'outflow' : 'inflow');
  let amount = signed;
  if (direction === 'outflow') amount = -Math.abs(signed);
  else if (direction === 'inflow') amount = Math.abs(signed);
  const category = FINANCE_CATEGORIES.includes(body.category) ? body.category : 'Outros';
  if (body.account_id) {
    const account = db.prepare('SELECT id FROM finance_accounts WHERE id = ?').get(String(body.account_id));
    if (!account) throw badRequest('account_id não existe');
  }
  db.prepare(`
    INSERT INTO finance_transactions
      (id, pierre_tx_id, external_id, account_id, posted_on, amount, direction, raw_description,
       merchant, category, subscription_id, debt_id, source, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.pierre_tx_id || null,
    body.external_id || null,
    body.account_id || null,
    postedOn,
    amount,
    direction,
    String(body.raw_description || '').slice(0, 300),
    String(body.merchant || '').trim().slice(0, 120),
    category,
    body.subscription_id || null,
    body.debt_id || null,
    pick(body.source, SOURCES, 'joao'),
    String(body.note || '').slice(0, 500),
    nowIso(),
  );
  return db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(id);
}

export function updateTransaction(db, id, body = {}) {
  const existing = db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE finance_transactions SET
      merchant = COALESCE(?, merchant),
      category = ?,
      subscription_id = COALESCE(?, subscription_id),
      debt_id = COALESCE(?, debt_id),
      raw_description = COALESCE(?, raw_description),
      note = COALESCE(?, note)
    WHERE id = ?
  `).run(
    body.merchant !== undefined ? String(body.merchant).trim().slice(0, 120) : null,
    body.category !== undefined && FINANCE_CATEGORIES.includes(body.category)
      ? body.category
      : existing.category,
    body.subscription_id !== undefined ? body.subscription_id : null,
    body.debt_id !== undefined ? body.debt_id : null,
    body.raw_description !== undefined ? String(body.raw_description) : null,
    body.note !== undefined ? String(body.note).slice(0, 500) : null,
    id,
  );
  return db.prepare('SELECT * FROM finance_transactions WHERE id = ?').get(id);
}

/** Extrato: lançamento manual já confirmado pelo banco não aparece de novo. */
export function listTransactions(db, { from, to, account_id, category, q, limit } = {}) {
  const today = todayFortaleza();
  const start = isValidDateString(from) ? from : addDays(today, -30);
  const end = isValidDateString(to) ? to : today;
  let sql = 'SELECT * FROM finance_transactions WHERE posted_on >= ? AND posted_on <= ? AND matched_tx_id IS NULL';
  const params = [start, end];
  if (account_id) {
    sql += ' AND account_id = ?';
    params.push(account_id);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (q) {
    sql += ' AND (merchant LIKE ? OR raw_description LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like);
  }
  sql += ' ORDER BY posted_on DESC, created_at DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 200, 1000));
  return db.prepare(sql).all(...params);
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function payDebt(db, id, body = {}) {
  const debt = db.prepare('SELECT * FROM finance_debts WHERE id = ?').get(id);
  if (!debt) return null;
  const amount = money(body.amount ?? debt.balance);
  if (amount <= 0) {
    const err = new Error('amount must be positive');
    err.status = 400;
    throw err;
  }
  const paidOn = isValidDateString(body.paid_on) ? body.paid_on : todayFortaleza();
  const nextBalance = money(Math.max(0, Number(debt.balance) - amount));
  const nextStatus = nextBalance <= 0.009 ? 'clean' : debt.status;

  const run = db.transaction(() => {
    db.prepare(`
      UPDATE finance_debts SET balance = ?, status = ?, updated_at = ? WHERE id = ?
    `).run(nextBalance, nextStatus, nowIso(), id);

    const paymentId = randomUUID();
    db.prepare(`
      INSERT INTO finance_payments (id, debt_id, account_id, amount, paid_on, method, confirmed, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      paymentId,
      id,
      body.account_id || null,
      amount,
      paidOn,
      String(body.method || 'pix'),
      String(body.note || ''),
      nowIso(),
    );

    createTransaction(db, {
      account_id: body.account_id || null,
      posted_on: paidOn,
      amount: -Math.abs(amount),
      direction: 'outflow',
      merchant: debt.title,
      // fatura de cartão só muda o dinheiro de lugar: as compras já contam no cartão
      category: debt.kind === 'card' ? 'Pagamento de fatura' : 'Dívidas',
      debt_id: id,
      source: 'joao',
      raw_description: `Pagamento ${debt.title}`,
    });

    db.prepare(`
      UPDATE finance_goals
      SET current_amount = MIN(target_amount, current_amount + ?),
          status = CASE WHEN current_amount + ? >= target_amount THEN 'done' ELSE status END,
          updated_at = ?
      WHERE debt_id = ? AND status = 'active'
    `).run(amount, amount, nowIso(), id);

    if (id === 'debt-carro' && nextStatus === 'clean') {
      updateSettings(db, { reserved_car: 0, snapshot_label: '' });
    } else {
      updateSettings(db, { snapshot_label: '' });
    }

    return paymentId;
  });

  const paymentId = run();
  return {
    debt: listDebts(db, { status: 'all' }).find((d) => d.id === id),
    payment: db.prepare('SELECT * FROM finance_payments WHERE id = ?').get(paymentId),
  };
}

export function listSubscriptions(db, { lane, status } = {}) {
  let q = 'SELECT * FROM finance_subscriptions WHERE 1=1';
  const params = [];
  if (lane && SUB_LANES.includes(lane)) {
    q += ' AND lane = ?';
    params.push(lane);
  }
  if (status && status !== 'all') {
    q += ' AND status = ?';
    params.push(status);
  }
  q += ' ORDER BY lane ASC, amount DESC';
  return db.prepare(q).all(...params).map((s) => ({
    ...s,
    amount: money(s.amount),
    locked: Number(s.locked) === 1,
  }));
}

export function createSubscription(db, body) {
  const name = String(body.name || '').trim();
  if (!name) {
    const err = new Error('name required');
    err.status = 400;
    throw err;
  }
  const id = body.id || randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO finance_subscriptions
      (id, name, lane, amount, cadence, charge_day, account_id, status, next_charge,
       vendor_hint, source, locked, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    pick(body.lane, SUB_LANES, 'personal'),
    money(body.amount),
    pick(body.cadence, SUB_CADENCES, 'monthly'),
    Number.isFinite(Number(body.charge_day)) ? Number(body.charge_day) : null,
    body.account_id || null,
    pick(body.status, SUB_STATUSES, 'active'),
    isValidDateString(body.next_charge) ? body.next_charge : null,
    String(body.vendor_hint || ''),
    pick(body.source, SOURCES, 'joao'),
    body.locked ? 1 : 0,
    String(body.note || ''),
    now,
    now,
  );
  return listSubscriptions(db).find((s) => s.id === id);
}

export function updateSubscription(db, id, body = {}) {
  const existing = db.prepare('SELECT * FROM finance_subscriptions WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE finance_subscriptions SET
      name = COALESCE(?, name),
      lane = ?,
      amount = ?,
      cadence = ?,
      charge_day = ?,
      account_id = COALESCE(?, account_id),
      status = ?,
      next_charge = ?,
      vendor_hint = COALESCE(?, vendor_hint),
      note = COALESCE(?, note),
      locked = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    body.name !== undefined ? String(body.name).trim() : null,
    body.lane !== undefined ? pick(body.lane, SUB_LANES, existing.lane) : existing.lane,
    body.amount !== undefined ? money(body.amount) : existing.amount,
    body.cadence !== undefined ? pick(body.cadence, SUB_CADENCES, existing.cadence) : existing.cadence,
    body.charge_day !== undefined
      ? (Number.isFinite(Number(body.charge_day)) ? Number(body.charge_day) : null)
      : existing.charge_day,
    body.account_id !== undefined ? body.account_id : null,
    body.status !== undefined ? pick(body.status, SUB_STATUSES, existing.status) : existing.status,
    body.next_charge !== undefined
      ? (isValidDateString(body.next_charge) ? body.next_charge : null)
      : existing.next_charge,
    body.vendor_hint !== undefined ? String(body.vendor_hint) : null,
    body.note !== undefined ? String(body.note) : null,
    body.locked !== undefined ? (body.locked ? 1 : 0) : existing.locked,
    nowIso(),
    id,
  );
  return listSubscriptions(db).find((s) => s.id === id);
}

export function deleteSubscription(db, id) {
  const existing = listSubscriptions(db).find((s) => s.id === id);
  if (!existing) return null;
  db.prepare('UPDATE finance_transactions SET subscription_id = NULL WHERE subscription_id = ?').run(id);
  db.prepare('DELETE FROM finance_subscriptions WHERE id = ?').run(id);
  return existing;
}

export function listInstallments(db, { status } = {}) {
  let q = 'SELECT * FROM finance_installments WHERE 1=1';
  const params = [];
  if (status && status !== 'all') {
    q += ' AND status = ?';
    params.push(status);
  }
  q += ' ORDER BY remaining DESC, monthly DESC';
  return db.prepare(q).all(...params).map((row) => ({
    ...row,
    monthly: money(row.monthly),
    remaining: money(row.remaining),
    locked: Number(row.locked) === 1,
  }));
}

export function createInstallment(db, body) {
  const title = String(body.title || '').trim();
  if (!title) {
    const err = new Error('title required');
    err.status = 400;
    throw err;
  }
  const id = body.id || randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO finance_installments
      (id, title, account_id, monthly, remaining, paid_n, total_n, last_due,
       status, source, locked, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    body.account_id || null,
    money(body.monthly),
    money(body.remaining),
    Number.isFinite(Number(body.paid_n)) ? Number(body.paid_n) : 0,
    Number.isFinite(Number(body.total_n)) ? Number(body.total_n) : 0,
    isValidDateString(body.last_due) ? body.last_due : null,
    pick(body.status, INST_STATUSES, 'open'),
    pick(body.source, SOURCES, 'pierre'),
    body.locked ? 1 : 0,
    String(body.note || ''),
    now,
    now,
  );
  return listInstallments(db).find((row) => row.id === id);
}

export function updateInstallment(db, id, body = {}) {
  const existing = db.prepare('SELECT * FROM finance_installments WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE finance_installments SET
      title = COALESCE(?, title),
      account_id = COALESCE(?, account_id),
      monthly = ?,
      remaining = ?,
      paid_n = ?,
      total_n = ?,
      last_due = ?,
      status = ?,
      source = ?,
      locked = ?,
      note = COALESCE(?, note),
      updated_at = ?
    WHERE id = ?
  `).run(
    body.title !== undefined ? String(body.title).trim() : null,
    body.account_id !== undefined ? body.account_id : null,
    body.monthly !== undefined ? money(body.monthly) : existing.monthly,
    body.remaining !== undefined ? money(body.remaining) : existing.remaining,
    body.paid_n !== undefined ? Number(body.paid_n) : existing.paid_n,
    body.total_n !== undefined ? Number(body.total_n) : existing.total_n,
    body.last_due !== undefined
      ? (isValidDateString(body.last_due) ? body.last_due : null)
      : existing.last_due,
    body.status !== undefined ? pick(body.status, INST_STATUSES, existing.status) : existing.status,
    body.source !== undefined ? pick(body.source, SOURCES, existing.source) : existing.source,
    body.locked !== undefined ? (body.locked ? 1 : 0) : existing.locked,
    body.note !== undefined ? String(body.note) : null,
    nowIso(),
    id,
  );
  return listInstallments(db).find((row) => row.id === id);
}

export function deleteInstallment(db, id) {
  const existing = listInstallments(db).find((row) => row.id === id);
  if (!existing) return null;
  db.prepare('DELETE FROM finance_installments WHERE id = ?').run(id);
  return existing;
}

export function listGoals(db) {
  return db.prepare('SELECT * FROM finance_goals ORDER BY due_date IS NULL, due_date ASC, title ASC').all()
    .map((g) => ({
      ...g,
      target_amount: money(g.target_amount),
      current_amount: money(g.current_amount),
      progress: g.target_amount > 0
        ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100))
        : 0,
    }));
}

export function createGoal(db, body) {
  const title = String(body.title || '').trim();
  if (!title) {
    const err = new Error('title required');
    err.status = 400;
    throw err;
  }
  const id = body.id || randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO finance_goals
      (id, title, target_amount, current_amount, due_date, debt_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    money(body.target_amount),
    money(body.current_amount || 0),
    isValidDateString(body.due_date) ? body.due_date : null,
    body.debt_id || null,
    pick(body.status, GOAL_STATUSES, 'active'),
    now,
    now,
  );
  return listGoals(db).find((g) => g.id === id);
}

export function updateGoal(db, id, body = {}) {
  const existing = db.prepare('SELECT * FROM finance_goals WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE finance_goals SET
      title = COALESCE(?, title),
      target_amount = ?,
      current_amount = ?,
      due_date = ?,
      debt_id = COALESCE(?, debt_id),
      status = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    body.title !== undefined ? String(body.title).trim() : null,
    body.target_amount !== undefined ? money(body.target_amount) : existing.target_amount,
    body.current_amount !== undefined ? money(body.current_amount) : existing.current_amount,
    body.due_date !== undefined
      ? (isValidDateString(body.due_date) ? body.due_date : null)
      : existing.due_date,
    body.debt_id !== undefined ? body.debt_id : null,
    body.status !== undefined ? pick(body.status, GOAL_STATUSES, existing.status) : existing.status,
    nowIso(),
    id,
  );
  return listGoals(db).find((g) => g.id === id);
}

export function getInsights(db, { from, to } = {}) {
  const today = todayFortaleza();
  const start = isValidDateString(from) ? from : addDays(today, -30);
  const end = isValidDateString(to) ? to : today;
  const rows = db.prepare(`
    SELECT * FROM finance_transactions
    WHERE posted_on >= ? AND posted_on <= ? AND matched_tx_id IS NULL
  `).all(start, end).filter((tx) => !OFF_BUDGET_CATEGORIES.includes(tx.category));

  let outflow = 0;
  let inflow = 0;
  const byCategory = new Map();
  const byDay = new Map();
  let cardOut = 0;
  let cashOut = 0;

  const accountKind = new Map(
    db.prepare('SELECT id, kind FROM finance_accounts').all().map((a) => [a.id, a.kind]),
  );

  for (const tx of rows) {
    const amt = money(tx.amount);
    if (tx.direction === 'internal') continue;
    if (tx.direction === 'inflow' || amt > 0) {
      inflow += Math.abs(amt);
    } else {
      const spent = Math.abs(amt);
      outflow += spent;
      const cat = tx.category || 'Outros';
      byCategory.set(cat, money((byCategory.get(cat) || 0) + spent));
      byDay.set(tx.posted_on, money((byDay.get(tx.posted_on) || 0) + spent));
      const kind = accountKind.get(tx.account_id);
      if (kind === 'credit') cardOut += spent;
      else cashOut += spent;
    }
  }

  const categories = [...byCategory.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  const days = [...byDay.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    from: start,
    to: end,
    outflow: money(outflow),
    inflow: money(inflow),
    card_outflow: money(cardOut),
    cash_outflow: money(cashOut),
    categories,
    days,
    tx_count: rows.length,
  };
}

// ── Despesas fixas ────────────────────────────────────────────────────────────

function monthOf(ymd) {
  return String(ymd).slice(0, 7);
}

function parseMonth(value, field = 'month') {
  if (typeof value !== 'string' || !MONTH_RE.test(value)) throw badRequest(`${field}: use YYYY-MM`);
  return value;
}

function parseAmount(value, field = 'amount') {
  if (typeof value === 'string' && value.trim() !== '') value = Number(value.replace(',', '.'));
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw badRequest(`${field} precisa ser número >= 0`);
  }
  return money(value);
}

function fixedRow(row, today) {
  const month = monthOf(today);
  return {
    ...row,
    amount: money(row.amount),
    due_day: row.due_day == null ? null : Number(row.due_day),
    active: Number(row.active) === 1,
    last_paid_month: row.last_paid_month || null,
    paid_this_month: row.last_paid_month === month,
  };
}

export function listFixedExpenses(db, { today } = {}) {
  const day = isValidDateString(today) ? today : todayFortaleza();
  return db.prepare(`
    SELECT * FROM finance_fixed_expenses
    ORDER BY active DESC, due_day IS NULL, due_day ASC, name ASC
  `).all().map((row) => fixedRow(row, day));
}

function getFixed(db, id, today) {
  const row = db.prepare('SELECT * FROM finance_fixed_expenses WHERE id = ?').get(id);
  return row ? fixedRow(row, isValidDateString(today) ? today : todayFortaleza()) : null;
}

/** Valida tudo antes de gravar; no PATCH só os campos enviados. */
function fixedFields(body, existing = null) {
  const out = {};
  if (!existing || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) throw badRequest('name obrigatório');
    out.name = name.slice(0, 120);
  }
  if (!existing || body.amount !== undefined) out.amount = parseAmount(body.amount);
  if (body.due_day !== undefined) {
    out.due_day = body.due_day === null || body.due_day === '' ? null : parseMonthDay(body.due_day, 'due_day');
  }
  if (body.category !== undefined) {
    if (!FINANCE_CATEGORIES.includes(body.category)) throw badRequest('category inválida');
    out.category = body.category;
  }
  if (body.lane !== undefined) {
    if (!SUB_LANES.includes(body.lane)) throw badRequest('lane: use personal ou work');
    out.lane = body.lane;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean' && ![0, 1].includes(body.active)) throw badRequest('active precisa ser booleano');
    out.active = body.active ? 1 : 0;
  }
  if (body.note !== undefined) out.note = String(body.note ?? '').slice(0, 500);
  return out;
}

export function createFixedExpense(db, body = {}, { today } = {}) {
  const fields = fixedFields(body);
  const id = randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO finance_fixed_expenses
      (id, name, amount, due_day, category, lane, active, last_paid_month, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(
    id,
    fields.name,
    fields.amount,
    fields.due_day ?? null,
    fields.category || 'Outros',
    fields.lane || 'personal',
    fields.active ?? 1,
    fields.note || '',
    now,
    now,
  );
  return getFixed(db, id, today);
}

export function updateFixedExpense(db, id, body = {}, { today } = {}) {
  const existing = db.prepare('SELECT * FROM finance_fixed_expenses WHERE id = ?').get(id);
  if (!existing) return null;
  const fields = fixedFields(body, existing);
  const next = { ...existing, ...fields };
  db.prepare(`
    UPDATE finance_fixed_expenses
    SET name = ?, amount = ?, due_day = ?, category = ?, lane = ?, active = ?, note = ?, updated_at = ?
    WHERE id = ?
  `).run(next.name, next.amount, next.due_day, next.category, next.lane, next.active, next.note || '', nowIso(), id);
  return getFixed(db, id, today);
}

export function deleteFixedExpense(db, id) {
  const existing = db.prepare('SELECT * FROM finance_fixed_expenses WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare('DELETE FROM finance_fixed_expenses WHERE id = ?').run(id);
  return existing;
}

/** Marca pago no mês (padrão: mês de hoje em Fortaleza). `month: null` desfaz. */
export function markFixedPaid(db, id, { month, today } = {}) {
  const existing = db.prepare('SELECT * FROM finance_fixed_expenses WHERE id = ?').get(id);
  if (!existing) return null;
  const day = isValidDateString(today) ? today : todayFortaleza();
  const value = month === null ? null : month === undefined ? monthOf(day) : parseMonth(month);
  db.prepare('UPDATE finance_fixed_expenses SET last_paid_month = ?, updated_at = ? WHERE id = ?')
    .run(value, nowIso(), id);
  return getFixed(db, id, day);
}

// ── Janela até o salário ──────────────────────────────────────────────────────

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ymdOf(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Dia D no mês (ano, mês 1..12); dia 31 em mês de 30 vira o último dia. */
function dayInMonth(year, month, day) {
  return ymdOf(year, month, Math.min(day, daysInMonth(year, month)));
}

function shiftMonth(year, month, delta) {
  const idx = year * 12 + (month - 1) + delta;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

/** Próximo dia do salário: se hoje já é (ou passou) o dia, é o do mês seguinte. */
export function nextSalaryDate(today, salaryDay = DEFAULT_SALARY_DAY) {
  const [y, m] = today.split('-').map(Number);
  const thisMonth = dayInMonth(y, m, salaryDay);
  if (today < thisMonth) return thisMonth;
  const [ny, nm] = shiftMonth(y, m, 1);
  return dayInMonth(ny, nm, salaryDay);
}

/** Datas em que o dia D do mês cai dentro de [from, to]. */
function occurrencesInWindow(day, from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const [y, m] = shiftMonth(fy, fm, i);
    const date = dayInMonth(y, m, day);
    if (date > to) break;
    if (date >= from) out.push(date);
  }
  return out;
}

/** paid: restante < R$ 5; min_paid_rolled: pagou o mínimo, o resto rola; min_open: nem o mínimo. */
export function cardSituation(card) {
  if (!card || card.bill_total == null) return null;
  const total = Number(card.bill_total) || 0;
  const paid = Number(card.bill_paid) || 0;
  const remaining = card.bill_remaining != null ? Number(card.bill_remaining) : Math.max(0, total - paid);
  if (remaining < 5) return 'paid';
  if (paid + 0.009 >= (Number(card.bill_minimum) || 0)) return 'min_paid_rolled';
  return 'min_open';
}

function cardLabel(card) {
  return card.account_name || card.institution || 'cartão';
}

/**
 * Tudo que sai do caixa de hoje até a véspera do salário:
 * fixas ativas não pagas no mês do vencimento, assinaturas active/keep e mínimo em aberto dos cartões.
 * Dívida com status waiting (pai) não entra.
 */
export function commitmentsUntilSalary(db, { today, salaryDate, cardsStatus }) {
  const until = addDays(salaryDate, -1);
  const items = [];
  const unknown = [];

  for (const fx of listFixedExpenses(db, { today })) {
    if (!fx.active || !(fx.amount > 0)) continue;
    if (fx.due_day == null) {
      unknown.push({ kind: 'fixed', id: fx.id, name: fx.name, amount: fx.amount });
      continue;
    }
    for (const date of occurrencesInWindow(fx.due_day, today, until)) {
      if (fx.last_paid_month === monthOf(date)) continue;
      items.push({ kind: 'fixed', id: fx.id, name: fx.name, amount: fx.amount, due_date: date });
    }
  }

  for (const sub of listSubscriptions(db)) {
    if (!['active', 'keep'].includes(sub.status) || !(sub.amount > 0)) continue;
    if (sub.cadence === 'yearly') {
      if (sub.next_charge && sub.next_charge >= today && sub.next_charge <= until) {
        items.push({ kind: 'subscription', id: sub.id, name: sub.name, amount: sub.amount, due_date: sub.next_charge });
      }
      continue;
    }
    const day = Number(sub.charge_day);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      unknown.push({ kind: 'subscription', id: sub.id, name: sub.name, amount: sub.amount });
      continue;
    }
    for (const date of occurrencesInWindow(day, today, until)) {
      items.push({ kind: 'subscription', id: sub.id, name: sub.name, amount: sub.amount, due_date: date });
    }
  }

  // mínimo em aberto conta até o salário; vencido há até 7 dias ainda pesa
  const overdueFrom = addDays(today, -7);
  for (const card of cardsStatus) {
    if (card.account_status !== 'active' || card.card_situation !== 'min_open' || !card.bill_due) continue;
    if (card.bill_due < overdueFrom || card.bill_due > until) continue;
    const amount = money(Math.max(0, Number(card.bill_minimum || 0) - Number(card.bill_paid || 0)));
    if (!(amount > 0)) continue;
    items.push({
      kind: 'card_minimum',
      id: card.account_id,
      name: cardLabel(card),
      amount,
      due_date: card.bill_due,
    });
  }

  items.sort((a, b) => a.due_date.localeCompare(b.due_date) || b.amount - a.amount);
  return { items, unknown, until };
}

function shortDate(ymd) {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/**
 * Próximo passo, nesta ordem:
 * (a) cartão com mínimo em aberto vencendo em até 3 dias (ou vencido);
 * (b) primeiro compromisso até o salário que o livre não cobre;
 * (c) nada aperta: quanto dá pra gastar até o salário.
 * Fatura com mínimo pago nunca vira passo: rolar o resto foi decisão.
 */
function buildNextStep({ livre, commitments, cardsStatus, today, salaryDate, safeToSpend }) {
  const urgentCard = cardsStatus
    .filter((c) => c.account_status === 'active' && c.card_situation === 'min_open' && c.bill_due)
    .map((c) => ({ ...c, days: daysUntil(c.bill_due, today) }))
    .filter((c) => c.days !== null && c.days <= 3 && c.days >= -7)
    .sort((a, b) => a.days - b.days)[0];
  if (urgentCard) {
    const gap = money(Math.max(0, Number(urgentCard.bill_minimum || 0) - Number(urgentCard.bill_paid || 0)));
    const when = urgentCard.days < 0 ? `(venceu ${shortDate(urgentCard.bill_due)})` : `até ${shortDate(urgentCard.bill_due)}`;
    return {
      kind: 'card_min',
      ref: { kind: 'card_minimum', id: urgentCard.account_id },
      debt_id: null,
      title: cardLabel(urgentCard),
      amount: gap,
      gap,
      due_date: urgentCard.bill_due,
      label: `Falta ${formatBrl(gap)} pro mínimo do ${cardLabel(urgentCard)} ${when}`,
    };
  }

  let left = Math.max(0, livre);
  for (const item of commitments) {
    if (left >= item.amount) {
      left = money(left - item.amount);
      continue;
    }
    const gap = money(item.amount - left);
    return {
      kind: 'cover',
      ref: { kind: item.kind, id: item.id },
      debt_id: null,
      title: item.name,
      amount: item.amount,
      gap,
      due_date: item.due_date,
      label: `Separa ${formatBrl(gap)} pra ${item.name} (${shortDate(item.due_date)})`,
    };
  }

  return {
    kind: 'clear',
    ref: null,
    debt_id: null,
    title: null,
    amount: safeToSpend,
    gap: null,
    due_date: salaryDate,
    label: `Sem compromisso descoberto até o salário (${shortDate(salaryDate)}). Pode gastar ${formatBrl(safeToSpend)}.`,
  };
}

/**
 * Gasto lançado à mão (app/Midas) ainda não visto pelo banco: posted_on depois do último saldo
 * da conta, ou no mesmo dia e lançado depois dele. Sem conta, compara com o saldo mais novo do caixa.
 * Conta que não é do dia e cartão de crédito não mexem no caixa.
 */
function manualPendingOut(db, accounts, today) {
  const operational = accounts.filter((a) => a.is_operational && a.status === 'active' && a.kind !== 'credit');
  const latest = new Map();
  for (const acc of operational) {
    const bal = latestBalance(db, acc.id, 'available');
    if (bal) latest.set(acc.id, bal);
  }
  const newest = [...latest.values()].sort((a, b) =>
    `${a.as_of}${a.created_at}`.localeCompare(`${b.as_of}${b.created_at}`),
  ).at(-1) || null;
  const placeholders = MANUAL_SOURCES.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT * FROM finance_transactions
    WHERE source IN (${placeholders}) AND direction = 'outflow' AND matched_tx_id IS NULL
      AND posted_on >= ? AND posted_on <= ?
  `).all(...MANUAL_SOURCES, addDays(today, -40), today);

  let total = 0;
  for (const tx of rows) {
    let bal;
    if (!tx.account_id) bal = newest;
    else if (operational.some((a) => a.id === tx.account_id)) bal = latest.get(tx.account_id) || null;
    else continue;
    const pending = !bal
      || tx.posted_on > bal.as_of
      || (tx.posted_on === bal.as_of && String(tx.created_at) > String(bal.created_at));
    if (pending) total += Math.abs(Number(tx.amount) || 0);
  }
  return money(total);
}

// ── Orçamento e mês ───────────────────────────────────────────────────────────

export function listBudgets(db) {
  return db.prepare('SELECT * FROM finance_budgets ORDER BY category ASC').all()
    .map((b) => ({ ...b, monthly_limit: money(b.monthly_limit) }));
}

/** PUT aceita {category, monthly_limit}, uma lista ou {budgets: [...]}; limite null apaga. */
export function saveBudgets(db, body) {
  const list = Array.isArray(body) ? body : body && body.budgets !== undefined ? body.budgets : [body];
  if (!Array.isArray(list) || !list.length) throw badRequest('budgets: lista de {category, monthly_limit}');
  const parsed = list.map((item, i) => {
    if (!item || typeof item !== 'object') throw badRequest(`budgets[${i}]: objeto`);
    if (!FINANCE_CATEGORIES.includes(item.category) || OFF_BUDGET_CATEGORIES.includes(item.category) || item.category === 'Receita') {
      throw badRequest(`budgets[${i}].category inválida`);
    }
    if (item.monthly_limit === null) return { category: item.category, limit: null };
    return { category: item.category, limit: parseAmount(item.monthly_limit, `budgets[${i}].monthly_limit`) };
  });
  const now = nowIso();
  db.transaction(() => {
    for (const { category, limit } of parsed) {
      if (limit === null) {
        db.prepare('DELETE FROM finance_budgets WHERE category = ?').run(category);
      } else {
        db.prepare(`
          INSERT INTO finance_budgets (category, monthly_limit, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit, updated_at = excluded.updated_at
        `).run(category, limit, now);
      }
    }
  })();
  return listBudgets(db);
}

/** Gasto do mês por categoria (só saídas; fatura e transferência à parte), com limite e % do orçamento. */
export function getMonthSummary(db, { month, today } = {}) {
  const day = isValidDateString(today) ? today : todayFortaleza();
  const ym = month === undefined || month === null || month === '' ? monthOf(day) : parseMonth(month);
  const [y, m] = ym.split('-').map(Number);
  const from = `${ym}-01`;
  const to = ymdOf(y, m, daysInMonth(y, m));
  const rows = db.prepare(`
    SELECT category, direction, amount FROM finance_transactions
    WHERE posted_on >= ? AND posted_on <= ? AND matched_tx_id IS NULL AND direction != 'internal'
  `).all(from, to);

  const spent = new Map();
  const count = new Map();
  let totalOut = 0;
  let totalIn = 0;
  let offBudget = 0;
  for (const tx of rows) {
    const amt = Math.abs(Number(tx.amount) || 0);
    const out = tx.direction === 'outflow' || Number(tx.amount) < 0;
    if (OFF_BUDGET_CATEGORIES.includes(tx.category)) {
      if (out) offBudget += amt;
      continue;
    }
    if (!out) {
      totalIn += amt;
      continue;
    }
    const cat = tx.category || 'Outros';
    totalOut += amt;
    spent.set(cat, (spent.get(cat) || 0) + amt);
    count.set(cat, (count.get(cat) || 0) + 1);
  }

  const budgets = new Map(listBudgets(db).map((b) => [b.category, b.monthly_limit]));
  const names = new Set([...spent.keys(), ...budgets.keys()]);
  const categories = [...names].map((category) => {
    const value = money(spent.get(category) || 0);
    const limit = budgets.has(category) ? budgets.get(category) : null;
    return {
      category,
      spent: value,
      limit,
      pct: limit ? Math.round((value / limit) * 100) : limit === 0 ? (value > 0 ? 100 : 0) : null,
      tx_count: count.get(category) || 0,
    };
  }).sort((a, b) => b.spent - a.spent || (b.limit || 0) - (a.limit || 0) || a.category.localeCompare(b.category));

  return {
    month: ym,
    from,
    to,
    total_out: money(totalOut),
    total_in: money(totalIn),
    off_budget_out: money(offBudget),
    budget_total: money([...budgets.values()].reduce((s, v) => s + v, 0)),
    categories,
  };
}

// ── Categoria e descrição do banco ────────────────────────────────────────────

const CATEGORY_RULES = [
  ['Pagamento de fatura', /credit card payment|card bill|pagamento (de )?fatura|pagto\.? fatura|pgto\.? fatura|pag fatura|fatura (do )?cart/i],
  ['Transferência', /same person|mesma titularidade|entre contas|own account|transfer[eê]ncia (entre|para) (contas|mim)|investment|aplica[cç][aã]o|resgate|poupan[cç]a|cofrinho|caixinha/i],
  ['Receita', /salary|sal[aá]rio|income|proventos|renda|dividend/i],
  ['Impostos', /\btax(es)?\b|impost|darf|\bdas\b|iptu|ipva|simples nacional/i],
  ['Assinaturas', /subscription|streaming|digital service|assinatura|netflix|spotify|youtube|icloud|apple\.com|google one|prime video|disney|hbo|deezer|chatgpt|openai/i],
  ['Alimentação', /food|eating|restaurant|delivery|groceries|supermarket|bakery|ifood|rappi|aliment|restaurante|lanchonete|padaria|mercado(?! ?(pago|livre))|supermercado|atacad|a[cç]ougue|hortifruti|caf[eé]\b/i],
  ['Transporte', /transport|taxi|ride|uber|99app|99 ?pop|gas station|fuel|parking|toll|combust|posto|estacionamento|ped[aá]gio|[oô]nibus|metr[oô]|passagem/i],
  ['Moradia', /housing|rent\b|electricity|water|utilities|telecom|internet|aluguel|condom[ií]nio|energia|enel|[aá]gua|cagece|g[aá]s de cozinha/i],
  ['Saúde', /health|pharmac|drugstore|hospital|clinic|dentist|doctor|sa[uú]de|farm[aá]cia|drogaria|drogasil|pague menos|cl[ií]nica|laborat[oó]rio|m[eé]dic/i],
  ['Educação', /educat|school|university|college|course|book|faculdade|escola|curso|livraria|udemy|alura/i],
  ['Compras', /shopping|clothing|electronics|department store|marketplace|compras|loja|vestu[aá]rio|mercado ?livre|amazon|shopee|magalu|magazine|aliexpress|shein/i],
  ['Lazer', /leisure|entertainment|travel|hotel|airline|cinema|theater|game|sport|lazer|viagem|show|ingresso|bar\b/i],
];

/** Categoria do Pluggy/Midas (ou descrição) → categoria da Praxis. */
export function mapBankCategory(category, description, amount, accountType) {
  if (FINANCE_CATEGORIES.includes(category)) return category;
  const desc = String(description || '');
  if (accountType === 'CREDIT' && Number(amount) > 0 && /pagamento|payment/i.test(`${category || ''} ${desc}`)) {
    return 'Pagamento de fatura';
  }
  for (const text of [category, desc]) {
    if (!text) continue;
    for (const [name, re] of CATEGORY_RULES) {
      if (re.test(text)) return name;
    }
  }
  if (Number(amount) > 0 && accountType !== 'CREDIT') return 'Receita';
  return 'Outros';
}

const MERCHANT_PREFIX = /^(compra (no |com )?(d[eé]bito|cr[eé]dito|cart[aã]o)|compra|pix (enviado|recebido|transf)|pix|pagamento( de)?|pag\*|pg \*|transfer[eê]ncia (enviada|recebida)|ted|doc|d[eé]bito autom[aá]tico)\b\s*[-:]?\s*/i;

function titleCase(text) {
  return text.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/** "COMPRA CARTAO IFOOD *RESTAURANTE 12/10" → "Ifood Restaurante". */
export function cleanMerchant(description) {
  const original = String(description || '').replace(/\s+/g, ' ').trim();
  let s = original.replace(MERCHANT_PREFIX, '');
  s = s.replace(/\*/g, ' ').replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?$/, '').replace(/\s+/g, ' ').trim();
  if (!s) s = original;
  if (s && s === s.toUpperCase()) s = titleCase(s);
  return s.slice(0, 80);
}

/** Estado dos cartões que o banco mandou, com o nome da conta e a situação da fatura. */
export function listCardStatus(db) {
  return db.prepare(`
    SELECT cs.*, a.name AS account_name, a.status AS account_status
    FROM finance_card_status cs
    LEFT JOIN finance_accounts a ON a.id = cs.account_id
    ORDER BY cs.bill_due IS NULL, cs.bill_due ASC, cs.institution ASC
  `).all().map((card) => ({ ...card, card_situation: cardSituation(card) }));
}

/** Última atualização de cada banco ativo (cartão ou saldo do Pluggy); devolve a mais antiga. */
function bankDataAsOf(db, cardsStatus) {
  const latest = new Map();
  const note = (institution, ts) => {
    if (!institution || !ts) return;
    if (!latest.has(institution) || ts > latest.get(institution)) latest.set(institution, ts);
  };
  for (const card of cardsStatus) {
    if (card.account_status === 'active') note(card.institution, card.bank_updated_at);
  }
  const balances = db.prepare(`
    SELECT a.institution, MAX(b.created_at) AS ts
    FROM finance_balances b
    JOIN finance_accounts a ON a.id = b.account_id
    WHERE b.source = 'pluggy' AND a.status = 'active'
    GROUP BY a.institution
  `).all();
  for (const row of balances) note(row.institution, row.ts);
  return [...latest.values()].sort()[0] || null;
}

export function lastMidasSync(db) {
  return db.prepare(`
    SELECT * FROM finance_sync_log
    WHERE actor = 'midas' AND ok = 1
    ORDER BY started_at DESC
    LIMIT 1
  `).get() || null;
}

export function getOverview(db, { today } = {}) {
  const day = isValidDateString(today) ? today : todayFortaleza();
  const settings = getSettings(db);
  const accounts = listAccounts(db);
  const debts = listDebts(db);
  const subscriptions = listSubscriptions(db);
  const lastSync = db.prepare(
    'SELECT * FROM finance_sync_log ORDER BY started_at DESC LIMIT 1',
  ).get();

  const caixaBanco = money(
    accounts
      .filter((a) => a.is_operational && a.status === 'active')
      .reduce((sum, a) => sum + Number(a.available || 0), 0),
  );
  // gasto lançado hoje desconta na hora; some quando o banco mandar o saldo novo
  const manualPending = manualPendingOut(db, accounts, day);
  const caixa = money(caixaBanco - manualPending);
  const invested = money(
    accounts
      .filter((a) => a.status === 'active')
      .reduce((sum, a) => sum + Number(a.invested || 0), 0),
  );
  const reservedCar = money(settings.reserved_car);
  const reservedLive = money(settings.reserved_live);
  const reserved = money(reservedCar + reservedLive);
  const livre = money(caixa - reserved);

  const openDebts = debts.filter((d) => d.status !== 'clean');
  const cardOpen = openDebts.filter((d) => d.kind === 'card');
  const debtsTotal = money(openDebts.reduce((s, d) => s + d.balance, 0));
  // dívida de cartão alimentada pelo Pluggy guarda o restante da fatura (total - pago) em balance
  const cardsTotal = money(cardOpen.reduce((s, d) => s + d.balance, 0));
  const billsFrom = addDays(day, -3);
  const billsTo = addDays(day, 7);
  const billsDue7d = money(
    cardOpen
      .filter((d) => d.due_date && d.due_date >= billsFrom && d.due_date <= billsTo)
      .reduce((s, d) => s + d.balance, 0),
  );

  const cardsStatus = listCardStatus(db);
  const salaryDate = nextSalaryDate(day, settings.salary_day);
  const commitments = commitmentsUntilSalary(db, { today: day, salaryDate, cardsStatus });
  const committedUntilSalary = money(commitments.items.reduce((s, c) => s + c.amount, 0));
  const safeToSpend = money(Math.max(0, livre - committedUntilSalary));
  const creditAvailableTotal = money(
    cardsStatus
      .filter((c) => c.account_status === 'active')
      .reduce((s, c) => s + Number(c.limit_available || 0), 0),
  );

  const liveSubs = subscriptions.filter((s) => ['active', 'keep'].includes(s.status));
  const workMonth = money(liveSubs.filter((s) => s.lane === 'work').reduce((s, x) => s + x.amount, 0));
  const personalMonth = money(liveSubs.filter((s) => s.lane === 'personal').reduce((s, x) => s + x.amount, 0));

  const openInst = listInstallments(db, { status: 'open' });
  const installmentsRemaining = money(openInst.reduce((s, x) => s + Number(x.remaining || 0), 0));
  const installmentsMonth = money(openInst.reduce((s, x) => s + Number(x.monthly || 0), 0));
  const lastInstDue = openInst
    .map((x) => x.last_due)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  const nextDue = openDebts
    .filter((d) => d.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;

  const nextStep = buildNextStep({
    livre,
    commitments: commitments.items,
    cardsStatus,
    today: day,
    salaryDate,
    safeToSpend,
  });

  return {
    today: day,
    snapshot_label: settings.snapshot_label || '',
    caixa,
    caixa_banco: caixaBanco,
    manual_pending_out: manualPending,
    invested,
    patrimonio_liquido_curto: money(caixa + invested),
    reserved_car: reservedCar,
    reserved_live: reservedLive,
    reserved,
    livre,
    salary_day: settings.salary_day,
    next_salary_date: salaryDate,
    committed_until_salary: committedUntilSalary,
    commitments_until_salary: commitments.items,
    commitments_unknown_day: commitments.unknown,
    safe_to_spend: safeToSpend,
    // compatibilidade: faturas de cartão de hoje-3 a hoje+7 (o front usa os compromissos até o salário)
    bills_due_7d: billsDue7d,
    month: getMonthSummary(db, { today: day }),
    debts_total: debtsTotal,
    cards_total: cardsTotal,
    cards_status: cardsStatus,
    credit_available_total: creditAvailableTotal,
    bank_data_as_of: bankDataAsOf(db, cardsStatus),
    subscriptions_month: money(workMonth + personalMonth),
    work_month: workMonth,
    personal_month: personalMonth,
    installments_remaining: installmentsRemaining,
    installments_month: installmentsMonth,
    installments_n: openInst.length,
    installments_last: lastInstDue,
    next_due: nextDue
      ? { id: nextDue.id, title: nextDue.title, amount: nextDue.balance, due_date: nextDue.due_date }
      : null,
    next_step: nextStep,
    accounts,
    debts,
    last_sync: lastSync || null,
    last_midas_sync: lastMidasSync(db),
    settings,
  };
}

export function lastSync(db) {
  return db.prepare('SELECT * FROM finance_sync_log ORDER BY started_at DESC LIMIT 1').get() || null;
}

export function recordSyncAttempt(db, { ok, error, actor, accountsN = 0, txN = 0 }) {
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO finance_sync_log (id, started_at, finished_at, ok, accounts_n, tx_n, error, actor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ts, ts, ok ? 1 : 0, accountsN, txN, String(error || ''), actor || 'system');
  return db.prepare('SELECT * FROM finance_sync_log WHERE id = ?').get(id);
}
