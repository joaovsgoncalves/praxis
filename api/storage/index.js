import { AsyncLocalStorage } from 'node:async_hooks';
import { assertUserId } from '../lib/tenantDb.js';
import { StorageError, mapStorageError, newTask, recordId, taskPatch, taskQuery } from './contract.js';

/**
 * Async storage boundary. currentOwner must come from server-authenticated scope.
 * No userId is accepted in methods or task payloads. Not wired to server.js yet.
 */
export function createStorage({ driver, currentOwner, now = () => new Date() }) {
  if (!driver || typeof driver.transaction !== 'function' || typeof currentOwner !== 'function') throw new TypeError('storage requires driver and verified currentOwner');
  const transactionScope = new AsyncLocalStorage();
  const owner = () => assertUserId(currentOwner());

  function repository(target, beforeRead, beforeWrite, onError = () => {}) {
    const call = async (guard, fn) => {
      try { guard(); return await fn(); } catch (error) { const mapped=mapStorageError(error); onError(mapped); throw mapped; }
    };
    return Object.freeze({
      get: async id => call(beforeRead, () => target.get(recordId(id))),
      list: async query => call(beforeRead, () => target.list(taskQuery(query))),
      create: async input => call(beforeWrite, () => target.create(newTask(input, now))),
      patch: async (id, fields) => call(beforeWrite, () => target.patch(recordId(id), taskPatch(fields))),
      remove: async id => call(beforeWrite, () => target.remove(recordId(id))),
    });
  }

  // Select scope at each call, not at module initialization or repository capture.
  const rootTarget = Object.fromEntries(['get','list','create','patch','remove'].map(method => [method,
    (...args) => driver.tasks(owner())[method](...args),
  ]));
  function rootGuard() {
    owner();
    if (transactionScope.getStore()) throw new StorageError('transaction_facade_required');
  }
  const tasks = repository(rootTarget, rootGuard, rootGuard);

  async function transaction(callback) {
    if (transactionScope.getStore()) throw new StorageError('nested_transaction');
    const id = owner();
    if (typeof callback !== 'function') throw new TypeError('transaction callback required');
    try {
      return await driver.transaction(id, async target => {
        let open = true, wrote = false, failed = null;
        const guard = () => {
          if (!open) throw new StorageError('transaction_closed');
          if (owner() !== id) throw new StorageError('transaction_owner_mismatch');
        };
        const tx = Object.freeze({ tasks: repository(target,
          () => { guard(); if (wrote) throw new StorageError('transaction_read_after_write'); },
          () => { guard(); wrote = true; }, error => { failed ??= error; }),
        });
        // Fresh lifetime for each Firestore transaction retry. Caller must keep external effects out.
        return transactionScope.run({ owner:id }, async () => {
          try { const result=await callback(tx); if(failed)throw failed; return result; } finally { open = false; }
        });
      });
    } catch (error) { throw mapStorageError(error); }
  }
  return Object.freeze({ tasks, transaction });
}
