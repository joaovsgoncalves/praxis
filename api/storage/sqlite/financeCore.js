import { StorageError } from '../contract.js';
import { FINANCE_TABLES, columnNames } from './financeTables.js';

/**
 * Configuração, contas e saldos sobre as tabelas existentes, com as MESMAS consultas da rota antiga
 * (`SELECT *`, mesma ordem). `SELECT *` devolve as colunas na ordem do banco de cada pessoa.
 */
function insert(db, def, row) {
  const names = columnNames(def);
  db.prepare(`INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...names.map((name) => row[name]));
  return structuredClone(row);
}
/**
 * Mesma regra do Firestore: dentro de transação, criar exige `reserve(n)` antes (lá a sequência da
 * ordem de inserção é lida antes das escritas). Fora de transação não há reserva.
 */
function reservations(db) {
  let reservation = null;
  return {
    async reserve(count) {
      if (!db.inTransaction) return;
      if (reservation) throw new StorageError('sequence_already_reserved');
      reservation = { count, used: 0 };
    },
    take() {
      if (!db.inTransaction) return;
      if (!reservation || reservation.used >= reservation.count) throw new StorageError('sequence_not_reserved');
      reservation.used += 1;
    },
  };
}
function update(db, def, id, fields) {
  const keys = Object.keys(fields);
  const result = db.prepare(`UPDATE ${def.table} SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((key) => fields[key]), id);
  if (!result.changes) throw new StorageError('not_found');
}

export function sqliteFinanceSettings(db) {
  const def = FINANCE_TABLES.financeSettings;
  return {
    async get() { return db.prepare('SELECT * FROM finance_settings WHERE id = ?').get(def.singleton) ?? null; },
    async create(row) { return insert(db, def, row); },
    async patch(fields) { update(db, def, def.singleton, fields); },
  };
}

export function sqliteFinanceAccounts(db) {
  const def = FINANCE_TABLES.financeAccounts, slots = reservations(db);
  return {
    reserve: slots.reserve,
    async get(id) { return db.prepare('SELECT * FROM finance_accounts WHERE id = ?').get(id) ?? null; },
    async list({ status, entity }) {
      let sql = 'SELECT * FROM finance_accounts WHERE 1=1';
      const params = [];
      if (status !== null) { sql += ' AND status = ?'; params.push(status); }
      if (entity !== null) { sql += ' AND entity = ?'; params.push(entity); }
      return db.prepare(`${sql} ORDER BY sort_order ASC, name ASC`).all(...params);
    },
    async maxSort() { return db.prepare('SELECT MAX(sort_order) AS m FROM finance_accounts').get().m; },
    async create(row) { slots.take(); return insert(db, def, row); },
    async patch(id, fields) { update(db, def, id, fields); },
  };
}

export function sqliteFinanceBalances(db) {
  const def = FINANCE_TABLES.financeBalances, slots = reservations(db);
  return {
    reserve: slots.reserve,
    async get(id) { return db.prepare('SELECT * FROM finance_balances WHERE id = ?').get(id) ?? null; },
    /** `accountId` null = todas; `limit` null = sem limite. Ordem `as_of DESC, created_at DESC` (empate: rowid). */
    async list({ accountId, limit }) {
      let sql = 'SELECT * FROM finance_balances';
      const params = [];
      if (accountId !== null) { sql += ' WHERE account_id = ?'; params.push(accountId); }
      sql += ' ORDER BY as_of DESC, created_at DESC';
      if (limit !== null) { sql += ' LIMIT ?'; params.push(limit); }
      return db.prepare(sql).all(...params);
    },
    async create(row) { slots.take(); return insert(db, def, row); },
  };
}
