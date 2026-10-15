import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_REVEAL_KEY, markDashboardRevealed, shouldRevealDashboard } from './dashboardReveal.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test('primeira visita da sessão anima; depois de marcar, não anima mais', () => {
  const storage = memoryStorage();
  assert.equal(shouldRevealDashboard(storage), true);
  markDashboardRevealed(storage);
  assert.equal(storage.getItem(DASHBOARD_REVEAL_KEY), '1');
  assert.equal(shouldRevealDashboard(storage), false);
});

test('sessionStorage bloqueado: não anima e não quebra', () => {
  const broken = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
  };
  assert.equal(shouldRevealDashboard(broken), false);
  assert.doesNotThrow(() => markDashboardRevealed(broken));
});
