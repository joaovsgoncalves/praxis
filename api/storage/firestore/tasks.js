import { TASK_ROW_FIELDS } from '../contract.js';
import { compareSqlite, maxSqlite } from '../sqliteOrder.js';
import { phase3Rows } from './phase3Rows.js';

const CLOSED = new Set(['completed', 'done', 'cancelled']);
const OPEN = new Set(['pending', 'in_progress']);
const nullLast = (value) => (value === null ? 1 : 0);
const chars = (text, count) => Array.from(text).slice(0, count).join('');

/** `ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC`; empate na ordem de inserção. */
const bySortThenNewest = (a, b) => (nullLast(a.row.sort_order) - nullLast(b.row.sort_order))
  || compareSqlite(a.row.sort_order, b.row.sort_order) || compareSqlite(b.row.created_date, a.row.created_date) || (a.seq - b.seq);

/**
 * `users/{uid}/tasks/{locator}`; `transaction` ausente = operação direta.
 *
 * Documento = linha SQLite (colunas na ordem da tabela) + `_row` (ordem de inserção, o rowid), com a
 * sequência `users/{uid}/sequences/tasks` lida e gravada no mesmo commit de cada criação. Documento sem
 * `_row` (criado antes da sequência, fases 1-2) vale 0: vem antes dos numerados e empata por id (bytes).
 * As consultas das rotas leem a coleção inteira e filtram/ordenam em memória com a comparação do
 * SQLite (NULL < número < texto em bytes). ceiling: troca por consulta indexada se a conta crescer.
 */
export function firestoreTasks(col, transaction) {
  // O driver entrega a coleção; o dono (documento do usuário) e o cliente saem dela.
  const base = phase3Rows(col.parent, transaction, col.firestore, 'tasks', TASK_ROW_FIELDS);
  const all = () => base.all();
  const chain = (row, parentRef) => row.recurrence_parent_id === parentRef || row.id === parentRef;
  return {
    get: base.get,
    // MAX(sort_order) do SQLite (NULL ignorado, texto acima de número). ceiling: lê a coleção inteira.
    async maxSort() { return maxSqlite((await all()).map(({ row }) => row.sort_order)); },
    async maxSortExcept(id) { return maxSqlite((await all()).filter(({ row }) => row.id !== id).map(({ row }) => row.sort_order)); },
    async idsByGoal(goalId) { return (await all()).filter(({ row }) => row.goal_id === goalId).map(({ row }) => row.id); },
    async clearGoal(ids) { for (const id of ids) await base.patch(id, { goal_id: null }); },
    /** Contrato genérico: filtro por data/status, `ORDER BY id`, janela. */
    async list({ limit, offset, ...filters }) {
      return (await all()).map(({ row }) => row)
        .filter((row) => ['date', 'status'].every((key) => !Object.hasOwn(filters, key) || row[key] === filters[key]))
        .sort((a, b) => compareSqlite(a.id, b.id)).slice(offset, offset + limit);
    },
    nextRow: base.nextRow,
    create: base.create,
    createAt: base.createAt,
    patch: base.patch,
    remove: base.remove,

    // ---- consultas das rotas (mesma regra e mesma ordem das consultas da rota antiga) ----
    async search({ date, status, category, idea_status, limit, offset }) {
      const want = { date, status, category, idea_status };
      return (await all()).filter(({ row }) => Object.entries(want).every(([key, value]) => value === null || row[key] === value))
        .sort(bySortThenNewest).slice(offset, offset + limit).map(({ row }) => row);
    },
    async all() { return (await all()).sort(bySortThenNewest).map(({ row }) => row); },
    /** Abertas fora de ideias: `(date IS NULL), date, priority DESC, sort_order IS NULL, sort_order`, 150. */
    async operational() {
      return (await all()).filter(({ row }) => row.status !== null && !CLOSED.has(row.status) && row.category !== null && row.category !== 'ideias')
        .sort((a, b) => (nullLast(a.row.date) - nullLast(b.row.date)) || compareSqlite(a.row.date, b.row.date) || compareSqlite(b.row.priority, a.row.priority)
          || (nullLast(a.row.sort_order) - nullLast(b.row.sort_order)) || compareSqlite(a.row.sort_order, b.row.sort_order) || (a.seq - b.seq))
        .slice(0, 150).map(({ row }) => row);
    },
    /** Concluídas no dia (`completed_date`, ou o dia de `completed_at`/`updated_date` se vazio), `updated_date DESC`, 80. */
    async completedOn(today) {
      return (await all()).filter(({ row }) => (row.status === 'completed' || row.status === 'done') && row.category !== null && row.category !== 'ideias'
        && (row.completed_date === today
          || ((row.completed_date === null || row.completed_date === '') && chars(row.completed_at ?? row.updated_date ?? '', 10) === today)))
        .sort((a, b) => compareSqlite(b.row.updated_date, a.row.updated_date) || (a.seq - b.seq)).slice(0, 80).map(({ row }) => row);
    },
    /** "Não rolou" a partir de `since`: `day_outcome_date DESC`, 60. */
    async missedSince(since) {
      return (await all()).filter(({ row }) => row.status === 'cancelled' && row.day_outcome === 'missed' && row.day_outcome_date !== null
        && compareSqlite(row.day_outcome_date, since) >= 0)
        .sort((a, b) => compareSqlite(b.row.day_outcome_date, a.row.day_outcome_date) || (a.seq - b.seq)).slice(0, 60).map(({ row }) => row);
    },
    /** Ocorrência da série (pai ou filhas) numa data, exceto `exceptId`: a mais antiga por `created_date`. */
    async findOccurrence(parentRef, date, exceptId) {
      const found = (await all()).filter(({ row }) => chain(row, parentRef) && row.date === date && row.id !== exceptId)
        .sort((a, b) => compareSqlite(a.row.created_date, b.row.created_date) || (a.seq - b.seq))[0];
      return found ? { id: found.row.id } : null;
    },
    async hasOpenUpcoming(parentRef, today) {
      return (await all()).some(({ row }) => chain(row, parentRef) && row.date !== null && compareSqlite(row.date, today) >= 0 && OPEN.has(row.status));
    },
    /** Recorrentes (ou blocos com hora do Sêneca) abertas de dia anterior, `date ASC`. */
    async staleForRollover(today) {
      return (await all()).filter(({ row }) => ((row.recurrence !== null && row.recurrence !== 'none') || (row.source === 'seneca' && row.time !== null && row.time !== ''))
        && row.date !== null && row.date !== '' && compareSqlite(row.date, today) < 0 && OPEN.has(row.status) && row.category !== null && row.category !== 'ideias')
        .sort((a, b) => compareSqlite(a.row.date, b.row.date) || (a.seq - b.seq)).map(({ row }) => row);
    },
    /** `UPDATE tasks SET sort_order = <posição> WHERE id = <id>`; id que não existe não faz nada. */
    async reorder(entries) {
      const present = new Set((await all()).map(({ row }) => row.id));
      for (const [id, position] of entries) if (present.has(id)) await base.patch(id, { sort_order: position });
    },
  };
}
