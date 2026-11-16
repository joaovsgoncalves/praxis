/**
 * Contrato dos repositórios de foco (`focus_sessions`) e bem-estar (`wellness_checks`) nos dois
 * motores: mesma ordem, mesmos tipos, mesmo isolamento por dono, mesmas recusas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';
import { FOCUS_FIELDS, WELLNESS_FIELDS } from './storage/domains/phase3.js';

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
    storage: createStorage({ driver, currentOwner: () => scope.getStore() }),
    as: (owner, fn) => scope.run(owner, fn),
    databases,
    close: async () => { for (const db of databases.values()) db.close(); if (client) await client.terminate(); },
  };
}

const focus = (id, extra = {}) => ({ id, task_id: null, task_title: null, date: '2026-11-10', duration_seconds: 60, created_date: '2026-11-10 10:00:00', ...extra });
const check = (id, extra = {}) => ({ id, date: '2026-11-10', sleep_hours: 7, sleep_quality: 3, mood: 3, productivity: 3, note: '', created_date: '2026-11-10 10:00:00', ...extra });

async function legacyFocus(s) {
  // Empates de carimbo, NULL e linhas de várias tarefas, como um banco antigo pode ter.
  for (const row of [
    focus('b'), focus('a'), focus('novo', { created_date: '2026-11-12 08:00:00', date: '2026-11-12' }),
    focus('nulo', { created_date: null }), focus('c', { task_id: 't1', task_title: 'Um', duration_seconds: 300 }),
    focus('d', { task_id: 't1', task_title: 'Um', duration_seconds: 300 }), focus('e', { task_id: 't1', task_title: 'Outro', duration_seconds: 600 }),
    focus('f', { task_id: 't0', duration_seconds: 600 }), focus('g', { duration_seconds: null, created_date: '2026-11-01 00:00:00' }),
    focus('h', { task_id: 't2', task_title: 'Dois', duration_seconds: null }),
  ]) await s.focusSessions.create(row);
}
async function legacyWellness(s) {
  for (const row of [
    check('w1', { date: '2026-11-09' }), check('w2', { date: '2026-11-10', mood: 5 }), check('w3', { date: '2026-11-10', mood: 1 }),
    check('w4', { date: '2026-11-11', sleep_hours: 6.5, note: null }), check('w5', { date: '5.0', mood: 'bom', sleep_hours: null }),
  ]) await s.wellnessChecks.create(row);
}

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de foco e bem-estar`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;

    await t.test('sem escopo falha fechado; linha incompleta, campo estranho ou tipo errado é recusado', async () => {
      await assert.rejects(() => s.focusSessions.list(), { code: 'tenant_scope_missing' });
      await assert.rejects(() => s.wellnessChecks.findByDate('2026-11-10'), { code: 'tenant_scope_missing' });
      await as('alice', async () => {
        await assert.rejects(() => s.focusSessions.create({ id: 'x', date: '2026-11-10' }), { code: 'incomplete_row' });
        await assert.rejects(() => s.focusSessions.create({ ...focus('x'), user_id: 'bob' }), { code: 'unknown_field' });
        await assert.rejects(() => s.focusSessions.create(focus('x', { task_id: 5 })), { code: 'invalid_value' });
        await assert.rejects(() => s.wellnessChecks.create(check('x', { date: null })), { code: 'invalid_value' });
        await assert.rejects(() => s.wellnessChecks.create(check('x', { sleep_hours: {} })), { code: 'invalid_value' });
        await assert.rejects(() => s.focusSessions.list({ date: 5 }), { code: 'invalid_query' });
        await assert.rejects(() => s.focusSessions.list({ limit: 0 }), { code: 'invalid_query' });
        await assert.rejects(() => s.wellnessChecks.findByDate(null), { code: 'invalid_query' });
        assert.deepEqual(await s.focusSessions.list(), []);
      });
    });

    await t.test('foco: ordem do SQLite (carimbo decrescente, NULL por último, empate na ordem de inserção), filtro e limite', async () => as('ordem', async () => {
      await legacyFocus(s);
      const all = await s.focusSessions.list();
      assert.deepEqual(all.map((r) => r.id), ['novo', 'b', 'a', 'c', 'd', 'e', 'f', 'h', 'g', 'nulo']);
      assert.deepEqual(Object.keys(all[0]), FOCUS_FIELDS);
      assert.deepEqual((await s.focusSessions.list({ date: '2026-11-12' })).map((r) => r.id), ['novo']);
      assert.deepEqual((await s.focusSessions.list({ limit: 3 })).map((r) => r.id), ['novo', 'b', 'a']);
      assert.deepEqual(await s.focusSessions.get('c'), focus('c', { task_id: 't1', task_title: 'Um', duration_seconds: 300 }));
      assert.equal(await s.focusSessions.get('nope'), null);
    }));

    await t.test('foco: estatística agrupa por tarefa e título, soma inteira, ordem por total com empate na ordem do grupo', async () => as('ordem', async () => {
      const rows = await s.focusSessions.stats({ since: '2026-11-05' });
      assert.deepEqual(rows, [
        { task_id: 't0', task_title: '(sem tarefa)', total_seconds: 600, sessions: 1 },
        { task_id: 't1', task_title: 'Outro', total_seconds: 600, sessions: 1 },
        { task_id: 't1', task_title: 'Um', total_seconds: 600, sessions: 2 },
        { task_id: null, task_title: '(sem tarefa)', total_seconds: 180, sessions: 3 },
        { task_id: 't2', task_title: 'Dois', total_seconds: null, sessions: 1 },
      ]);
      assert.deepEqual((await s.focusSessions.stats({ since: '2026-11-05', limit: 2 })).map((r) => r.task_title), ['(sem tarefa)', 'Outro']);
      // Comparação de texto do SQLite: '2026-11-10 10:00:00' < '2026-11-10T...' (espaço antes de T).
      assert.deepEqual((await s.focusSessions.stats({ since: '2026-11-10T00:00:00.000Z' })).map((r) => r.task_id), [null]);
    }));

    await t.test('foco: soma que o Firestore não reproduz é recusada lá; o SQLite segue exato', async () => as('fracao', async () => {
      await s.focusSessions.create(focus('frac', { duration_seconds: 12.5 }));
      if (kind === 'sqlite') assert.equal((await s.focusSessions.stats({ since: '2000' }))[0].total_seconds, 12.5);
      else await assert.rejects(() => s.focusSessions.stats({ since: '2000' }), { code: 'sqlite_coercion_unsupported' });
    }));

    await t.test('bem-estar: ordem por data decrescente com empate na inserção; busca por data acha o primeiro inserido', async () => as('ordem', async () => {
      await legacyWellness(s);
      const all = await s.wellnessChecks.list();
      // Texto em bytes: '5.0' > '2026-...'.
      assert.deepEqual(all.map((r) => r.id), ['w5', 'w4', 'w2', 'w3', 'w1']);
      assert.deepEqual(Object.keys(all[0]), WELLNESS_FIELDS);
      assert.deepEqual(all.find((r) => r.id === 'w5'), check('w5', { date: '5.0', mood: 'bom', sleep_hours: null }));
      assert.deepEqual((await s.wellnessChecks.list({ date: '2026-11-10', limit: 1 })).map((r) => r.id), ['w2']);
      assert.equal((await s.wellnessChecks.findByDate('2026-11-10')).id, 'w2');
      assert.equal(await s.wellnessChecks.findByDate('2026-12-01'), null);
      assert.equal((await s.wellnessChecks.findByDate('5.0')).id, 'w5');
    }));

    await t.test('bem-estar: alteração só dos campos do dia; id, data e criação imutáveis; inexistente = not_found', async () => as('ordem', async () => {
      for (const bad of [{ id: 'z' }, { date: '2026-01-01' }, { created_date: '2026-01-01 00:00:00' }]) await assert.rejects(() => s.wellnessChecks.patch('w1', bad), { code: 'immutable_field' });
      await assert.rejects(() => s.wellnessChecks.patch('w1', {}), { code: 'empty_patch' });
      await assert.rejects(() => s.wellnessChecks.patch('nope', { mood: 1 }), { code: 'not_found' });
      await s.wellnessChecks.patch('w1', { mood: 4, sleep_hours: 8.25, note: 'ok' });
      assert.deepEqual(await s.wellnessChecks.get('w1'), check('w1', { date: '2026-11-09', mood: 4, sleep_hours: 8.25, note: 'ok' }));
    }));

    await t.test('duas contas não se cruzam; id repetido é already_exists; transação abortada não deixa nada', async () => {
      await as('alice', () => s.wellnessChecks.create(check('mesmo')));
      await as('bob', () => s.wellnessChecks.create(check('mesmo', { note: 'do bob' })));
      assert.equal((await as('alice', () => s.wellnessChecks.get('mesmo'))).note, '');
      assert.equal((await as('bob', () => s.wellnessChecks.get('mesmo'))).note, 'do bob');
      await as('alice', async () => {
        await assert.rejects(() => s.wellnessChecks.create(check('mesmo')), { code: 'already_exists' });
        await assert.rejects(() => s.focusSessions.create(focus('f1')).then(() => s.focusSessions.create(focus('f1'))), { code: 'already_exists' });
        await assert.rejects(() => s.transaction(async (tx) => {
          assert.equal(await tx.wellnessChecks.findByDate('2026-12-24'), null);
          await tx.wellnessChecks.create(check('natal', { date: '2026-12-24' }));
          throw new Error('aborta');
        }), /aborta/);
        assert.equal(await s.wellnessChecks.get('natal'), null);
        await assert.rejects(() => s.transaction(async (tx) => {
          await tx.wellnessChecks.patch('mesmo', { mood: 1 });
          await tx.wellnessChecks.findByDate('2026-11-10');
        }), { code: 'transaction_read_after_write' });
        assert.equal((await s.wellnessChecks.get('mesmo')).mood, 3);
      });
    });
  });
}

test('sqlite: colunas do repositório = colunas reais das tabelas (SELECT * da rota antiga)', () => {
  const db = createTestDb();
  t_columns(db, 'focus_sessions', FOCUS_FIELDS);
  t_columns(db, 'wellness_checks', WELLNESS_FIELDS);
  db.close();
});
function t_columns(db, table, fields) {
  assert.deepEqual(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name), fields, table);
}

test('foco e bem-estar: mesmos dados, mesma ordem, byte a byte, nos dois motores', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const sql = await fixture('sqlite'), fire = await fixture('firestore');
  t.after(sql.close); t.after(fire.close);
  const replay = (f) => f.as('paridade', async () => {
    await legacyFocus(f.storage); await legacyWellness(f.storage);
    const s = f.storage;
    return JSON.stringify([await s.focusSessions.list(), await s.focusSessions.list({ date: '2026-11-10', limit: 4 }),
      await s.focusSessions.stats({ since: '2026-11-01 00:00:00' }), await s.wellnessChecks.list(), await s.wellnessChecks.findByDate('2026-11-10')]);
  });
  assert.equal(await replay(fire), await replay(sql));
});
