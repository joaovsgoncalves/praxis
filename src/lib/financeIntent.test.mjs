import assert from 'node:assert/strict';
import { test } from 'node:test';
import { intentKeyFor, markUnconfirmed, outcomeUnknown, pendingIntent, settleIntent } from './financeIntent.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}
function counter() {
  let n = 0;
  return () => `k${(n += 1)}`;
}

test('mesma baixa reenviada usa a mesma chave; outro valor ou outra dívida é outra intenção', () => {
  const opts = { storage: memoryStorage(), now: 1000, makeKey: counter() };
  const first = intentKeyFor('pay:d1', { amount: 25 }, opts);
  assert.equal(intentKeyFor('pay:d1', { amount: 25 }, opts), first);
  assert.notEqual(intentKeyFor('pay:d1', { amount: 30 }, opts), first);
  assert.notEqual(intentKeyFor('pay:d2', { amount: 30 }, opts), intentKeyFor('pay:d1', { amount: 30 }, opts));
});

test('depois de concluir, a mesma baixa de novo é uma segunda intenção legítima', () => {
  const opts = { storage: memoryStorage(), now: 1000, makeKey: counter() };
  const first = intentKeyFor('pay:d1', { amount: 25 }, opts);
  settleIntent('pay:d1', opts);
  assert.notEqual(intentKeyFor('pay:d1', { amount: 25 }, opts), first);
});

test('tentativa sem confirmação sobrevive ao fechar o diálogo e some depois do prazo', () => {
  const storage = memoryStorage();
  const makeKey = counter();
  const key = intentKeyFor('pay:d1', { amount: 25 }, { storage, now: 1000, makeKey });
  assert.equal(pendingIntent('pay:d1', { storage, now: 1000 }), null);
  markUnconfirmed('pay:d1', { storage, now: 1000 });
  assert.deepEqual(pendingIntent('pay:d1', { storage, now: 60_000 }), { key, payload: { amount: 25 } });
  assert.equal(intentKeyFor('pay:d1', { amount: 25 }, { storage, now: 60_000, makeKey }), key);
  assert.equal(pendingIntent('pay:d1', { storage, now: 31 * 60 * 1000 + 1000 }), null);
  assert.notEqual(intentKeyFor('pay:d1', { amount: 25 }, { storage, now: 31 * 60 * 1000 + 1000, makeKey }), key);
});

test('sem armazenamento a chave ainda sai, só não é lembrada', () => {
  const key = intentKeyFor('spend', { amount: -10 }, { storage: null, now: 1, makeKey: () => 'solta' });
  assert.equal(key, 'solta');
});

test('só queda de rede ou erro do servidor deixam dúvida se gravou', () => {
  assert.equal(outcomeUnknown({ kind: 'network' }), true);
  assert.equal(outcomeUnknown({ status: 502 }), true);
  assert.equal(outcomeUnknown({ kind: 'offline' }), false);
  assert.equal(outcomeUnknown({ status: 400 }), false);
  assert.equal(outcomeUnknown({ status: 409 }), false);
});
