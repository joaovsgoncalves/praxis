/**
 * Cobertura do extrato — fase 3 do PRD.
 *
 * Saldo atualizado não prova extrato: o Midas manda saldo e cartão a cada hora e nenhum lançamento.
 * Aqui fica guardado, por conta e origem, o intervalo de datas em que o banco respondeu o extrato.
 * Um total de R$ 0 só é "real" quando esse intervalo cobre o período perguntado.
 *
 * Sem dependência de finance.js (evita import circular); datas são YYYY-MM-DD.
 */

import { randomUUID } from 'crypto';

export const COVERAGE_SOURCES = ['pierre', 'pluggy'];
export const COVERAGE_STATUSES = ['complete', 'partial', 'manual_only', 'unavailable'];
const BANK_SOURCES = ['pierre', 'pluggy'];
const MANUAL_SOURCES = ['joao', 'agent'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function initCoverageSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_statement_coverage (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      source TEXT NOT NULL,
      covered_from TEXT NOT NULL,
      covered_to TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_finance_coverage_account
      ON finance_statement_coverage(account_id, covered_from, covered_to);
  `);
}

function isYmd(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/** Dias corridos de a até b, contando os dois; 0 quando b vem antes de a. */
export function daysBetween(a, b) {
  if (!isYmd(a) || !isYmd(b) || b < a) return 0;
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000) + 1;
}

function todayFortaleza() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
}

/**
 * Registra que o extrato da conta veio para [from, to]. Janelas da mesma conta e origem que se
 * tocam viram uma só, então a sincronização diária não enche a tabela. Idempotente.
 */
export function recordStatementCoverage(db, { accountId, source, from, to, at } = {}) {
  if (!accountId || !COVERAGE_SOURCES.includes(source) || !isYmd(from) || !isYmd(to) || to < from) return null;
  const recordedAt = at || new Date().toISOString();
  return db.transaction(() => {
    // encosta ou sobrepõe: começa até o dia seguinte ao fim e termina a partir da véspera do início
    const touching = db.prepare(`
      SELECT * FROM finance_statement_coverage
      WHERE account_id = ? AND source = ? AND covered_from <= ? AND covered_to >= ?
    `).all(accountId, source, addDays(to, 1), addDays(from, -1));
    let start = from;
    let end = to;
    let latest = recordedAt;
    for (const row of touching) {
      if (row.covered_from < start) start = row.covered_from;
      if (row.covered_to > end) end = row.covered_to;
      if (row.recorded_at > latest) latest = row.recorded_at;
    }
    const drop = db.prepare('DELETE FROM finance_statement_coverage WHERE id = ?');
    for (const row of touching) drop.run(row.id);
    const id = randomUUID();
    db.prepare(`
      INSERT INTO finance_statement_coverage (id, account_id, source, covered_from, covered_to, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, accountId, source, start, end, latest);
    return { id, account_id: accountId, source, covered_from: start, covered_to: end, recorded_at: latest };
  })();
}

/** Soma os dias de [from, to] cobertos pela união das janelas. */
function coveredDays(windows, from, to) {
  const clipped = windows
    .map((w) => ({ from: w.covered_from < from ? from : w.covered_from, to: w.covered_to > to ? to : w.covered_to }))
    .filter((w) => w.to >= w.from)
    .sort((a, b) => a.from.localeCompare(b.from));
  let days = 0;
  let cursor = null;
  let first = null;
  let last = null;
  for (const w of clipped) {
    const start = cursor && w.from <= cursor ? addDays(cursor, 1) : w.from;
    if (start <= w.to) {
      days += daysBetween(start, w.to);
      if (!first) first = start;
    }
    if (!cursor || w.to > cursor) cursor = w.to;
    last = cursor;
  }
  return { days, first, last };
}

/**
 * O que se sabe do extrato em [from, to].
 *
 * Por conta ligada a banco: complete | partial | none. Conta sem ligação com banco é `manual` e
 * não entra na conta do período. Do período:
 *   complete     todas as contas ligadas têm extrato do período inteiro (zero é zero de verdade)
 *   partial      só parte das contas ou dos dias veio do banco
 *   manual_only  o banco não mandou extrato; só existe o que foi lançado à mão
 *   unavailable  nem extrato nem lançamento manual
 *
 * Dias no futuro não contam. O dia de hoje ainda está em aberto no banco, então o período é
 * completo com extrato até ontem (a não ser que o período seja só hoje).
 */
export function getStatementCoverage(db, { from, to, today } = {}) {
  const day = isYmd(today) ? today : todayFortaleza();
  const start = isYmd(from) ? from : addDays(day, -30);
  const end = isYmd(to) && to >= start ? to : (isYmd(to) ? start : day);
  const measuredTo = end > day ? day : end;
  const daysTotal = daysBetween(start, measuredTo);
  const yesterday = addDays(day, -1);
  const settledTo = measuredTo > yesterday ? yesterday : measuredTo;
  const daysSettled = daysBetween(start, settledTo);
  const requiredTo = daysSettled > 0 ? settledTo : measuredTo;
  const daysRequired = daysSettled > 0 ? daysSettled : daysTotal;

  const accounts = db.prepare(`
    SELECT id, name, institution, kind, status, pierre_account_id FROM finance_accounts
    WHERE status = 'active'
    ORDER BY sort_order ASC, id ASC
  `).all();
  const windowsOf = db.prepare(`
    SELECT source, covered_from, covered_to, recorded_at FROM finance_statement_coverage
    WHERE account_id = ? ORDER BY covered_from ASC
  `);
  const bankBalanceOf = db.prepare(`
    SELECT MAX(created_at) AS ts FROM finance_balances
    WHERE account_id = ? AND source IN (${BANK_SOURCES.map(() => '?').join(', ')})
  `);
  const txCount = db.prepare(`
    SELECT
      SUM(CASE WHEN source IN (${BANK_SOURCES.map(() => '?').join(', ')}) THEN 1 ELSE 0 END) AS bank,
      SUM(CASE WHEN source IN (${MANUAL_SOURCES.map(() => '?').join(', ')}) AND matched_tx_id IS NULL THEN 1 ELSE 0 END) AS manual
    FROM finance_transactions
    WHERE posted_on >= ? AND posted_on <= ? AND (? IS NULL OR account_id = ?)
  `);
  const countFor = (accountId) => {
    if (daysTotal === 0) return { bank: 0, manual: 0 };
    const row = txCount.get(...BANK_SOURCES, ...MANUAL_SOURCES, start, measuredTo, accountId, accountId);
    return { bank: Number(row?.bank || 0), manual: Number(row?.manual || 0) };
  };

  const perAccount = accounts.map((account) => {
    const windows = windowsOf.all(account.id);
    const balanceAt = bankBalanceOf.get(account.id, ...BANK_SOURCES)?.ts || null;
    const linked = Boolean(account.pierre_account_id) || Boolean(balanceAt) || windows.length > 0;
    const counts = countFor(account.id);
    const covered = daysRequired > 0 ? coveredDays(windows, start, requiredTo) : { days: 0, first: null, last: null };
    const everCovered = windows.length ? windows.map((w) => w.covered_to).sort().at(-1) : null;
    let status = 'manual';
    if (linked) {
      if (daysRequired > 0 && covered.days >= daysRequired) status = 'complete';
      else if (covered.days > 0 || counts.bank > 0) status = 'partial';
      else status = 'none';
    }
    return {
      account_id: account.id,
      name: account.name,
      institution: account.institution,
      kind: account.kind,
      status,
      days_covered: covered.days,
      days_required: linked ? daysRequired : 0,
      covered_from: covered.first,
      covered_to: covered.last,
      statement_through: everCovered,
      statement_at: windows.length ? windows.map((w) => w.recorded_at).sort().at(-1) : null,
      sources: [...new Set(windows.map((w) => w.source))].sort(),
      balance_at: balanceAt,
      bank_tx_count: counts.bank,
      manual_tx_count: counts.manual,
    };
  });

  const linked = perAccount.filter((a) => a.status !== 'manual');
  const complete = linked.filter((a) => a.status === 'complete');
  const some = linked.filter((a) => a.status === 'complete' || a.status === 'partial');
  const totals = countFor(null);

  let status = 'unavailable';
  if (daysRequired > 0 && linked.length > 0 && complete.length === linked.length) status = 'complete';
  else if (some.length > 0 || totals.bank > 0) status = 'partial';
  else if (totals.manual > 0) status = 'manual_only';

  const latest = (list) => list.filter(Boolean).sort().at(-1) || null;
  return {
    from: start,
    to: end,
    today: day,
    measured_to: daysTotal > 0 ? measuredTo : null,
    days_total: daysTotal,
    days_required: daysRequired,
    status,
    // só com extrato do período inteiro um total zerado quer dizer "não houve movimento"
    zero_is_real: status === 'complete',
    linked_accounts_n: linked.length,
    complete_accounts_n: complete.length,
    covered_accounts_n: some.length,
    bank_tx_count: totals.bank,
    manual_tx_count: totals.manual,
    statement_at: latest(perAccount.map((a) => a.statement_at)),
    statement_through: latest(perAccount.map((a) => a.statement_through)),
    balance_at: latest(perAccount.map((a) => a.balance_at)),
    accounts: perAccount,
  };
}
