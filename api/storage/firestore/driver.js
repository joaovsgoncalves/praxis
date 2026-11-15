import { assertUserId } from '../../lib/tenantDb.js';
import { firestoreTasks } from './tasks.js';
import { firestoreWeeklyReviews } from './weeklyReviews.js';
import { firestorePurchases } from './purchases.js';

/**
 * SDK injetado: importar este módulo não lê credencial nem abre rede.
 * `root` é escolhido pelo servidor (banco/namespace), nunca vem do corpo da requisição.
 */
export function createFirestoreDriver({ client, root = client }) {
  if (!client || typeof client.runTransaction !== 'function' || typeof client.batch !== 'function' || !root || typeof root.collection !== 'function') {
    throw new TypeError('Firestore client and root required');
  }
  const userDoc = (owner) => root.collection('users').doc(assertUserId(owner));
  const domains = {
    tasks: (owner, tx) => firestoreTasks(userDoc(owner).collection('tasks'), tx),
    weeklyReviews: (owner, tx) => firestoreWeeklyReviews(userDoc(owner), tx, client),
    purchases: (owner, tx) => firestorePurchases(userDoc(owner), tx, client),
  };
  const driver = {
    kind: 'firestore',
    transaction: async (owner, callback) => {
      assertUserId(owner);
      return client.runTransaction((tx) => callback(Object.fromEntries(Object.entries(domains).map(([name, make]) => [name, make(owner, tx)]))), { maxAttempts: 5 });
    },
  };
  for (const [name, make] of Object.entries(domains)) driver[name] = (owner) => make(owner);
  return driver;
}
