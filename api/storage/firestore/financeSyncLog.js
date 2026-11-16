import { compareSqlite } from '../sqliteOrder.js';
import { firestoreFinanceTable } from './financeTable.js';
import { FINANCE_GENERIC_TABLES } from '../sqlite/financeTables.js';

const DEF = FINANCE_GENERIC_TABLES.financeSyncLog;
const PAGE = 100;

/**
 * Log de sincronização no Firestore. `latest`: páginas ordenadas por `started_at` decrescente (índice de
 * campo único, sem índice composto), filtro de `actor`/`ok` em memória; no empate vale a linha inserida
 * primeiro (`_row` menor). ceiling: com filtro raro, pagina até achar (ou até acabar).
 */
export function firestoreFinanceSyncLog(userDoc, transaction, client) {
  const base = firestoreFinanceTable('financeSyncLog', DEF)(userDoc, transaction, client);
  const col = userDoc.collection('financeSyncLog');
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  return {
    ...base,
    async latest({ actor, ok }) {
      let best = null, cursor = null;
      for (;;) {
        let query = col.orderBy('started_at', 'desc').limit(PAGE);
        if (cursor) query = query.startAfter(cursor);
        const snap = await read(query);
        for (const doc of snap.docs) {
          const data = doc.data();
          if (best && compareSqlite(data.started_at ?? null, best.started_at) < 0) return base.project(best.doc);
          if ((actor !== null && data.actor !== actor) || (ok !== null && data.ok !== ok)) continue;
          if (!best || (compareSqlite(data.started_at ?? null, best.started_at) === 0 && (data._row ?? 0) < best.seq)) {
            best = { doc, started_at: data.started_at ?? null, seq: data._row ?? 0 };
          }
        }
        if (snap.docs.length < PAGE) return best ? base.project(best.doc) : null;
        cursor = snap.docs[snap.docs.length - 1];
      }
    },
  };
}
