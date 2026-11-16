/**
 * Conferência de totais sobre a camada assíncrona: a mesma fotografia de `financeTotals`
 * (lib/financeReconcile.js; oráculo em test-support/oracles/financeReconcile.bcbadad.js), em centavos
 * inteiros, com o mesmo `hash`. Serve para provar que dinheiro não mudou entre motores. Só leitura.
 * ceiling: lê todos os lançamentos (uma vez) — é ferramenta de conferência, não rota de tela.
 */
import { createHash } from 'node:crypto';
import { compareSqlite } from '../../storage/sqliteOrder.js';

/** `CAST(ROUND(x * 100) AS INTEGER)` do SQLite: arredonda para longe do zero; nulo continua nulo. */
function cents(value) {
  if (value === null || value === undefined) return null;
  const scaled = Number(value) * 100;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}
const sumOf = (rows, pick = (r) => r.cents) => rows.reduce((s, r) => s + Number(pick(r) || 0), 0);
const byColumns = (...columns) => (a, b) => { for (const column of columns) { const result = compareSqlite(a[column], b[column]); if (result) return result; } return 0; };
const substr7 = (text) => Array.from(String(text)).slice(0, 7).join('');

export function createFinanceReconcileService({ storage }) {
  if (!storage?.financeTransactions || typeof storage.transaction !== 'function') throw new TypeError('finance reconcile service requires storage');

  async function financeTotals() {
    const all = await storage.financeTransactions.between({ from: null, to: null });
    const groups = new Map();
    for (const row of all.filter((tx) => tx.matched_tx_id === null)) {
      const key = JSON.stringify([row.account_id ?? '', substr7(row.posted_on), row.category ?? '', row.direction, row.source]);
      const group = groups.get(key) ?? { account_id: row.account_id ?? '', month: substr7(row.posted_on), category: row.category ?? '', direction: row.direction, source: row.source, n: 0, cents: 0 };
      group.n += 1;
      group.cents += cents(row.amount);
      groups.set(key, group);
    }
    const transactions = [...groups.values()].sort(byColumns('account_id', 'month', 'category', 'direction', 'source'));
    const matchedRows = all.filter((tx) => tx.matched_tx_id !== null);
    const matched = { n: matchedRows.length, cents: matchedRows.reduce((s, tx) => s + cents(tx.amount), 0) };

    const paymentGroups = new Map();
    for (const row of await storage.financePayments.list({})) {
      const group = paymentGroups.get(row.debt_id) ?? { debt_id: row.debt_id, n: 0, cents: 0 };
      group.n += 1;
      group.cents += cents(row.amount);
      paymentGroups.set(row.debt_id, group);
    }
    const payments = [...paymentGroups.values()].sort(byColumns('debt_id'));
    const debts = (await storage.financeDebts.list({ status: null }))
      .map((d) => ({ id: d.id, status: d.status, cents: cents(d.balance) })).sort(byColumns('id'));

    // último saldo de cada conta e tipo: o primeiro na ordem `as_of DESC, created_at DESC`
    const latest = new Map();
    for (const b of await storage.financeBalances.list({ accountId: null, limit: null })) {
      const key = JSON.stringify([b.account_id, b.amount_kind]);
      if (!latest.has(key)) latest.set(key, { account_id: b.account_id, amount_kind: b.amount_kind, source: b.source, as_of: b.as_of, cents: cents(b.amount) });
    }
    const balances = [...latest.values()].sort(byColumns('account_id', 'amount_kind'));

    const statusGroups = new Map();
    for (const account of await storage.financeAccounts.list({ status: null, entity: null })) {
      const group = statusGroups.get(account.status) ?? { status: account.status, n: 0 };
      group.n += 1;
      statusGroups.set(account.status, group);
    }
    const accounts = [...statusGroups.values()].sort(byColumns('status'));

    const body = {
      transactions,
      matched,
      payments,
      debts,
      balances,
      accounts,
      summary: {
        transactions_n: sumOf(transactions, (r) => r.n),
        outflow_cents: sumOf(transactions.filter((r) => r.direction === 'outflow')),
        inflow_cents: sumOf(transactions.filter((r) => r.direction === 'inflow')),
        payments_n: sumOf(payments, (r) => r.n),
        payments_cents: sumOf(payments),
        debts_open_cents: sumOf(debts.filter((d) => d.status !== 'clean')),
        accounts_n: sumOf(accounts, (r) => r.n),
      },
    };
    return { ...body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
  }
  return Object.freeze({ financeTotals });
}
