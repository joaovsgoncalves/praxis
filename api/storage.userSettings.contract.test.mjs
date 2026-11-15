import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteDriver } from './storage/sqlite/driver.js';
import { createFirestoreDriver } from './storage/firestore/driver.js';
import { USER_SETTINGS_FIELDS, USER_SETTINGS_DEFAULTS } from './storage/domains/phase4.js';

/** Conta nova: no SQLite apaga a linha que o preparo do banco cria, para os dois motores partirem do vazio. */
async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client;
  const driver = kind === 'sqlite' ? createSqliteDriver({
    open(owner) {
      if (!databases.has(owner)) { const db = createTestDb(); db.prepare('DELETE FROM user_settings').run(); databases.set(owner, db); }
      return databases.get(owner);
    },
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

test('sqlite: os padrões do domínio são os que o próprio SQLite grava para a linha nova', () => {
  const db = createTestDb();
  db.prepare('DELETE FROM user_settings').run();
  db.prepare('INSERT INTO user_settings (id) VALUES (?)').run('default');
  const row = db.prepare('SELECT * FROM user_settings').get();
  db.close();
  assert.deepEqual(Object.keys(row).sort(), [...USER_SETTINGS_FIELDS].sort(), 'mesmas colunas');
  assert.deepEqual(row, { ...USER_SETTINGS_DEFAULTS });
});

for (const kind of ['sqlite', 'firestore']) {
  test(`${kind}: contrato de configurações (linha única)`, { skip: kind === 'firestore' && !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
    const f = await fixture(kind); t.after(f.close);
    const { storage: s, as } = f;
    const row = (extra = {}) => ({ ...USER_SETTINGS_DEFAULTS, ...extra });

    await t.test('sem escopo falha fechado; conta nova não tem linha', async () => {
      await assert.rejects(() => s.userSettings.get(), { code: 'tenant_scope_missing' });
      await assert.rejects(() => s.userSettings.save(row()), { code: 'tenant_scope_missing' });
      assert.equal(await as('alice', () => s.userSettings.get()), null);
    });

    await t.test('linha incompleta, campo estranho, id diferente ou valor que o SQLite não guarda é recusado', async () => as('alice', async () => {
      const { pomodoro_break, ...missing } = row();
      assert.equal(pomodoro_break, 5);
      await assert.rejects(() => s.userSettings.save(missing), { code: 'incomplete_user_settings' });
      await assert.rejects(() => s.userSettings.save(row({ user_id: 'bob' })), { code: 'unknown_user_settings_field' });
      await assert.rejects(() => s.userSettings.save(row({ id: 'outra' })), { code: 'invalid_user_settings_id' });
      for (const bad of [true, {}, [1], Number.NaN, Infinity, undefined]) {
        await assert.rejects(() => s.userSettings.save(row({ full_name: bad })), { code: 'invalid_user_settings_value' }, String(bad));
      }
      await assert.rejects(() => s.userSettings.save([]), { code: 'invalid_user_settings' });
      assert.equal(await s.userSettings.get(), null, 'nada gravado');
    }));

    await t.test('grava e lê a linha exata, nas colunas do SQLite e na mesma ordem', async () => as('alice', async () => {
      await s.userSettings.save(row());
      const read = await s.userSettings.get();
      assert.deepEqual(read, row());
      assert.deepEqual(Object.keys(read), USER_SETTINGS_FIELDS);
      // Valores que a afinidade do SQLite deixa assim: texto em INTEGER, REAL em INTEGER, "5.0" em TEXT.
      const odd = row({ full_name: '5.0', avatar_url: '', pomodoro_focus: 'abc', pomodoro_break: 30.5, notif_habits: 0, list_density: null, focus_weekly_goal_minutes: 300 });
      await s.userSettings.save(odd);
      assert.deepEqual(await s.userSettings.get(), odd);
      if (kind === 'sqlite') {
        const raw = f.databases.get('alice').prepare('SELECT typeof(pomodoro_focus) AS a, typeof(pomodoro_break) AS b, typeof(full_name) AS c FROM user_settings').get();
        assert.deepEqual(raw, { a: 'text', b: 'real', c: 'text' }, 'tipos guardados iguais aos da rota antiga');
        assert.equal(f.databases.get('alice').prepare('SELECT COUNT(*) AS n FROM user_settings').get().n, 1, 'continua linha única');
      }
    }));

    await t.test('duas contas não se cruzam', async () => {
      await as('bob', () => s.userSettings.save(row({ full_name: 'Bob' })));
      assert.equal((await as('alice', () => s.userSettings.get())).full_name, '5.0');
      assert.equal((await as('bob', () => s.userSettings.get())).full_name, 'Bob');
    });

    await t.test('transação: lê antes de gravar; leitura depois de gravar e falha não deixam nada', async () => as('carol', async () => {
      await s.transaction(async (tx) => { assert.equal(await tx.userSettings.get(), null); await tx.userSettings.save(row({ full_name: 'Carol' })); });
      assert.equal((await s.userSettings.get()).full_name, 'Carol');
      await assert.rejects(() => s.transaction(async (tx) => { await tx.userSettings.save(row({ full_name: 'X' })); await tx.userSettings.get(); }), { code: 'transaction_read_after_write' });
      await assert.rejects(() => s.transaction(async (tx) => { await tx.userSettings.get(); await tx.userSettings.save(row({ full_name: 'Y' })); throw new Error('falhou depois'); }), /falhou depois/);
      assert.equal((await s.userSettings.get()).full_name, 'Carol', 'transações abortadas não gravaram');
    }));
  });
}
