import test from 'node:test';
import assert from 'node:assert/strict';
import { planNowTasks, pickNowTask, formatBehindSince } from './nowTask.js';

const today = '2026-10-15';
const task = (id, time, extra = {}) => ({ id, title: id, status: 'pending', date: today, time, ...extra });

const day = [
  task('loki', '07:15'),
  task('almoco', '12:00'),
  task('cliente', '13:00'),
  task('rca', '14:00'),
  task('faculdade', '18:20'),
  task('leitura', '22:20'),
];

test('16:10: Agora é a das 14:00, Depois a das 18:20, as três primeiras ficaram pra trás', () => {
  const plan = planNowTasks(day, today, '16:10');
  assert.equal(plan.now?.id, 'rca');
  assert.equal(plan.next?.id, 'faculdade');
  assert.deepEqual(plan.behind.map((t) => t.id), ['loki', 'almoco', 'cliente']);
});

test('06:50: Agora é a das 07:15 e nada ficou pra trás', () => {
  const plan = planNowTasks(day, today, '06:50');
  assert.equal(plan.now?.id, 'loki');
  assert.equal(plan.next?.id, 'almoco');
  assert.deepEqual(plan.behind, []);
});

test('relógio aceita Date (Fortaleza)', () => {
  assert.equal(pickNowTask(day, today, new Date('2026-10-15T16:10:00-03:00'))?.id, 'rca');
});

test('duração encerra o bloco antes da próxima tarefa', () => {
  const plan = planNowTasks([
    task('curta', '13:00', { duration_minutes: 30 }),
    task('noite', '19:00'),
  ], today, '16:10');
  assert.equal(plan.now?.id, 'noite');
  assert.deepEqual(plan.behind.map((t) => t.id), ['curta']);
});

test('única tarefa da manhã não segura o Agora à tarde', () => {
  const plan = planNowTasks([
    task('loki', '07:15'),
    task('ler', null, { priority: 'high' }),
  ], today, '16:10');
  assert.equal(plan.now?.id, 'ler');
  assert.equal(plan.next, null);
  assert.deepEqual(plan.behind.map((t) => t.id), ['loki']);
});

test('sem hora mantém a regra antiga: atrasada → alta sem hora → qualquer de hoje', () => {
  const ontem = task('ontem', null, { date: '2026-10-14' });
  const alta = task('alta', null, { priority: 'high' });
  const media = task('media', null, { priority: 'medium' });
  assert.equal(pickNowTask([media, alta, ontem], today, '10:00')?.id, 'ontem');
  assert.equal(pickNowTask([media, alta], today, '10:00')?.id, 'alta');
  assert.equal(pickNowTask([media], today, '10:00')?.id, 'media');
  assert.equal(pickNowTask([task('feita', '10:00', { status: 'completed' })], today, '10:00'), null);
});

test('dias anteriores entram em Ficou pra trás antes das de hoje', () => {
  const plan = planNowTasks([task('hoje-cedo', '07:00'), task('ontem', '09:00', { date: '2026-10-14' })], today, '16:10');
  assert.deepEqual(plan.behind.map((t) => t.id), ['ontem', 'hoje-cedo']);
});

test('rótulo de atraso sem data ISO', () => {
  assert.equal(formatBehindSince({ date: '2026-10-14' }, today), 'desde ontem');
  assert.equal(formatBehindSince({ date: '2026-10-12' }, today), 'desde seg 12/10');
  assert.equal(formatBehindSince({ date: today, time: '07:15:00' }, today), 'desde 07:15');
  assert.doesNotMatch(formatBehindSince({ date: '2026-09-30' }, today), /\d{4}-\d{2}-\d{2}/);
});
