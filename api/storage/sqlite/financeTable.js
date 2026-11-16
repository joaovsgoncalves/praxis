import { StorageError } from '../contract.js';
import { columnNames, keyOf, orderSql, uniqueColumns } from './financeTables.js';

/**
 * Tabela genérica de finanças (domínio 2 em diante) sobre a tabela existente, com a consulta da rota
 * antiga: `SELECT *` (colunas na ordem do banco da pessoa), igualdade nos filtros e o mesmo ORDER BY.
 * Mesma regra do Firestore: criar dentro de transação exige `reserve(n)` antes.
 */
export function sqliteFinanceTable(def) {
  const key = keyOf(def), names = columnNames(def), order = orderSql(def);
  return (db) => {
    let reservation = null;
    return {
      async reserve(count) {
        if (!db.inTransaction) return;
        if (reservation) throw new StorageError('sequence_already_reserved');
        reservation = { count, used: 0 };
      },
      async get(value) { return db.prepare(`SELECT * FROM ${def.table} WHERE ${key} = ?`).get(value) ?? null; },
      async list(filters) {
        let sql = `SELECT * FROM ${def.table} WHERE 1=1`;
        const params = [];
        for (const column of def.filters) if (filters[column] !== null) { sql += ` AND ${column} = ?`; params.push(filters[column]); }
        if (order) sql += ` ORDER BY ${order}`;
        return db.prepare(sql).all(...params);
      },
      /** Linha que já tem esse valor numa coluna UNIQUE (só as colunas de `def.unique`). */
      async findUnique(column, value) {
        if (!(def.unique ?? []).some((rule) => rule.column === column)) throw new StorageError('invalid_unique_column');
        return db.prepare(`SELECT * FROM ${def.table} WHERE ${column} = ?`).get(value) ?? null;
      },
      /** Primeira coluna UNIQUE (na ordem de conferência do SQLite) ou chave que a linha violaria; null se nenhuma. */
      async clash(row) {
        for (const { column } of uniqueColumns(def, row)) {
          if (db.prepare(`SELECT 1 FROM ${def.table} WHERE ${column} = ?`).get(row[column])) return column;
        }
        return db.prepare(`SELECT 1 FROM ${def.table} WHERE ${key} = ?`).get(row[key]) ? key : null;
      },
      async create(row) {
        if (db.inTransaction) {
          if (!reservation || reservation.used >= reservation.count) throw new StorageError('sequence_not_reserved');
          reservation.used += 1;
        }
        db.prepare(`INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...names.map((name) => row[name]));
        return structuredClone(row);
      },
      /** `INSERT ... ON CONFLICT(chave) DO UPDATE` das colunas que não são a chave. */
      async upsert(row) {
        const rest = names.filter((name) => name !== key);
        db.prepare(`INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})
          ON CONFLICT(${key}) DO UPDATE SET ${rest.map((name) => `${name} = excluded.${name}`).join(', ')}`).run(...names.map((name) => row[name]));
      },
      async patch(value, fields) {
        const keys = Object.keys(fields);
        const result = db.prepare(`UPDATE ${def.table} SET ${keys.map((name) => `${name} = ?`).join(', ')} WHERE ${key} = ?`).run(...keys.map((name) => fields[name]), value);
        if (!result.changes) throw new StorageError('not_found');
      },
      async remove(value) { db.prepare(`DELETE FROM ${def.table} WHERE ${key} = ?`).run(value); },
    };
  };
}
