import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure, failureMessage, kindFromStatus } from './apiFailure.js';

test('cada status vira uma causa diferente', () => {
  assert.equal(kindFromStatus(401), 'session');
  assert.equal(kindFromStatus(403), 'forbidden');
  assert.equal(kindFromStatus(404), 'not_found');
  assert.equal(kindFromStatus(500), 'server');
  assert.equal(kindFromStatus(503), 'server');
  assert.equal(kindFromStatus(422), 'client');
  assert.equal(kindFromStatus(200), 'unknown');
});

test('a causa marcada pelo cliente vale mais que o status', () => {
  assert.equal(classifyFailure({ kind: 'offline' }), 'offline');
  assert.equal(classifyFailure({ kind: 'network', status: 500 }), 'network');
  assert.equal(classifyFailure({ status: 401 }), 'session');
  assert.equal(classifyFailure(new Error('qualquer')), 'unknown');
  assert.equal(classifyFailure(null), 'unknown');
});

test('mensagens distintas por causa; o genérico só cobre o desconhecido', () => {
  const kinds = ['session', 'forbidden', 'offline', 'network', 'not_found', 'server'];
  const messages = kinds.map((kind) => failureMessage({ kind }, 'GENÉRICO'));
  assert.equal(new Set(messages).size, kinds.length);
  assert.ok(messages.every((message) => message !== 'GENÉRICO'));
  assert.equal(failureMessage({ status: 422 }, 'GENÉRICO'), 'GENÉRICO');
  assert.equal(failureMessage(new Error('x'), 'GENÉRICO'), 'GENÉRICO');
});

test('falha de servidor mostra a referência curta do pedido', () => {
  assert.match(failureMessage({ status: 500, requestId: 'abcdef1234567890' }), /\(ref\. abcdef12\)$/);
  assert.doesNotMatch(failureMessage({ status: 403, requestId: 'abcdef1234567890' }), /ref\./);
});
