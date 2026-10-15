import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDayTrack, normalizeTrackTitle } from './dayTrack.js';

const today = '2026-10-15';
const task = (id, time, extra = {}) => ({
  id,
  title: id,
  status: 'pending',
  priority: 'medium',
  date: today,
  time,
  ...extra,
});
const event = (id, start, extra = {}) => ({
  id,
  title: id,
  start: `${today}T${start}:00-03:00`,
  end: null,
  ...extra,
});
const keys = (items) => items.map((item) => item.key);

test('trilha ordena tarefas com hora e eventos pelo início; empate põe a tarefa antes', () => {
  const track = buildDayTrack({
    tasks: [task('rca', '14:00'), task('loki', '07:15'), task('almoco', '12:00')],
    events: [event('dentista', '09:30'), event('reuniao', '14:00')],
    now: '08:00',
    today,
  });
  assert.deepEqual(keys(track.timeline), [
    'task:loki',
    'event:dentista',
    'task:almoco',
    'task:rca',
    'event:reuniao',
  ]);
  assert.equal(track.timeline[1].startLabel, '09:30');
});

test('sem hora vai para untimed (ordem da lista); evento de dia inteiro também; concluídas no fim', () => {
  const track = buildDayTrack({
    tasks: [
      task('baixa', null, { priority: 'low', sort_order: 2 }),
      task('alta', null, { priority: 'high', sort_order: 1 }),
      task('feita', '10:00', { status: 'completed', completed_date: today }),
      task('amanha', null, { date: '2026-10-16' }),
      task('cancelada', null, { status: 'cancelled' }),
    ],
    events: [{ id: 'aniversario', title: 'Aniversário da Ana', start: today, end: '2026-10-16', all_day: true }],
    now: '08:00',
    today,
  });
  assert.deepEqual(keys(track.untimed), ['task:alta', 'task:baixa', 'event:aniversario']);
  assert.deepEqual(keys(track.timeline), []);
  assert.deepEqual(track.done.map((t) => t.id), ['feita']);
});

test('excludeIds tira da trilha o que já está em "Ficou pra trás"', () => {
  const track = buildDayTrack({
    tasks: [task('cedo', '06:00'), task('tarde', '15:00')],
    events: [],
    now: '12:00',
    today,
    excludeIds: ['cedo'],
  });
  assert.deepEqual(keys(track.timeline), ['task:tarde']);
});

test('dedupe: evento espelho da tarefa sai pelo id do evento (calendar_event_id) ou Task ID', () => {
  const track = buildDayTrack({
    tasks: [
      task('Ligar pro banco', '10:00', { id: 't1', calendar_event_id: 'gcal-1' }),
      task('Relatório', '11:00', { id: 't2' }),
    ],
    events: [
      event('gcal-1', '10:30', { title: 'Outro nome' }),
      event('gcal-2', '16:00', { title: 'Outro título', task_id: 't2' }),
      event('gcal-3', '17:00', { title: 'Treino' }),
    ],
    now: '08:00',
    today,
  });
  assert.deepEqual(keys(track.timeline), ['task:t1', 'task:t2', 'event:gcal-3']);
});

test('dedupe: mesmo título normalizado e mesmo início também é espelho; a tarefa vence', () => {
  const track = buildDayTrack({
    tasks: [
      task('P1 - Reunião com Cliente', '14:00', { id: 't1' }),
      task('Academia', '18:00', { id: 't2', status: 'completed', completed_date: today }),
    ],
    events: [
      event('e1', '14:00', { title: 'reuniao com cliente' }),
      event('e2', '15:00', { title: 'Reunião com cliente' }), // outro horário: fica
      event('e3', '18:00', { title: 'Academia' }), // espelho de tarefa concluída: sai
    ],
    now: '08:00',
    today,
  });
  assert.deepEqual(keys(track.timeline), ['task:t1', 'event:e2']);
  assert.equal(normalizeTrackTitle('P1 - Reunião  com Cliente'), 'reuniao com cliente');
});

test('marcador: sem itens fica em 0', () => {
  const track = buildDayTrack({ tasks: [], events: [], now: '12:00', today });
  assert.equal(track.nowIndex, 0);
});

test('marcador: todos passados fica no fim', () => {
  const track = buildDayTrack({
    tasks: [task('a', '07:00'), task('b', '08:00')],
    events: [],
    now: '20:00',
    today,
  });
  assert.equal(track.nowIndex, 2);
});

test('marcador: todos futuros fica em 0', () => {
  const track = buildDayTrack({
    tasks: [task('a', '15:00')],
    events: [event('e', '16:00')],
    now: '09:00',
    today,
  });
  assert.equal(track.nowIndex, 0);
});

test('marcador: no meio, entre o último que começou e o primeiro futuro', () => {
  const track = buildDayTrack({
    tasks: [task('a', '07:00'), task('b', '12:00'), task('c', '18:00')],
    events: [],
    now: '12:00',
    today,
  });
  // 12:00 começou agora (início <= agora): fica antes do marcador
  assert.equal(track.nowIndex, 2);
  assert.equal(track.timeline[track.nowIndex].key, 'task:c');
});

test('marcador: evento em andamento fica antes do marcador e vem marcado', () => {
  const track = buildDayTrack({
    tasks: [task('depois', '16:00')],
    events: [event('aula', '14:00', { end: `${today}T15:30:00-03:00` })],
    now: '14:45',
    today,
  });
  assert.deepEqual(keys(track.timeline), ['event:aula', 'task:depois']);
  assert.equal(track.nowIndex, 1);
  assert.equal(track.timeline[0].inProgress, true);
  assert.equal(track.timeline[1].inProgress, false);
});

test('aceita Date como relógio (Fortaleza)', () => {
  const track = buildDayTrack({
    tasks: [task('a', '09:00'), task('b', '11:00')],
    events: [],
    // 13:00Z = 10:00 em Fortaleza
    now: new Date('2026-10-15T13:00:00Z'),
    today,
  });
  assert.equal(track.nowIndex, 1);
});
