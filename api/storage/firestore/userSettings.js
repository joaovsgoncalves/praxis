/**
 * `users/{uid}/userSettings/default`: um documento só, com as colunas da linha SQLite.
 * Gravar = trocar o documento inteiro (a linha já vem completa e validada) e devolver como ficou.
 */
export function firestoreUserSettings(userDoc, transaction, { fields, id }) {
  const ref = userDoc.collection('userSettings').doc(id);
  return {
    async get() {
      const snap = transaction ? await transaction.get(ref) : await ref.get();
      if (!snap.exists) return null;
      const data = snap.data();
      return Object.fromEntries(fields.map((field) => [field, data[field] ?? null]));
    },
    async save(row) {
      if (transaction) transaction.set(ref, row); else await ref.set(row);
      return structuredClone(row);
    },
  };
}
