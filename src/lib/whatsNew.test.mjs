import test from 'node:test';
import assert from 'node:assert/strict';
import { EDIT_QUIET_MS, isUserBusy, shouldShowWhatsNew } from './whatsNew.js';

test('mostra a release nova só para quem ainda não viu o id dela', () => {
  assert.equal(shouldShowWhatsNew(null, { id: 'a' }), true);
  assert.equal(shouldShowWhatsNew('a', { id: 'a' }), false);
  assert.equal(shouldShowWhatsNew('a', null), false);
});

test('o aviso espera enquanto há painel aberto ou cursor num campo', () => {
  assert.equal(isUserBusy({ overlayOpen: true }), true);
  assert.equal(isUserBusy({ focusInField: true }), true);
});

test('quem acabou de digitar ainda está editando, mesmo com o cursor fora do campo', () => {
  assert.equal(isUserBusy({ msSinceLastInput: 500 }), true);
  assert.equal(isUserBusy({ msSinceLastInput: EDIT_QUIET_MS - 1 }), true);
  assert.equal(isUserBusy({ msSinceLastInput: EDIT_QUIET_MS }), false);
});

test('tela parada libera o aviso', () => {
  assert.equal(isUserBusy({}), false);
  assert.equal(isUserBusy({ overlayOpen: false, focusInField: false, msSinceLastInput: null }), false);
});
