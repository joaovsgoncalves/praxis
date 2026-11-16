import { StorageError } from '../contract.js';
import { originalId } from '../schema.mjs';
import { compareSqlite } from '../sqliteOrder.js';

/**
 * Leitura dos insights no Firestore, só leitura, nas coleções `users/{uid}/<camelCase(tabela)>` com o
 * mapeamento do FROZEN §2 (documento = linha SQLite + `_row`). Cada método devolve o mesmo que a consulta
 * do SQLite (storage/sqlite/insightsRead.js): filtro, ordem, teto e NULL como o SQL, com a comparação de
 * `sqliteOrder.js` (NULL < número < texto em bytes UTF-8).
 *
 * - Cada consulta usa só filtro de um campo (igualdade ou faixa), sem índice composto; o resto do filtro é
 *   refeito em memória com a regra do SQL. Premissa: o documento guarda o valor como o SQLite guardou (texto
 *   em coluna TEXT, número em coluna numérica), é o que a gravação de cada fase faz.
 * - ceiling: tarefas abertas (atrasadas, sem data) e todas as de ideia são lidas inteiras antes do LIMIT;
 *   registros de hábito, foco e bem-estar entram por faixa de data. Dezenas a poucas centenas de documentos
 *   por conta; revisar se a conta passar de milhares de tarefas abertas.
 * - ordem de inserção (rowid do SQL): `_row`; sem ele, depois dos que têm, pelo id.
 */
const MAX_CHAR = '\u{10FFFF}';
const CLOSED = ['completed', 'done', 'cancelled'];
const isNull = (value) => value === null || value === undefined;
const ne = (value, literal) => !isNull(value) && compareSqlite(value, literal) !== 0;
const notIn = (value, list) => !isNull(value) && !list.includes(value);
const inList = (value, list) => !isNull(value) && list.includes(value);
const sub10 = (value) => (isNull(value) ? null : Array.from(String(value)).slice(0, 10).join(''));
const between = (value, low, high) => !isNull(value) && compareSqlite(value, low) >= 0 && compareSqlite(value, high) <= 0;
const desc = (a, b) => compareSqlite(b, a);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function pick(row, columns) { return Object.fromEntries(columns.map((column) => [column, row[column] ?? null])); }

export function firestoreInsightsRead(userDoc, transaction) {
  const col = (name) => userDoc.collection(name);
  const run = (query) => (transaction ? transaction.get(query) : query.get());

  async function rows(query) {
    const snap = await run(query);
    return snap.docs.map((doc) => {
      const { _row, ...row } = doc.data();
      originalId(doc.id, row.id);
      return { row, key: doc.ref.path, seq: typeof _row === 'number' ? _row : Number.POSITIVE_INFINITY };
    });
  }
  /** Documentos de várias consultas sem repetir o mesmo documento. */
  async function union(...queries) {
    const seen = new Map();
    for (const query of queries) for (const item of await rows(query)) seen.set(item.key, item);
    return [...seen.values()];
  }
  /** Ordena pelas chaves e desempata pela ordem de inserção; `keys` = [[valor(row), comparador]]. */
  function order(items, keys) {
    return items.sort((a, b) => {
      for (const [value, compare = compareSqlite] of keys) {
        const diff = compare(value(a.row), value(b.row));
        if (diff) return diff;
      }
      return (a.seq === b.seq ? 0 : a.seq - b.seq) || compareSqlite(a.row.id, b.row.id);
    });
  }
  const range = (name, field, from, to) => col(name).where(field, '>=', from).where(field, '<=', to);
  const week = async (name, from, to) => union(range(name, 'date', from, to), range(name, 'completed_date', from, to));
  const inWeek = (row, from, to) => (!isNull(row.date) && between(row.date, from, to)) || (!isNull(row.completed_date) && between(row.completed_date, from, to));
  const openTask = (row) => notIn(row.status, CLOSED) && ne(row.category, 'ideias');

  return {
    // --- best-hours / correlação ---
    async focusSessionsSince(cutoff) {
      const found = await rows(col('focusSessions').where('created_date', '>=', cutoff));
      return order(found, [[(r) => r.created_date, desc]]).map(({ row }) => pick(row, ['created_date', 'duration_seconds']));
    },
    async wellnessSince(from) {
      const found = await rows(col('wellnessChecks').where('date', '>=', from));
      return order(found, [[(r) => r.date]]).map(({ row }) => pick(row, ['date', 'sleep_hours', 'sleep_quality', 'mood', 'productivity']));
    },
    // --- semanal ---
    async completedTasksOfWeek(from, to) {
      const found = (await week('tasks', from, to)).filter(({ row }) => row.status === 'completed' && ne(row.category, 'ideias') && inWeek(row, from, to));
      return order(found, [[(r) => r.completed_date, desc], [(r) => r.updated_date, desc]]).slice(0, 50)
        .map(({ row }) => pick(row, ['id', 'title', 'priority', 'category', 'date', 'completed_date']));
    },
    async stalePendingTasks(before) {
      const found = (await rows(col('tasks').where('status', '==', 'pending')))
        .filter(({ row }) => ne(row.category, 'ideias') && !isNull(row.date) && compareSqlite(row.date, before) < 0);
      return order(found, [[(r) => r.date]]).slice(0, 10).map(({ row }) => pick(row, ['title']));
    },
    async activeHabits() {
      const found = await rows(col('habits').where('status', '==', 'active'));
      return order(found, []).map(({ row }) => row);
    },
    async habitLogs(from, to) {
      const found = await rows(range('habitLogs', 'date', from, to));
      return order(found, [[(r) => r.habit_id], [(r) => r.date]]).map(({ row }) => pick(row, ['habit_id', 'date', 'completed', 'outcome', 'skip_reason']));
    },
    async taskDayCounts(from, to) {
      // `substr(date, 1, 10)` está na faixa: o campo inteiro começa no mesmo dia (limite de cima só com data ISO).
      let query = col('tasks').where('date', '>=', from);
      if (ISO_DAY.test(to)) query = query.where('date', '<=', `${to}${MAX_CHAR}`);
      const days = new Map();
      for (const { row } of await rows(query)) {
        const day = sub10(row.date);
        if (isNull(row.date) || !between(day, from, to) || !ne(row.category ?? '', 'ideias') || !ne(row.status ?? 'pending', 'cancelled')) continue;
        const entry = days.get(day) ?? { day, total: 0, done: 0 };
        entry.total += 1;
        if (inList(row.status, ['completed', 'done'])) entry.done += 1;
        days.set(day, entry);
      }
      return [...days.values()].sort((a, b) => compareSqlite(a.day, b.day));
    },
    async focusTotals(from, to) {
      const found = await rows(range('focusSessions', 'date', from, to));
      let total = 0;
      for (const { row } of found) {
        const value = row.duration_seconds;
        if (isNull(value)) continue;
        // SUM do SQLite trata texto como número parcial e vira REAL: fora do subconjunto provado.
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new StorageError('sqlite_coercion_unsupported');
        total += value;
      }
      return { sessions: found.length, total_seconds: total };
    },
    async wellnessBetween(from, to) {
      const found = await rows(range('wellnessChecks', 'date', from, to));
      return order(found, []).map(({ row }) => pick(row, ['date', 'sleep_hours', 'sleep_quality', 'mood', 'productivity']));
    },
    async ideaCounts(from, to) {
      const ideas = (await rows(col('tasks').where('category', '==', 'ideias'))).map(({ row }) => row);
      return {
        created: ideas.filter((row) => between(sub10(row.created_date), from, to)).length,
        promoted: ideas.filter((row) => row.idea_status === 'virou_tarefa' && between(sub10(row.updated_date), from, to)).length,
      };
    },
    async promissoras() {
      const found = (await rows(col('tasks').where('category', '==', 'ideias'))).filter(({ row }) => row.idea_status === 'promissora');
      return order(found, [[(r) => r.updated_date, desc]]).slice(0, 5).map(({ row }) => pick(row, ['title']));
    },
    async projectNames() {
      return order(await rows(col('projects')), []).map(({ row }) => pick(row, ['id', 'slug', 'name']));
    },
    async projectUpdatesBetween(from, to) {
      const found = await rows(range('projectUpdates', 'date', from, to));
      return order(found, [[(r) => r.date], [(r) => r.created_at]]).map(({ row }) => pick(row, ['date', 'project_id', 'summary', 'source']));
    },
    async completedTasksForHistory(from, to) {
      const found = (await week('tasks', from, to)).filter(({ row }) => inList(row.status, ['completed', 'done']) && ne(row.category, 'ideias') && inWeek(row, from, to));
      return order(found, [[(r) => (isNull(r.completed_date) ? r.date : r.completed_date), desc]]).slice(0, 80).map(({ row }) => pick(row, ['title', 'category']));
    },
    // --- cockpit "o que estou evitando" ---
    async overdueTasks(today) {
      const found = (await rows(col('tasks').where('status', 'not-in', CLOSED)))
        .filter(({ row }) => openTask(row) && !isNull(row.date) && compareSqlite(row.date, today) < 0);
      return order(found, [[(r) => r.date], [(r) => r.priority, desc]]).slice(0, 24).map(({ row }) => pick(row, ['id', 'title', 'date', 'priority', 'category']));
    },
    async floatingTasks(before) {
      const found = (await rows(col('tasks').where('date', '==', null)))
        .filter(({ row }) => openTask(row) && !isNull(sub10(row.created_date)) && compareSqlite(sub10(row.created_date), before) <= 0);
      return order(found, [[(r) => r.created_date]]).slice(0, 5).map(({ row }) => pick(row, ['id', 'title', 'priority', 'created_date']));
    },
    async staleIdeas(before) {
      const found = (await rows(col('tasks').where('category', '==', 'ideias')))
        .filter(({ row }) => inList(row.idea_status, ['capturada', 'promissora'])
          && !isNull(sub10(row.updated_date ?? row.created_date)) && compareSqlite(sub10(row.updated_date ?? row.created_date), before) <= 0);
      return order(found, [[(r) => r.updated_date]]).slice(0, 5).map(({ row }) => pick(row, ['id', 'title', 'idea_status', 'updated_date']));
    },
    async closedHabitIds(date) {
      const found = (await rows(col('habitLogs').where('date', '==', date)))
        .filter(({ row }) => row.completed === 1 || row.outcome === 'skipped' || row.outcome === 'done');
      return order(found, []).map(({ row }) => row.habit_id);
    },
    async skippedHabitIds(date) {
      const found = (await rows(col('habitLogs').where('date', '==', date))).filter(({ row }) => row.outcome === 'skipped');
      return order(found, []).map(({ row }) => row.habit_id);
    },
    async skippedHabitCounts(after, upto) {
      const found = (await rows(col('habitLogs').where('date', '>', after).where('date', '<=', upto))).filter(({ row }) => row.outcome === 'skipped');
      const counts = new Map();
      for (const { row } of found) counts.set(row.habit_id, (counts.get(row.habit_id) ?? 0) + 1);
      return [...counts].filter(([, skips]) => skips >= 3).sort((a, b) => compareSqlite(a[0], b[0])).map(([habit_id, skips]) => ({ habit_id, skips }));
    },
    async failedCaptureCount() { return (await rows(col('captureQueue').where('status', '==', 'failed'))).length; },
    async pendingTodayCount(today) {
      return (await rows(col('tasks').where('date', '==', today))).filter(({ row }) => openTask(row)).length;
    },
  };
}
