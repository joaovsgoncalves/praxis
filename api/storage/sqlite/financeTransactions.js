import { StorageError } from '../contract.js';
import { sqliteFinanceTable } from './financeTable.js';
import { FINANCE_GENERIC_TABLES } from './financeTables.js';

const DEF = FINANCE_GENERIC_TABLES.financeTransactions;

/** Texto exato ou null (o serviço já ligou os parâmetros como o driver do SQLite). */
const textOrNull = (value) => {
  if (value !== null && typeof value !== 'string') throw new StorageError('invalid_transaction_query');
  return value;
};

/**
 * Consulta do extrato (`listTransactions` da rota antiga): período fechado, fora o lançamento manual já
 * confirmado pelo banco (`matched_tx_id`), conta/categoria por igualdade, busca `q` (já como `%q%`) em
 * `merchant` ou `raw_description` e recorte PF/PJ pela conta. `limit` null = sem limite.
 */
export function transactionRangeQuery(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StorageError('invalid_transaction_query');
  const allowed = ['from', 'to', 'accountId', 'category', 'like', 'entity', 'limit'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new StorageError('invalid_transaction_query');
  const { from, to, entity, limit } = input;
  if (typeof from !== 'string' || typeof to !== 'string' || !['all', 'pf', 'pj'].includes(entity)) throw new StorageError('invalid_transaction_query');
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) throw new StorageError('invalid_transaction_query');
  return { from, to, accountId: textOrNull(input.accountId ?? null), category: textOrNull(input.category ?? null), like: textOrNull(input.like ?? null), entity, limit };
}

/** Período aberto nas pontas (`null` = sem limite); só texto. */
export function transactionPeriodQuery(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StorageError('invalid_transaction_query');
  for (const key of Object.keys(input)) if (!['from', 'to'].includes(key)) throw new StorageError('invalid_transaction_query');
  return { from: textOrNull(input.from ?? null), to: textOrNull(input.to ?? null) };
}

/** Lançamentos: tabela genérica + extrato e busca pela baixa. Mesmas consultas da rota antiga. */
export function sqliteFinanceTransactions(db) {
  const base = sqliteFinanceTable(DEF)(db);
  return {
    ...base,
    /** Lançamentos com esses `external_id` (único quando não vazio): `SELECT ... WHERE external_id IN (...)`. */
    async byExternalIds(list) {
      const found = [];
      for (let i = 0; i < list.length; i += 500) {
        const chunk = list.slice(i, i + 500);
        found.push(...db.prepare(`SELECT * FROM finance_transactions WHERE external_id IN (${chunk.map(() => '?').join(', ')})`).all(...chunk));
      }
      return found;
    },
    async byPayment(paymentId) {
      return db.prepare('SELECT * FROM finance_transactions WHERE payment_id = ?').get(paymentId) ?? null;
    },
    /**
     * Todas as linhas do período (casadas incluídas), na ordem em que o SQLite varre o índice de `posted_on`
     * sem ORDER BY: data crescente e, no empate, ordem de inserção. As leituras compostas somam nessa ordem.
     */
    async between({ from, to }) {
      let sql = 'SELECT * FROM finance_transactions WHERE 1=1';
      const params = [];
      if (from !== null) { sql += ' AND posted_on >= ?'; params.push(from); }
      if (to !== null) { sql += ' AND posted_on <= ?'; params.push(to); }
      if (from !== null || to !== null) return db.prepare(sql).all(...params);
      return db.prepare('SELECT * FROM finance_transactions ORDER BY posted_on ASC, rowid ASC').all();
    },
    async range({ from, to, accountId, category, like, entity, limit }) {
      let sql = 'SELECT * FROM finance_transactions WHERE posted_on >= ? AND posted_on <= ? AND matched_tx_id IS NULL';
      const params = [from, to];
      if (accountId !== null) { sql += ' AND account_id = ?'; params.push(accountId); }
      if (category !== null) { sql += ' AND category = ?'; params.push(category); }
      if (like !== null) { sql += ' AND (merchant LIKE ? OR raw_description LIKE ?)'; params.push(like, like); }
      if (entity !== 'all') {
        sql += entity === 'pj'
          ? " AND account_id IN (SELECT id FROM finance_accounts WHERE entity = 'pj')"
          : " AND (account_id IS NULL OR account_id NOT IN (SELECT id FROM finance_accounts WHERE entity = 'pj'))";
      }
      sql += ' ORDER BY posted_on DESC, created_at DESC LIMIT ?';
      params.push(limit === null ? -1 : limit);
      return db.prepare(sql).all(...params);
    },
  };
}
