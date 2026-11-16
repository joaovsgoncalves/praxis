import { AsyncLocalStorage } from 'node:async_hooks';
import { assertUserId } from '../lib/tenantDb.js';
import {
  StorageError, mapStorageError, recordId,
  newTask, taskPatch, taskQuery, taskGoalKey, taskIdList, fullTask, rowToken, taskSearchQuery, taskText, taskPositions,
  newReview, reviewPatch, reviewQuery, weekStart,
  newPurchase, purchasePatch, purchaseQuery,
} from './contract.js';
import { EXTRA_DOMAINS, checkDomains } from './domains/index.js';

/**
 * Métodos de cada domínio: tipo de acesso (read/write/readwrite) e normalização dos argumentos.
 * `readwrite` = o motor precisa ler antes de escrever (Firestore exige leituras antes das escritas),
 * então segue a regra das duas coisas nos dois motores.
 */
function domainSpecs(now, extra) {
  return {
    ...Object.fromEntries(extra.map((domain) => [domain.name, domain.spec(now)])),
    tasks: {
      get: ['read', (id) => [recordId(id)]],
      list: ['read', (query) => [taskQuery(query)]],
      // Firestore lê a sequência (ordem de inserção) antes de gravar: mesma regra nos dois motores.
      create: ['readwrite', (input) => [newTask(input, now)]],
      // Fase 3: ficha de ordem reservada por `nextRow()` (leitura) e linha completa na hora de gravar.
      nextRow: ['read', () => []],
      createAt: ['write', (row, token) => [fullTask(row), rowToken(token)]],
      patch: ['write', (id, fields) => [recordId(id), taskPatch(fields)]],
      remove: ['write', (id) => [recordId(id)]],
      // Usados pelas metas (fase 3): posição MAX + 1 e soltar os itens de uma meta excluída.
      maxSort: ['read', () => []],
      maxSortExcept: ['read', (id) => [recordId(id)]],
      idsByGoal: ['read', (goalId) => [taskGoalKey(goalId)]],
      clearGoal: ['write', (ids) => [taskIdList(ids)]],
      // Rotas de tarefas (fase 3, domínio 5): as consultas da rota antiga.
      search: ['read', (query) => [taskSearchQuery(query)]],
      all: ['read', () => []],
      operational: ['read', () => []],
      completedOn: ['read', (today) => [taskText(today)]],
      missedSince: ['read', (since) => [taskText(since)]],
      findOccurrence: ['read', (parentRef, date, exceptId) => [taskText(parentRef), taskText(date), taskText(exceptId)]],
      hasOpenUpcoming: ['read', (parentRef, today) => [taskText(parentRef), taskText(today)]],
      staleForRollover: ['read', (today) => [taskText(today)]],
      // `UPDATE tasks SET sort_order = <posição> WHERE id = <id>` para cada [id, posição]; id que não existe não faz nada.
      reorder: ['readwrite', (entries) => [taskPositions(entries)]],
    },
    weeklyReviews: {
      get: ['read', (id) => [recordId(id)]],
      getByWeek: ['read', (week) => [weekStart(week)]],
      list: ['read', (query) => [reviewQuery(query)]],
      create: ['write', (input) => [newReview(input, now)]],
      patch: ['write', (id, fields) => [recordId(id), reviewPatch(fields)]],
      remove: ['readwrite', (id) => [recordId(id)]],
    },
    purchases: {
      get: ['read', (id) => [recordId(id)]],
      list: ['read', (query) => [purchaseQuery(query)]],
      maxSort: ['read', () => []],
      // Firestore lê a sequência antes de gravar: mesma regra nos dois motores.
      create: ['readwrite', (input) => [newPurchase(input)]],
      patch: ['write', (id, fields) => [recordId(id), purchasePatch(fields)]],
      remove: ['readwrite', (id) => [recordId(id)]],
    },
  };
}

/**
 * Fronteira de persistência assíncrona. `currentOwner` vem do escopo verificado pelo servidor;
 * nenhum método ou payload escolhe o dono.
 */
export function createStorage({ driver, currentOwner, now = () => new Date(), domains = EXTRA_DOMAINS }) {
  if (!driver || typeof driver.transaction !== 'function' || typeof currentOwner !== 'function') throw new TypeError('storage requires driver and verified currentOwner');
  const specs = domainSpecs(now, checkDomains(domains));
  for (const name of Object.keys(specs)) if (typeof driver[name] !== 'function') throw new TypeError(`driver sem domínio ${name}`);
  const transactionScope = new AsyncLocalStorage();
  const owner = () => assertUserId(currentOwner());
  const inflight = new Set();
  let closing = false;

  function track(promise) {
    inflight.add(promise);
    promise.then(() => inflight.delete(promise), () => inflight.delete(promise));
    return promise;
  }

  function repository(spec, target, guards, onError = () => {}) {
    return Object.freeze(Object.fromEntries(Object.entries(spec).map(([method, [kind, normalize]]) => [method,
      async (...args) => {
        try {
          if (kind !== 'write') guards.read();
          if (kind !== 'read') guards.write();
          return await target[method](...normalize(...args));
        } catch (error) { const mapped = mapStorageError(error); onError(mapped); throw mapped; }
      },
    ])));
  }

  function rootGuard() {
    if (closing) throw new StorageError('storage_closed');
    owner();
    if (transactionScope.getStore()) throw new StorageError('transaction_facade_required');
  }
  const root = {};
  for (const [name, spec] of Object.entries(specs)) {
    // Escopo escolhido a cada chamada, nunca na criação do módulo ou do repositório.
    const target = Object.fromEntries(Object.keys(spec).map((method) => [method, (...args) => track(driver[name](owner())[method](...args))]));
    root[name] = repository(spec, target, { read: rootGuard, write: rootGuard });
  }

  async function transaction(callback) {
    if (closing) throw new StorageError('storage_closed');
    if (transactionScope.getStore()) throw new StorageError('nested_transaction');
    const id = owner();
    if (typeof callback !== 'function') throw new TypeError('transaction callback required');
    try {
      return await track(driver.transaction(id, async (targets) => {
        let open = true, wrote = false, failed = null;
        const guard = () => {
          if (!open) throw new StorageError('transaction_closed');
          if (owner() !== id) throw new StorageError('transaction_owner_mismatch');
        };
        const guards = {
          read: () => { guard(); if (wrote) throw new StorageError('transaction_read_after_write'); },
          write: () => { guard(); wrote = true; },
        };
        const tx = Object.freeze(Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name,
          repository(spec, targets[name], guards, (error) => { failed ??= error; })])));
        // Vida nova a cada nova tentativa do Firestore. Efeito externo não entra aqui.
        return transactionScope.run({ owner: id }, async () => {
          try { const result = await callback(tx); if (failed) throw failed; return result; } finally { open = false; }
        });
      }));
    } catch (error) { throw mapStorageError(error); }
  }

  /** Recusa chamadas novas e espera as que já começaram (desligamento gracioso). */
  async function close() {
    closing = true;
    while (inflight.size) await Promise.allSettled([...inflight]);
  }
  return Object.freeze({ ...root, transaction, close });
}
