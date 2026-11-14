import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKIPPED_PLAN,
  applyPlanToHabitList,
  applyPlanToLogs,
  findHabitInLists,
  planHabitIncrement,
  planHabitToggle,
} from './habitDay.js';

const agua = { id: 'agua', title: 'Beber água', target_value: 3, unit: 'L', quick_increment: 0.5 };
const ler = { id: 'ler', title: 'Ler 10 páginas', target_value: null };
const rotina = {
  id: 'manha',
  title: 'Manhã',
  children: [
    { id: 'alongar', title: 'Alongar', target_value: null },
    { id: 'creatina', title: 'Creatina', target_value: 5, unit: 'g' },
  ],
};

test('acha hábito solto e passo de rotina em qualquer lista carregada', () => {
  assert.equal(findHabitInLists([undefined, [ler], [agua, rotina]], 'agua'), agua);
  assert.equal(findHabitInLists([[rotina]], 'creatina').target_value, 5);
  assert.equal(findHabitInLists([[ler]], 'nao-existe'), null);
  assert.equal(findHabitInLists(null, 'agua'), null);
});

test('0,5 L de 3 L fica aberto; atingir a meta conclui', () => {
  assert.deepEqual(planHabitToggle({ habit: agua, isDone: false, value: 0.5 }), {
    completed: false, value: 0.5, outcome: null, cleared: false,
  });
  assert.equal(planHabitToggle({ habit: agua, isDone: false, value: 3 }).completed, true);
  assert.equal(planHabitToggle({ habit: agua, isDone: false, value: 3.5 }).outcome, 'done');
});

test('passo de rotina com meta segue a meta do passo, não a da rotina', () => {
  const creatina = findHabitInLists([[rotina]], 'creatina');
  assert.equal(planHabitToggle({ habit: creatina, isDone: false, value: 2 }).completed, false);
  assert.equal(planHabitToggle({ habit: creatina, isDone: false, value: 5 }).completed, true);
});

test('check simples conclui; em hábito com meta, check sem valor vale a meta', () => {
  assert.deepEqual(planHabitToggle({ habit: ler, isDone: false }), {
    completed: true, value: null, outcome: 'done', cleared: false,
  });
  assert.equal(planHabitToggle({ habit: agua, isDone: false }).value, 3);
});

test('valor que não é número não marca como feito', () => {
  assert.equal(planHabitToggle({ habit: agua, isDone: false, value: 'abc' }).completed, false);
  assert.equal(planHabitToggle({ habit: ler, isDone: false, value: Number.NaN }).completed, false);
});

test('desfazer limpa o registro do dia', () => {
  assert.deepEqual(planHabitToggle({ habit: agua, isDone: true }), {
    completed: false, value: null, outcome: null, cleared: true,
  });
});

test('dose rápida soma ao que já tinha e só conclui na meta', () => {
  assert.deepEqual(planHabitIncrement({ habit: agua, currentValue: null }), {
    completed: false, value: 0.5, outcome: null, cleared: false,
  });
  assert.equal(planHabitIncrement({ habit: agua, currentValue: 0.2, increment: 0.1 }).value, 0.3);
  assert.equal(planHabitIncrement({ habit: agua, currentValue: 2.5 }).completed, true);
});

test('a lista recebe o plano no hábito certo e no passo certo da rotina', () => {
  const list = [agua, rotina, ler];
  const partial = applyPlanToHabitList(list, 'agua', planHabitToggle({ habit: agua, isDone: false, value: 0.5 }));
  assert.deepEqual(
    { c: partial[0].completed_today, v: partial[0].value_today, o: partial[0].day_outcome },
    { c: false, v: 0.5, o: 'open' },
  );
  assert.equal(partial[1], rotina, 'quem não mudou continua a mesma referência');

  const step = applyPlanToHabitList(list, 'alongar', planHabitToggle({ habit: rotina.children[0], isDone: false }));
  assert.equal(step[1].children[0].completed_today, true);
  assert.equal(step[1].children[1].completed_today, undefined);

  const skipped = applyPlanToHabitList(list, 'ler', SKIPPED_PLAN);
  assert.deepEqual(
    { c: skipped[2].completed_today, s: skipped[2].skipped_today, o: skipped[2].day_outcome },
    { c: false, s: true, o: 'skipped' },
  );
  assert.equal(applyPlanToHabitList(undefined, 'agua', SKIPPED_PLAN), undefined);
});

test('o registro do dia: parcial, feito, Não rolou e desfazer ficam distinguíveis', () => {
  const base = [{ id: 'l0', habit_id: 'ler', date: '2026-11-14', completed: 1, outcome: 'done', value: null }];
  const args = { habitId: 'agua', date: '2026-11-14', tempId: 'temp-1' };

  const partial = applyPlanToLogs(base, { ...args, plan: planHabitToggle({ habit: agua, isDone: false, value: 0.5 }) });
  assert.deepEqual(partial[1], { id: 'temp-1', habit_id: 'agua', date: '2026-11-14', outcome: null, completed: 0, value: 0.5 });

  const more = applyPlanToLogs(partial, { ...args, plan: planHabitIncrement({ habit: agua, currentValue: 0.5 }) });
  assert.equal(more.length, 2, 'um registro por hábito e dia');
  assert.equal(more[1].value, 1);

  const skipped = applyPlanToLogs(more, { ...args, plan: SKIPPED_PLAN, extra: { skip_reason: 'cansaço' } });
  assert.deepEqual(
    { o: skipped[1].outcome, c: skipped[1].completed, v: skipped[1].value, r: skipped[1].skip_reason },
    { o: 'skipped', c: 0, v: null, r: 'cansaço' },
  );

  const undone = applyPlanToLogs(skipped, { ...args, plan: planHabitToggle({ habit: agua, isDone: true }) });
  assert.deepEqual(undone, base);
});
