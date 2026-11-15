import { assertUserId } from '../../lib/tenantDb.js';
import { documentId, originalId } from '../schema.mjs';

/**
 * Firestore SDK is injected, so importing this module never reads credentials or contacts cloud.
 * root is a server-selected database/namespace; never supplied by the request body.
 */
export function createFirestoreTasksDriver({ client, root = client }) {
  if (!client || typeof client.runTransaction !== 'function' || !root || typeof root.collection !== 'function') throw new TypeError('Firestore client and root required');
  function collection(owner) { return root.collection('users').doc(assertUserId(owner)).collection('tasks'); }
  function query(col, options) {
    let q=col;
    for(const key of ['date','status']) if(Object.hasOwn(options,key)) q=q.where(key,'==',options[key]);
    return q.orderBy('id','asc').offset(options.offset).limit(options.limit);
  }
  function direct(owner, transaction) {
    const col=collection(owner);
    return {
      async get(id) {
        const ref=col.doc(documentId(id)), snap=transaction?await transaction.get(ref):await ref.get();
        if(!snap.exists)return null;
        const row=snap.data(); originalId(snap.id,row.id); return row;
      },
      async list(options) {
        const q=query(col,options), snap=transaction?await transaction.get(q):await q.get();
        return snap.docs.map(doc=>{ const row=doc.data(); originalId(doc.id,row.id); return row; });
      },
      async create(row) {
        const ref=col.doc(documentId(row.id));
        if(transaction) transaction.create(ref,row); else await ref.create(row);
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
  return {
    kind:'firestore',
    tasks:owner=>direct(owner),
    transaction:async(owner,callback)=>{
      assertUserId(owner);
      return client.runTransaction(tx=>callback(direct(owner,tx)),{maxAttempts:5});
    },
  };
}
