import { StorageError } from '../contract.js';
import { documentId, originalId } from '../schema.mjs';

/** `users/{uid}/tasks/{locator}`; `transaction` ausente = operação direta. */
export function firestoreTasks(col, transaction) {
  // Mesmo id criado duas vezes no commit: igualar ao UNIQUE do SQLite (o Firestore daria INVALID_ARGUMENT).
  const created = new Set();
  function query(options) {
    let q=col;
    for(const key of ['date','status']) if(Object.hasOwn(options,key)) q=q.where(key,'==',options[key]);
    return q.orderBy('id','asc').offset(options.offset).limit(options.limit);
  }
  return {
    async get(id) {
      const ref=col.doc(documentId(id)), snap=transaction?await transaction.get(ref):await ref.get();
      if(!snap.exists)return null;
      const row=snap.data(); originalId(snap.id,row.id); return row;
    },
    async list(options) {
      const q=query(options), snap=transaction?await transaction.get(q):await q.get();
      return snap.docs.map(doc=>{ const row=doc.data(); originalId(doc.id,row.id); return row; });
    },
    async create(row) {
      const ref=col.doc(documentId(row.id));
      if(transaction) {
        if(created.has(ref.path)) throw new StorageError('already_exists');
        created.add(ref.path);
        transaction.create(ref,row);
      } else await ref.create(row);
      return structuredClone(row);
    },
    async patch(id,fields) {
      const ref=col.doc(documentId(id));
      if(transaction) transaction.update(ref,fields); else await ref.update(fields);
    },
    async remove(id) {
      const ref=col.doc(documentId(id));
      if(transaction) transaction.delete(ref); else await ref.delete();
    },
  };
}
