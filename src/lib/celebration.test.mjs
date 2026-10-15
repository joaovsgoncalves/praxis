import test from 'node:test';
import assert from 'node:assert/strict';
import { prefersReducedMotion, sparkAt, sparkFromElement, fireConfetti } from './celebration.js';

function withMatchMedia(matches, fn) {
  const previous = globalThis.window;
  const queries = [];
  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844,
    matchMedia: (query) => {
      queries.push(query);
      return { matches, media: query };
    },
  };
  return Promise.resolve(fn(queries)).finally(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
}

test('sem window (SSR/teste), não considera movimento reduzido', () => {
  assert.equal(prefersReducedMotion(), false);
});

test('lê a media query prefers-reduced-motion: reduce', () =>
  withMatchMedia(true, (queries) => {
    assert.equal(prefersReducedMotion(), true);
    assert.deepEqual(queries, ['(prefers-reduced-motion: reduce)']);
  }));

test('sem movimento reduzido, devolve false', () =>
  withMatchMedia(false, () => {
    assert.equal(prefersReducedMotion(), false);
  }));

test('matchMedia que lança erro não derruba a tela', async () => {
  globalThis.window = {
    matchMedia: () => {
      throw new Error('boom');
    },
  };
  try {
    assert.equal(prefersReducedMotion(), false);
  } finally {
    delete globalThis.window;
  }
});

test('com movimento reduzido, nenhum confete dispara (nem carrega a lib)', () =>
  withMatchMedia(true, async () => {
    assert.equal(await sparkAt(100, 200), false);
    assert.equal(await fireConfetti({ particleCount: 3 }), false);
    const el = { getBoundingClientRect: () => ({ left: 10, top: 10, width: 20, height: 20 }) };
    assert.equal(await sparkFromElement(el, 'ember'), false);
  }));

test('sparkFromElement sem elemento não faz nada', async () => {
  assert.equal(await sparkFromElement(null), false);
});
