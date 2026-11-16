import { StorageError } from '../contract.js';
import { documentId, originalId } from '../schema.mjs';
import { compareSqlite } from '../sqliteOrder.js';

/**
 * Base das coleções de rotina da fase 3: `users/{uid}/<colecao>/{documentId(id)}`, documento = linha
 * SQLite com os mesmos nomes de coluna + `_row` (ordem de inserção, o `rowid` do SQLite).
 *
 * - Toda criação lê e grava `users/{uid}/sequences/<colecao>` no mesmo commit: `_row` cresce como o
 *   rowid e criações concorrentes entram em conflito (uma repete).
 * - Mesmo documento criado duas vezes no commit = `already_exists` (o Firestore daria INVALID_ARGUMENT).
 * - Leitura da coleção inteira; filtro e ordem em memória com a comparação do SQLite.
 *   ceiling: lê a coleção inteira da conta a cada consulta; trocar por consulta indexada se crescer.
 */
/**
 * `uniqueKey(row)`: texto da chave UNIQUE do SQLite (ex.: habit_logs(habit_id, date)) ou null. Com ela,
 * criar grava também a sentinela `users/{uid}/uniqueKeys/{chave}` no mesmo commit (ALREADY_EXISTS se
 * já existe), como em storage/firestore/weeklyReviews.js.
 */
export function phase3Rows(userDoc, transaction, client, collection, fields, { uniqueKey = null, keyField = 'id' } = {}) {
  const keys = userDoc.collection('uniqueKeys');
  const col = userDoc.collection(collection);
  const seqRef = userDoc.collection('sequences').doc(collection);
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  const created = new Set();
  const project = (doc) => {
    const row = doc.data();
    originalId(doc.id, row[keyField]);
    return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
  };
  // Dentro da transação as leituras vêm antes de qualquer escrita: a coleção inteira lida uma vez só.
  let snapshot = null;
  // `seen` é por tentativa: a repetição automática do Firestore começa com um conjunto vazio.
  async function createWith(tx, row, seen) {
    const ref = col.doc(documentId(row[keyField]));
    if (seen.has(ref.path)) throw new StorageError('already_exists');
    const seq = await tx.get(seqRef);
    const next = (seq.exists ? seq.data().next : 0) + 1;
    const key = uniqueKey ? uniqueKey(row) : null;
    const keyRef = key === null ? null : keys.doc(documentId(key));
    if (keyRef && seen.has(keyRef.path)) throw new StorageError('already_exists');
    seen.add(ref.path);
    if (keyRef) { seen.add(keyRef.path); tx.create(keyRef, { domain: collection, key, record_id: row[keyField] }); }
    tx.set(seqRef, { next });
    tx.create(ref, { ...row, _row: next });
    return structuredClone(row);
  }
  return {
    /**
     * [{ row, seq }] na ordem de inserção. Documento sem `_row` (dado anterior à sequência, ex.: tarefas
     * das fases 1-2) vale 0: vem antes dos numerados e empata por id (bytes UTF-8), sempre igual.
     */
    async all() {
      if (!snapshot || !transaction) snapshot = await read(col);
      return snapshot.docs.map((doc) => ({ row: project(doc), seq: doc.data()._row ?? 0 }))
        .sort((a, b) => (a.seq - b.seq) || compareSqlite(a.row[keyField], b.row[keyField]));
    },
    async get(id) {
      const snap = await read(col.doc(documentId(id)));
      return snap.exists ? project(snap) : null;
    },
    async create(row) {
      if (transaction) return createWith(transaction, row, created);
      return client.runTransaction((tx) => createWith(tx, row, new Set()), { maxAttempts: 5 });
    },
    /** Reserva a próxima ordem (leitura); `createAt` grava a linha e a sequência no mesmo commit. */
    async nextRow() {
      if (!transaction) throw new StorageError('transaction_required');
      const seq = await transaction.get(seqRef);
      return (seq.exists ? seq.data().next : 0) + 1;
    },
    async createAt(row, token) {
      if (!transaction) throw new StorageError('transaction_required');
      if (token === null) throw new StorageError('invalid_row_token');
      const ref = col.doc(documentId(row[keyField]));
      if (created.has(ref.path)) throw new StorageError('already_exists');
      created.add(ref.path);
      transaction.set(seqRef, { next: token });
      transaction.create(ref, { ...row, _row: token });
      return structuredClone(row);
    },
    async remove(id) {
      const ref = col.doc(documentId(id));
      if (transaction) transaction.delete(ref); else await ref.delete();
    },
    /**
     * Apaga as linhas `ids` (e a sentinela UNIQUE de cada uma, se houver) no mesmo commit. Lê todas
     * antes de apagar; id que não existe é ignorado, como o DELETE do SQLite.
     */
    async removeAll(ids) {
      const run = async (tx) => {
        const snaps = [];
        for (const id of ids) snaps.push(await tx.get(col.doc(documentId(id))));
        for (const snap of snaps) {
          if (!snap.exists) continue;
          if (uniqueKey) tx.delete(keys.doc(documentId(uniqueKey(snap.data()))));
          tx.delete(snap.ref);
        }
      };
      if (transaction) await run(transaction); else await client.runTransaction(run, { maxAttempts: 5 });
    },
    async patch(id, values) {
      const ref = col.doc(documentId(id));
      if (transaction) transaction.update(ref, values); else await ref.update(values);
    },
  };
}
