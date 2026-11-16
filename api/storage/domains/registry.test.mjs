import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from '../../test-support/helpers.mjs';
import { createStorage } from '../index.js';
import { createSqliteDriver } from '../sqlite/driver.js';
import { createFirestoreDriver } from '../firestore/driver.js';
import { checkDomains, EXTRA_DOMAINS } from './index.js';
import { documentId } from '../schema.mjs';

// Domínio de prova sobre a tabela `achievements` (existe no esquema, nenhuma fase escreve nela aqui).
const probe = {
  name: 'probeNotes',
  spec: () => ({ get: ['read', (id) => [String(id)]], put: ['write', (id, title) => [String(id), String(title)]] }),
  sqlite: (db) => ({
    async get(id) { return db.prepare('SELECT id, name AS title FROM achievements WHERE id = ?').get(id) ?? null; },
    async put(id, title) { db.prepare("INSERT INTO achievements (id, name) VALUES (?, ?)").run(id, title); },
  }),
  firestore: (userDoc, tx) => {
    const ref = (id) => userDoc.collection('achievements').doc(documentId(id));
    return {
      async get(id) { const snap = tx ? await tx.get(ref(id)) : await ref(id).get(); return snap.exists ? { id: snap.data().id, title: snap.data().title } : null; },
      async put(id, title) { if (tx) tx.create(ref(id), { id, title }); else await ref(id).create({ id, title }); },
    };
  },
};

test('registro: nomes válidos, sem colisão com os domínios de base nem entre fases', () => {
  assert.ok(Object.isFrozen(EXTRA_DOMAINS), 'registro montado e congelado');
  assert.equal(new Set(EXTRA_DOMAINS.map((d) => d.name)).size, EXTRA_DOMAINS.length, 'sem nome repetido entre fases');
  assert.throws(() => checkDomains([{ ...probe, name: 'tasks' }]), /repetido: tasks/);
  assert.throws(() => checkDomains([probe, probe]), /repetido: probeNotes/);
  assert.throws(() => checkDomains([{ ...probe, name: 'Bad-name' }]), /nome válido/);
  assert.throws(() => checkDomains([{ ...probe, firestore: undefined }]), /sem firestore/);
});

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: domínio de fase entra na fachada, nas transações e nas mesmas regras`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const scope = new AsyncLocalStorage();
    let driver, close;
    if (kind === 'sqlite') {
      const dbs = new Map();
      driver = createSqliteDriver({ open: (owner) => { if (!dbs.has(owner)) dbs.set(owner, createTestDb()); return dbs.get(owner); }, domains: [probe] });
      close = () => { for (const db of dbs.values()) db.close(); };
    } else {
      const client = new Firestore({ projectId: 'demo-praxis-storage', host: process.env.FIRESTORE_EMULATOR_HOST, ssl: false });
      driver = createFirestoreDriver({ client, root: client.collection('registryRuns').doc(randomUUID()), domains: [probe] });
      close = () => client.terminate();
    }
    t.after(close);
    const s = createStorage({ driver, currentOwner: () => scope.getStore(), domains: [probe] });
    await assert.rejects(() => s.probeNotes.get('x'), { code: 'tenant_scope_missing' });
    await scope.run('alice', async () => {
      await s.transaction(async (tx) => { await tx.probeNotes.put('n1', 'Nota'); await tx.purchases.list(); }).catch((error) => assert.equal(error.code, 'transaction_read_after_write'));
      assert.equal(await s.probeNotes.get('n1'), null, 'transação recusada não gravou');
      await s.transaction(async (tx) => { await tx.probeNotes.get('n1'); await tx.probeNotes.put('n1', 'Nota'); });
      assert.deepEqual(await s.probeNotes.get('n1'), { id: 'n1', title: 'Nota' });
    });
    assert.equal(await scope.run('bob', () => s.probeNotes.get('n1')), null, 'outra conta não vê');
    assert.throws(() => createStorage({ driver, currentOwner: () => 'a', domains: [{ ...probe, name: 'outro' }] }), /driver sem domínio outro/);
  });
}
