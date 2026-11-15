/**
 * Oráculo: cada caso é gravado no SQLite real (better-sqlite3) e comparado com o codec em JS.
 * O codec só pode divergir recusando explicitamente (`sqlite_coercion_unsupported`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { bindPositional, applyAffinity, sqliteRow, sqliteLimit, SQLITE_BIND_TYPE_MESSAGE } from './sqliteSemantics.js';

function real(fn) {
  try { return { ok: fn() }; } catch (error) { return { error: `${error.name}: ${error.message}` }; }
}
function emulated(fn) {
  try { return { ok: fn() }; } catch (error) {
    if (error.code === 'sqlite_coercion_unsupported') return { unsupported: true };
    return { error: `${error.name}: ${error.message}` };
  }
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('afinidade TEXT e INTEGER: codec igual ao SQLite real ou recusa explícita', (t) => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (a TEXT, b INTEGER)');
  const insert = db.prepare('INSERT INTO t (a, b) VALUES (?, ?)');
  const read = db.prepare('SELECT a, b FROM t WHERE rowid = ?');
  const next = rng(20261115);
  const corpus = [0, -0, 1, 5, -7, 1.5, 0.1, 0.25, 100, 999999999999999, 1e15, 1e16, 1e17, 1e21, 1e-4, 1e-5, 1 / 3, 2 / 3, NaN, Infinity, -Infinity, 2 ** 53, 2 ** 53 + 2,
    '4', ' 4', '4 ', '\t4\n', '\v4\f', '\r4', '\u00a04', '4\u00a0', '\u20034', '4.0', '4.5', '1e2', '1.5e1', '1e-2', '0x10', '+4', '-4', '.5', '5.', '', ' ', 'abc', '4abc', '00012', '-0', '-0.0', '3.0e0',
    '9223372036854775807', '9223372036854775808', '1e400', '1_000', '١', '4.50', '0.10000000000000001', '123456789012345678', null, undefined];
  for (let i = 0; i < 6000; i += 1) {
    const sign = next() < 0.3 ? -1 : 1;
    corpus.push(sign * Math.round(next() * 1e9));
    corpus.push(sign * Math.round(next() * 1e9) / 100); // valor de dinheiro com 2 casas
    corpus.push(sign * Math.round(next() * 1e5) / 10);
    corpus.push(String(sign * Math.round(next() * 1e7) / 100));
    corpus.push(`${' '.repeat(Math.floor(next() * 2))}${Math.round(next() * 1e6)}${next() < 0.5 ? '.0' : ''}`);
  }
  let compared = 0, refused = 0;
  for (const value of corpus) {
    const result = insert.run(value, value);
    const stored = read.get(result.lastInsertRowid);
    for (const [column, affinity] of [['a', 'TEXT'], ['b', 'INTEGER']]) {
      const mine = emulated(() => applyAffinity(bindPositional([value], 1)[0], affinity));
      if (mine.unsupported) { refused += 1; continue; }
      compared += 1;
      assert.ok('ok' in mine, `codec falhou para ${String(value)} ${affinity}: ${mine.error}`);
      assert.ok(Object.is(mine.ok, stored[column]) || (mine.ok === 0 && stored[column] === 0),
        `${affinity} ${JSON.stringify(value)}: codec ${JSON.stringify(mine.ok)} != SQLite ${JSON.stringify(stored[column])}`);
    }
  }
  t.diagnostic(`comparados=${compared} recusados=${refused}`);
  assert.ok(compared > 59000, `comparados ${compared}`);
  // O que é recusado é raro e é justamente onde o SQLite tem regra própria (17 dígitos, int64).
  assert.ok(refused < 40, `recusados ${refused}`);
  for (const [value, affinity] of [[1 / 3, 'TEXT'], [1e17, 'TEXT'], [1e-5, 'TEXT'], [Infinity, 'TEXT'], ['9223372036854775807', 'INTEGER'], ['1e400', 'INTEGER'], ['0.10000000000000001', 'INTEGER'], [2 ** 53, 'INTEGER']]) {
    assert.throws(() => applyAffinity(value, affinity), { code: 'sqlite_coercion_unsupported' }, `${value} ${affinity}`);
  }
  db.close();
});

test('ligação posicional: mesmos valores, mesmos erros e mesma ordem de erro do driver', (t) => {
  const db = new Database(':memory:');
  const statements = [1, 2, 3, 7].map((count) => [count, db.prepare(`SELECT ${Array.from({ length: count }, (_, i) => `? AS p${i}`).join(', ')}`)]);
  const pieces = [1, 'x', null, undefined, NaN, true, false, {}, { a: 1 }, [], [1], [1, 2], [undefined], [true], [{}], [[1]], [null, 'y'], Object.create(null)];
  const next = rng(42);
  const lists = [];
  for (const a of pieces) for (const b of pieces) lists.push([a, b]);
  for (let i = 0; i < 4000; i += 1) lists.push(Array.from({ length: 1 + Math.floor(next() * 8) }, () => pieces[Math.floor(next() * pieces.length)]));
  let checked = 0;
  for (const args of lists) {
    for (const [count, statement] of statements) {
      const truth = real(() => Object.values(statement.get(...args)));
      const mine = emulated(() => bindPositional(args, count));
      assert.ok(!mine.unsupported);
      assert.deepEqual(mine, truth, `${count} marcadores, args ${JSON.stringify(args, (k, v) => (v === undefined ? '<undef>' : Number.isNaN(v) ? '<NaN>' : v))}`);
      checked += 1;
    }
  }
  t.diagnostic(`listas_x_marcadores=${checked}`);
  assert.ok(checked > 16000);
  assert.throws(() => bindPositional([1n], 1), { code: 'sqlite_coercion_unsupported' });
  assert.throws(() => bindPositional([Buffer.from('a')], 1), { code: 'sqlite_coercion_unsupported' });
  assert.throws(() => bindPositional([Symbol('s')], 1), { message: SQLITE_BIND_TYPE_MESSAGE });
  db.close();
});

test('linha inteira e LIMIT seguem o SQLite real', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE r (h TEXT, s INTEGER)');
  const columns = [['h', 'TEXT'], ['s', 'INTEGER']];
  for (const args of [[5, '4'], [[1], 4.5], ['a', 'abc'], [null, null], [{ x: 1 }, 'a', 3], [[], 'a', 3]]) {
    const truth = real(() => { db.exec('DELETE FROM r'); db.prepare('INSERT INTO r VALUES (?, ?)').run(...args); return db.prepare('SELECT h, s FROM r').get(); });
    assert.deepEqual(emulated(() => sqliteRow(columns, args)), 'ok' in truth ? { ok: { ...truth.ok } } : truth, JSON.stringify(args));
  }
  const limit = db.prepare('SELECT 1 FROM (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3) LIMIT ?');
  for (const value of [-1, -5, 0, 1, 2, 2.0, 1.5, NaN, Infinity, -Infinity, 1e300]) {
    const truth = real(() => limit.all(value).length);
    const mine = emulated(() => { const n = sqliteLimit(value); return n === null ? 3 : Math.min(n, 3); });
    assert.deepEqual(mine, truth, `LIMIT ${value}`);
  }
  assert.throws(() => sqliteLimit(2 ** 60), { code: 'sqlite_coercion_unsupported' });
  assert.throws(() => sqliteLimit('2'), { code: 'sqlite_coercion_unsupported' });
  db.close();
});
