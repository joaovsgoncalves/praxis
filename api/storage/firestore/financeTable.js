import { StorageError } from '../contract.js';
import { documentId, originalId, centsToMoney } from '../schema.mjs';
import { compareSqlite } from '../sqliteOrder.js';
import { sqliteStoredText } from '../sqliteSemantics.js';
import { columnNames, keyOf, exactCents } from '../sqlite/financeTables.js';

/**
 * Tabela genérica de finanças no Firestore (domínio 2 em diante): `users/{uid}/<coleção>/{documentId(chave)}`.
 *
 * - Dinheiro em centavos inteiros no mesmo campo; a leitura devolve o número do SQLite. Texto com
 *   substituto UTF-16 solto é gravado como o SQLite o devolve (`sqliteStoredText`).
 * - `_row` = ordem de inserção, de `users/{uid}/sequences/<coleção>`: numa transação, lida por
 *   `reserve(n)` antes das escritas e gravada no primeiro `create`.
 * - Filtros por igualdade na consulta (só colunas TEXT, onde a igualdade é a mesma do SQLite);
 *   ordem em memória com a comparação do SQLite (`col IS NULL` incluso) e `_row` no empate.
 *   ceiling: lê a coleção inteira (ou o recorte do filtro) por consulta.
 * - `upsert` = `set` com merge: documento existente mantém o `_row` (o rowid do ON CONFLICT também fica).
 */
export function firestoreFinanceTable(name, def) {
  const key = keyOf(def), names = columnNames(def);
  const compare = (a, b) => {
    for (const { col, desc, isNull } of def.order) {
      const result = isNull ? (a[col] === null ? 1 : 0) - (b[col] === null ? 1 : 0) : compareSqlite(a[col], b[col]) * (desc ? -1 : 1);
      if (result) return result;
    }
    return 0;
  };
  return (userDoc, transaction, client) => {
    const col = userDoc.collection(name);
    const seqRef = userDoc.collection('sequences').doc(name);
    const read = (target) => (transaction ? transaction.get(target) : target.get());
    const created = new Set();
    let reservation = null;
    // Texto gravado como o SQLite o devolve (substituto UTF-16 solto = 3 U+FFFD).
    const toDoc = (row) => Object.fromEntries(Object.entries(row).map(([column, value]) => [column,
      def.money.includes(column) && value !== null ? exactCents(value) : sqliteStoredText(value)]));
    const project = (doc) => {
      const data = doc.data();
      originalId(doc.id, data[key]);
      return Object.fromEntries(names.map((column) => {
        const value = data[column] ?? null;
        return [column, value !== null && def.money.includes(column) ? centsToMoney(value) : value];
      }));
    };
    const createIn = (tx, row, seen, slot) => {
      const ref = col.doc(documentId(row[key]));
      if (seen.has(ref.path)) throw new StorageError('already_exists');
      seen.add(ref.path);
      tx.create(ref, { ...toDoc(row), _row: slot });
      return structuredClone(row);
    };
    return {
      async reserve(count) {
        if (!transaction) return;
        if (reservation) throw new StorageError('sequence_already_reserved');
        const snap = await transaction.get(seqRef);
        reservation = { base: snap.exists ? snap.data().next : 0, count, used: 0 };
      },
      async get(value) {
        const snap = await read(col.doc(documentId(value)));
        return snap.exists ? project(snap) : null;
      },
      async list(filters) {
        let query = col;
        for (const column of def.filters) if (filters[column] !== null) query = query.where(column, '==', filters[column]);
        const rows = (await read(query)).docs.map((doc) => ({ row: project(doc), seq: doc.data()._row ?? 0 }));
        return rows.sort((a, b) => compare(a.row, b.row) || a.seq - b.seq).map(({ row }) => row);
      },
      async create(row) {
        if (!transaction) {
          return client.runTransaction(async (tx) => {
            const snap = await tx.get(seqRef);
            const next = (snap.exists ? snap.data().next : 0) + 1;
            tx.set(seqRef, { next });
            return createIn(tx, row, new Set(), next);
          }, { maxAttempts: 5 });
        }
        if (!reservation || reservation.used >= reservation.count) throw new StorageError('sequence_not_reserved');
        if (reservation.used === 0) transaction.set(seqRef, { next: reservation.base + reservation.count });
        reservation.used += 1;
        return createIn(transaction, row, created, reservation.base + reservation.used);
      },
      async upsert(row) {
        const ref = col.doc(documentId(row[key]));
        if (created.has(ref.path)) throw new StorageError('duplicate_write_in_transaction');
        created.add(ref.path);
        if (transaction) transaction.set(ref, toDoc(row), { merge: true }); else await ref.set(toDoc(row), { merge: true });
      },
      async patch(value, fields) {
        const ref = col.doc(documentId(value));
        if (transaction) transaction.update(ref, toDoc(fields)); else await ref.update(toDoc(fields));
      },
      async remove(value) {
        const ref = col.doc(documentId(value));
        if (transaction) transaction.delete(ref); else await ref.delete();
      },
    };
  };
}
