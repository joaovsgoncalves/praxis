import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';
import { PROJECT_FIELDS, PROJECT_UPDATE_FIELDS } from './storage/domains/phase4.js';

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
const STAMP = '2026-11-15 10:00:00';
const project = (id, extra = {}) => ({
  id, slug: id, name: id, tagline: '', kind: 'produto', column: 'radar', focus: 0, live: 0, objective: '', status_summary: '',
  current_slice: '', next_step: '', last_move_at: '', last_move_note: '', last_reviewed_at: '', notes: '', shipped_note: '',
  blocked_note: '', prod_url: '', repo_path: '', sort_order: 1, created_date: STAMP, updated_date: STAMP, parent_slug: '', revision: 0, ...extra,
});
const update = (id, extra = {}) => ({ id, project_id: 'p', date: '2026-11-01', summary: id, source: 'manual', created_by: 'joao', created_at: STAMP, ...extra });

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de frentes e timeline`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('sem escopo falha fechado; linha incompleta, campo estranho ou valor inválido é recusado', async () => {
      await assert.rejects(() => s.projects.list(), { code: 'tenant_scope_missing' });
      await assert.rejects(() => s.projectUpdates.list('p', 5), { code: 'tenant_scope_missing' });
      await as('alice', async () => {
        const { revision, ...missing } = project('x');
        assert.equal(revision, 0);
        await assert.rejects(() => s.projects.create(missing), { code: 'incomplete_project' });
        await assert.rejects(() => s.projects.create(project('x', { owner: 'bob' })), { code: 'unknown_project_field' });
        await assert.rejects(() => s.projects.create(project('x', { name: null })), { code: 'invalid_project_value' });
        await assert.rejects(() => s.projects.create(project('x', { focus: true })), { code: 'invalid_project_value' });
        await assert.rejects(() => s.projects.create(project('x', { sort_order: 1e20 })), { code: 'sqlite_coercion_unsupported' });
        await assert.rejects(() => s.projectUpdates.create(update('u', { summary: null })), { code: 'invalid_project_update_value' });
        await assert.rejects(() => s.projectUpdates.list('p', -1), { code: 'invalid_limit' });
        assert.deepEqual(await s.projects.list(), []);
      });
    });

    await t.test('grava com a afinidade do SQLite e lê nas colunas e ordem do banco novo', async () => as('alice', async () => {
      const made = await s.projects.create(project('afinidade', { sort_order: '7', tagline: 5, live: 1.5 }));
      assert.deepEqual(Object.keys(made), PROJECT_FIELDS);
      assert.deepEqual([made.sort_order, made.tagline, made.live], [7, '5.0', 1.5]);
      assert.deepEqual(await s.projects.get('afinidade'), made);
    }));

    await t.test('chave: id vence slug; slug acha quando não há id igual', async () => as('chaves', async () => {
      await s.projects.create(project('dona-do-id', { slug: 'k' }));
      await s.projects.create(project('k2', { id: 'k', slug: 'outro' }));
      assert.equal((await s.projects.get('k')).slug, 'outro', 'id = k vence slug = k');
      assert.equal((await s.projects.get('dona-do-id')).slug, 'k');
      assert.equal(await s.projects.get('ninguem'), null);
    }));

    await t.test('ordem: foco desc, posição (NULL primeiro), nome, ordem de inserção', async () => as('ordem', async () => {
      for (const row of [project('b', { name: 'Mesmo', sort_order: 2 }), project('a', { name: 'Mesmo', sort_order: 2 }), project('nulo', { sort_order: null }),
        project('focado', { focus: 1, sort_order: 9 }), project('z', { name: 'Antes', sort_order: 2 }), project('c', { name: 'Mesmo', sort_order: 2 })]) {
        await s.projects.create(row);
      }
      assert.deepEqual((await s.projects.list()).map((r) => r.id), ['focado', 'nulo', 'z', 'b', 'a', 'c']);
    }));

    await t.test('id e slug únicos dizem qual campo; contas não se cruzam', async () => {
      await as('alice', async () => {
        await assert.rejects(() => s.projects.create(project('afinidade', { slug: 'novo' })), (e) => e.code === 'already_exists' && e.field !== 'slug');
        await assert.rejects(() => s.projects.create(project('novo-id', { slug: 'afinidade' })), (e) => e.code === 'already_exists' && e.field === 'slug');
        await assert.rejects(() => s.transaction((tx) => tx.projects.create(project('novo-id', { slug: 'afinidade' }))), { code: 'already_exists' });
      });
      await as('bob', () => s.projects.create(project('afinidade', { name: 'do bob' })));
      assert.equal((await as('alice', () => s.projects.get('afinidade'))).name, 'afinidade');
      assert.equal((await as('bob', () => s.projects.get('afinidade'))).name, 'do bob');
    });

    await t.test('alteração: exige revisão nova; id, slug e criação imutáveis; inexistente = not_found', async () => as('alice', async () => {
      for (const bad of [{ id: 'z', revision: 1 }, { slug: 'z', revision: 1 }, { created_date: STAMP, revision: 1 }]) {
        await assert.rejects(() => s.projects.patch('afinidade', bad), { code: 'immutable_project_field' });
      }
      await assert.rejects(() => s.projects.patch('afinidade', { name: 'sem revisão' }), { code: 'project_revision_required' });
      await assert.rejects(() => s.projects.patch('nope', { name: 'x', revision: 1 }), { code: 'not_found' });
      await s.projects.patch('afinidade', { name: 'mudou', revision: 3 });
      const row = await s.projects.get('afinidade');
      assert.deepEqual([row.name, row.revision], ['mudou', 3], 'a revisão gravada é a que veio, sem soma extra');
      if (kind === 'sqlite') {
        f.databases.get('alice').prepare("UPDATE projects SET notes = 'direto' WHERE id = 'afinidade'").run();
        assert.equal((await s.projects.get('afinidade')).revision, 4, 'escritor de fora continua com o gatilho');
      }
    }));

    await t.test('timeline: por frente, data e carimbo desc, empate na ordem de inserção, limite', async () => as('linha', async () => {
      await assert.rejects(() => s.projectUpdates.create(update('orfa')), { code: 'foreign_key_violation' }, 'frente precisa existir (FK do SQLite)');
      await s.projects.create(project('p'));
      await s.projects.create(project('q'));
      for (const row of [update('u3'), update('u1'), update('u2'), update('novo', { date: '2026-11-02', created_at: '2026-11-01 08:00:00' }),
        update('tarde', { created_at: '2026-11-15 11:00:00' }), update('outra', { project_id: 'q' })]) {
        await s.projectUpdates.create(row);
      }
      const rows = await s.projectUpdates.list('p', 40);
      assert.deepEqual(rows.map((r) => r.id), ['novo', 'tarde', 'u3', 'u1', 'u2']);
      assert.deepEqual(Object.keys(rows[0]), PROJECT_UPDATE_FIELDS);
      assert.deepEqual((await s.projectUpdates.list('p', 2)).map((r) => r.id), ['novo', 'tarde']);
      assert.deepEqual(await s.projectUpdates.list('p', 0), []);
      await assert.rejects(() => s.projectUpdates.create(update('u1')), { code: 'already_exists' });
    }));

    await t.test('transação: criar lê antes de gravar; abortada não deixa nada', async () => as('tx', async () => {
      await assert.rejects(() => s.transaction(async (tx) => { await tx.projects.create(project('t1')); await tx.projects.create(project('t2')); }), { code: 'transaction_read_after_write' });
      assert.deepEqual(await s.projects.list(), []);
      await s.projects.create(project('p'));
      await assert.rejects(() => s.transaction(async (tx) => { await tx.projectUpdates.create(update('tu')); await tx.projects.patch('p', { name: 'x', revision: 1 }); throw new Error('falhou depois'); }), /falhou depois/);
      assert.equal((await s.projects.get('p')).name, 'p');
      assert.deepEqual(await s.projectUpdates.list('p', 5), []);
      // Timeline e frente na mesma transação: a frente (que lê sequência e slug) vem antes da timeline? Não: cada criação lê,
      // então só uma criação por transação, nos dois motores.
      await assert.rejects(() => s.transaction(async (tx) => { await tx.projectUpdates.create(update('tu')); await tx.projects.create(project('t1')); }), { code: 'transaction_read_after_write' });
      assert.deepEqual(await s.projectUpdates.list('p', 5), []);
    }));
  });
}
