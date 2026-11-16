import { StorageError } from '../contract.js';
import { documentId, originalId } from '../schema.mjs';
import { compareSqlite } from '../sqliteOrder.js';
import { CHECKLIST_FIELDS, QUEUE_FIELDS, ROLLOVER_FIELDS } from '../domains/phase3.js';
import { phase3Rows } from './phase3Rows.js';

/** `users/{uid}/taskChecklistItems`: `ORDER BY sort_order IS NULL, sort_order, created_date`, empate na inserção. */
export function firestoreTaskChecklistItems(userDoc, transaction, client) {
  const base = phase3Rows(userDoc, transaction, client, 'taskChecklistItems', CHECKLIST_FIELDS);
  const nullLast = (value) => (value === null ? 1 : 0);
  return {
    async get(id, taskId) { const row = await base.get(id); return row && row.task_id === taskId ? row : null; },
    async list(taskId) {
      return (await base.all()).filter(({ row }) => row.task_id === taskId)
        .sort((a, b) => (nullLast(a.row.sort_order) - nullLast(b.row.sort_order)) || compareSqlite(a.row.sort_order, b.row.sort_order)
          || compareSqlite(a.row.created_date, b.row.created_date) || (a.seq - b.seq)).map(({ row }) => row);
    },
    async counts(taskIds) {
      const wanted = new Set(taskIds), groups = new Map();
      for (const { row } of await base.all()) {
        if (!wanted.has(row.task_id)) continue;
        const group = groups.get(row.task_id) ?? { task_id: row.task_id, total: 0, done: 0 };
        group.total += 1;
        if (row.done === 1) group.done += 1;
        groups.set(row.task_id, group);
      }
      return [...groups.values()];
    },
    async maxSort(taskId) {
      let top = null;
      for (const { row } of await base.all()) if (row.task_id === taskId && row.sort_order !== null && (top === null || compareSqlite(row.sort_order, top) > 0)) top = row.sort_order;
      return top;
    },
    nextRow: base.nextRow,
    create: base.create,
    createAt: base.createAt,
    patch: base.patch,
    remove: base.remove,
    async removeByTask(taskId) { await base.removeAll((await base.all()).filter(({ row }) => row.task_id === taskId).map(({ row }) => row.id)); },
    async removeMany(ids) { for (const id of ids) await base.remove(id); },
  };
}

/** `users/{uid}/taskCalendarQueue/{task_id}`: uma linha por tarefa; `_row` = rowid (empate de `next_attempt_at`). */
export function firestoreTaskCalendarQueue(userDoc, transaction, client) {
  const base = phase3Rows(userDoc, transaction, client, 'taskCalendarQueue', QUEUE_FIELDS, { keyField: 'task_id' });
  const col = userDoc.collection('taskCalendarQueue');
  // Condicional a `updated_date`: lê o documento e só então grava, dentro da transação.
  async function conditional(taskId, updatedDate, apply) {
    const ref = col.doc(documentId(taskId));
    const run = async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().updated_date === updatedDate) apply(tx, ref);
    };
    if (transaction) await run(transaction); else await client.runTransaction(run, { maxAttempts: 5 });
  }
  return {
    get: base.get,
    nextRow: base.nextRow,
    createAt: base.createAt,
    patch: base.patch,
    async due(nowIso, limit) {
      return (await base.all()).filter(({ row }) => row.status === 'pending' && compareSqlite(row.next_attempt_at, nowIso) <= 0)
        .sort((a, b) => compareSqlite(a.row.next_attempt_at, b.row.next_attempt_at) || (a.seq - b.seq)).slice(0, limit).map(({ row }) => row);
    },
    async stats() {
      const totals = new Map();
      for (const { row } of await base.all()) totals.set(row.status, (totals.get(row.status) ?? 0) + 1);
      return [...totals].map(([status, total]) => ({ status, total }));
    },
    async list() { return (await base.all()).map(({ row }) => row); },
    async finish(taskId, updatedDate) { await conditional(taskId, updatedDate, (tx, ref) => tx.delete(ref)); },
    async fail(taskId, updatedDate, fields) { await conditional(taskId, updatedDate, (tx, ref) => tx.update(ref, fields)); },
  };
}

/** `users/{uid}/dayRolloverRuns/{day}`: sem sequência (a ordem das passadas é o próprio dia). */
export function firestoreDayRolloverRuns(userDoc, transaction, client) {
  const col = userDoc.collection('dayRolloverRuns');
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  const rowOf = (doc) => {
    const row = doc.data();
    originalId(doc.id, row.day);
    return Object.fromEntries(ROLLOVER_FIELDS.map((field) => [field, row[field] ?? null]));
  };
  const created = new Set();
  return {
    async get(day) { const snap = await read(col.doc(documentId(day))); return snap.exists ? rowOf(snap) : null; },
    async list() { return (await read(col)).docs.map(rowOf).sort((a, b) => compareSqlite(a.day, b.day)); },
    async create(row) {
      const ref = col.doc(documentId(row.day));
      if (transaction) {
        if (created.has(ref.path)) throw new StorageError('already_exists');
        created.add(ref.path);
        transaction.create(ref, row);
      } else await ref.create(row);
      return structuredClone(row);
    },
    async patch(day, fields) {
      const ref = col.doc(documentId(day));
      if (transaction) transaction.update(ref, fields); else await ref.update(fields);
    },
  };
}
