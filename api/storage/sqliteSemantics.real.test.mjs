/**
 * Oráculo da afinidade REAL (fase 5, finanças): cada caso é gravado no SQLite real e comparado com o
 * codec em JS. O codec só pode divergir recusando explicitamente (`sqlite_coercion_unsupported`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { bindPositional, applyRealAffinity, sqliteRowWithReal, sqliteStoredText } from './sqliteSemantics.js';

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

test('afinidade REAL: codec igual ao SQLite real ou recusa explícita', (t) => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (r REAL)');
  const insert = db.prepare('INSERT INTO t (r) VALUES (?)');
  const read = db.prepare('SELECT r FROM t WHERE rowid = ?');
  const next = rng(20261116);
  const corpus = [0, -0, 1, 5, -7, 1.5, 0.1, 0.25, 100, 0.1 + 0.2, 999999999999999, 1e15, 1e16, 1e21, 1e300, 1e-4, 1e-5, 1 / 3, NaN, Infinity, -Infinity, 2 ** 53, 2 ** 53 + 2,
    '4', ' 4', '4 ', '\t4\n', '\v4\f', '\r4', ' 4', '4 ', '4.0', '4.5', '1e2', '1.5e1', '1e-2', '0x10', '+4', '-4', '.5', '5.', '', ' ', 'abc', '4abc', '00012', '-0', '-0.0', '3.0e0',
    '9223372036854775807', '1e400', '1_000', '١', '4.50', '0.10000000000000001', '123456789012345678', '12345678901234567', '10.005', '1234.56', '-0.01', null, undefined];
  for (let i = 0; i < 6000; i += 1) {
    const sign = next() < 0.3 ? -1 : 1;
    corpus.push(sign * Math.round(next() * 1e9) / 100); // dinheiro com 2 casas
    corpus.push(sign * Math.round(next() * 1e12) / 100);
    corpus.push(sign * next() * 1e6);
    corpus.push(String(sign * Math.round(next() * 1e7) / 100));
    corpus.push(`${' '.repeat(Math.floor(next() * 2))}${Math.round(next() * 1e6)}${next() < 0.5 ? '.5' : ''}`);
  }
  let compared = 0, refused = 0;
  for (const value of corpus) {
    const stored = read.get(insert.run(value).lastInsertRowid).r;
    const mine = emulated(() => applyRealAffinity(bindPositional([value], 1)[0]));
    if (mine.unsupported) { refused += 1; continue; }
    compared += 1;
    assert.ok('ok' in mine, `codec falhou para ${String(value)}: ${mine.error}`);
    assert.ok(Object.is(mine.ok, stored), `REAL ${JSON.stringify(value)}: codec ${JSON.stringify(mine.ok)} != SQLite ${JSON.stringify(stored)} (${typeof stored})`);
  }
  t.diagnostic(`comparados=${compared} recusados=${refused}`);
  assert.ok(compared > 29000, `comparados ${compared}`);
  assert.ok(refused < 20, `recusados ${refused}`);
  // -0 volta 0 (o SQLite guarda o valor inteiro); texto não numérico continua texto.
  assert.ok(Object.is(applyRealAffinity(-0), 0));
  assert.equal(applyRealAffinity('0x10'), '0x10');
  assert.equal(applyRealAffinity(' 5.5 '), 5.5);
  for (const value of [Infinity, -Infinity, '1e400', '12345678901234567', 2 ** 53 + 2, true]) {
    assert.throws(() => applyRealAffinity(value), { code: 'sqlite_coercion_unsupported' }, String(value));
  }
  db.close();
});

test('linha com coluna REAL: mesma ligação e mesmos valores do SQLite real', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE r (h TEXT, s INTEGER, m REAL)');
  const columns = [['h', 'TEXT'], ['s', 'INTEGER'], ['m', 'REAL']];
  for (const args of [[5, '4', '10.50'], [[1], 4.5, 3], ['a', 'abc', 'abc'], [null, null, null], [{ x: 1 }, 'a', 3, 4], [[], 'a', 3, 1], ['a', 1, [2.25]], ['a', 1, -0], ['a', 1, {}]]) {
    const truth = real(() => { db.exec('DELETE FROM r'); db.prepare('INSERT INTO r VALUES (?, ?, ?)').run(...args); return db.prepare('SELECT h, s, m FROM r').get(); });
    assert.deepEqual(emulated(() => sqliteRowWithReal(columns, args)), 'ok' in truth ? { ok: { ...truth.ok } } : truth, JSON.stringify(args));
  }
  db.close();
});

test('texto com substituto UTF-16 solto: igual ao que o SQLite real devolve', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE s (t TEXT)');
  const insert = db.prepare('INSERT INTO s (t) VALUES (?)'), read = db.prepare('SELECT t FROM s WHERE rowid = ?');
  const emoji = '😀', high = emoji[0], low = emoji[1];
  const corpus = ['', 'abc', emoji, `${emoji}abc`.slice(1), `x${emoji}`.slice(0, 2), high, low, `${low}${high}`, `${high}${high}${low}`, `a${low}b${high}`, `${'a'.repeat(119)}${emoji}`.slice(0, 120),
    'ação', '�', `${high}�`, `${emoji}${emoji}`.slice(1, 3)];
  for (let code = 0xd800; code <= 0xdfff; code += 97) corpus.push(`a${String.fromCharCode(code)}z`);
  for (const value of corpus) {
    const stored = read.get(insert.run(value).lastInsertRowid).t;
    assert.equal(sqliteStoredText(value), stored, JSON.stringify(value));
  }
  assert.equal(sqliteStoredText(5), 5);
  db.close();
});
