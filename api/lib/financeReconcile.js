/**
 * Conferência de totais — fase 3 do PRD.
 *
 * Fotografa Finanças em centavos (inteiros): lançamentos por conta, mês e categoria, baixas por
 * dívida, saldo das dívidas e o último saldo de cada conta. Serve para provar que uma migração ou
 * um reenvio não mudou dinheiro nenhum: duas fotos iguais têm o mesmo `hash`.
 * Só leitura.
 */

import { createHash } from 'crypto';

export function toCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const CENTS = (column) => `CAST(ROUND(${column} * 100) AS INTEGER)`;

export function financeTotals(db) {
  const transactions = db.prepare(`
    SELECT
      COALESCE(account_id, '') AS account_id,
      substr(posted_on, 1, 7) AS month,
      COALESCE(category, '') AS category,
      direction,
      source,
      COUNT(*) AS n,
      SUM(${CENTS('amount')}) AS cents
    FROM finance_transactions
    WHERE matched_tx_id IS NULL
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1, 2, 3, 4, 5
  `).all();
  const matched = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(${CENTS('amount')}), 0) AS cents
    FROM finance_transactions WHERE matched_tx_id IS NOT NULL
  `).get();
  const payments = db.prepare(`
    SELECT debt_id, COUNT(*) AS n, SUM(${CENTS('amount')}) AS cents
    FROM finance_payments GROUP BY 1 ORDER BY 1
  `).all();
  const debts = db.prepare(`
    SELECT id, status, ${CENTS('balance')} AS cents FROM finance_debts ORDER BY id
  `).all();
  const balances = db.prepare(`
    SELECT b.account_id, b.amount_kind, b.source, b.as_of, ${CENTS('b.amount')} AS cents
    FROM finance_balances b
    WHERE b.id = (
      SELECT id FROM finance_balances x
      WHERE x.account_id = b.account_id AND x.amount_kind = b.amount_kind
      ORDER BY x.as_of DESC, x.created_at DESC LIMIT 1
    )
    ORDER BY 1, 2
  `).all();
  const accounts = db.prepare(`
    SELECT status, COUNT(*) AS n FROM finance_accounts GROUP BY 1 ORDER BY 1
  `).all();

  const sum = (rows, pick = (r) => r.cents) => rows.reduce((s, r) => s + Number(pick(r) || 0), 0);
  const body = {
    transactions,
    matched: { n: matched.n, cents: matched.cents },
    payments,
    debts,
    balances,
    accounts,
    summary: {
      transactions_n: sum(transactions, (r) => r.n),
      outflow_cents: sum(transactions.filter((r) => r.direction === 'outflow')),
      inflow_cents: sum(transactions.filter((r) => r.direction === 'inflow')),
      payments_n: sum(payments, (r) => r.n),
      payments_cents: sum(payments),
      debts_open_cents: sum(debts.filter((d) => d.status !== 'clean')),
      accounts_n: sum(accounts, (r) => r.n),
    },
  };
  return { ...body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

/** Diferenças entre duas fotos, em texto curto; lista vazia = dinheiro igual. */
export function diffTotals(before, after) {
  const out = [];
  const index = (rows, key) => new Map(rows.map((r) => [key(r), r]));
  const compare = (label, a, b, key, show) => {
    const A = index(a, key);
    const B = index(b, key);
    for (const k of new Set([...A.keys(), ...B.keys()])) {
      const x = A.get(k);
      const y = B.get(k);
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${label} ${k}: ${x ? show(x) : 'ausente'} -> ${y ? show(y) : 'ausente'}`);
    }
  };
  compare('lançamentos', before.transactions, after.transactions,
    (r) => [r.account_id, r.month, r.category, r.direction, r.source].join('|'), (r) => `${r.n}x ${r.cents}c`);
  compare('baixas', before.payments, after.payments, (r) => r.debt_id, (r) => `${r.n}x ${r.cents}c`);
  compare('dívida', before.debts, after.debts, (r) => r.id, (r) => `${r.status} ${r.cents}c`);
  compare('saldo', before.balances, after.balances,
    (r) => `${r.account_id}|${r.amount_kind}`, (r) => `${r.cents}c ${r.source} ${r.as_of}`);
  compare('contas', before.accounts, after.accounts, (r) => r.status, (r) => `${r.n}`);
  if (JSON.stringify(before.matched) !== JSON.stringify(after.matched)) {
    out.push(`casados: ${before.matched.n}x ${before.matched.cents}c -> ${after.matched.n}x ${after.matched.cents}c`);
  }
  return out;
}
