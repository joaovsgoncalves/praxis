import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoutineGlances,
  formatMinutesShort,
  formatWeekSpan,
  isReviewWeekend,
  pickFocusFront,
  pickMainGoal,
  pickReviewCard,
  routineStartsExpanded,
  summarizeHabitGroup,
  weekBarRatio,
  weekDayAriaLabel,
  weekSummaryParts,
} from './todayGlance.js';

const TODAY = '2026-10-15'; // quinta

const step = (id, extra = {}) => ({ id, title: id, status: 'active', frequency: 'daily', ...extra });
const abertura = {
  id: 'ab',
  title: 'Abertura do dia',
  kind: 'compound',
  children: [step('levantar'), step('cama'), step('cafe'), step('banho'), step('agua')],
};
const fechamento = {
  id: 'fe',
  title: 'Fechamento do dia',
  kind: 'compound',
  children: [step('aula'), step('banho-noite'), step('celular'), step('luz')],
};

test('rotina: feitos/total, próximo passo aberto e "não rolou" fechando o passo', () => {
  const logs = [
    { habit_id: 'levantar', date: TODAY, outcome: 'done', completed: 1 },
    { habit_id: 'cama', date: TODAY, outcome: 'skipped', completed: 0 },
    { habit_id: 'cafe', date: '2026-10-14', outcome: 'done', completed: 1 },
  ];
  const [first, second] = buildRoutineGlances([fechamento, abertura], logs, TODAY);
  assert.equal(first.compound.id, 'ab', 'Abertura vem antes do Fechamento');
  assert.equal(first.done, 1);
  assert.equal(first.skipped, 1);
  assert.equal(first.total, 5);
  assert.equal(first.next.habit.id, 'cafe', 'log de ontem não conta hoje');
  assert.deepEqual(first.steps.map((s) => s.outcome), ['done', 'skipped', 'open', 'open', 'open']);
  assert.equal(first.closed, false);
  assert.equal(second.done, 0);
  assert.equal(second.total, 4);
});

test('rotina completa e fechada; passo fora do dia não conta', () => {
  const routine = {
    id: 'r',
    title: 'Abertura do dia',
    children: [step('a'), step('b'), step('fds', { frequency: 'weekends' })],
  };
  const logs = [
    { habit_id: 'a', date: TODAY, outcome: 'done' },
    { habit_id: 'b', date: TODAY, outcome: 'done' },
  ];
  const [glance] = buildRoutineGlances([routine], logs, TODAY);
  assert.equal(glance.total, 2);
  assert.equal(glance.complete, true);
  assert.equal(glance.closed, true);
  assert.equal(glance.next, null);

  const withSkip = summarizeHabitGroup(
    [step('a'), step('b')],
    [{ habit_id: 'a', date: TODAY, outcome: 'done' }, { habit_id: 'b', date: TODAY, outcome: 'skipped' }],
    TODAY,
  );
  assert.equal(withSkip.closed, true);
  assert.equal(withSkip.complete, false);
});

test('rotina sem passo hoje some da linha', () => {
  const vazia = { id: 'v', title: 'Rotina de sábado', children: [step('x', { frequency: 'weekends' })] };
  assert.equal(buildRoutineGlances([vazia], [], TODAY).length, 0);
});

test('hábito de quantidade aberto mostra quanto já foi', () => {
  const agua = step('agua', { target_value: 3, quick_increment: 0.5, unit: 'L' });
  const { steps } = summarizeHabitGroup([agua], [{ habit_id: 'agua', date: TODAY, value: 1.5, completed: 0 }], TODAY);
  assert.equal(steps[0].outcome, 'open');
  assert.equal(steps[0].progress, 0.5);
  const done = summarizeHabitGroup([agua], [{ habit_id: 'agua', date: TODAY, value: 3, outcome: 'done' }], TODAY);
  assert.equal(done.steps[0].progress, null);
});

test('janela: Abertura aberta antes das 11h, Fechamento a partir das 20h', () => {
  assert.equal(routineStartsExpanded(abertura, '06:30'), true);
  assert.equal(routineStartsExpanded(abertura, '10:59'), true);
  assert.equal(routineStartsExpanded(abertura, '11:00'), false);
  assert.equal(routineStartsExpanded(abertura, '21:00'), false);
  assert.equal(routineStartsExpanded(fechamento, '19:59'), false);
  assert.equal(routineStartsExpanded(fechamento, '20:00'), true);
  assert.equal(routineStartsExpanded(fechamento, '23:40'), true);
  assert.equal(routineStartsExpanded(fechamento, '08:00'), false);
  assert.equal(routineStartsExpanded({ id: 't', title: 'Rotina da tarde' }, '15:00'), false);
});

test('frente: em foco com próximo passo; senão a primeira andando; pausada e sem passo ficam de fora', () => {
  const projects = [
    { id: 1, name: 'Praxis', focus: 1, column: 'andando', next_step: '' },
    { id: 2, name: 'Encarte', focus: 1, column: 'pausado', next_step: 'Conferir' },
    { id: 3, name: 'RCA', focus: 0, column: 'andando', next_step: 'Ligar' },
    { id: 4, name: 'Animália', focus: 1, column: 'andando', next_step: 'Corrigir paridade' },
  ];
  assert.equal(pickFocusFront(projects).name, 'Animália');
  assert.equal(pickFocusFront(projects.slice(0, 3)).name, 'RCA');
  assert.equal(pickFocusFront(projects.slice(0, 2)), null);
  assert.equal(pickFocusFront(undefined), null);
});

test('meta: prazo mais perto à frente; sem prazo à frente, maior progresso; sem ativa, null', () => {
  const goals = [
    { id: 'a', status: 'active', deadline: '2026-08-31' },
    { id: 'b', status: 'active', deadline: '2026-12-01' },
    { id: 'c', status: 'active', deadline: '2026-11-01' },
    { id: 'd', status: 'paused', deadline: '2026-10-20' },
  ];
  assert.equal(pickMainGoal(goals, () => 0, TODAY).id, 'c');
  const semPrazo = [
    { id: 'x', status: 'active', deadline: '2026-01-01' },
    { id: 'y', status: 'active', deadline: null },
  ];
  const pct = { x: 20, y: 70 };
  assert.equal(pickMainGoal(semPrazo, (g) => pct[g.id], TODAY).id, 'y');
  assert.equal(pickMainGoal([{ id: 'p', status: 'paused' }], () => 0, TODAY), null);
});

test('revisar: fila de capturas primeiro; senão a semana, em destaque de sexta a domingo', () => {
  assert.deepEqual(pickReviewCard({ pendingCount: 3, today: TODAY }), { kind: 'captures', count: 3 });
  const week = pickReviewCard({ pendingCount: 0, today: TODAY });
  assert.equal(week.kind, 'week');
  assert.equal(week.weekend, false);
  assert.equal(week.span, '12 a 18 out');
  assert.equal(isReviewWeekend('2026-10-16'), true);
  assert.equal(isReviewWeekend('2026-10-17'), true);
  assert.equal(isReviewWeekend('2026-10-18'), true);
  assert.equal(isReviewWeekend('2026-10-19'), false);
  assert.equal(formatWeekSpan('2026-10-01'), '28 set a 4 out');
});

test('minutos curtos e resumo da semana sem zeros', () => {
  assert.equal(formatMinutesShort(0), '0 min');
  assert.equal(formatMinutesShort(45), '45 min');
  assert.equal(formatMinutesShort(60), '1 h');
  assert.equal(formatMinutesShort(200), '3 h 20');
  assert.equal(formatMinutesShort(65), '1 h 05');
  assert.deepEqual(
    weekSummaryParts({ focus_minutes: 200, tasks_completed_count: 18, habits_completion_pct: 74.4, habits_target: 30 }),
    ['3 h 20 de foco', '18 tarefas', '74% dos hábitos'],
  );
  assert.deepEqual(
    weekSummaryParts({ focus_minutes: 0, tasks_completed_count: 1, habits_completion_pct: null }),
    ['1 tarefa'],
  );
  assert.deepEqual(weekSummaryParts(null), []);
});

test('barra e rótulo do dia', () => {
  const day = { weekday: 3, done: 4, total: 16 };
  assert.equal(weekDayAriaLabel(day), 'Quarta, 4 de 16');
  assert.equal(weekDayAriaLabel({ weekday: 0, done: 0, total: 0 }), 'Domingo, nada agendado');
  assert.equal(weekBarRatio(day), 0.25);
  assert.equal(weekBarRatio({ done: 5, total: 4 }), 1);
  assert.equal(weekBarRatio({ done: 0, total: 0 }), 0);
});
