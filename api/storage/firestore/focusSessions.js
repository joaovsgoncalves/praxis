import { StorageError } from '../contract.js';
import { compareSqlite } from '../sqliteOrder.js';
import { FOCUS_FIELDS } from '../domains/phase3.js';
import { phase3Rows } from './phase3Rows.js';

const unsupported = (detail) => new StorageError('sqlite_coercion_unsupported', `sqlite_coercion_unsupported: ${detail}`);

/** SUM() do SQLite só no subconjunto exato: inteiros seguros e NULL. Fração ou texto = recusa. */
function sumIntegers(values) {
  let total = null;
  for (const value of values) {
    if (value === null) continue;
    if (!Number.isInteger(value)) throw unsupported(`SUM com ${typeof value} ${value}`);
    total = (total ?? 0) + value;
    if (!Number.isSafeInteger(total)) throw unsupported('SUM fora da faixa segura');
  }
  return total;
}

/** `users/{uid}/focusSessions`: mesmas consultas da rota antiga, em memória (ver phase3Rows.js). */
export function firestoreFocusSessions(userDoc, transaction, client) {
  const base = phase3Rows(userDoc, transaction, client, 'focusSessions', FOCUS_FIELDS);
  return {
    get: base.get,
    create: base.create,
    // ORDER BY created_date DESC: NULL por último; empate na ordem de inserção (ordenação estável).
    async list({ date, limit }) {
      const rows = (await base.all()).filter(({ row }) => date === null || row.date === date);
      rows.sort((a, b) => compareSqlite(b.row.created_date, a.row.created_date) || a.seq - b.seq);
      return rows.slice(0, limit).map(({ row }) => row);
    },
    // WHERE created_date >= ? (texto, NULL fora) / GROUP BY task_id, task_title (grupos em ordem
    // crescente) / ORDER BY total DESC estável sobre a ordem dos grupos / LIMIT.
    async stats({ since, limit }) {
      const groups = new Map();
      for (const { row } of await base.all()) {
        if (row.created_date === null || compareSqlite(row.created_date, since) < 0) continue;
        const key = JSON.stringify([row.task_id, row.task_title]);
        if (!groups.has(key)) groups.set(key, { task_id: row.task_id, title: row.task_title, values: [] });
        groups.get(key).values.push(row.duration_seconds);
      }
      const ordered = [...groups.values()].sort((a, b) => compareSqlite(a.task_id, b.task_id) || compareSqlite(a.title, b.title))
        .map((g) => ({ task_id: g.task_id, task_title: g.title ?? '(sem tarefa)', total_seconds: sumIntegers(g.values), sessions: g.values.length }));
      ordered.sort((a, b) => compareSqlite(b.total_seconds, a.total_seconds));
      return ordered.slice(0, limit);
    },
  };
}
