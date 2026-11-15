import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';
import { REVIEW_FIELDS } from './storage/contract.js';

const now = () => new Date('2026-11-15T12:00:00Z');
async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb()); return databases.get(owner); },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({ projectId: 'demo-praxis-storage', host, ssl: false });
    return createFirestoreDriver({ client, root: client.collection('storageContractRuns').doc(randomUUID()) });
  })();
  return {
    storage: createStorage({ driver, currentOwner: () => scope.getStore(), now }),
    as: (owner, fn) => scope.run(owner, fn),
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}
const review = (id, week, extra = {}) => ({ id, week_start: week, ...extra });

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de revisões semanais`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;
    await t.test('sem escopo falha fechado; dono não vem do payload', async () => {
      await assert.rejects(() => s.weeklyReviews.getByWeek('2026-11-09'), { code: 'tenant_scope_missing' });
      await assert.rejects(() => as('alice', () => s.weeklyReviews.create({ ...review('x', '2026-11-09'), owner: 'bob' })), { code: 'unknown_review_field' });
    });
    await t.test('padrões da tabela, ordem das colunas e duas contas na mesma semana', async () => {
      const a = await as('alice', () => s.weeklyReviews.create(review('r1', '2026-11-09', { highlights: 'A' })));
      await as('bob', () => s.weeklyReviews.create(review('r1', '2026-11-09', { highlights: 'B' })));
      assert.deepEqual(Object.keys(a), REVIEW_FIELDS);
      const read = await as('alice', () => s.weeklyReviews.getByWeek('2026-11-09'));
      assert.deepEqual(Object.keys(read), REVIEW_FIELDS);
      assert.deepEqual(read, { id: 'r1', week_start: '2026-11-09', highlights: 'A', blockers: '', learnings: '', next_week_focus: '', overall_score: 3, created_date: '2026-11-15 12:00:00', updated_date: '2026-11-15 12:00:00' });
      assert.equal((await as('bob', () => s.weeklyReviews.get('r1'))).highlights, 'B');
    });
    await t.test('semana e id repetidos são recusados, também dentro de transação', async () => {
      await as('alice', async () => {
        await assert.rejects(() => s.weeklyReviews.create(review('r2', '2026-11-09')), { code: 'already_exists' });
        await assert.rejects(() => s.weeklyReviews.create(review('r1', '2026-11-16')), { code: 'already_exists' });
        await assert.rejects(() => s.transaction(async (tx) => { await tx.weeklyReviews.create(review('r3', '2026-11-23')); await tx.weeklyReviews.create(review('r4', '2026-11-23')); }), { code: 'already_exists' });
        assert.equal(await s.weeklyReviews.getByWeek('2026-11-23'), null, 'nada da transação abortada ficou');
        assert.equal(await s.weeklyReviews.get('r3'), null);
      });
    });
    await t.test('lista em ordem de semana decrescente, com limite, zero e sem limite', async () => as('lista', async () => {
      for (const [id, week] of [['a', '2026-10-05'], ['b', '2026-11-02'], ['c', '2026-10-19']]) await s.weeklyReviews.create(review(id, week));
      assert.deepEqual((await s.weeklyReviews.list()).map((r) => r.id), ['b', 'c', 'a']);
      assert.deepEqual((await s.weeklyReviews.list({ limit: 2 })).map((r) => r.id), ['b', 'c']);
      assert.deepEqual(await s.weeklyReviews.list({ limit: 0 }), []);
      assert.equal((await s.weeklyReviews.list({ limit: null })).length, 3);
      for (const bad of [{ limit: -1 }, { limit: 1.5 }, { limit: 1001 }, { where: 'x' }]) await assert.rejects(() => s.weeklyReviews.list(bad), { code: 'invalid_review_query' });
    }));
    await t.test('alteração preserva o resto; id, semana e criação são imutáveis', async () => as('alice', async () => {
      await s.weeklyReviews.patch('r1', { learnings: 'L', overall_score: 'abc', updated_date: '2026-11-15 13:00:00' });
      const row = await s.weeklyReviews.get('r1');
      assert.equal(row.highlights, 'A'); assert.equal(row.learnings, 'L'); assert.equal(row.overall_score, 'abc'); assert.equal(row.created_date, '2026-11-15 12:00:00');
      for (const bad of [{ week_start: '2026-11-16' }, { id: 'z' }, { created_date: '2026-11-15 13:00:00' }]) await assert.rejects(() => s.weeklyReviews.patch('r1', bad), { code: 'immutable_review_field' });
      for (const bad of [{ highlights: 5 }, { overall_score: true }, { updated_date: 'ontem' }, {}]) await assert.rejects(() => s.weeklyReviews.patch('r1', bad));
      await assert.rejects(() => s.weeklyReviews.patch('nao-existe', { learnings: 'x' }), { code: 'not_found' });
    }));
    await t.test('apagar é idempotente, isolado e libera a semana', async () => {
      await as('alice', () => s.weeklyReviews.remove('r1'));
      await as('alice', () => s.weeklyReviews.remove('r1'));
      assert.equal(await as('alice', () => s.weeklyReviews.getByWeek('2026-11-09')), null);
      assert.ok(await as('bob', () => s.weeklyReviews.get('r1')));
      await as('alice', () => s.weeklyReviews.create(review('r5', '2026-11-09')));
      assert.equal((await as('alice', () => s.weeklyReviews.getByWeek('2026-11-09'))).id, 'r5');
    });
    await t.test('apagar depois de escrever na mesma transação é recusado nos dois motores', async () => as('alice', async () => {
      await assert.rejects(() => s.transaction(async (tx) => { await tx.weeklyReviews.patch('r5', { learnings: 'x', updated_date: '2026-11-15 13:00:00' }); await tx.weeklyReviews.remove('r5'); }), { code: 'transaction_read_after_write' });
      assert.equal((await s.weeklyReviews.get('r5')).learnings, '');
    }));
    await t.test('criações concorrentes da mesma semana: uma vence, as outras recebem already_exists', async () => as('corrida', async () => {
      const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => s.transaction(async (tx) => {
        const existing = await tx.weeklyReviews.getByWeek('2026-11-09');
        if (!existing) await tx.weeklyReviews.create(review(`c${i}`, '2026-11-09'));
        return existing ? 'achou' : 'criou';
      })));
      const created = results.filter((r) => r.status === 'fulfilled' && r.value === 'criou');
      assert.equal(created.length, 1);
      for (const r of results.filter((x) => x.status === 'rejected')) assert.equal(r.reason.code, 'already_exists');
      assert.equal((await s.weeklyReviews.list({ limit: null })).length, 1);
    }));
  });
}

test('mesma sequência dá o mesmo resultado, byte a byte, nos dois motores', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const sql = await fixture('sqlite'), fire = await fixture('firestore');
  t.after(sql.close); t.after(fire.close);
  async function replay(f) {
    return f.as('paridade', async () => {
      const s = f.storage, out = [];
      out.push(await s.weeklyReviews.create(review('a/b', '2026-11-09', { highlights: 'Ação 😀', overall_score: 4.5, learnings: null })));
      out.push(await s.weeklyReviews.create(review('~bYS9i', '2026-11-02', { overall_score: 'abc', blockers: '5.0' })));
      out.push(await s.weeklyReviews.list({ limit: null }));
      await s.transaction(async (tx) => { const row = await tx.weeklyReviews.getByWeek('2026-11-09'); await tx.weeklyReviews.patch(row.id, { overall_score: null, updated_date: '2026-11-15 14:00:00' }); });
      out.push(await s.weeklyReviews.getByWeek('2026-11-09'));
      await s.weeklyReviews.remove('~bYS9i');
      out.push(await s.weeklyReviews.list());
      return JSON.stringify(out);
    });
  }
  assert.equal(await replay(fire), await replay(sql));
});
