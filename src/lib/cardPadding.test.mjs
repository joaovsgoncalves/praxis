import test from 'node:test';
import assert from 'node:assert/strict';
import { twMerge } from 'tailwind-merge';
import { cardContentPadding } from './cardPadding.js';

const merged = (className) => twMerge(cardContentPadding(className), className).split(' ').sort().join(' ');
const sorted = (value) => value.split(' ').sort().join(' ');

test('sem padding próprio mantém o default de depois do header', () => {
  assert.equal(merged('space-y-4'), sorted('pt-0 pb-5 px-5 sm:pt-0 sm:pb-6 sm:px-6 space-y-4'));
});

test('card sem header com p-5 não perde o topo no desktop', () => {
  const out = merged('space-y-3 p-5');
  assert.equal(out, sorted('space-y-3 p-5'));
  assert.ok(!out.includes('sm:pt-0'));
});

test('p-4 vale em todos os tamanhos (Compras parceladas)', () => {
  assert.equal(merged('grid gap-3 p-4 sm:grid-cols-3'), sorted('grid gap-3 p-4 sm:grid-cols-3'));
});

test('py-12 do timer mantém laterais responsivas e topo real', () => {
  assert.equal(merged('py-12 flex'), sorted('px-5 sm:px-6 py-12 flex'));
});

test('consumidor depois do header (px/pb + sm:) continua com topo zero', () => {
  assert.equal(
    merged('space-y-2.5 px-5 pb-5 sm:px-5 sm:pb-5'),
    sorted('pt-0 sm:pt-0 space-y-2.5 px-5 pb-5 sm:px-5 sm:pb-5'),
  );
});

test('variantes sm: do consumidor seguem ganhando do default', () => {
  assert.equal(merged('p-5 sm:p-6'), sorted('p-5 sm:p-6'));
  assert.equal(merged('sm:p-4'), sorted('pt-0 pb-5 px-5 sm:p-4'));
});
