import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDayRollover } from './lib/dayRollover.js';
import { buildRouteCtx, createTestDb } from './test-support/helpers.mjs';

const quiet = { log() {}, error() {} };

function setup(t, { today = '2026-10-15' } = {}) {
  const db = createTestDb();
  t.after(() => db.close());
  const clock = { today };
  const ctx = buildRouteCtx(db);
  const logs = [];
  const rollover = createDayRollover({
    db,
    getLocalDateString: () => clock.today,
    nextSortOrder: ctx.nextSortOrder,
    log: { log: (line) => logs.push(line), error: (line) => logs.push(`ERRO ${line}`) },
  });
  const insert = db.prepare(`
    INSERT INTO tasks (id, title, date, time, status, priority, category, sort_order, recurrence, recurrence_parent_id, source)
    VALUES (?, ?, ?, ?, 'pending', 'medium', 'pessoal', ?, ?, ?, ?)
  `);
  const snapshot = () => db.prepare('SELECT * FROM tasks ORDER BY id, date').all();
  const xp = () => db.prepare("SELECT xp_total FROM gamification WHERE id = 'main'").get().xp_total;
  return { db, clock, rollover, insert, snapshot, xp, logs };
}

test('virada fecha a recorrente de ontem, garante a de hoje e registra o dia', (t) => {
  const { db, rollover, insert, xp } = setup(t);
  insert.run('faculdade', 'Sair para a faculdade', '2026-10-14', '18:40', 1, 'daily', null, 'manual');
  insert.run('avulsa', 'Pagar boleto', '2026-10-14', '10:00', 2, 'none', null, 'manual');
  const xpBefore = xp();

  const result = rollover.run('teste');

  assert.deepEqual({ ok: result.ok, closed: result.closed }, { ok: true, closed: 1 });
  const missed = db.prepare('SELECT status, day_outcome, day_outcome_date FROM tasks WHERE id = ?').get('faculdade');
  assert.deepEqual(missed, { status: 'cancelled', day_outcome: 'missed', day_outcome_date: '2026-10-14' });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM tasks WHERE recurrence_parent_id = 'faculdade' AND date = '2026-10-15' AND status = 'pending'").get().c, 1);
  assert.equal(db.prepare("SELECT status FROM tasks WHERE id = 'avulsa'").get().status, 'pending', 'avulsa continua atrasada');
  assert.equal(xp(), xpBefore, 'sem XP');
  assert.deepEqual(db.prepare('SELECT day, closed FROM day_rollover_runs').all(), [{ day: '2026-10-15', closed: 1 }]);
});

test('passadas repetidas no mesmo dia não mudam nada', (t) => {
  const { db, rollover, insert, snapshot } = setup(t);
  insert.run('faculdade', 'Sair para a faculdade', '2026-10-14', '18:40', 1, 'daily', null, 'manual');

  rollover.run('subida');
  const first = snapshot();
  for (let i = 0; i < 5; i += 1) assert.equal(rollover.run('tick').closed, 0);

  assert.deepEqual(snapshot(), first);
  assert.deepEqual(db.prepare('SELECT day, closed FROM day_rollover_runs').all(), [{ day: '2026-10-15', closed: 1 }]);
});

test('API parada por vários dias: a primeira passada fecha tudo e não cria ocorrência no passado', (t) => {
  const { db, rollover, insert } = setup(t, { today: '2026-10-20' });
  // A série ficou com três ocorrências abertas enquanto a API estava fora do ar.
  insert.run('agua', 'Regar plantas', '2026-10-12', '07:00', 1, 'daily', null, 'manual');
  insert.run('agua-13', 'Regar plantas', '2026-10-13', '07:00', 2, 'daily', 'agua', 'manual');
  insert.run('agua-14', 'Regar plantas', '2026-10-14', '07:00', 3, 'daily', 'agua', 'manual');
  insert.run('bloco', 'Sair para a faculdade', '2026-10-16', '18:20', 4, 'none', null, 'seneca');

  const result = rollover.run('subida');

  assert.equal(result.closed, 4);
  const open = db.prepare("SELECT date FROM tasks WHERE status IN ('pending', 'in_progress') ORDER BY date").all();
  assert.deepEqual(open.map((row) => row.date), ['2026-10-20'], 'só a ocorrência de hoje fica aberta');
  const outcomes = db.prepare("SELECT id, day_outcome_date FROM tasks WHERE day_outcome = 'missed' ORDER BY id").all();
  assert.deepEqual(outcomes, [
    { id: 'agua', day_outcome_date: '2026-10-12' },
    { id: 'agua-13', day_outcome_date: '2026-10-13' },
    { id: 'agua-14', day_outcome_date: '2026-10-14' },
    { id: 'bloco', day_outcome_date: '2026-10-16' },
  ]);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM tasks WHERE recurrence_parent_id = 'bloco'").get().c, 0, 'bloco do Sêneca não gera filho');
});

test('processo que atravessa a meia-noite fecha o dia novo sem reiniciar', (t) => {
  const { db, clock, rollover, insert } = setup(t, { today: '2026-10-15' });
  insert.run('faculdade', 'Sair para a faculdade', '2026-10-15', '18:40', 1, 'daily', null, 'manual');

  assert.equal(rollover.run('tick').closed, 0, 'tarefa de hoje não é vencida');
  clock.today = '2026-10-16';
  assert.equal(rollover.run('tick').closed, 1);

  assert.equal(db.prepare("SELECT status FROM tasks WHERE id = 'faculdade'").get().status, 'cancelled');
  assert.equal(db.prepare("SELECT COUNT(*) c FROM tasks WHERE date = '2026-10-16' AND status = 'pending'").get().c, 1);
  assert.deepEqual(db.prepare('SELECT day FROM day_rollover_runs ORDER BY day').all().map((row) => row.day), ['2026-10-15', '2026-10-16']);
});

test('falha no meio é desfeita por inteiro e a passada seguinte conclui', (t) => {
  const { db, rollover, insert, snapshot, logs } = setup(t);
  insert.run('faculdade', 'Sair para a faculdade', '2026-10-14', '18:40', 1, 'daily', null, 'manual');
  insert.run('agua', 'Regar plantas', '2026-10-14', '07:00', 2, 'daily', null, 'manual');
  const before = snapshot();
  // Derruba a criação da próxima ocorrência, depois de as vencidas já terem sido marcadas.
  db.exec(`
    CREATE TRIGGER falha_ao_criar_ocorrencia BEFORE INSERT ON tasks
    BEGIN SELECT RAISE(ABORT, 'disco cheio (simulado)'); END;
  `);

  const failed = rollover.run('tick');

  assert.equal(failed.ok, false);
  assert.deepEqual(snapshot(), before, 'nada fica pela metade');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM day_rollover_runs').get().c, 0, 'o dia não fica registrado como fechado');
  assert.ok(logs.some((line) => line.startsWith('ERRO')), 'a falha vai para o log');

  db.exec('DROP TRIGGER falha_ao_criar_ocorrencia');
  const retried = rollover.run('tick');

  assert.deepEqual({ ok: retried.ok, closed: retried.closed }, { ok: true, closed: 2 });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM tasks WHERE date = '2026-10-15' AND status = 'pending'").get().c, 2);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM tasks WHERE day_outcome = 'missed'").get().c, 2);
});

test('ideia e tarefa já concluída ou cancelada ficam fora da virada', (t) => {
  const { db, rollover } = setup(t);
  const ins = db.prepare(`
    INSERT INTO tasks (id, title, date, time, status, priority, category, sort_order, recurrence)
    VALUES (?, ?, '2026-10-14', '08:00', ?, 'medium', ?, ?, 'daily')
  `);
  ins.run('ideia', 'Ideia recorrente', 'pending', 'ideias', 1);
  ins.run('feita', 'Feita ontem', 'completed', 'pessoal', 2);
  ins.run('cancelada', 'Cancelada ontem', 'cancelled', 'pessoal', 3);

  assert.equal(rollover.run('tick').closed, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM tasks').get().c, 3);
});

test('o relógio interno liga uma vez só e desliga', (t) => {
  const { rollover } = setup(t);
  rollover.start({ intervalMs: 60_000 });
  rollover.start({ intervalMs: 60_000 });
  rollover.stop();
  rollover.stop();
  assert.ok(true);
});
