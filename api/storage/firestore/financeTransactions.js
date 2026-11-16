import { compareSqlite } from '../sqliteOrder.js';
import { sqliteLike } from '../sqlite/financeLike.js';
import { firestoreFinanceTable } from './financeTable.js';
import { FINANCE_GENERIC_TABLES } from '../sqlite/financeTables.js';

const DEF = FINANCE_GENERIC_TABLES.financeTransactions;

/**
 * Lançamentos no Firestore: tabela genérica + extrato e busca pela baixa.
 * `range`: período pela consulta (`posted_on` é texto AAAA-MM-DD, mesma ordem de bytes do SQLite), o resto
 * em memória com a comparação do SQLite (LIKE em `financeLike.js`); ordem `posted_on DESC, created_at DESC` e,
 * no empate total, a mais recente primeiro (`_row` decrescente), que é o que o SQLite devolve ao varrer o
 * índice de `posted_on` de trás para frente (provado no teste de contrato contra o SQLite real).
 * ceiling: lê todo o período do pedido (e as contas PJ, se houver recorte) por consulta.
 */
export function firestoreFinanceTransactions(userDoc, transaction, client) {
  const base = firestoreFinanceTable('financeTransactions', DEF)(userDoc, transaction, client);
  const col = userDoc.collection('financeTransactions');
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  return {
    ...base,
    async byPayment(paymentId) {
      const docs = (await read(col.where('payment_id', '==', paymentId))).docs
        .map((doc) => ({ doc, seq: doc.data()._row ?? 0 })).sort((a, b) => a.seq - b.seq);
      if (!docs.length) return null;
      return base.project(docs[0].doc);
    },
    async between({ from, to }) {
      let query = col;
      if (from !== null) query = query.where('posted_on', '>=', from);
      if (to !== null) query = query.where('posted_on', '<=', to);
      const rows = (await read(query)).docs.map((doc) => ({ doc, posted_on: doc.data().posted_on ?? null, seq: doc.data()._row ?? 0 }));
      rows.sort((a, b) => compareSqlite(a.posted_on, b.posted_on) || a.seq - b.seq);
      return rows.map(({ doc }) => base.project(doc));
    },
    async range({ from, to, accountId, category, like, entity, limit }) {
      const snap = await read(col.where('posted_on', '>=', from).where('posted_on', '<=', to));
      let pj = null;
      if (entity !== 'all') pj = new Set((await read(userDoc.collection('financeAccounts').where('entity', '==', 'pj'))).docs.map((doc) => doc.data().id));
      const rows = [];
      for (const doc of snap.docs) {
        const data = doc.data();
        if ((data.matched_tx_id ?? null) !== null) continue;
        if (accountId !== null && (data.account_id ?? null) !== accountId) continue;
        if (category !== null && (data.category ?? null) !== category) continue;
        if (like !== null && !(sqliteLike(data.merchant ?? null, like) === true || sqliteLike(data.raw_description ?? null, like) === true)) continue;
        const account = data.account_id ?? null;
        if (entity === 'pj' && !(account !== null && pj.has(account))) continue;
        if (entity === 'pf' && !(account === null || !pj.has(account))) continue;
        rows.push({ doc, posted_on: data.posted_on ?? null, created_at: data.created_at ?? null, seq: data._row ?? 0 });
      }
      rows.sort((a, b) => compareSqlite(b.posted_on, a.posted_on) || compareSqlite(b.created_at, a.created_at) || b.seq - a.seq);
      const chosen = limit === null ? rows : rows.slice(0, limit);
      return chosen.map(({ doc }) => base.project(doc));
    },
  };
}
