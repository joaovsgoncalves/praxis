import { StorageError, PURCHASE_FIELDS } from '../contract.js';
import { documentId, originalId } from '../schema.mjs';
import { compareSqlite, maxSqlite } from '../sqliteOrder.js';

/**
 * `users/{uid}/purchaseItems/{locator}`.
 *
 * - `_row` guarda a ordem de inserção (o `rowid` do SQLite), que desempata a ordenação como lá.
 * - Toda criação lê e grava `users/{uid}/sequences/purchaseItems` no mesmo commit: criações
 *   concorrentes entram em conflito e uma repete, então `MAX(sort_order) + 1` não se repete.
 * - Filtro e ordem em memória com a comparação do SQLite (NULL < número < texto).
 *   ceiling: lê a lista inteira da conta a cada consulta; trocar por consulta indexada se crescer.
 */
export function firestorePurchases(userDoc, transaction, client) {
  const col = userDoc.collection('purchaseItems');
  const seqRef = userDoc.collection('sequences').doc('purchaseItems');
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  const created = new Set();
  const project = (doc) => {
    const row = doc.data();
    originalId(doc.id, row.id);
    return Object.fromEntries(PURCHASE_FIELDS.map((field) => [field, row[field] ?? null]));
  };
  async function all() {
    return (await read(col)).docs.map((doc) => ({ row: project(doc), seq: doc.data()._row }));
  }
  // `seen` é por tentativa: a repetição automática do Firestore começa com um conjunto vazio.
  async function createWith(tx, row, seen) {
    const ref = col.doc(documentId(row.id));
    if (seen.has(ref.path)) throw new StorageError('already_exists');
    const seq = await tx.get(seqRef);
    const next = (seq.exists ? seq.data().next : 0) + 1;
    seen.add(ref.path);
    tx.set(seqRef, { next });
    tx.create(ref, { ...row, _row: next });
    return structuredClone(row);
  }
  async function removeWith(tx, id) {
    const ref = col.doc(documentId(id)), snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.delete(ref);
    return true;
  }
  return {
    async get(id) {
      const snap = await read(col.doc(documentId(id)));
      return snap.exists ? project(snap) : null;
    },
    async list({ status, excludePaused, horizon }) {
      const rows = (await all()).filter(({ row }) => {
        if (status !== null && row.status !== status) return false;
        // `status != 'paused'` do SQLite também descarta NULL.
        if (status === null && excludePaused && (row.status === null || row.status === 'paused')) return false;
        return horizon === null || row.horizon === horizon;
      });
      rows.sort((a, b) => compareSqlite(a.row.sort_order, b.row.sort_order)
        || compareSqlite(b.row.created_date, a.row.created_date)
        || a.seq - b.seq);
      return rows.map(({ row }) => row);
    },
    async maxSort() { return maxSqlite((await all()).map(({ row }) => row.sort_order)); },
    async create(row) {
      if (transaction) return createWith(transaction, row, created);
      return client.runTransaction((tx) => createWith(tx, row, new Set()), { maxAttempts: 5 });
    },
    async patch(id, fields) {
      const ref = col.doc(documentId(id));
      if (transaction) transaction.update(ref, fields); else await ref.update(fields);
    },
    async remove(id) {
      if (transaction) return removeWith(transaction, id);
      return client.runTransaction((tx) => removeWith(tx, id), { maxAttempts: 5 });
    },
  };
}
