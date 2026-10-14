import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { layoutTimedBlocks, taskBlock, TIMELINE_MIN_BLOCK_MINUTES } from '../src/lib/taskLenses.js';

describe('layoutTimedBlocks', () => {
  it('keeps a single block full width', () => {
    const [a] = layoutTimedBlocks([
      { id: 'a', start: '09:00', end: '10:00' },
    ]);
    assert.equal(a.col, 0);
    assert.equal(a.cols, 1);
  });

  it('puts two overlapping blocks side by side', () => {
    const laid = layoutTimedBlocks([
      { id: 'a', start: '09:00', end: '10:00' },
      { id: 'b', start: '09:00', end: '10:00' },
    ]);
    const cols = new Set(laid.map((x) => x.col));
    assert.equal(cols.size, 2);
    assert.equal(laid[0].cols, 2);
    assert.equal(laid[1].cols, 2);
  });

  it('does not shrink a later non-overlapping block', () => {
    const laid = layoutTimedBlocks([
      { id: 'a', start: '09:00', end: '10:00' },
      { id: 'b', start: '09:30', end: '10:30' },
      { id: 'c', start: '14:00', end: '15:00' },
    ]);
    const c = laid.find((x) => x.id === 'c');
    assert.equal(c.col, 0);
    assert.equal(c.cols, 1);
  });

  it('puts short blocks side by side when the minimum height makes them collide on screen', () => {
    // Dado real de 14/10: 10 min às 17:30 é desenhado com altura mínima e alcançaria o bloco das 17:45.
    const clipe = { id: 'clipe', date: '2026-10-14', time: '17:30', duration_minutes: 10 };
    const loki = { id: 'loki', date: '2026-10-14', time: '17:45', duration_minutes: 30 };
    const laid = layoutTimedBlocks([clipe, loki].map((task) => ({ id: task.id, ...taskBlock(task) })));

    assert.ok(TIMELINE_MIN_BLOCK_MINUTES > 15, 'altura mínima cobre mais que o intervalo entre os dois');
    assert.equal(laid[0].cols, 2);
    assert.equal(laid[1].cols, 2);
    assert.notEqual(laid[0].col, laid[1].col);
  });

  it('keeps short blocks in one column when they do not touch on screen', () => {
    const laid = layoutTimedBlocks([
      { id: 'a', start: '09:00', end: '09:10' },
      { id: 'b', start: '10:00', end: '10:30' },
    ]);
    assert.deepEqual(laid.map((x) => x.cols), [1, 1]);
  });
});
