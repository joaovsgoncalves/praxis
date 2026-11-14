/**
 * Ingest do Pluggy via Midas: o Midas lê os bancos e manda um JSON já normalizado.
 * A Praxis não fala com o Pluggy. Valida tudo antes e grava numa transação só.
 */

import { randomUUID } from 'crypto';
import {
  MANUAL_SOURCES,
  cleanMerchant,
  getOverview,
  mapBankCategory,
  money,
  todayFortaleza,
  updateSettings,
} from './finance.js';

export const PLUGGY_INSTITUTIONS = ['inter', 'c6', 'mp', 'nubank', 'santander'];
export const PLUGGY_ACCOUNT_TYPES = ['BANK', 'CREDIT'];
const MAX_TRANSACTIONS = 2000;
// Pagamento de fatura confirmado pelo João vale até o banco mostrar, no máximo 3 dias úteis (João, 14/11/2026).
export const MANUAL_PAYMENT_GRACE_BUSINESS_DAYS = 3;
const ISO_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const LAST4_RE = /^\d{4}$/;

function invalid(path, message) {
  const err = new Error(`${path}: ${message}`);
  err.status = 400;
  return err;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value, path, { nullable = false } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw invalid(path, 'número obrigatório');
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(path, 'precisa ser número finito');
  return value;
}

function ymd(value, path, { nullable = false } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw invalid(path, 'data obrigatória');
  }
  if (typeof value !== 'string' || !YMD_RE.test(value)) throw invalid(path, 'use YYYY-MM-DD');
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw invalid(path, 'data inexistente');
  }
  return value;
}

function isoTime(value, path) {
  if (typeof value !== 'string' || !ISO_TIME_RE.test(value) || !Number.isFinite(Date.parse(value))) {
    throw invalid(path, 'use data e hora ISO 8601');
  }
  return new Date(value).toISOString();
}

function shortText(value, path, { max = 60, nullable = true } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw invalid(path, 'texto obrigatório');
  }
  if (typeof value !== 'string' || value.length > max) throw invalid(path, `texto de até ${max} caracteres`);
  if (!nullable && !value.trim()) throw invalid(path, 'texto obrigatório');
  return value;
}

function parseBank(bank, path) {
  if (bank === null || bank === undefined) return null;
  if (!isPlainObject(bank)) throw invalid(path, 'objeto ou null');
  const reservedRaw = bank.reserved ?? [];
  if (!Array.isArray(reservedRaw)) throw invalid(`${path}.reserved`, 'lista');
  const reserved = reservedRaw.map((item, i) => {
    if (!isPlainObject(item)) throw invalid(`${path}.reserved[${i}]`, 'objeto');
    return {
      name: shortText(item.name, `${path}.reserved[${i}].name`, { max: 120 }) || '',
      amount: finite(item.amount, `${path}.reserved[${i}].amount`),
    };
  });
  return { balance: finite(bank.balance, `${path}.balance`), reserved };
}

function parseBill(bill, path) {
  if (bill === null || bill === undefined) return null;
  if (!isPlainObject(bill)) throw invalid(path, 'objeto ou null');
  const paymentsN = bill.payments_n ?? null;
  if (paymentsN !== null && !(Number.isInteger(paymentsN) && paymentsN >= 0)) {
    throw invalid(`${path}.payments_n`, 'inteiro >= 0');
  }
  return {
    due_date: ymd(bill.due_date, `${path}.due_date`),
    closing_date: ymd(bill.closing_date, `${path}.closing_date`, { nullable: true }),
    total: finite(bill.total, `${path}.total`),
    minimum: finite(bill.minimum, `${path}.minimum`, { nullable: true }) ?? 0,
    paid: finite(bill.paid, `${path}.paid`, { nullable: true }) ?? 0,
    payments_n: paymentsN,
  };
}

function parseCard(card, path) {
  if (card === null || card === undefined) return null;
  if (!isPlainObject(card)) throw invalid(path, 'objeto ou null');
  const last4 = card.last4 ?? null;
  if (last4 !== null && (typeof last4 !== 'string' || !LAST4_RE.test(last4))) {
    throw invalid(`${path}.last4`, '4 dígitos');
  }
  return {
    last4,
    brand: shortText(card.brand, `${path}.brand`, { max: 40 }),
    used: finite(card.used, `${path}.used`, { nullable: true }),
    limit: finite(card.limit, `${path}.limit`, { nullable: true }),
    available: finite(card.available, `${path}.available`, { nullable: true }),
    bill: parseBill(card.bill, `${path}.bill`),
  };
}

/** Valida o corpo inteiro; qualquer erro vira 400 antes de gravar qualquer coisa. */
export function parsePluggyPayload(body) {
  if (!isPlainObject(body)) throw invalid('body', 'objeto JSON');
  if (body.source !== 'pluggy') throw invalid('source', 'precisa ser "pluggy"');
  const fetchedAt = body.fetched_at == null ? null : isoTime(body.fetched_at, 'fetched_at');
  if (!Array.isArray(body.institutions)) throw invalid('institutions', 'lista');
  if (body.institutions.length > 20) throw invalid('institutions', 'no máximo 20');
  const seen = new Set();
  const institutions = body.institutions.map((raw, i) => {
    const path = `institutions[${i}]`;
    if (!isPlainObject(raw)) throw invalid(path, 'objeto');
    if (!PLUGGY_INSTITUTIONS.includes(raw.institution)) {
      throw invalid(`${path}.institution`, `use ${PLUGGY_INSTITUTIONS.join(', ')}`);
    }
    if (seen.has(raw.institution)) throw invalid(`${path}.institution`, 'repetida');
    seen.add(raw.institution);
    return {
      institution: raw.institution,
      updated_at: isoTime(raw.updated_at, `${path}.updated_at`),
      status: shortText(raw.status, `${path}.status`, { max: 40, nullable: false }),
      bank: parseBank(raw.bank, `${path}.bank`),
      card: parseCard(raw.card, `${path}.card`),
    };
  });
  const pendingInstitutions = body.pending_institutions == null ? [] : body.pending_institutions;
  if (!Array.isArray(pendingInstitutions)) throw invalid('pending_institutions', 'lista');
  pendingInstitutions.forEach((inst, i) => {
    if (!PLUGGY_INSTITUTIONS.includes(inst)) throw invalid(`pending_institutions[${i}]`, `use ${PLUGGY_INSTITUTIONS.join(', ')}`);
  });
  return {
    fetched_at: fetchedAt,
    institutions,
    transactions: parseTransactions(body.transactions),
    pending_transactions: parseTransactions(body.pending_transactions, 'pending_transactions'),
    pending_institutions: [...new Set(pendingInstitutions)],
  };
}

/**
 * transactions (opcional): [{ external_id, institution, account_type: BANK|CREDIT, date: YYYY-MM-DD,
 *   amount (negativo = saída), description, category }]
 */
function parseTransactions(list, label = 'transactions') {
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) throw invalid(label, 'lista');
  if (list.length > MAX_TRANSACTIONS) throw invalid(label, `no máximo ${MAX_TRANSACTIONS}`);
  const seen = new Set();
  return list.map((raw, i) => {
    const path = `${label}[${i}]`;
    if (!isPlainObject(raw)) throw invalid(path, 'objeto');
    const externalId = shortText(raw.external_id, `${path}.external_id`, { max: 120, nullable: false }).trim();
    if (seen.has(externalId)) throw invalid(`${path}.external_id`, 'repetido');
    seen.add(externalId);
    if (!PLUGGY_INSTITUTIONS.includes(raw.institution)) {
      throw invalid(`${path}.institution`, `use ${PLUGGY_INSTITUTIONS.join(', ')}`);
    }
    if (!PLUGGY_ACCOUNT_TYPES.includes(raw.account_type)) throw invalid(`${path}.account_type`, 'use BANK ou CREDIT');
    const amount = finite(raw.amount, `${path}.amount`);
    if (amount === 0) throw invalid(`${path}.amount`, 'diferente de zero');
    return {
      external_id: externalId,
      institution: raw.institution,
      account_type: raw.account_type,
      date: ymd(raw.date, `${path}.date`),
      amount,
      description: shortText(raw.description, `${path}.description`, { max: 300 }) || '',
      category: shortText(raw.category, `${path}.category`, { max: 80 }),
    };
  });
}

/** Conta do dia a dia da instituição: não-crédito, ativa, operacional primeiro. */
function operationalAccount(db, institution) {
  return db.prepare(`
    SELECT * FROM finance_accounts
    WHERE institution = ? AND kind != 'credit' AND status = 'active'
    ORDER BY is_operational DESC, sort_order ASC, id ASC
    LIMIT 1
  `).get(institution) || null;
}

/** Conta de crédito com o mesmo final; senão a conta da instituição (ex.: pré-pago do Mercado Pago). */
function cardAccount(db, institution, last4, fallback) {
  if (last4) {
    const credit = db.prepare(`
      SELECT * FROM finance_accounts
      WHERE kind = 'credit' AND status = 'active' AND (mask = ? OR card_last4 = ?)
      ORDER BY (institution = ?) DESC, sort_order ASC, id ASC
      LIMIT 1
    `).get(last4, last4, institution);
    if (credit) return credit;
  }
  return fallback;
}

/** Hora do banco mais recente já gravada para a instituição (para não regredir com JSON atrasado). */
function storedBankTime(db, institution) {
  const card = db.prepare(
    'SELECT MAX(bank_updated_at) AS ts FROM finance_card_status WHERE institution = ?',
  ).get(institution);
  const balance = db.prepare(`
    SELECT MAX(b.created_at) AS ts
    FROM finance_balances b
    JOIN finance_accounts a ON a.id = b.account_id
    WHERE b.source = 'pluggy' AND a.institution = ?
  `).get(institution);
  return [card?.ts, balance?.ts].filter(Boolean).sort().at(-1) || null;
}

function upsertBalance(db, accountId, bank, bankUpdatedAt) {
  const asOf = todayFortaleza(new Date(bankUpdatedAt));
  const amount = money(bank.balance + bank.reserved.reduce((s, r) => s + r.amount, 0));
  const reservedNames = bank.reserved.filter((r) => r.amount).map((r) => r.name).filter(Boolean);
  const note = reservedNames.length ? `inclui reservas: ${reservedNames.join(', ')}` : '';
  const existing = db.prepare(`
    SELECT id FROM finance_balances
    WHERE account_id = ? AND as_of = ? AND amount_kind = 'available' AND source = 'pluggy'
  `).get(accountId, asOf);
  // created_at = hora real do banco: no desempate de latestBalance, o manual mais novo que ela vence
  if (existing) {
    db.prepare('UPDATE finance_balances SET amount = ?, note = ?, created_at = ? WHERE id = ?')
      .run(amount, note, bankUpdatedAt, existing.id);
  } else {
    db.prepare(`
      INSERT INTO finance_balances (id, account_id, as_of, amount, amount_kind, source, locked, note, created_at)
      VALUES (?, ?, ?, ?, 'available', 'pluggy', 0, ?, ?)
    `).run(randomUUID(), accountId, asOf, amount, note, bankUpdatedAt);
  }
  return amount;
}

function ymdToUtc(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Dias úteis (seg a sex) depois de `from` até `to`, inclusive `to`. Feriado não é descontado. */
export function businessDaysBetween(from, to) {
  let n = 0;
  for (let t = ymdToUtc(from) + 86400000; t <= ymdToUtc(to); t += 86400000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}

/**
 * Quanto do que o João confirmou ter pago (finance_payments, via /debts/:id/pay) o banco ainda não mostra.
 * Conta pagamentos desde o fechamento da fatura, feitos há no máximo 3 dias úteis.
 * Se o banco já mostra pelo menos esse valor como pago, o banco vence e o ajuste some.
 */
export function pendingManualCardPayment(db, accountIds, bill, today) {
  if (!bill || !accountIds.length || !today) return 0;
  const marks = accountIds.map(() => '?').join(', ');
  const debts = db.prepare(`SELECT id FROM finance_debts WHERE kind = 'card' AND account_id IN (${marks})`).all(...accountIds);
  if (!debts.length) return 0;
  const since = bill.closing_date || (bill.due_date ? new Date(ymdToUtc(bill.due_date) - 40 * 86400000).toISOString().slice(0, 10) : null);
  if (!since) return 0;
  const rows = db.prepare(`
    SELECT amount, paid_on FROM finance_payments
    WHERE debt_id IN (${debts.map(() => '?').join(', ')}) AND paid_on >= ? AND paid_on <= ?
  `).all(...debts.map((d) => d.id), since, today);
  const manual = money(rows
    .filter((r) => businessDaysBetween(r.paid_on, today) <= MANUAL_PAYMENT_GRACE_BUSINESS_DAYS)
    .reduce((s, r) => s + Number(r.amount || 0), 0));
  if (manual <= 0.009) return 0;
  if (Number(bill.paid || 0) + 0.01 >= manual) return 0;
  return money(Math.min(manual, Math.max(0, Number(bill.total || 0) - Number(bill.paid || 0))));
}

function upsertCardStatus(db, accountId, institution, card, bankUpdatedAt, now, manualPaid = 0) {
  const bill = card.bill;
  const remaining = bill ? money(Math.max(0, bill.total - bill.paid)) : null;
  db.prepare(`
    INSERT INTO finance_card_status
      (account_id, institution, last4, brand, used, limit_total, limit_available,
       bill_total, bill_minimum, bill_paid, bill_remaining, bill_due, bill_closing,
       bank_updated_at, updated_at, source, bill_paid_manual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pluggy', ?)
    ON CONFLICT(account_id) DO UPDATE SET
      institution = excluded.institution,
      last4 = excluded.last4,
      brand = excluded.brand,
      used = excluded.used,
      limit_total = excluded.limit_total,
      limit_available = excluded.limit_available,
      bill_total = excluded.bill_total,
      bill_minimum = excluded.bill_minimum,
      bill_paid = excluded.bill_paid,
      bill_remaining = excluded.bill_remaining,
      bill_due = excluded.bill_due,
      bill_closing = excluded.bill_closing,
      bank_updated_at = excluded.bank_updated_at,
      updated_at = excluded.updated_at,
      source = excluded.source,
      bill_paid_manual = excluded.bill_paid_manual
  `).run(
    accountId,
    institution,
    card.last4,
    card.brand,
    card.used == null ? null : money(card.used),
    card.limit == null ? null : money(card.limit),
    card.available == null ? null : money(card.available),
    bill ? money(bill.total) : null,
    bill ? money(bill.minimum) : null,
    bill ? money(bill.paid) : null,
    remaining,
    bill?.due_date || null,
    bill?.closing_date || null,
    bankUpdatedAt,
    now,
    money(manualPaid || 0),
  );
  return remaining;
}

/**
 * Só os campos da fatura; ignora locked porque o Pluggy é a fonte oficial do valor.
 * O `bill.paid` que chega aqui já inclui o pagamento confirmado pelo João que o banco ainda não mostra.
 */
function updateCardDebt(db, accountIds, bill, now) {
  let debt = null;
  for (const id of accountIds) {
    debt = db.prepare(`
      SELECT * FROM finance_debts
      WHERE kind = 'card' AND account_id = ?
      ORDER BY queue ASC, created_at ASC
      LIMIT 1
    `).get(id);
    if (debt) break;
  }
  if (!debt) return null;
  const remaining = money(Math.max(0, bill.total - bill.paid));
  db.prepare(`
    UPDATE finance_debts
    SET balance = ?, min_payment = ?, due_date = ?, status = ?, source = 'pluggy', updated_at = ?
    WHERE id = ?
  `).run(
    remaining,
    money(Math.max(0, bill.minimum - bill.paid)),
    bill.due_date,
    remaining <= 0.01 ? 'clean' : 'open',
    now,
    debt.id,
  );
  return debt.id;
}

function applyInstitution(db, item, now, today) {
  const op = operationalAccount(db, item.institution);
  const cardAcc = item.card ? cardAccount(db, item.institution, item.card.last4, op) : null;
  if (!op && !cardAcc) return { skipped: { institution: item.institution, status: item.status, reason: 'sem conta na Praxis' } };

  const stored = storedBankTime(db, item.institution);
  if (stored && item.updated_at < stored) {
    return { skipped: { institution: item.institution, status: item.status, reason: 'dados mais antigos que os gravados' } };
  }

  const applied = {
    institution: item.institution,
    account_id: op?.id || null,
    card_account_id: cardAcc?.id || null,
    balance: null,
    bill_remaining: null,
    debt_id: null,
    manual_paid_pending: 0,
  };
  if (item.bank && op) {
    applied.balance = upsertBalance(db, op.id, item.bank, item.updated_at);
  }
  if (item.card && cardAcc) {
    const ids = [...new Set([cardAcc.id, op?.id].filter(Boolean))];
    const manual = item.card.bill ? pendingManualCardPayment(db, ids, item.card.bill, today) : 0;
    const card = manual > 0
      ? { ...item.card, bill: { ...item.card.bill, paid: money(item.card.bill.paid + manual) } }
      : item.card;
    applied.manual_paid_pending = manual;
    applied.bill_remaining = upsertCardStatus(db, cardAcc.id, item.institution, card, item.updated_at, now, manual);
    if (card.bill) {
      applied.debt_id = updateCardDebt(db, ids, card.bill, now);
    }
  }
  return { applied };
}

/**
 * Conta do lançamento: para CREDIT, a conta do cartão daquela instituição; senão a conta do dia dela.
 * A conta do cartão é achada pelo estado do cartão (`finance_card_status`), porque o nome e a
 * `institution` dela costumam ser do produto (GOLD, platinum, BANDEIRADO), não do banco.
 */
function transactionAccount(db, tx) {
  const op = operationalAccount(db, tx.institution);
  if (tx.account_type !== 'CREDIT') return op;
  const byCard = db.prepare(`
    SELECT a.* FROM finance_card_status cs
    JOIN finance_accounts a ON a.id = cs.account_id
    WHERE cs.institution = ? AND a.status = 'active'
    ORDER BY a.sort_order ASC, a.id ASC
    LIMIT 1
  `).get(tx.institution);
  if (byCard) return byCard;
  return db.prepare(`
    SELECT * FROM finance_accounts
    WHERE kind = 'credit' AND status = 'active' AND institution = ?
    ORDER BY sort_order ASC, id ASC
    LIMIT 1
  `).get(tx.institution) || op;
}

/**
 * Gasto que o João lançou e o banco agora confirmou: mesmo valor, até 3 dias de diferença,
 * mesma conta (ou lançado sem conta). O manual sai das somas; a categoria e o nome dele ficam na linha do banco.
 */
function matchManual(db, bankTx, altAccountId = null) {
  if (bankTx.amount >= 0) return null;
  const placeholders = MANUAL_SOURCES.map(() => '?').join(', ');
  return db.prepare(`
    SELECT * FROM finance_transactions
    WHERE source IN (${placeholders}) AND direction = 'outflow' AND matched_tx_id IS NULL
      AND (external_id IS NULL OR external_id = '')
      AND ABS(ABS(amount) - ?) < 0.005
      AND posted_on >= date(?, '-3 day') AND posted_on <= date(?, '+3 day')
      AND (account_id IS NULL OR account_id = ? OR account_id = ?)
    ORDER BY ABS(julianday(posted_on) - julianday(?)) ASC, created_at ASC
    LIMIT 1
  `).get(...MANUAL_SOURCES, Math.abs(bankTx.amount), bankTx.posted_on, bankTx.posted_on, bankTx.account_id, altAccountId ?? bankTx.account_id, bankTx.posted_on) || null;
}

function applyTransactions(db, list) {
  const summary = { received: list.length, inserted: 0, duplicates: 0, matched: 0, relinked: 0, skipped: [] };
  const exists = db.prepare('SELECT id, account_id, source FROM finance_transactions WHERE external_id = ?');
  const relink = db.prepare('UPDATE finance_transactions SET account_id = ? WHERE id = ?');
  const insert = db.prepare(`
    INSERT INTO finance_transactions
      (id, external_id, account_id, posted_on, amount, direction, raw_description,
       merchant, category, source, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pluggy', ?, ?)
  `);
  for (const tx of list) {
    const found = exists.get(tx.external_id);
    if (found) {
      summary.duplicates += 1;
      // lançamento do banco gravado na conta errada (ex.: compra de cartão na corrente): só troca a conta
      const right = transactionAccount(db, tx);
      if (found.source === 'pluggy' && right && found.account_id !== right.id) {
        relink.run(right.id, found.id);
        summary.relinked += 1;
      }
      continue;
    }
    const account = transactionAccount(db, tx);
    if (!account) {
      summary.skipped.push({ external_id: tx.external_id, reason: 'sem conta na Praxis' });
      continue;
    }
    const row = {
      id: randomUUID(),
      account_id: account.id,
      posted_on: tx.date,
      amount: money(tx.amount),
      category: mapBankCategory(tx.category, tx.description, tx.amount, tx.account_type),
      merchant: cleanMerchant(tx.description),
      note: '',
    };
    // compra de cartão: o João pode ter lançado o gasto na corrente do mesmo banco
    const alt = tx.account_type === 'CREDIT' ? operationalAccount(db, tx.institution)?.id ?? null : null;
    const manual = matchManual(db, row, alt);
    if (manual) {
      if (manual.category && manual.category !== 'Outros') row.category = manual.category;
      if (manual.merchant) row.merchant = manual.merchant;
      row.note = manual.note || '';
    }
    insert.run(
      row.id,
      tx.external_id,
      row.account_id,
      row.posted_on,
      row.amount,
      row.amount < 0 ? 'outflow' : 'inflow',
      tx.description,
      row.merchant,
      row.category,
      row.note,
      new Date().toISOString(),
    );
    summary.inserted += 1;
    if (manual) {
      db.prepare('UPDATE finance_transactions SET matched_tx_id = ? WHERE id = ?').run(row.id, manual.id);
      summary.matched += 1;
    }
  }
  return summary;
}

/**
 * Compras pendentes do cartão. Para cada banco lido por completo (`pending_institutions`) e atualizado,
 * a lista daquele banco é trocada inteira. Uma pendente não entra se a versão confirmada já existe:
 * mesmo id, ou mesma conta e mesmo valor com data de -3 a +10 dias (o banco pode trocar o id ao confirmar).
 * Banco que não veio completo fica com a lista anterior (com o `seen_at` antigo).
 */
function applyPending(db, payload, refreshed, now) {
  const summary = { stored: 0, already_posted: 0, institutions: [] };
  const targets = payload.pending_institutions.filter((inst) => refreshed.has(inst));
  if (!targets.length) return summary;
  const clear = db.prepare('DELETE FROM finance_pending_transactions WHERE institution = ?');
  const byId = db.prepare('SELECT id FROM finance_transactions WHERE external_id = ?');
  const posted = db.prepare(`
    SELECT id FROM finance_transactions
    WHERE source = 'pluggy' AND account_id = ? AND ABS(amount - ?) < 0.005
      AND posted_on >= date(?, '-3 day') AND posted_on <= date(?, '+10 day')
    ORDER BY ABS(julianday(posted_on) - julianday(?)) ASC
  `);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO finance_pending_transactions
      (external_id, institution, account_id, posted_on, amount, raw_description, merchant, category, seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const used = new Set();
  for (const inst of targets) {
    clear.run(inst);
    summary.institutions.push(inst);
    for (const tx of payload.pending_transactions.filter((t) => t.institution === inst)) {
      if (byId.get(tx.external_id)) {
        summary.already_posted += 1;
        continue;
      }
      const account = transactionAccount(db, tx);
      const amount = money(tx.amount);
      const twin = account
        ? posted.all(account.id, amount, tx.date, tx.date, tx.date).find((r) => !used.has(r.id))
        : null;
      if (twin) {
        used.add(twin.id);
        summary.already_posted += 1;
        continue;
      }
      insert.run(
        tx.external_id,
        inst,
        account?.id ?? null,
        tx.date,
        amount,
        tx.description,
        cleanMerchant(tx.description),
        mapBankCategory(tx.category, tx.description, tx.amount, tx.account_type),
        now,
      );
      summary.stored += 1;
    }
  }
  return summary;
}

/** POST /api/finance/ingest/pluggy — idempotente; status != UPDATED só entra no log. */
export function ingestPluggy(db, body, { today } = {}) {
  const payload = parsePluggyPayload(body);
  const now = new Date().toISOString();
  const day = today || todayFortaleza();
  const applied = [];
  const skipped = [];
  let transactions = null;
  let pending = null;

  db.transaction(() => {
    for (const item of payload.institutions) {
      if (item.status !== 'UPDATED') {
        skipped.push({ institution: item.institution, status: item.status, reason: 'status do banco' });
        continue;
      }
      const result = applyInstitution(db, item, now, day);
      if (result.applied) applied.push(result.applied);
      else skipped.push(result.skipped);
    }
    if (applied.some((a) => a.balance !== null)) {
      // dado vivo do banco: deixa de ser "foto"
      updateSettings(db, { snapshot_label: '' });
    }
    transactions = applyTransactions(db, payload.transactions);
    const refreshed = new Set(payload.institutions.filter((i) => i.status === 'UPDATED').map((i) => i.institution));
    pending = applyPending(db, payload, refreshed, now);
    db.prepare(`
      INSERT INTO finance_sync_log (id, started_at, finished_at, ok, accounts_n, tx_n, error, actor)
      VALUES (?, ?, ?, 1, ?, ?, ?, 'midas')
    `).run(
      randomUUID(),
      now,
      now,
      applied.length,
      transactions.inserted,
      skipped.map((s) => `${s.institution}: ${s.status === 'UPDATED' ? s.reason : s.status}`).join('; '),
    );
  })();

  const overview = getOverview(db, { today });
  return {
    ok: true,
    applied,
    skipped,
    transactions,
    pending,
    overview_snapshot: {
      caixa: overview.caixa,
      livre: overview.livre,
      safe_to_spend: overview.safe_to_spend,
      committed_until_salary: overview.committed_until_salary,
      next_salary_date: overview.next_salary_date,
      bills_due_7d: overview.bills_due_7d,
    },
  };
}
