import { assertUserId } from '../../lib/tenantDb.js';
import { StorageError } from '../contract.js';
import { sqliteTasks } from './tasks.js';
import { sqliteWeeklyReviews } from './weeklyReviews.js';
import { sqlitePurchases } from './purchases.js';
import { EXTRA_DOMAINS, checkDomains } from '../domains/index.js';

const BUILT_IN = Object.freeze({ tasks: sqliteTasks, weeklyReviews: sqliteWeeklyReviews, purchases: sqlitePurchases });

/**
 * Opera as tabelas existentes, sem esquema, semente ou conexão implícitos.
 * open(owner) devolve a conexão DEDICADA da camada nova para um dono autorizado. Tudo nessa conexão
 * passa por esta fila, inclusive leitura, para ninguém enxergar escrita ainda não confirmada.
 */
export function createSqliteDriver({ open, domains = EXTRA_DOMAINS }) {
  if (typeof open !== 'function') throw new TypeError('open(owner) required');
  const DOMAINS = { ...BUILT_IN, ...Object.fromEntries(checkDomains(domains).map((domain) => [domain.name, domain.sqlite])) };
  const ownership = new WeakMap(), queues = new WeakMap();
  function dbFor(owner) {
    assertUserId(owner);
    const db = open(owner);
    if (!db || typeof db.prepare !== 'function') throw new TypeError('invalid SQLite connection');
    const previous = ownership.get(db);
    if (previous && previous !== owner) throw new StorageError('sqlite_owner_connection_reused');
    ownership.set(db, owner);
    return db;
  }
  function queued(db, callback) {
    const pending = (queues.get(db) || Promise.resolve()).then(callback);
    queues.set(db, pending.catch(() => {}));
    return pending;
  }
  const targets = (db) => Object.fromEntries(Object.entries(DOMAINS).map(([name, make]) => [name, make(db)]));
  const driver = {
    kind: 'sqlite',
    async transaction(owner, callback) {
      const db = dbFor(owner);
      return queued(db, async () => {
        if (db.inTransaction) throw new StorageError('sqlite_connection_already_in_transaction');
        db.exec('BEGIN IMMEDIATE');
        try { const value = await callback(targets(db)); db.exec('COMMIT'); return value; }
        catch (error) { if (db.inTransaction) db.exec('ROLLBACK'); throw error; }
      });
    },
  };
  for (const [name, make] of Object.entries(DOMAINS)) {
    driver[name] = (owner) => {
      const db = dbFor(owner), target = make(db);
      return Object.fromEntries(Object.keys(target).map((method) => [method, (...args) => queued(db, () => target[method](...args))]));
    };
  }
  return driver;
}
