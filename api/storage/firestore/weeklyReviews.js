import { StorageError, REVIEW_FIELDS } from '../contract.js';
import { documentId, originalId } from '../schema.mjs';

/**
 * `users/{uid}/weeklyReviews/{locator}`. O Firestore não tem UNIQUE: `week_start` é garantido por um
 * documento-sentinela em `users/{uid}/uniqueKeys/` criado e apagado no MESMO commit do registro.
 * `week_start` é imutável depois de criado (o serviço nunca o troca), então a sentinela não se move.
 * Linhas saem na ordem de colunas da tabela SQLite, para o corpo HTTP sair igual byte a byte.
 */
export function firestoreWeeklyReviews(userDoc, transaction, client) {
  const col = userDoc.collection('weeklyReviews'), keys = userDoc.collection('uniqueKeys');
  const keyRef = (weekStart) => keys.doc(documentId(`weeklyReviews.week_start:${weekStart}`));
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  // Duas criações do mesmo documento num commit: o SQLite diz UNIQUE, o Firestore recusa o pedido
  // inteiro com INVALID_ARGUMENT. Detectar aqui mantém o mesmo `already_exists` nos dois motores.
  const created = new Set();
  const once = (ref) => { if (created.has(ref.path)) throw new StorageError('already_exists'); created.add(ref.path); };
  const project = (doc) => {
    const row = doc.data();
    originalId(doc.id, row.id);
    return Object.fromEntries(REVIEW_FIELDS.map((field) => [field, row[field] ?? null]));
  };
  async function removeWith(tx, id) {
    const ref = col.doc(documentId(id)), snap = await tx.get(ref);
    if (!snap.exists) return;
    tx.delete(ref);
    tx.delete(keyRef(snap.data().week_start));
  }
  return {
    async get(id) {
      const snap = await read(col.doc(documentId(id)));
      return snap.exists ? project(snap) : null;
    },
    async getByWeek(weekStart) {
      const snap = await read(col.where('week_start', '==', weekStart).limit(2));
      if (snap.size > 1) throw new StorageError('unique_violation_detected');
      return snap.size ? project(snap.docs[0]) : null;
    },
    async list({ limit }) {
      if (limit === 0) return [];
      let q = col.orderBy('week_start', 'desc');
      if (limit !== null) q = q.limit(limit);
      return (await read(q)).docs.map(project);
    },
    async create(row) {
      const sentinel = { domain: 'weeklyReviews', field: 'week_start', value: row.week_start, record_id: row.id };
      const ref = col.doc(documentId(row.id));
      if (transaction) {
        once(keyRef(row.week_start)); once(ref);
        transaction.create(keyRef(row.week_start), sentinel);
        transaction.create(ref, row);
      } else {
        await client.batch().create(keyRef(row.week_start), sentinel).create(ref, row).commit();
      }
      return structuredClone(row);
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
