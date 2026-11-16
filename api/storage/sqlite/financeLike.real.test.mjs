/**
 * `sqliteLike` (usado pelo motor Firestore na busca `q` do extrato) contra o LIKE do SQLite real:
 * sem ESCAPE, `%` e `_` curinga, minúsculas só ASCII, NULL em qualquer lado dá NULL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { sqliteLike, SQLITE_LIKE_MAX_PATTERN } from './financeLike.js';

const VALUES = [
  'Mercado Livre', 'mercado livre', 'MERCADO', 'Pão de Açúcar', 'PÃO DE AÇÚCAR', 'pão de açúcar', 'Café', 'CAFÉ', 'café',
  '', ' ', 'a', 'A', 'ab', 'abc', 'aBc', 'a%c', 'a_c', '100%', '50_50', 'x\ny', 'tab\tx', '😀', 'a😀b', '😀😀', 'İ', 'ß', 'SS', 'ı', 'I',
  'PIX ENVIADO JOAO', 'Uber *Trip', 'iFood', 'IFOOD*ZAZ', 'a\\b', 'a\\%', '%', '_', '%%', '__',
];
const PATTERNS = [
  '', '%', '%%', '_', '__', '___', 'a', 'A', 'a%', '%a', '%a%', 'a_c', 'a%c', 'A_C', '%livre', '%LIVRE%', '%mercado%', '%pão%', '%PÃO%', '%café%', '%CAFÉ%',
  '%ç%', '%Ç%', '%😀%', '_😀_', '__', '😀', '_', '%_%', '%\\%%', 'a\\b', '%\\_%', 'x_y', 'x%y', '%\n%', '%\t%', '%i%', '%İ%', '%ß%', '%ss%', '%ı%',
  '%pix%', '%uber *%', '%*%', '100\\%', '100%', '50_50', '50__50', '%%%a', 'a%%%', '%a%b%c%',
];

test('LIKE: mesmo resultado do SQLite real para valores e padrões com acento, emoji, curingas e barra', () => {
  const db = new Database(':memory:');
  const real = db.prepare('SELECT ? LIKE ? AS r');
  let compared = 0, trues = 0;
  for (const value of VALUES) {
    for (const pattern of PATTERNS) {
      const expected = real.get(value, pattern).r;
      const actual = sqliteLike(value, pattern);
      assert.equal(actual, expected === null ? null : expected === 1, `${JSON.stringify(value)} LIKE ${JSON.stringify(pattern)}`);
      compared += 1; if (expected === 1) trues += 1;
    }
  }
  assert.ok(trues > 60 && compared - trues > 60, `mistura de verdadeiros (${trues}) e falsos (${compared - trues})`);
  db.close();
});

test('LIKE: NULL em qualquer lado dá NULL', () => {
  const db = new Database(':memory:');
  for (const [value, pattern] of [[null, '%a%'], ['a', null], [null, null]]) {
    assert.equal(real(db, value, pattern), null);
    assert.equal(sqliteLike(value, pattern), null);
  }
  db.close();
});

function real(db, value, pattern) { return db.prepare('SELECT ? LIKE ? AS r').get(value, pattern).r; }

test('LIKE: padrão acima do limite do SQLite é recusado como o SQLite recusa', () => {
  const db = new Database(':memory:');
  const huge = '%' + 'a'.repeat(SQLITE_LIKE_MAX_PATTERN);
  assert.throws(() => real(db, 'a', huge), /LIKE or GLOB pattern too complex/);
  assert.throws(() => sqliteLike('a', huge), { message: /LIKE or GLOB pattern too complex/ });
  const ok = 'a'.repeat(SQLITE_LIKE_MAX_PATTERN);
  assert.equal(real(db, 'a', ok), 0);
  assert.equal(sqliteLike('a', ok), false);
  db.close();
});

test('LIKE: ordem aleatória reproduzível, 3000 pares ASCII/UTF-8 mistos', () => {
  const db = new Database(':memory:');
  const alphabet = ['a', 'A', 'b', 'ç', 'Ç', '😀', '%', '_', ' ', '\\', 'é', 'É'];
  let seed = 12345;
  const next = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const make = (max) => Array.from({ length: next(max) }, () => alphabet[next(alphabet.length)]).join('');
  for (let i = 0; i < 3000; i += 1) {
    const value = make(6), pattern = make(5);
    assert.equal(sqliteLike(value, pattern), real(db, value, pattern) === 1, `${JSON.stringify(value)} LIKE ${JSON.stringify(pattern)}`);
  }
  db.close();
});
