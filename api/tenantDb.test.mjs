import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { createTenantDb, TenantScopeError } from './lib/tenantDb.js';

function setup(t) {
  const files = new Map();
  const boot = new Database(':memory:');
  const tenant = createTenantDb({
    bootDb: boot,
    open: (id) => {
      if (id === 'jota') return boot;
      const db = new Database(':memory:');
      files.set(id, db);
      return db;
    },
  });
  t.after(() => { tenant.closeAll(); });
  const schema = 'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, body TEXT)';
  tenant.db.exec(schema); // subida: vai para o banco legado
  tenant.runAs('bia', () => tenant.db.exec(schema));
  return { tenant, boot, files };
}

test('cada pessoa lê e grava só no próprio banco, mesmo com statement guardado', (t) => {
  const { tenant } = setup(t);
  const { db } = tenant;
  const insert = db.prepare('INSERT INTO notes (slug, body) VALUES (?, ?)'); // guardado fora de escopo, como nas fábricas de rota
  const list = db.prepare('SELECT body FROM notes ORDER BY id').pluck();
  const count = db.prepare('SELECT count(*) AS n FROM notes');

  tenant.runAs('jota', () => { insert.run('casa', 'do jota'); insert.run('carro', 'parcela'); });
  tenant.runAs('bia', () => {
    assert.equal(count.get().n, 0, 'a conta nova nasce vazia');
    insert.run('casa', 'da bia'); // mesmo slug único: não colide com o do Jota
  });

  assert.deepEqual(tenant.runAs('jota', () => list.all()), ['do jota', 'parcela']);
  assert.deepEqual(tenant.runAs('bia', () => list.all()), ['da bia']);
  // o mesmo SQL sem pluck não herda o modificador de outro statement
  assert.deepEqual(tenant.runAs('bia', () => db.prepare('SELECT body FROM notes ORDER BY id').all()), [{ body: 'da bia' }]);
});

test('o escopo acompanha a requisição depois de await, com duas pessoas intercaladas', async (t) => {
  const { tenant } = setup(t);
  const { db } = tenant;
  const insert = db.prepare('INSERT INTO notes (slug, body) VALUES (?, ?)');
  const work = (user, n) => tenant.runAs(user, async () => {
    for (let i = 0; i < n; i += 1) {
      await sleep(Math.random() * 4);
      insert.run(`${user}-${i}`, user);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(tenant.currentUserId(), user);
    }
    return db.prepare('SELECT DISTINCT body FROM notes').pluck().all();
  });
  const [jota, bia] = await Promise.all([work('jota', 25), work('bia', 25)]);
  assert.deepEqual(jota, ['jota']);
  assert.deepEqual(bia, ['bia']);
});

test('transação roda e desfaz no banco de quem chamou', (t) => {
  const { tenant } = setup(t);
  const { db } = tenant;
  const add = db.transaction((rows) => {
    for (const [slug, body] of rows) db.prepare('INSERT INTO notes (slug, body) VALUES (?, ?)').run(slug, body);
  });
  tenant.runAs('bia', () => add([['a', '1'], ['b', '2']]));
  assert.throws(() => tenant.runAs('jota', () => add.immediate([['x', '1'], ['x', 'repetido']])), /UNIQUE/);
  const n = (user) => tenant.runAs(user, () => db.prepare('SELECT count(*) FROM notes').pluck().get());
  assert.equal(n('bia'), 2);
  assert.equal(n('jota'), 0, 'a transação que falhou desfez tudo, e só no banco do Jota');
});

test('depois de selar, usar o banco sem dono falha fechado', (t) => {
  const { tenant } = setup(t);
  const { db } = tenant;
  const count = db.prepare('SELECT count(*) AS n FROM notes');
  assert.equal(count.get().n, 0, 'durante a subida ainda responde pelo banco legado');
  tenant.seal();
  assert.throws(() => count.get(), TenantScopeError);
  assert.throws(() => db.exec('DELETE FROM notes'), TenantScopeError);
  assert.throws(() => db.transaction(() => {})(), TenantScopeError);
  assert.equal(tenant.runAs('jota', () => count.get().n), 0);
});

test('identidade estranha não escolhe arquivo, e fechar pela fachada não derruba ninguém', (t) => {
  const { tenant } = setup(t);
  for (const bad of ['', '../jota', 'a/b', 'x'.repeat(65), null, 12]) {
    assert.throws(() => tenant.runAs(bad, () => 1), TenantScopeError);
  }
  tenant.runAs('bia', () => tenant.db.close());
  assert.equal(tenant.runAs('bia', () => tenant.db.prepare('SELECT 1 AS ok').get().ok), 1);
  assert.deepEqual(tenant.openedUserIds().sort(), ['bia']);
});
