import assert from 'node:assert/strict';
import express from 'express';
import { createInsightsRouter } from './routes/insights.js';
import { createTestDb, fixedDate, requestJson, startTestServer } from './test-support/helpers.mjs';
import { readerFor, testEngines, weeklyOn } from './test-support/insightsParity.fase4.mjs';

// Quinta-feira; a semana vai de seg 12/10 a dom 18/10.
const TODAY = '2026-10-15';
const WEEK_START = '2026-10-12';
const WEEK_DATES = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];

function seed(db) {
  const habit = db.prepare(`
    INSERT INTO habits (id, title, frequency, status, category) VALUES (?, ?, ?, 'active', 'pessoal')
  `);
  habit.run('agua', 'Beber água', 'daily');
  habit.run('ler', 'Ler 10 páginas', 'weekdays');
  habit.run('pausado', 'Hábito pausado', 'daily');
  db.prepare("UPDATE habits SET status = 'paused' WHERE id = 'pausado'").run();
  // Rotina: contêiner (passos contam por si); sem log, mas fica no slot de victories.
  habit.run('abertura', 'Abertura do dia', 'daily');
  habit.run('passo', 'Arrumar a cama', 'daily');
  db.prepare("UPDATE habits SET kind = 'compound' WHERE id = 'abertura'").run();
  db.prepare("UPDATE habits SET parent_id = 'abertura' WHERE id = 'passo'").run();

  const log = db.prepare(`
    INSERT INTO habit_logs (id, habit_id, date, completed, outcome) VALUES (?, ?, ?, ?, ?)
  `);
  log.run('l1', 'agua', '2026-10-12', 1, 'done');
  log.run('l2', 'ler', '2026-10-12', 1, 'done');
  log.run('l3', 'agua', '2026-10-13', 0, 'skipped'); // não rolou: fora do total e do feito
  log.run('l4', 'ler', '2026-10-14', 1, 'done');
  log.run('l5', 'agua', '2026-10-15', 1, 'done');
  log.run('l6', 'passo', '2026-10-12', 1, 'done');

  const task = db.prepare(`
    INSERT INTO tasks (id, title, date, status, category, day_outcome) VALUES (?, ?, ?, ?, ?, ?)
  `);
  task.run('t1', 'Pagar boleto', '2026-10-12', 'completed', 'pessoal', null);
  task.run('t2', 'Ligar pro banco', '2026-10-12', 'pending', 'pessoal', null);
  task.run('t3', 'Arquivada', '2026-10-13', 'cancelled', 'pessoal', null);
  task.run('t4', 'Academia (não rolou)', '2026-10-14', 'cancelled', 'treino', 'missed');
  task.run('t5', 'Ideia solta', '2026-10-15', 'pending', 'ideias', null);
  task.run('t6', 'Relatório', '2026-10-15', 'completed', 'estudo', null);
  task.run('t7', 'Consulta', '2026-10-17', 'pending', 'pessoal', null);
  task.run('t8', 'Sem categoria', '2026-10-15', 'pending', null, null);
}

function nonFuture(days) {
  return days.filter((d) => !d.is_future);
}

function sum(days, key) {
  return days.reduce((acc, d) => acc + d[key], 0);
}

testEngines('days[] traz 7 itens de segunda a domingo, com hoje e futuros marcados', async (t, kind) => {
  const db = createTestDb();
  seed(db);
  const payload = await weeklyOn(t, kind, db, WEEK_START, { today: TODAY });
  db.close();

  assert.equal(payload.days.length, 7);
  assert.deepEqual(payload.days.map((d) => d.date), WEEK_DATES);
  // Mesmo padrão de dia da semana do arquivo (Date#getDay): 0 = domingo.
  assert.deepEqual(payload.days.map((d) => d.weekday), [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(payload.days.map((d) => d.is_today), [false, false, false, true, false, false, false]);
  assert.deepEqual(payload.days.map((d) => d.is_future), [false, false, false, false, true, true, true]);
});

testEngines('cada dia conta tarefas e hábitos; cancelada, não rolou e ideias ficam fora', async (t, kind) => {
  const db = createTestDb();
  seed(db);
  const { days } = await weeklyOn(t, kind, db, WEEK_START, { today: TODAY });
  db.close();
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));

  // Hábitos folha: água, passo da rotina (diários) e leitura (dias úteis); a rotina em si fica fora.
  // seg: água, leitura e passo feitos; boleto feito, banco aberto
  assert.deepEqual(
    pick(byDate['2026-10-12']),
    { done: 4, total: 5, tasks_done: 1, tasks_total: 2, habits_done: 3, habits_total: 3 },
  );
  // ter: água não rolou (fora), leitura e passo abertos; tarefa cancelada fora
  assert.deepEqual(
    pick(byDate['2026-10-13']),
    { done: 0, total: 2, tasks_done: 0, tasks_total: 0, habits_done: 0, habits_total: 2 },
  );
  // qua: tarefa "não rolou" (cancelled/missed) fora
  assert.deepEqual(
    pick(byDate['2026-10-14']),
    { done: 1, total: 3, tasks_done: 0, tasks_total: 0, habits_done: 1, habits_total: 3 },
  );
  // qui (hoje): ideia fora; tarefa sem categoria entra
  assert.deepEqual(
    pick(byDate['2026-10-15']),
    { done: 2, total: 5, tasks_done: 1, tasks_total: 2, habits_done: 1, habits_total: 3 },
  );
  // sáb (futuro): só o que já está agendado, nada feito
  assert.deepEqual(
    pick(byDate['2026-10-17']),
    { done: 0, total: 3, tasks_done: 0, tasks_total: 1, habits_done: 0, habits_total: 2 },
  );
});

/**
 * Invariante (dias não futuros), com R = days_routines (rotinas-contêiner, fora do dia):
 *   Σ habits_done + R.done == victories.habits_done
 *   Σ habits_total + (R.slots − R.skipped) == victories.habits_target − victories.habits_skipped
 *   Σ (habits_total − habits_done) + (R.slots − R.done − R.skipped) == victories.habits_open_slots
 * `habits_target` conta todo slot devido (feito + não rolou + aberto), rotina incluída; o dia
 * tira o "não rolou" (decisão, não pendência) e a rotina (os passos já contam).
 */
function assertInvariant(payload) {
  const { victories, days_routines: R } = payload;
  const past = nonFuture(payload.days);
  assert.equal(sum(past, 'habits_done') + R.done, victories.habits_done);
  assert.equal(
    sum(past, 'habits_total') + (R.slots - R.skipped),
    victories.habits_target - victories.habits_skipped,
  );
  assert.equal(
    sum(past, 'habits_total') - sum(past, 'habits_done') + (R.slots - R.done - R.skipped),
    victories.habits_open_slots,
  );
  for (const day of payload.days) {
    assert.equal(day.done, day.tasks_done + day.habits_done);
    assert.equal(day.total, day.tasks_total + day.habits_total);
  }
}

testEngines('soma dos dias bate com victories (invariante)', async (t, kind) => {
  const db = createTestDb();
  seed(db);
  const payload = await weeklyOn(t, kind, db, WEEK_START, { today: TODAY });
  db.close();

  assertInvariant(payload);
  assert.deepEqual(payload.days_routines, { slots: 4, done: 0, skipped: 0 });
  // Campos antigos intactos (rotina continua no slot, como antes).
  assert.equal(payload.victories.habits_target, 16);
  assert.equal(payload.victories.habits_done, 5);
  assert.equal(payload.victories.habits_skipped, 1);
  assert.equal(payload.victories.habits_open_slots, 10);
});

testEngines('semana passada fecha com 7 dias não futuros e a mesma invariante', async (t, kind) => {
  const db = createTestDb();
  seed(db);
  const payload = await weeklyOn(t, kind, db, '2026-10-05', { today: TODAY });
  db.close();
  const { days } = payload;

  assert.equal(days.length, 7);
  assert.equal(days.every((d) => !d.is_future && !d.is_today), true);
  assertInvariant(payload);
  // seg a sex: água + passo + leitura; sáb e dom: água + passo
  assert.equal(sum(days, 'habits_total'), 5 * 3 + 2 * 2);
  assert.equal(payload.days_routines.slots, 7);
});

testEngines('GET /api/insights/weekly devolve days[] sem endpoint novo', async (t, kind) => {
  const db = createTestDb();
  seed(db);
  const { insights } = await readerFor(t, kind, db);
  const app = express();
  app.use('/api/insights', createInsightsRouter({ insights, getLocalDateString: fixedDate(TODAY) }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });

  const payload = await requestJson(server.base, `/api/insights/weekly?week_start=${WEEK_START}`);
  assert.equal(payload.days.length, 7);
  assert.equal(payload.days[3].is_today, true);
  assertInvariant(payload);
});

function pick(day) {
  const { done, total, tasks_done, tasks_total, habits_done, habits_total } = day;
  return { done, total, tasks_done, tasks_total, habits_done, habits_total };
}
