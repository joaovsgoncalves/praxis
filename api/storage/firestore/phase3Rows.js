import { StorageError } from '../contract.js';
import { documentId, originalId } from '../schema.mjs';

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
export function phase3Rows(userDoc, transaction, client, collection, fields) {
  const col = userDoc.collection(collection);
  const seqRef = userDoc.collection('sequences').doc(collection);
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  const created = new Set();
  const project = (doc) => {
    const row = doc.data();
    originalId(doc.id, row.id);
    return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
  };
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
  return {
    /** [{ row, seq }] na ordem de inserção. */
    async all() {
      return (await read(col)).docs.map((doc) => ({ row: project(doc), seq: doc.data()._row })).sort((a, b) => a.seq - b.seq);
    },
    async get(id) {
      const snap = await read(col.doc(documentId(id)));
      return snap.exists ? project(snap) : null;
    },
    async create(row) {
      if (transaction) return createWith(transaction, row, created);
      return client.runTransaction((tx) => createWith(tx, row, new Set()), { maxAttempts: 5 });
    },
    async patch(id, values) {
      const ref = col.doc(documentId(id));
      if (transaction) transaction.update(ref, values); else await ref.update(values);
    },
  };
}
