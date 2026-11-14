import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverageView, emptyMovementsText, manualSubtotal, totalDisplay } from './financeCoverage.js';

const acc = (name, status) => ({ name, status });

test('extrato completo: zero é zero de verdade e o total aparece sem ressalva', () => {
  const view = coverageView({ status: 'complete', statement_through: '2026-11-13', accounts: [acc('Inter', 'complete'), acc('PicPay', 'manual')] });
  assert.equal(view.label, 'Extrato completo');
  assert.match(view.detail, /1 conta, lido até 13\/11/);
  assert.deepEqual(totalDisplay(view, 0), { known: true, qualifier: '' });
  assert.deepEqual(totalDisplay(view, 120.5), { known: true, qualifier: '' });
});

test('extrato parcial: mostra o que chegou como parcial, diz o que falta e não afirma zero', () => {
  const view = coverageView({
    status: 'partial',
    statement_through: '2026-11-13',
    accounts: [acc('Inter', 'complete'), acc('C6', 'none'), acc('Nubank', 'partial'), acc('Carteira', 'manual')],
  });
  assert.equal(view.label, 'Extrato parcial');
  assert.match(view.detail, /1 de 3 contas/);
  assert.match(view.detail, /Falta: C6, Nubank\./);
  assert.deepEqual(totalDisplay(view, 0), { known: false, qualifier: '' });
  assert.deepEqual(totalDisplay(view, 300), { known: true, qualifier: 'parcial' });
});

test('só lançamento à mão: o total é identificado e a data do saldo não vira data do extrato', () => {
  const view = coverageView({ status: 'manual_only', balance_at: '2026-11-13T15:00:00.000Z', accounts: [acc('Inter', 'none')] });
  assert.equal(view.label, 'Só lançado à mão');
  assert.match(view.detail, /saldo foi atualizado em 13\/11, mas saldo não é extrato/);
  assert.deepEqual(totalDisplay(view, 1370), { known: true, qualifier: 'à mão' });
  assert.deepEqual(totalDisplay(view, 0), { known: false, qualifier: '' });
  assert.equal(manualSubtotal(view, { out: 1370, count: 2 }), null);
});

test('sem extrato, lendo ou com erro: nenhum total vira número', () => {
  const none = coverageView({ status: 'unavailable', accounts: [] });
  assert.equal(none.label, 'Sem extrato');
  assert.equal(totalDisplay(none, 0).known, false);
  assert.equal(totalDisplay(coverageView(null), 50).known, false);
  const failed = coverageView({ status: 'complete', accounts: [] }, { failed: true });
  assert.equal(failed.status, 'error');
  assert.equal(totalDisplay(failed, 50).known, false);
  assert.equal(coverageView({ status: 'inventado' }).status, 'unavailable');
});

test('subtotal manual aparece quando está misturado com o extrato', () => {
  const view = coverageView({ status: 'complete', accounts: [acc('Inter', 'complete')] });
  assert.deepEqual(manualSubtotal(view, { out: -45.5, inn: 0, count: 2 }), { out: 45.5, in: 0, count: 2 });
  assert.equal(manualSubtotal(view, { out: 0, count: 0 }), null);
});

test('lista vazia de movimentações diz o que se sabe do período', () => {
  const range = { from: '2026-10-15', to: '2026-11-14' };
  assert.match(emptyMovementsText(coverageView({ status: 'complete', accounts: [acc('Inter', 'complete')] }), range).description, /de 15\/10 a 14\/11 veio completo/);
  const none = emptyMovementsText(coverageView({ status: 'unavailable', accounts: [] }), range);
  assert.equal(none.title, 'Sem extrato neste período');
  assert.match(none.description, /não quer dizer que não houve gasto/);
  assert.equal(emptyMovementsText(coverageView(null, { failed: true }), range).title, 'Não deu para ler o período');
});
