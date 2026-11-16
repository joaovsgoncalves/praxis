import { documentId, originalId } from '../schema.mjs';

/** `users/{uid}/continuityGuidance/{locator(date)}`: a linha SQLite inteira; gravar troca o documento. */
export function firestoreContinuityGuidance(userDoc, transaction, fields) {
  const col = userDoc.collection('continuityGuidance');
  return {
    async get(date) {
      const ref = col.doc(documentId(date));
      const snap = transaction ? await transaction.get(ref) : await ref.get();
      if (!snap.exists) return null;
      const data = snap.data();
      originalId(snap.id, data.date);
      return Object.fromEntries(fields.map((f) => [f, data[f] ?? null]));
    },
    async put(row) {
      const ref = col.doc(documentId(row.date));
      if (transaction) transaction.set(ref, row); else await ref.set(row);
      return structuredClone(row);
    },
  };
}
