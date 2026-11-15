import { compareSqlite } from '../sqliteOrder.js';
import { WELLNESS_FIELDS } from '../domains/phase3.js';
import { phase3Rows } from './phase3Rows.js';

/** `users/{uid}/wellnessChecks`: mesmas consultas da rota antiga, em memória (ver phase3Rows.js). */
export function firestoreWellnessChecks(userDoc, transaction, client) {
  const base = phase3Rows(userDoc, transaction, client, 'wellnessChecks', WELLNESS_FIELDS);
  return {
    get: base.get,
    create: base.create,
    patch: base.patch,
    // ORDER BY date DESC, empate na ordem de inserção.
    async list({ date, limit }) {
      const rows = (await base.all()).filter(({ row }) => date === null || row.date === date);
      rows.sort((a, b) => compareSqlite(b.row.date, a.row.date) || a.seq - b.seq);
      return rows.slice(0, limit).map(({ row }) => row);
    },
    // Sem ORDER BY no SQLite: o primeiro na ordem do rowid. Dentro de transação, ler a coleção
    // inteira faz upserts concorrentes do mesmo dia entrarem em conflito (um repete e vira update).
    async findByDate(date) {
      return (await base.all()).find(({ row }) => row.date === date)?.row ?? null;
    },
  };
}
