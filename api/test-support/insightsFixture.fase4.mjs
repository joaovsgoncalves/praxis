/**
 * Massa dos insights de leitura (fase 4), igual para o contrato do repositório e a paridade HTTP.
 *
 * - `seedInsights(db)`: linhas gravadas no SQLite na ordem de inserção, com volume que passa dos tetos
 *   (LIMIT 50/80/10/24/5), empates de carimbo e ids fora da ordem de inserção (rowid != id).
 * - `copyToFirestore(userDoc, db, tables)`: o mesmo conteúdo como documentos `users/{uid}/<tabela>/{id}`
 *   no formato do FROZEN §2 (linha SQLite + `_row` = rowid). É migração de dado, sem regra.
 */
import { documentId } from '../storage/schema.mjs';

const camel = (table) => table.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** Embaralhamento determinístico (LCG), para a ordem de inserção não coincidir com a ordem dos ids. */
export function shuffled(list, seed = 7) {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const WEEK_START = '2026-10-12';
export const WEEK_END = '2026-10-18';
export const TODAY = '2026-10-15';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (day) => `2026-10-${pad(day)}`;

export const INSIGHTS_TABLES = ['tasks', 'habits', 'habit_logs', 'focus_sessions', 'wellness_checks', 'capture_queue', 'projects', 'project_updates'];

export function seedInsights(db) {
  const task = db.prepare(`INSERT INTO tasks (id, title, date, status, category, priority, completed_date, idea_status, created_date, updated_date)
    VALUES (@id, @title, @date, @status, @category, @priority, @completed_date, @idea_status, @created_date, @updated_date)`);
  const put = (row) => task.run({ date: null, status: 'pending', category: 'pessoal', priority: 'medium', completed_date: null, idea_status: null, created_date: '2026-09-01 09:00:00', updated_date: '2026-09-01 09:00:00', ...row });
  const rows = [];

  // 55 concluídas na semana (teto 50): data na semana, ou só a conclusão na semana, com empates de
  // completed_date e updated_date; algumas sem categoria (fora, como `!=` com NULL) e uma ideia (fora).
  for (let i = 0; i < 55; i += 1) {
    const id = `c${pad(i)}`;
    const inWeekDate = i % 3 === 0 ? ymd(12 + (i % 7)) : (i % 3 === 1 ? '2026-10-02' : null);
    rows.push({
      id, title: `P${(i % 3) + 1} - Feita ${i % 11}`, date: inWeekDate, status: 'completed',
      category: i % 17 === 5 ? null : (i === 9 ? 'ideias' : ['pessoal', 'rca', 'facul', 'treino', 'gofluxo', 'projeto'][i % 6]),
      priority: ['high', 'medium', 'low'][i % 3],
      completed_date: i % 3 === 2 ? ymd(12 + (i % 5)) : (i % 4 === 0 ? null : ymd(12 + (i % 3))),
      updated_date: `2026-10-1${i % 3} 1${i % 4}:00:00`,
    });
  }
  // Concluídas fora da semana e canceladas/pendentes dentro dela (não entram).
  rows.push({ id: 'c-old', title: 'Antiga', date: '2026-09-10', status: 'completed', completed_date: '2026-09-10' });
  rows.push({ id: 'c-edge-lo', title: 'Borda inicio', date: WEEK_START, status: 'completed', completed_date: '2026-10-11' });
  rows.push({ id: 'c-edge-hi', title: 'Borda fim', date: null, status: 'completed', completed_date: WEEK_END });
  rows.push({ id: 'c-after', title: 'Depois', date: '2026-10-19', status: 'completed', completed_date: '2026-10-19' });
  rows.push({ id: 'c-done', title: 'Status done', date: ymd(13), status: 'done', completed_date: ymd(13) });
  rows.push({ id: 'c-canc', title: 'Cancelada', date: ymd(14), status: 'cancelled' });
  rows.push({ id: 'c-time', title: 'Com hora', date: '2026-10-18T09:30:00', status: 'pending', category: 'pessoal' });
  rows.push({ id: 'c-time2', title: 'Com hora feita', date: '2026-10-12T08:00:00', status: 'completed', completed_date: null });

  // 12 pendentes atrasadas antes da semana (teto 10) + sem data, ideias e categoria nula (fora).
  for (let i = 0; i < 12; i += 1) rows.push({ id: `s${pad(i)}`, title: `Atrasada ${i % 5}`, date: i < 8 ? ymd(1 + (i % 4)) : '2026-09-20', status: 'pending', priority: i % 2 ? 'high' : 'low' });
  rows.push({ id: 's-null-cat', title: 'Sem categoria atrasada', date: '2026-10-01', status: 'pending', category: null });
  rows.push({ id: 's-idea', title: 'Ideia atrasada', date: '2026-10-01', status: 'pending', category: 'ideias', idea_status: 'capturada' });
  rows.push({ id: 's-nodate', title: 'Sem data', date: null, status: 'pending' });
  rows.push({ id: 's-inprog', title: 'Em andamento atrasada', date: '2026-10-03', status: 'in_progress', priority: 'high' });
  rows.push({ id: 's-nullstatus', title: 'Status nulo', date: '2026-10-04', status: null });

  // 30 atrasadas para o cockpit (teto 24) com títulos repetidos em datas diferentes e prioridades variadas.
  for (let i = 0; i < 30; i += 1) rows.push({ id: `o${pad(i)}`, title: i % 4 === 0 ? 'P2 - Enviar relatório' : `Atrasada ${i % 9}`, date: ymd(1 + (i % 11)), status: 'pending', priority: ['high', 'medium', 'low', 'urgent'][i % 4], category: i % 5 === 0 ? 'rca' : 'pessoal' });
  // 7 sem data e criadas há mais de uma semana (teto 5).
  for (let i = 0; i < 7; i += 1) rows.push({ id: `f${pad(i)}`, title: `Flutuante ${i}`, date: null, status: 'pending', priority: i === 2 ? 'high' : 'medium', created_date: i === 3 ? '2026-10-05 08:00:00' : `2026-09-0${1 + (i % 3)} 08:0${i}:00` });
  rows.push({ id: 'f-recent', title: 'Flutuante recente', date: null, status: 'pending', created_date: '2026-10-14 10:00:00' });
  // Hoje: 4 pendentes (três ou mais + pouco foco dispara o aviso).
  for (let i = 0; i < 4; i += 1) rows.push({ id: `h${i}`, title: `Hoje ${i}`, date: TODAY, status: i === 3 ? 'completed' : 'pending', completed_date: i === 3 ? TODAY : null });
  rows.push({ id: 'h-idea', title: 'Hoje ideia', date: TODAY, status: 'pending', category: 'ideias', idea_status: 'capturada' });

  // Ideias: 7 paradas (teto 5), 7 promissoras (teto 5), criadas e promovidas na semana.
  for (let i = 0; i < 14; i += 1) rows.push({ id: `i${pad(i)}`, title: `Ideia ${i}`, category: 'ideias', idea_status: i % 2 ? 'promissora' : 'capturada', created_date: i < 3 ? `2026-10-1${i} 09:00:00` : '2026-09-15 09:00:00', updated_date: i % 3 === 0 ? '2026-09-20 10:00:00' : `2026-10-0${1 + (i % 5)} 10:00:00` });
  rows.push({ id: 'i-null-upd', title: 'Ideia sem atualização', category: 'ideias', idea_status: 'capturada', created_date: '2026-09-01 10:00:00', updated_date: null });
  rows.push({ id: 'i-promoted', title: 'Virou tarefa', category: 'ideias', idea_status: 'virou_tarefa', created_date: '2026-10-13 10:00:00', updated_date: '2026-10-14 10:00:00' });
  rows.push({ id: 'i-promoted2', title: 'Virou tarefa tarde', category: 'ideias', idea_status: 'virou_tarefa', created_date: '2026-08-13 10:00:00', updated_date: '2026-10-18 23:59:59' });
  rows.push({ id: 'i-arch', title: 'Ideia arquivada', category: 'ideias', idea_status: 'arquivada', created_date: '2026-09-01 10:00:00', updated_date: '2026-09-01 10:00:00' });

  // Histórico da semana: 85 concluídas (teto 80) para a camada factual, com um título repetido.
  for (let i = 0; i < 85; i += 1) rows.push({ id: `k${pad(i)}`, title: i % 10 === 0 ? 'Revisar contrato' : `Entrega ${i}`, date: ymd(12 + (i % 7)), status: i % 6 === 0 ? 'done' : 'completed', category: ['rca', 'facul', 'treino', 'projeto', 'pessoal', 'gofluxo', 'familia'][i % 7], completed_date: i % 5 === 0 ? null : ymd(12 + (i % 5)) });

  for (const row of shuffled(rows)) put(row);

  // Hábitos: ativos em várias frequências (ids fora da ordem de inserção), rotina com passo, pausado e contador.
  const habit = db.prepare('INSERT INTO habits (id, title, frequency, status, kind, parent_id, tracking_mode, recurrence_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const habits = [
    ['h-zeta', 'P1 - Beber água', 'daily', 'active', 'simple', null, 'check', '[]'], ['h-alfa', 'Ler 10 páginas', 'weekdays', 'active', 'simple', null, 'check', '[]'],
    ['h-mid', 'Caminhar', 'weekends', 'active', 'simple', null, 'check', '[]'], ['h-weekly', 'Revisão', 'weekly', 'active', 'simple', null, 'check', '[1,3]'],
    ['h-routine', 'Abertura do dia', 'daily', 'active', 'compound', null, 'check', '[]'], ['h-step', 'Arrumar a cama', 'daily', 'active', 'simple', 'h-routine', 'check', '[]'],
    ['h-paused', 'Pausado', 'daily', 'paused', 'simple', null, 'check', '[]'], ['h-since', 'Sem fumar', 'daily', 'active', 'simple', null, 'since', '[]'],
    ['h-beta', 'Meditar', 'daily', 'active', 'simple', null, 'check', '[]'], ['h-gamma', 'Alongar', 'daily', 'active', 'simple', null, 'check', '[]'],
    ['h-null-freq', 'Frequência nula', null, 'active', 'simple', null, 'check', '[]'], ['h-bad-rec', 'Recorrência quebrada', 'weekly', 'active', 'simple', null, 'check', 'não é json'],
  ];
  for (const row of shuffled(habits, 11)) habit.run(...row);

  // Registros: semana corrente (fechados, não rolou, abertos), semana passada e janela dos 7 dias do cockpit.
  const log = db.prepare('INSERT INTO habit_logs (id, habit_id, date, completed, outcome, skip_reason) VALUES (?, ?, ?, ?, ?, ?)');
  const logs = [];
  const habitIds = ['h-zeta', 'h-alfa', 'h-mid', 'h-weekly', 'h-routine', 'h-step', 'h-since', 'h-beta', 'h-gamma', 'h-paused'];
  habitIds.forEach((hid, hi) => {
    for (let day = 5; day <= 18; day += 1) {
      const k = (hi * 7 + day) % 5;
      if (k === 4) continue;
      const outcome = k === 0 ? 'skipped' : k === 1 ? null : 'done';
      const completed = k === 2 ? 1 : k === 3 && day % 2 ? 1 : 0;
      logs.push([`l-${hid}-${day}`, hid, ymd(day), completed, outcome, outcome === 'skipped' ? ['time', 'energy', 'context', 'other', null][(hi + day) % 5] : null]);
    }
  });
  for (const row of shuffled(logs, 3)) log.run(...row);
  // Hoje e ontem do cockpit com combinações de fechado/aberto/não rolou em hábitos devidos nos dois dias.
  const today = db.prepare('UPDATE habit_logs SET completed = ?, outcome = ? WHERE habit_id = ? AND date = ?');
  today.run(0, 'skipped', 'h-beta', '2026-10-14'); today.run(0, null, 'h-beta', TODAY);
  db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date IN (?, ?)').run('h-gamma', '2026-10-14', TODAY);
  db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date IN (?, ?)').run('h-zeta', '2026-10-14', TODAY);
  db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date IN (?, ?)').run('h-routine', '2026-10-14', TODAY);
  // Três ou mais "não rolou" na janela de 7 dias.
  for (const day of [9, 10, 11]) db.prepare("UPDATE habit_logs SET outcome = 'skipped', completed = 0 WHERE habit_id = 'h-mid' AND date = ?").run(ymd(day));

  // Foco e bem-estar da semana.
  const focus = db.prepare('INSERT INTO focus_sessions (id, task_id, date, duration_seconds, created_date) VALUES (?, ?, ?, ?, ?)');
  [['fs1', ymd(12), 1500], ['fs2', ymd(12), 1500], ['fs3', ymd(13), 900], ['fs4', ymd(18), 1800], ['fs5', '2026-10-11', 600], ['fs6', '2026-10-19', 600], ['fs7', TODAY, 600], ['fs8', ymd(14), null], ['fs9', ymd(14), 0]]
    .forEach(([id, date, seconds]) => focus.run(id, null, date, seconds, `${date} 10:00:00`));
  const well = db.prepare('INSERT INTO wellness_checks (id, date, sleep_hours, sleep_quality, mood, productivity) VALUES (?, ?, ?, ?, ?, ?)');
  [['w1', ymd(12), 6.1, 3, 4, 3], ['w2', ymd(13), 7.3, 4, 5, 4], ['w3', ymd(14), 8.2, 2, 2, 5], ['w4', ymd(17), 5.7, 5, 3, 1], ['w5', '2026-10-11', 7, 3, 3, 3], ['w6', '2026-10-19', 7, 3, 3, 3]]
    .forEach((r) => well.run(...r));

  // Capturas com falha (o cockpit conta) e frentes com avanços na semana.
  const capture = db.prepare('INSERT INTO capture_queue (id, status) VALUES (?, ?)');
  ['failed', 'pending', 'failed', 'archived'].forEach((status, i) => capture.run(`cq${i}`, status));
  const project = db.prepare("INSERT INTO projects (id, slug, name, kind, \"column\", focus, live, revision) VALUES (?, ?, ?, 'produto', 'agora', 0, 0, 1)");
  for (const [id, slug, name] of shuffled([['p1', 'rca-site', 'RCA Site'], ['p2', 'gofluxo', 'GoFluxo'], ['p3', 'animalia', 'Animália'], ['p4', 'faculdade', 'Faculdade'], ['p5', 'praxis', 'Praxis'], ['p6', 'mistério', 'Outro']], 5)) project.run(id, slug, name);
  const update = db.prepare('INSERT INTO project_updates (id, project_id, date, summary, source, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const updates = [
    ['u1', 'p1', ymd(12), 'Revisar contrato do site', 'manual', '2026-10-12 08:00:00'], ['u2', 'p2', ymd(12), 'Entrega 4 do fluxo', 'alfred', '2026-10-12 08:00:00'],
    ['u3', 'p3', ymd(13), 'Animália no ar', null, '2026-10-13 09:00:00'], ['u4', 'p4', ymd(13), '  Prova de cálculo  ', 'manual', '2026-10-13 09:00:00'],
    ['u5', 'p5', ymd(14), '', 'manual', '2026-10-14 09:00:00'], ['u6', 'p-ausente', '2026-10-15', 'Frente que sumiu', 'manual', '2026-10-15 09:00:00'],
    ['u7', 'p6', ymd(16), 'Algo sem área', 'manual', '2026-10-16 09:00:00'], ['u8', 'p1', '2026-10-11', 'Fora da semana', 'manual', '2026-10-11 09:00:00'],
    ['u9', 'p1', ymd(18), 'Fim da semana', 'manual', '2026-10-18 09:00:00'], ['u10', 'p1', '2026-10-19', 'Depois', 'manual', '2026-10-19 09:00:00'],
  ];
  db.pragma('foreign_keys = OFF');
  for (let i = 0; i < 6; i += 1) updates.push([`ux${i}`, 'p1', ymd(15), `Passo extra ${i}`, 'manual', '2026-10-15 09:00:00']);
  for (const row of shuffled(updates, 9)) update.run(...row);
  db.pragma('foreign_keys = ON');
}

/** Copia as linhas das tabelas para `users/{uid}/<tabela>/{id}` com `_row` = rowid. */
export async function copyToFirestore(userDoc, db, tables = INSIGHTS_TABLES) {
  for (const table of tables) {
    const rows = db.prepare(`SELECT rowid AS _rowid, * FROM ${table} ORDER BY rowid`).all();
    for (let i = 0; i < rows.length; i += 500) {
      const batch = userDoc.firestore.batch();
      for (const { _rowid, ...row } of rows.slice(i, i + 500)) batch.create(userDoc.collection(camel(table)).doc(documentId(row.id)), { ...row, _row: _rowid });
      await batch.commit();
    }
  }
}
