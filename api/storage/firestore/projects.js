import { StorageError } from '../contract.js';
import { documentId, originalId } from '../schema.mjs';
import { compareSqlite } from '../sqliteOrder.js';

/**
 * `users/{uid}/projects/{locator}` e `users/{uid}/projectUpdates/{locator}`.
 *
 * - `_row` = ordem de inserção (o `rowid`), lida e gravada em `users/{uid}/sequences/<coleção>`
 *   no mesmo commit; desempata as ordenações como no SQLite.
 * - `slug` é UNIQUE: sentinela `users/{uid}/uniqueKeys/projects.slug:<slug>` lida e criada no mesmo
 *   commit da frente (o slug não muda depois de criado).
 * - `get(chave)`: como `WHERE id = ? OR slug = ?` no SQLite, quem tem o id vence quem tem o slug.
 * - `project_updates.project_id` tem chave estrangeira no SQLite (foreign_keys ligado): a criação lê
 *   a frente no mesmo commit e recusa com `foreign_key_violation` se ela não existe.
 * - Ordem e filtro em memória com a comparação do SQLite.
 *   ceiling: `list()` lê todas as frentes da conta (dezenas); timeline lê a frente inteira antes do LIMIT.
 */
function makeOnce() {
  const created = new Set();
  return (ref) => { if (created.has(ref.path)) throw new StorageError('already_exists'); created.add(ref.path); };
}
async function nextRow(tx, seqRef) {
  const seq = await tx.get(seqRef);
  return (seq.exists ? seq.data().next : 0) + 1;
}

export function firestoreProjects(userDoc, transaction, client, fields) {
  const col = userDoc.collection('projects');
  const seqRef = userDoc.collection('sequences').doc('projects');
  const slugRef = (slug) => userDoc.collection('uniqueKeys').doc(documentId(`projects.slug:${slug}`));
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  const once = makeOnce();
  const project = (doc) => {
    const row = doc.data();
    originalId(doc.id, row.id);
    return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
  };
  async function createWith(tx, row, mark) {
    const ref = col.doc(documentId(row.id)), keyRef = slugRef(row.slug);
    mark(ref);
    const [next, taken] = [await nextRow(tx, seqRef), await tx.get(keyRef)];
    if (taken.exists) { const error = new StorageError('already_exists'); error.field = 'slug'; throw error; }
    mark(keyRef);
    tx.set(seqRef, { next });
    tx.create(ref, { ...row, _row: next });
    tx.create(keyRef, { domain: 'projects', field: 'slug', value: row.slug, record_id: row.id });
    return structuredClone(row);
  }
  return {
    async get(key) {
      let byId = null;
      try { byId = await read(col.doc(documentId(key))); } catch (error) { if (error?.code !== 'invalid_record_id') throw error; }
      if (byId?.exists) return project(byId);
      const bySlug = await read(col.where('slug', '==', key).limit(2));
      if (bySlug.size > 1) throw new StorageError('unique_violation_detected');
      return bySlug.size ? project(bySlug.docs[0]) : null;
    },
    async list() {
      const rows = (await read(col)).docs.map((doc) => ({ row: project(doc), seq: doc.data()._row }));
      rows.sort((a, b) => compareSqlite(b.row.focus, a.row.focus)
        || compareSqlite(a.row.sort_order, b.row.sort_order)
        || compareSqlite(a.row.name, b.row.name)
        || a.seq - b.seq);
      return rows.map(({ row }) => row);
    },
    async create(row) {
      if (transaction) return createWith(transaction, row, once);
      return client.runTransaction((tx) => createWith(tx, row, makeOnce()), { maxAttempts: 5 });
    },
    async patch(id, changes) {
      const ref = col.doc(documentId(id));
      if (transaction) transaction.update(ref, changes); else await ref.update(changes);
    },
  };
}

export function firestoreProjectUpdates(userDoc, transaction, client, fields) {
  const col = userDoc.collection('projectUpdates');
  const parentRef = (projectId) => userDoc.collection('projects').doc(documentId(projectId));
  const seqRef = userDoc.collection('sequences').doc('projectUpdates');
  const read = (target) => (transaction ? transaction.get(target) : target.get());
  const once = makeOnce();
  const project = (doc) => {
    const row = doc.data();
    originalId(doc.id, row.id);
    return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
  };
  async function createWith(tx, row, mark) {
    const ref = col.doc(documentId(row.id));
    mark(ref);
    const [next, parent] = [await nextRow(tx, seqRef), await tx.get(parentRef(row.project_id))];
    if (!parent.exists) throw new StorageError('foreign_key_violation');
    tx.set(seqRef, { next });
    tx.create(ref, { ...row, _row: next });
    return structuredClone(row);
  }
  return {
    async list(projectId, limit) {
      const rows = (await read(col.where('project_id', '==', projectId))).docs.map((doc) => ({ row: project(doc), seq: doc.data()._row }));
      rows.sort((a, b) => compareSqlite(b.row.date, a.row.date) || compareSqlite(b.row.created_at, a.row.created_at) || a.seq - b.seq);
      return rows.slice(0, limit).map(({ row }) => row);
    },
    async create(row) {
      if (transaction) return createWith(transaction, row, once);
      return client.runTransaction((tx) => createWith(tx, row, makeOnce()), { maxAttempts: 5 });
    },
  };
}
