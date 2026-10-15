import test from 'node:test';
import assert from 'node:assert/strict';
import { weekStripHint, formatDayLabel } from './taskWeekStrip.js';

test('lista sem dia: dica diz que o toque filtra só as tarefas', () => {
  assert.equal(weekStripHint({ lens: 'list', view: 'tasks', selectedDay: null }), 'Toque num dia para ver só as tarefas dele.');
});

test('em Todos, a dica avisa que hábitos seguem em hoje', () => {
  const hint = weekStripHint({ lens: 'list', view: 'all', selectedDay: null });
  assert.match(hint, /só as tarefas/);
  assert.match(hint, /Hábitos seguem em hoje\.$/);
});

test('com dia escolhido, mostra o dia e como voltar', () => {
  const hint = weekStripHint({ lens: 'list', view: 'all', selectedDay: '2026-10-14' });
  assert.ok(hint.startsWith('Mostrando só as tarefas de ' + formatDayLabel('2026-10-14') + '.'));
  assert.match(hint, /Toque de novo para voltar/);
});

test('linha do tempo não promete filtro', () => {
  assert.equal(weekStripHint({ lens: 'week', view: 'all', selectedDay: '2026-10-14' }), 'Toque num dia para destacá-lo na linha do tempo.');
});
