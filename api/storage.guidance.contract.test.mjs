import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';
import { GUIDANCE_FIELDS } from './storage/domains/phase4.js';

async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb({ withProjects: true })); return databases.get(owner); },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    return createFirestoreDriver({ client, root: client.collection('storageContractRuns').doc(randomUUID()) });
  })();
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore() }),
    as: (owner, fn) => scope.run(owner, fn),
    databases,
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}
const row = (date, extra = {}) => ({ date, summary: '', priorities_json: '[]', source: 'seneca', generated_at: `${date}T07:00:00Z`, created_at: '2026-11-15 10:00:00', updated_at: '2026-11-15 10:00:00', ...extra });

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato da orientação do dia (uma linha por data)`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;
    await assert.rejects(() => s.continuityGuidance.get('2026-11-15'), { code: 'tenant_scope_missing' });
    await as('alice', async () => {
      assert.equal(await s.continuityGuidance.get('2026-11-15'), null);
      const { generated_at, ...missing } = row('2026-11-15');
      assert.ok(generated_at);
      await assert.rejects(() => s.continuityGuidance.put(missing), { code: 'incomplete_guidance' });
      await assert.rejects(() => s.continuityGuidance.put(row('2026-11-15', { owner: 'x' })), { code: 'unknown_guidance_field' });
      await assert.rejects(() => s.continuityGuidance.put(row('2026-11-15', { generated_at: null })), { code: 'invalid_guidance_value' });
      await assert.rejects(() => s.continuityGuidance.put(row('')), { code: 'invalid_record_id' });
      await s.continuityGuidance.put(row('2026-11-15', { summary: 'a', priorities_json: '[{"rank":1}]' }));
      const read = await s.continuityGuidance.get('2026-11-15');
      assert.deepEqual(Object.keys(read), GUIDANCE_FIELDS);
      assert.equal(read.summary, 'a');
      // Trocar = documento inteiro; a mesma data continua uma linha só.
      await s.continuityGuidance.put(row('2026-11-15', { summary: 'b', priorities_json: '[]' }));
      assert.deepEqual(await s.continuityGuidance.get('2026-11-15'), row('2026-11-15', { summary: 'b' }));
      await s.continuityGuidance.put(row('a/b ../x'));
      assert.equal((await s.continuityGuidance.get('a/b ../x')).date, 'a/b ../x', 'data estranha como chave não quebra o caminho');
      if (kind === 'sqlite') assert.equal(f.databases.get('alice').prepare("SELECT COUNT(*) FROM continuity_guidance WHERE date = '2026-11-15'").pluck().get(), 1);
      await assert.rejects(() => s.transaction(async (tx) => { await tx.continuityGuidance.put(row('2026-11-15', { summary: 'c' })); await tx.continuityGuidance.get('2026-11-15'); }), { code: 'transaction_read_after_write' });
      assert.equal((await s.continuityGuidance.get('2026-11-15')).summary, 'b', 'abortada não gravou');
    });
    assert.equal(await as('bob', () => s.continuityGuidance.get('2026-11-15')), null, 'outra conta não vê');
  });
}
