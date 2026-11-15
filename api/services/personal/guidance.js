/**
 * Orientação do dia sobre a camada assíncrona, com o comportamento de continuityGuidance.js no
 * commit bcbadad (oráculo em test-support/oracles/continuityGuidance.bcbadad.js):
 *
 * - PUT: as mesmas recusas antes de abrir a transação; dentro dela, a trava `expected_generated_at`
 *   contra o que está gravado, a validação (que lê as frentes citadas), e a troca do conjunto
 *   inteiro de 0 a 3 ações numa gravação só. Leituras todas antes da gravação.
 * - Como na rota antiga, a trava olha a data da URL como veio e a gravação usa a data aparada.
 * - GET/resposta: prioridades em ordem de rank, cada uma com a frente achada por id ou slug
 *   (a mesma busca de `getProject`), `fresh` só com linha legível.
 */
import { applyAffinity, bindPositional } from '../../storage/sqliteSemantics.js';
import { recordId } from '../../storage/contract.js';
import { ALLOWED_REASON_CODES, isValidCivilDate, isValidIsoTimestampWithTz } from '../../continuityGuidance.js';
import { mapRow } from './projects.js';

const WRITE_ROOT_KEYS = new Set(['date', 'summary', 'generated_at', 'source', 'priorities', 'expected_generated_at']);
const WRITE_ITEM_KEYS = new Set(['rank', 'action', 'reason_code', 'reason', 'project_slug', 'task_id']);
const sqlStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = message;
  Object.assign(err, extra);
  return err;
}
function usableKey(key) {
  try { recordId(key); return true; } catch { return false; }
}

/** `getProject(db, chave)`: chave crua ligada como o better-sqlite3 e comparada como TEXT. */
async function findProject(repo, raw) {
  const [key] = bindPositional([raw, raw], 2);
  if (key === null) return null;
  const text = applyAffinity(key, 'TEXT');
  return usableKey(text) ? mapRow(await repo.get(text)) : null;
}

/** validateContinuityGuidance, com a busca de frente injetada (lida dentro da transação). */
async function validate(payload, projects) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be an object');
  const date = typeof payload.date === 'string' ? payload.date.trim() : '';
  if (!isValidCivilDate(date)) throw new Error('date must be a valid civil date in YYYY-MM-DD format');
  const generatedAt = typeof payload.generated_at === 'string' ? payload.generated_at.trim() : '';
  if (!isValidIsoTimestampWithTz(generatedAt)) throw new Error('generated_at must be a valid ISO 8601 timestamp with explicit timezone');
  if (!Array.isArray(payload.priorities)) throw new Error('priorities must be an array');
  if (payload.priorities.length > 3) throw new Error('priorities maximum length is 3');
  const seenRanks = new Set();
  for (const item of payload.priorities) {
    if (!item || typeof item !== 'object') throw new Error('priority item must be an object');
    if (!Number.isInteger(item.rank) || item.rank < 1 || item.rank > 3) throw new Error('rank must be an integer between 1 and 3');
    if (seenRanks.has(item.rank)) throw new Error('duplicate rank in priorities');
    seenRanks.add(item.rank);
    if (typeof item.action !== 'string' || !item.action.trim()) throw new Error('action required and cannot be empty');
    if (!ALLOWED_REASON_CODES.has(item.reason_code)) throw new Error(`invalid reason_code: ${item.reason_code}`);
    if (typeof item.reason !== 'string' || !item.reason.trim()) throw new Error('reason required and cannot be empty');
    if (item.project_slug != null && String(item.project_slug).trim() !== '') {
      const slug = String(item.project_slug).trim().toLowerCase();
      if (!(await findProject(projects, slug))) throw new Error(`project_slug not found: ${slug}`);
    }
  }
}

/** getContinuityGuidance a partir da linha e da busca de frente. */
async function present(date, row, projects) {
  const fallback = { date, summary: '', generated_at: null, priorities: [], fresh: false };
  if (!row) return fallback;
  let items;
  try {
    const parsed = JSON.parse(row.priorities_json);
    if (!Array.isArray(parsed)) return fallback;
    items = parsed;
  } catch {
    return fallback;
  }
  const priorities = [];
  for (const item of items) {
    const p = {
      rank: item.rank, action: item.action, reason_code: item.reason_code, reason: item.reason,
      project_slug: item.project_slug || null, task_id: item.task_id || null,
    };
    if (item.project_slug) {
      const proj = await findProject(projects, item.project_slug);
      p.project = proj ? { id: proj.id, slug: proj.slug, name: proj.name, kind: proj.kind, column: proj.column, parent_slug: proj.parent_slug || '' } : null;
    }
    priorities.push(p);
  }
  return { date: row.date, summary: row.summary || '', generated_at: row.generated_at, fresh: true, priorities };
}

export function createGuidanceService({ storage, now = () => new Date() }) {
  if (!storage?.continuityGuidance || !storage?.projects || typeof storage.transaction !== 'function') throw new TypeError('guidance service requires storage');

  async function read(date) {
    const row = usableKey(date) ? await storage.continuityGuidance.get(date) : null;
    return present(date, row, storage.projects);
  }

  async function write(date, body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'payload must be an object');
    const unknown = Object.keys(body).filter((k) => !WRITE_ROOT_KEYS.has(k));
    if (unknown.length) throw httpError(400, `campos não permitidos: ${unknown.sort().join(', ')}`);
    if (!Array.isArray(body.priorities)) throw httpError(400, 'priorities must be an array');
    for (const item of body.priorities) {
      if (item && typeof item === 'object') {
        const bad = Object.keys(item).filter((k) => !WRITE_ITEM_KEYS.has(k));
        if (bad.length) throw httpError(400, `campos não permitidos na prioridade: ${bad.sort().join(', ')}`);
      }
    }
    if (body.date !== undefined && body.date !== date) throw httpError(400, 'date do corpo difere da URL');
    if (typeof body.source !== 'string' || !body.source.trim()) throw httpError(400, 'source obrigatório (quem escreve)');
    if (!Object.prototype.hasOwnProperty.call(body, 'expected_generated_at')) {
      throw httpError(400, 'expected_generated_at obrigatório (generated_at lido, ou null se não havia orientação)');
    }
    const payload = { ...body, date };
    delete payload.expected_generated_at;

    return storage.transaction(async (tx) => {
      const current = usableKey(date) ? await tx.continuityGuidance.get(date) : null;
      const currentAt = current ? current.generated_at : null;
      if ((body.expected_generated_at ?? null) !== currentAt) {
        throw httpError(409, 'GUIDANCE_CHANGED', { current_generated_at: currentAt });
      }
      try {
        await validate(payload, tx.projects);
      } catch (err) {
        throw httpError(400, err.message);
      }
      const day = String(payload.date).trim();
      const sorted = [...payload.priorities].sort((a, b) => a.rank - b.rank).map((item) => ({
        rank: item.rank,
        action: String(item.action).trim(),
        reason_code: item.reason_code,
        reason: String(item.reason).trim(),
        project_slug: item.project_slug != null && String(item.project_slug).trim() !== '' ? String(item.project_slug).trim().toLowerCase() : null,
        task_id: item.task_id != null && String(item.task_id).trim() !== '' ? String(item.task_id).trim() : null,
      }));
      const existing = day === date ? current : await tx.continuityGuidance.get(day);
      const stamp = sqlStamp(now());
      const row = {
        date: day,
        summary: typeof payload.summary === 'string' ? payload.summary.trim() : '',
        priorities_json: JSON.stringify(sorted),
        source: typeof payload.source === 'string' && payload.source.trim() ? payload.source.trim() : 'seneca',
        generated_at: String(payload.generated_at).trim(),
        created_at: existing ? existing.created_at : stamp,
        updated_at: stamp,
      };
      // A resposta lê as frentes antes de gravar (no Firestore, leitura depois de escrita não vale).
      const shown = await present(day, row, tx.projects);
      await tx.continuityGuidance.put(row);
      return shown;
    });
  }

  return Object.freeze({ read, write });
}
