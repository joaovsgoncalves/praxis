import test from 'node:test';
import assert from 'node:assert/strict';
import {
  habitTasksTabFromSearchParams,
  taskScopeFromSearchParams,
  taskLensFromSearchParams,
  taskDayFromSearchParams,
  setTaskDayInSearchParams,
  weekDayHref,
} from './urlDeepLinks.js';

const params = (query) => new URLSearchParams(query);

test('day: lê só datas válidas', () => {
  assert.equal(taskDayFromSearchParams(params('day=2026-10-15')), '2026-10-15');
  assert.equal(taskDayFromSearchParams(params('')), null);
  assert.equal(taskDayFromSearchParams(params('day=2026-02-30')), null);
  assert.equal(taskDayFromSearchParams(params('day=amanha')), null);
  assert.equal(taskDayFromSearchParams(params('day=2026-10-15T10:00')), null);
});

test('day: grava e apaga sem mexer nos outros parâmetros', () => {
  const withDay = setTaskDayInSearchParams(params('tab=tasks&scope=week'), '2026-10-14');
  assert.equal(withDay.toString(), 'tab=tasks&scope=week&day=2026-10-14');
  assert.equal(setTaskDayInSearchParams(withDay, null).toString(), 'tab=tasks&scope=week');
});

test('weekDayHref abre Tarefas na semana com o dia', () => {
  const href = weekDayHref('2026-10-14');
  assert.equal(href, '/tarefas?scope=week&day=2026-10-14');
  const query = params(href.split('?')[1]);
  // O destino é a rota; a tela conjunta antiga é que usa ?tab=.
  assert.equal(href.split('?')[0], '/tarefas');
  assert.equal(taskScopeFromSearchParams(query), 'week');
  assert.equal(taskLensFromSearchParams(query), 'list');
  assert.equal(taskDayFromSearchParams(query), '2026-10-14');
});

test('links antigos continuam iguais', () => {
  const old = params('tab=tasks&scope=week');
  assert.equal(habitTasksTabFromSearchParams(old), 'tasks');
  assert.equal(taskScopeFromSearchParams(old), 'week');
  assert.equal(taskDayFromSearchParams(old), null);
});
