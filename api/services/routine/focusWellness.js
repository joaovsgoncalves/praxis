/**
 * Foco e bem-estar sobre a camada assíncrona, com o comportamento das rotas antigas (oráculos em
 * test-support/oracles/focus.bcbadad.js e wellness.bcbadad.js):
 *
 * - foco, lista: `date` = igualdade, ordem `created_date DESC`, 50 linhas;
 * - foco, criar: UUID, `task_id`/`task_title` vazios viram NULL, data padrão = hoje em UTC,
 *   duração padrão 0, afinidade das colunas; `created_date` = agora (formato `datetime('now')`);
 * - foco, estatística: corte `now - days` (dias locais) comparado como TEXTO com `created_date`
 *   (ISO com `T` contra carimbo com espaço, igual à antiga), agrupado por tarefa e título, 20 linhas;
 * - bem-estar, lista: `date` = igualdade, ordem `date DESC`, 30 linhas;
 * - bem-estar, gravar: upsert pelo primeiro registro do dia (ordem de inserção); campos ausentes
 *   voltam ao padrão (7, 3, 3, 3, ''); 200 ao atualizar, 201 ao criar. Busca e gravação na MESMA
 *   transação: dois envios do mesmo dia não criam dois registros.
 *
 * Diferenças intencionais (nenhum consumidor manda; tela e Alfred mandam número inteiro/real):
 * (1) duração que não vira inteiro (fração, texto) é recusada: o Firestore não reproduz o SUM do
 *     SQLite sobre fração/texto; (2) texto em `sleep_hours` (REAL) é recusado; (3) lista/objeto que
 *     desloca parâmetros sem mudar a contagem é recusado. Todas com `sqlite_coercion_unsupported`.
 */
import { randomUUID } from 'node:crypto';
import { bindPositional, applyAffinity } from '../../storage/sqliteSemantics.js';
import { bindRow, unsupported, sqliteError, sqlStamp } from './affinity.js';

const FOCUS_INSERT = [['id', 'TEXT'], ['task_id', 'TEXT'], ['task_title', 'TEXT'], ['date', 'TEXT'], ['duration_seconds', 'INTEGER']];
const WELLNESS_VALUES = [['sleep_hours', 'REAL'], ['sleep_quality', 'INTEGER'], ['mood', 'INTEGER'], ['productivity', 'INTEGER'], ['note', 'TEXT']];
const WELLNESS_INSERT = [['id', 'TEXT'], ['date', 'TEXT'], ...WELLNESS_VALUES];

/** `WHERE date = ?` só quando `date` veio: mesma montagem de parâmetros da consulta antiga. */
function dateFilter(date) {
  if (!date) return null;
  const [bound] = bindPositional([date], 1);
  if (typeof bound !== 'string') throw unsupported('filtro de data sem texto');
  return bound;
}

export function createFocusService({ storage, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.focusSessions) throw new TypeError('focus service requires storage');
  return Object.freeze({
    list: ({ date } = {}) => storage.focusSessions.list({ date: dateFilter(date), limit: 50 }),
    async create(body) {
      const { task_id, task_title, date, duration_seconds } = body;
      const row = bindRow(FOCUS_INSERT, [newId(), task_id || null, task_title || null, date || now().toISOString().split('T')[0], duration_seconds || 0]);
      if (row.duration_seconds !== null && !Number.isInteger(row.duration_seconds)) throw unsupported(`duration_seconds ${JSON.stringify(row.duration_seconds)} não é inteiro`);
      return storage.focusSessions.create({ ...row, created_date: sqlStamp(now()) });
    },
    async stats(daysParam) {
      const days = Number(daysParam) || 30;
      const cutoff = new Date(now());
      cutoff.setDate(cutoff.getDate() - days);
      const rows = await storage.focusSessions.stats({ since: cutoff.toISOString(), limit: 20 });
      return rows.map((r) => ({
        task_id: r.task_id,
        task_title: r.task_title,
        total_seconds: r.total_seconds || 0,
        total_minutes: Math.round((r.total_seconds || 0) / 60),
        sessions: r.sessions,
      }));
    },
  });
}

export function createWellnessService({ storage, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.wellnessChecks || typeof storage.transaction !== 'function') throw new TypeError('wellness service requires storage');
  return Object.freeze({
    list: ({ date } = {}) => storage.wellnessChecks.list({ date: dateFilter(date), limit: 30 }),
    /** `{ created, row }`; o chamador já recusou `date` vazio (400). */
    async upsert(body) {
      const id = newId();
      const { date, sleep_hours = 7, sleep_quality = 3, mood = 3, productivity = 3, note = '' } = body;
      // `date = ?` com coluna TEXT: o parâmetro ganha a afinidade TEXT antes de comparar (5 -> '5.0').
      const [bound] = bindPositional([date], 1);
      const key = bound === null ? null : applyAffinity(bound, 'TEXT');
      return storage.transaction(async (tx) => {
        const existing = key === null ? null : await tx.wellnessChecks.findByDate(key);
        if (existing) {
          const fields = bindRow([...WELLNESS_VALUES, ['id', 'TEXT']], [sleep_hours, sleep_quality, mood, productivity, note, existing.id]);
          delete fields.id;
          await tx.wellnessChecks.patch(existing.id, fields);
          return { created: false, row: { ...existing, ...fields } };
        }
        const row = bindRow(WELLNESS_INSERT, [id, date, sleep_hours, sleep_quality, mood, productivity, note]);
        if (row.date === null) throw sqliteError('SQLITE_CONSTRAINT_NOTNULL', 'NOT NULL constraint failed: wellness_checks.date');
        return { created: true, row: await tx.wellnessChecks.create({ ...row, created_date: sqlStamp(now()) }) };
      });
    },
  });
}
