import { StorageError } from '../contract.js';
import { documentId, originalId, centsToMoney } from '../schema.mjs';
import { compareSqlite, maxSqlite } from '../sqliteOrder.js';
import { sqliteStoredText } from '../sqliteSemantics.js';
import { FINANCE_TABLES, columnNames, exactCents } from '../sqlite/financeTables.js';

/**
 * Configuração, contas e saldos no Firestore (`users/{uid}/financeSettings|financeAccounts|financeBalances`).
 *
 * - Dinheiro em centavos inteiros no mesmo campo; a leitura devolve o número do SQLite. Texto com
 *   substituto UTF-16 solto é gravado como o SQLite o devolve (`sqliteStoredText`).
 * - `_row` = ordem de inserção (o rowid), tirada de `users/{uid}/sequences/<coleção>`. Numa transação a
 *   sequência é lida por `reserve(n)` ANTES das escritas (o Firestore exige leituras antes das
 *   escritas) e gravada no primeiro `create`; criação sem reserva na transação é recusada.
 * - Filtro e ordem em memória com a comparação do SQLite (NULL < número < texto) e `_row` no empate.
 *   ceiling: lê a coleção (ou a conta) inteira por consulta; trocar por consulta indexada se crescer.
 */
function financeTable(userDoc, transaction, client, name) {
  const def = FINANCE_TABLES[name];
  const names = columnNames(def);
  const col = userDoc.collection(name);
  const seqRef = userDoc.collection('sequences').doc(name);
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  // Estado por tentativa: o driver monta repositórios novos a cada tentativa do Firestore.
  const created = new Set();
  let reservation = null;

  // Texto gravado como o SQLite o devolve (substituto UTF-16 solto = 3 U+FFFD).
  const toDoc = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    def.money.includes(key) && value !== null ? exactCents(value) : sqliteStoredText(value)]));
  const fromDoc = (key, value) => {
    if (value === undefined || value === null) return null;
    if (def.money.includes(key)) return centsToMoney(value);
    return value;
  };
  const project = (doc) => {
    const data = doc.data();
    originalId(doc.id, data.id);
    return Object.fromEntries(names.map((key) => [key, fromDoc(key, data[key])]));
  };
  async function all(query = col) {
    return (await read(query)).docs.map((doc) => ({ row: project(doc), seq: doc.data()._row ?? 0 }));
  }
  function createIn(tx, row, seen, slot) {
    const ref = col.doc(documentId(row.id));
    if (seen.has(ref.path)) throw new StorageError('already_exists');
    seen.add(ref.path);
    tx.create(ref, { ...toDoc(row), _row: slot });
    return structuredClone(row);
  }
  return {
    async reserve(count) {
      if (!transaction) return;
      if (reservation) throw new StorageError('sequence_already_reserved');
      const snap = await transaction.get(seqRef);
      reservation = { base: snap.exists ? snap.data().next : 0, count, used: 0 };
    },
    async get(id) {
      const snap = await read(col.doc(documentId(id)));
      return snap.exists ? project(snap) : null;
    },
    all,
    async create(row) {
      if (!transaction) {
        return client.runTransaction(async (tx) => {
          const snap = await tx.get(seqRef);
          const next = (snap.exists ? snap.data().next : 0) + 1;
          tx.set(seqRef, { next });
          return createIn(tx, row, new Set(), next);
        }, { maxAttempts: 5 });
      }
      if (!reservation || reservation.used >= reservation.count) throw new StorageError('sequence_not_reserved');
      if (reservation.used === 0) transaction.set(seqRef, { next: reservation.base + reservation.count });
      reservation.used += 1;
      return createIn(transaction, row, created, reservation.base + reservation.used);
    },
    async patch(id, fields) {
      const ref = col.doc(documentId(id));
      if (transaction) transaction.update(ref, toDoc(fields)); else await ref.update(toDoc(fields));
    },
  };
}

const sortRows = (rows, compare) => rows.sort((a, b) => compare(a.row, b.row) || a.seq - b.seq).map(({ row }) => row);

export function firestoreFinanceSettings(userDoc, transaction, client) {
  const t = financeTable(userDoc, transaction, client, 'financeSettings');
  const ref = userDoc.collection('financeSettings').doc(FINANCE_TABLES.financeSettings.singleton);
  const created = new Set();
  return {
    get: () => t.get(FINANCE_TABLES.financeSettings.singleton),
    async create(row) {
      const doc = Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
        FINANCE_TABLES.financeSettings.money.includes(key) && value !== null ? exactCents(value) : sqliteStoredText(value)]));
      if (!transaction) { await ref.create(doc); return structuredClone(row); }
      if (created.has(ref.path)) throw new StorageError('already_exists');
      created.add(ref.path);
      transaction.create(ref, doc);
      return structuredClone(row);
    },
    patch: (fields) => t.patch(FINANCE_TABLES.financeSettings.singleton, fields),
  };
}

export function firestoreFinanceAccounts(userDoc, transaction, client) {
  const t = financeTable(userDoc, transaction, client, 'financeAccounts');
  return {
    reserve: t.reserve,
    get: t.get,
    async list({ status, entity }) {
      const rows = (await t.all()).filter(({ row }) => (status === null || row.status === status) && (entity === null || row.entity === entity));
      return sortRows(rows, (a, b) => compareSqlite(a.sort_order, b.sort_order) || compareSqlite(a.name, b.name));
    },
    async maxSort() { return maxSqlite((await t.all()).map(({ row }) => row.sort_order)); },
    create: t.create,
    patch: t.patch,
  };
}

export function firestoreFinanceBalances(userDoc, transaction, client) {
  const t = financeTable(userDoc, transaction, client, 'financeBalances');
  const col = userDoc.collection('financeBalances');
  return {
    reserve: t.reserve,
    get: t.get,
    async list({ accountId, limit }) {
      const rows = await t.all(accountId === null ? col : col.where('account_id', '==', accountId));
      const sorted = sortRows(rows, (a, b) => compareSqlite(b.as_of, a.as_of) || compareSqlite(b.created_at, a.created_at));
      return limit === null ? sorted : sorted.slice(0, limit);
    },
    async bank() {
      const rows = await t.all(col.where('source', 'in', ['pierre', 'pluggy']));
      return rows.sort((a, b) => a.seq - b.seq).map(({ row }) => row);
    },
    create: t.create,
  };
}
