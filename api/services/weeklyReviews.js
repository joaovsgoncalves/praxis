/**
 * Revisões semanais sobre a camada de persistência assíncrona, com o mesmo comportamento da rota
 * antiga (oráculo em test-support/oracles/weeklyReviews.bcbadad.js):
 *
 * - semana âncora por `mondayOf` (data inválida = RangeError, como antes);
 * - POST é "substitui a semana inteira": campos ausentes voltam ao padrão ('' e nota 3);
 * - valores passam pela mesma ligação e afinidade do SQLite (número em texto vira "5.0", nota "4" vira 4);
 * - GET usa `Math.min(Number(limit) || 12, 52)` e o LIMIT do SQLite (negativo = tudo, fração = erro);
 * - DELETE responde `{ success: true }` exista ou não.
 *
 * Diferença intencional e única: lista com tamanho diferente de 1 ou objeto no meio dos campos
 * deslocava os parâmetros e gravava dados desalinhados sem erro. Agora é `sqlite_coercion_unsupported`
 * (500). Nem a tela nem o Alfred mandam isso (texto e nota inteira de 1 a 5).
 */
import { randomUUID } from 'node:crypto';
import { mondayOf } from '../lib/week.js';
import { sqliteRow, sqliteLimit } from '../storage/sqliteSemantics.js';
import { StorageError } from '../storage/contract.js';

const VALUE_COLUMNS = [['highlights', 'TEXT'], ['blockers', 'TEXT'], ['learnings', 'TEXT'], ['next_week_focus', 'TEXT'], ['overall_score', 'INTEGER']];
const sqlStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

function refuseShift(values) {
  if (values.some((value) => (Array.isArray(value) && value.length !== 1) || (value && typeof value === 'object' && !Array.isArray(value)))) {
    throw new StorageError('sqlite_coercion_unsupported', 'sqlite_coercion_unsupported: parâmetros deslocados por lista ou objeto');
  }
}

export function createWeeklyReviewsService({ storage, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.weeklyReviews || typeof storage.transaction !== 'function') throw new TypeError('weekly reviews service requires storage');

  async function list(rawLimit) {
    const limit = sqliteLimit(Math.min(Number(rawLimit) || 12, 52));
    return storage.weeklyReviews.list({ limit });
  }

  async function current(rawDate) {
    const weekStart = mondayOf(rawDate);
    return { week_start: weekStart, review: (await storage.weeklyReviews.getByWeek(weekStart)) || null };
  }

  async function saveOnce(weekStart, values) {
    return storage.transaction(async (tx) => {
      const existing = await tx.weeklyReviews.getByWeek(weekStart);
      const stamp = sqlStamp(now());
      if (existing) {
        const row = sqliteRow([...VALUE_COLUMNS, ['id', 'TEXT']], [...values, existing.id]);
        refuseShift(values);
        delete row.id;
        await tx.weeklyReviews.patch(existing.id, { ...row, updated_date: stamp });
        // Leitura depois de escrita é proibida: a linha devolvida é a que acabou de ser gravada.
        return { status: 200, review: { ...existing, ...row, updated_date: stamp } };
      }
      const row = sqliteRow([['id', 'TEXT'], ['week_start', 'TEXT'], ...VALUE_COLUMNS], [newId(), weekStart, ...values]);
      refuseShift(values);
      return { status: 201, review: await tx.weeklyReviews.create({ ...row, created_date: stamp, updated_date: stamp }) };
    });
  }

  async function save(body) {
    const {
      week_start, highlights = '', blockers = '', learnings = '',
      next_week_focus = '', overall_score = 3,
    } = body;
    const weekStart = mondayOf(week_start);
    const values = [highlights, blockers, learnings, next_week_focus, overall_score];
    try {
      return await saveOnce(weekStart, values);
    } catch (error) {
      // Outra requisição criou a mesma semana no meio: como no SQLite em série, esta vira atualização.
      if (error?.code !== 'already_exists') throw error;
      return saveOnce(weekStart, values);
    }
  }

  async function remove(id) {
    try {
      await storage.weeklyReviews.remove(id);
    } catch (error) {
      // Id que nenhum registro pode ter (vazio, longo demais): igual a apagar o que não existe.
      if (error?.code !== 'invalid_record_id') throw error;
    }
    return { success: true };
  }

  return Object.freeze({ list, current, save, remove });
}
