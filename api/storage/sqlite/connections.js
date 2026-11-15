import Database from 'better-sqlite3';
import { assertUserId } from '../../lib/tenantDb.js';
import { StorageError } from '../contract.js';

/**
 * Conexões DEDICADAS da camada nova, uma por dono, separadas da conexão da fachada legada.
 *
 * - Nunca cria arquivo nem esquema: `prepare(owner)` (a fachada legada) garante que o banco existe e
 *   está alinhado; aqui só se abre o arquivo que já existe (`fileMustExist`).
 * - Mesmo `timeout` padrão do better-sqlite3 da conexão legada (5 s esperando trava de outro processo).
 * - Convivência no mesmo processo é segura porque a transação assíncrona da camada nova só aguarda
 *   operações dela mesma (microtarefas): o código síncrono legado não roda no meio. Provado em
 *   `storage/sqlite/connections.test.mjs`. Nada de rede, timer ou arquivo dentro de transação.
 * - `closeAll()` fecha tudo e recusa abrir de novo: depois do desligamento, falha fechada.
 */
export function createSqliteConnections({ pathFor, prepare = () => {}, timeoutMs = 5000 }) {
  if (typeof pathFor !== 'function') throw new TypeError('pathFor(owner) required');
  const open = new Map();
  let closed = false;
  function get(owner) {
    if (closed) throw new StorageError('storage_closed');
    const id = assertUserId(owner);
    let db = open.get(id);
    if (!db) {
      prepare(id);
      db = new Database(pathFor(id), { fileMustExist: true, timeout: timeoutMs });
      open.set(id, db);
    }
    return db;
  }
  function closeAll() {
    closed = true;
    let count = 0;
    for (const db of open.values()) {
      // Fechar com transação aberta desfaz a transação no próprio SQLite.
      try { db.close(); count += 1; } catch { /* já fechada */ }
    }
    open.clear();
    return count;
  }
  return { get, closeAll, openOwners: () => [...open.keys()], isClosed: () => closed };
}
