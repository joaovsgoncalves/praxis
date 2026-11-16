import { StorageError } from '../contract.js';
import { sqliteFinanceTable } from './financeTable.js';
import { FINANCE_GENERIC_TABLES } from './financeTables.js';

const DEF = FINANCE_GENERIC_TABLES.financeSyncLog;

/** Filtro do `latest`: `actor` texto ou null; `ok` 0, 1 ou null. */
export function syncLogQuery(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StorageError('invalid_sync_log_query');
  for (const key of Object.keys(input)) if (!['actor', 'ok'].includes(key)) throw new StorageError('invalid_sync_log_query');
  const actor = input.actor ?? null, ok = input.ok ?? null;
  if ((actor !== null && typeof actor !== 'string') || (ok !== null && ok !== 0 && ok !== 1)) throw new StorageError('invalid_sync_log_query');
  return { actor, ok };
}

/**
 * Log de sincronização: tabela genérica + `latest` = `ORDER BY started_at DESC LIMIT 1` da consulta antiga
 * (empate de `started_at`: a linha inserida primeiro, como o SQLite devolve).
 */
export function sqliteFinanceSyncLog(db) {
  const base = sqliteFinanceTable(DEF)(db);
  return {
    ...base,
    async latest({ actor, ok }) {
      let sql = 'SELECT * FROM finance_sync_log WHERE 1=1';
      const params = [];
      if (actor !== null) { sql += ' AND actor = ?'; params.push(actor); }
      if (ok !== null) { sql += ' AND ok = ?'; params.push(ok); }
      return db.prepare(`${sql} ORDER BY started_at DESC LIMIT 1`).get(...params) ?? null;
    },
  };
}
