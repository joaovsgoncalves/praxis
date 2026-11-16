/**
 * Frentes sobre a camada assíncrona, com o comportamento de projects.js no commit bcbadad (oráculo
 * em test-support/oracles/projects.bcbadad.js). Cada operação que grava é UMA transação: o que a
 * rota antiga lia e comparava (slug livre, limite de foco, revisão, próximo passo esperado) é lido
 * e comparado dentro dela, e só então tudo é gravado de uma vez. Nada de last-write-wins.
 *
 * Revisão: o SQLite antigo soma 1 a cada UPDATE em `projects` (gatilho). Aqui cada passo que a
 * rota antiga gravava (mudar coluna, mudar foco, campos, concluir passo) soma 1, e a gravação manda
 * a revisão final; o gatilho continua valendo para quem grava direto no banco.
 *
 * Ligação de parâmetros: os valores que a rota antiga mandava crus para o SQLite (o `id` vindo do
 * corpo e `Number(sort_order)`) passam pela mesma ligação do better-sqlite3 (`bindPositional`),
 * com os mesmos erros; a afinidade das colunas é aplicada pelo domínio.
 *
 * Diferenças intencionais (nenhum consumidor manda): `id` do cliente acima de 1500 bytes e número
 * fora do subconjunto provado (ex.: sort_order 1e20, "Infinity") respondem 500 sem gravar.
 */
import { randomUUID } from 'node:crypto';
import { bindPositional, sqliteLimit } from '../../storage/sqliteSemantics.js';
import { maxSqlite } from '../../storage/sqliteOrder.js';
import { recordId } from '../../storage/contract.js';
import { FOCUS_LIMIT, PROJECT_COLUMNS, PROJECT_KINDS, todayFortaleza } from '../../projects.js';

const COLUMN_MOVE_NOTES = {
  andando: 'Voltou para a mesa',
  radar: 'Foi para o radar',
  aguardando: 'Ficou aguardando',
  pausado: 'Pausa consciente',
};
const TEXT_FIELDS = [
  'name', 'tagline', 'kind', 'objective', 'status_summary', 'current_slice', 'next_step', 'last_move_at',
  'last_move_note', 'last_reviewed_at', 'notes', 'shipped_note', 'blocked_note', 'prod_url', 'repo_path',
];
const sqlStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}
const badRequest = (message) => httpError(400, message);
const conflict = (message) => httpError(409, message, message);
const focusLimitError = () => httpError(409, 'FOCUS_LIMIT', 'FOCUS_LIMIT');
/** Mesmo erro que o SQLite dava para id repetido (a rota antiga devolve a mensagem no corpo). */
function sqliteUniqueError(table, field) {
  const err = new Error(`UNIQUE constraint failed: ${table}.${field}`);
  err.name = 'SqliteError';
  err.code = field === 'id' ? 'SQLITE_CONSTRAINT_PRIMARYKEY' : 'SQLITE_CONSTRAINT_UNIQUE';
  return err;
}
async function asSqliteUnique(promise, table) {
  try { return await promise; } catch (error) {
    if (error?.code === 'already_exists') throw sqliteUniqueError(table, error.field || 'id');
    throw error;
  }
}
/** Chave que nenhuma frente pode ter (longa demais para guardar) = inexistente, como no SQLite. */
function usableKey(key) {
  try { recordId(key); return true; } catch { return false; }
}

export function mapRow(row) {
  if (!row) return null;
  return { ...row, focus: row.focus ? 1 : 0, live: row.live ? 1 : 0 };
}
function normalizeParentSlug(value) {
  return String(value ?? '').trim().toLowerCase();
}
// LOWER/TRIM do SQLite: só A-Z e só espaço.
const sqlLower = (text) => text.replace(/[A-Z]/g, (c) => c.toLowerCase());
const sqlTrim = (text) => text.replace(/^ +| +$/g, '');
const sqlText = (value) => (value === null || value === undefined ? '' : String(value));

/** Estado da conta dentro da transação: as frentes lidas e as mudanças ainda não gravadas. */
function workingSet(rows) {
  const byId = new Map(rows.map((row) => [row.id, { ...row }]));
  return {
    rows: () => [...byId.values()],
    bySlug: (slug) => [...byId.values()].find((row) => row.slug === slug) || null,
    byKey: (key) => byId.get(key) || [...byId.values()].find((row) => row.slug === key) || null,
    byId: (id) => byId.get(id) || null,
  };
}

function countFocused(rows, exceptId) {
  return rows.filter((row) => row.focus === 1 && (exceptId === undefined || row.id !== exceptId)).length;
}

/** Mesma validação da rota antiga: um nível só, sem ciclo, mãe precisa existir. */
function resolveParentSlug(state, slug, rawParent) {
  const parentSlug = normalizeParentSlug(rawParent);
  if (!parentSlug) return '';
  if (parentSlug === slug) throw badRequest('Uma frente não pode ser mãe dela mesma');
  const parent = state.bySlug(parentSlug);
  if (!parent) throw badRequest(`Frente-mãe não encontrada: ${parentSlug}`);
  if (normalizeParentSlug(parent.parent_slug)) {
    throw badRequest(`${parent.name} já está dentro de outra frente e não pode ter filhas`);
  }
  const children = state.rows().filter((row) => sqlLower(sqlTrim(sqlText(row.parent_slug))) === slug).length;
  if (children) throw badRequest('Esta frente tem filhas e não pode ficar dentro de outra');
  const seen = new Set([slug]);
  let cursor = parentSlug;
  while (cursor) {
    if (seen.has(cursor)) throw badRequest('Essa frente-mãe criaria um ciclo');
    seen.add(cursor);
    cursor = normalizeParentSlug(state.bySlug(cursor)?.parent_slug);
  }
  return parentSlug;
}

export function createProjectsService({ storage, now = () => new Date(), today = todayFortaleza, newId = randomUUID }) {
  if (!storage?.projects || !storage?.projectUpdates || typeof storage.transaction !== 'function') throw new TypeError('projects service requires storage');
  const stamp = () => sqlStamp(now());

  /** Linha nova da timeline, como `createProjectUpdate` montava (validação + ligação do INSERT). */
  function timelineRow(project, body) {
    const summary = String(body.summary || '').trim();
    if (!summary) throw badRequest('summary required');
    const id = body.id || newId();
    const date = String(body.date || today()).slice(0, 10);
    const source = String(body.source || 'manual').trim() || 'manual';
    const createdBy = String(body.created_by || 'joao').trim() || 'joao';
    const [boundId, projectId, boundDate, boundSummary, boundSource, boundBy] = bindPositional([id, project.id, date, summary, source, createdBy], 6);
    return { id: boundId, project_id: projectId, date: boundDate, summary: boundSummary, source: boundSource, created_by: boundBy, created_at: stamp() };
  }

  async function list() {
    return (await storage.projects.list()).map(mapRow);
  }

  async function get(key) {
    return usableKey(key) ? mapRow(await storage.projects.get(key)) : null;
  }

  async function create(body) {
    const slug = String(body.slug || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    if (!slug) throw badRequest('slug required');
    if (!name) throw badRequest('name required');
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(slug)) throw badRequest('invalid slug');
    return asSqliteUnique(storage.transaction(async (tx) => {
      const state = workingSet(await tx.projects.list());
      if (state.bySlug(slug)) throw badRequest('slug already exists');
      const column = PROJECT_COLUMNS.includes(body.column) ? body.column : 'radar';
      const kind = PROJECT_KINDS.includes(body.kind) ? body.kind : 'produto';
      const parentSlug = resolveParentSlug(state, slug, body.parent_slug);
      const focus = body.focus ? 1 : 0;
      if (focus && countFocused(state.rows()) >= FOCUS_LIMIT) throw focusLimitError();
      const id = body.id || newId();
      const top = maxSqlite(state.rows().map((row) => row.sort_order)) ?? 0;
      const sort = body.sort_order != null ? Number(body.sort_order) : (top || 0) + 1;
      const values = bindPositional([
        id, slug, name, String(body.tagline || ''), kind, column, focus, body.live ? 1 : 0,
        String(body.objective || ''), String(body.status_summary || ''), String(body.current_slice || ''),
        String(body.next_step || ''), String(body.last_move_at || ''), String(body.last_move_note || ''),
        String(body.last_reviewed_at || ''), String(body.notes || ''), String(body.shipped_note || ''),
        String(body.blocked_note || ''), String(body.prod_url || ''), String(body.repo_path || ''), sort, parentSlug,
      ], 22);
      const keys = ['id', 'slug', 'name', 'tagline', 'kind', 'column', 'focus', 'live', 'objective', 'status_summary',
        'current_slice', 'next_step', 'last_move_at', 'last_move_note', 'last_reviewed_at', 'notes', 'shipped_note',
        'blocked_note', 'prod_url', 'repo_path', 'sort_order', 'parent_slug'];
      const row = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
      const at = stamp();
      return mapRow(await tx.projects.create({
        id: row.id, slug: row.slug, name: row.name, tagline: row.tagline, kind: row.kind, column: row.column,
        focus: row.focus, live: row.live, objective: row.objective, status_summary: row.status_summary,
        current_slice: row.current_slice, next_step: row.next_step, last_move_at: row.last_move_at,
        last_move_note: row.last_move_note, last_reviewed_at: row.last_reviewed_at, notes: row.notes,
        shipped_note: row.shipped_note, blocked_note: row.blocked_note, prod_url: row.prod_url, repo_path: row.repo_path,
        sort_order: row.sort_order, created_date: at, updated_date: at, parent_slug: row.parent_slug, revision: 0,
      }));
    }), 'projects');
  }

  async function addUpdate(key, body) {
    if (!usableKey(key)) return null;
    return asSqliteUnique(storage.transaction(async (tx) => {
      const project = await tx.projects.get(key);
      if (!project) return null;
      return tx.projectUpdates.create(timelineRow(project, body));
    }), 'project_updates');
  }

  async function listUpdates(key, limit = 40) {
    const project = await get(key);
    if (!project) return null;
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 40));
    const bound = sqliteLimit(safeLimit);
    return storage.projectUpdates.list(project.id, bound === null ? Number.MAX_SAFE_INTEGER : bound);
  }

  async function completeNextStep(key, body) {
    if (!usableKey(key)) return null;
    return storage.transaction(async (tx) => {
      const current = await tx.projects.get(key);
      if (!current) return null;
      const project = mapRow(current);
      const currentNextStep = String(project.next_step || '').trim();
      if (!currentNextStep) throw badRequest('no next step');
      const expectedStep = String(body.expected_step || '').trim();
      if (expectedStep && expectedStep !== currentNextStep) throw conflict('NEXT_STEP_CHANGED');
      const date = today();
      const rawSummary = String(body.summary || currentNextStep).trim() || currentNextStep;
      const summary = /^conclu[ií]do:/i.test(rawSummary) ? rawSummary : `Concluído: ${rawSummary}`;
      const source = String(body.source || 'conclusao').trim() || 'conclusao';
      const createdBy = String(body.created_by || 'joao').trim() || 'joao';
      const update = await tx.projectUpdates.create(timelineRow(project, { date, summary, source, created_by: createdBy }));
      const changes = {
        next_step: '', last_reviewed_at: date, last_move_at: date, last_move_note: 'Próximo passo concluído',
        updated_date: stamp(), revision: current.revision + 1,
      };
      await tx.projects.patch(current.id, changes);
      return { project: mapRow({ ...current, ...changes }), update, completed_step: currentNextStep };
    });
  }

  async function patch(key, body) {
    if (!usableKey(key)) return null;
    return storage.transaction(async (tx) => {
      const found = await tx.projects.get(key);
      if (!found) return null;
      const state = workingSet(await tx.projects.list());
      const row = state.byId(found.id);
      const original = { ...row };
      let bumps = 0, timeline = null;

      if (body.expected_revision !== undefined && body.expected_revision !== null) {
        const expected = Number(body.expected_revision);
        if (!Number.isInteger(expected) || expected < 0) throw badRequest('expected_revision inválido');
        if (row.revision !== expected) {
          const err = conflict('REVISION_CHANGED');
          err.current_revision = row.revision;
          throw err;
        }
      }

      if (body.column !== undefined) {
        const column = body.column, note = body.last_move_note;
        if (!PROJECT_COLUMNS.includes(column)) throw badRequest('invalid column');
        if (mapRow(row).column !== column) {
          const moveNote = note != null && String(note).trim() ? String(note).trim() : (COLUMN_MOVE_NOTES[column] || '');
          const date = today();
          Object.assign(row, { column, last_move_at: date, last_move_note: moveNote, updated_date: stamp() });
          bumps += 1;
          timeline = timelineRow(row, { date, summary: moveNote, source: 'praxis', created_by: 'joao' });
        }
      }

      if (body.focus !== undefined) {
        const next = body.focus ? 1 : 0;
        if (mapRow(row).focus !== next) {
          if (next === 1 && countFocused(state.rows(), row.id) >= FOCUS_LIMIT) throw focusLimitError();
          Object.assign(row, { focus: next, updated_date: stamp() });
          bumps += 1;
        }
      }

      const rest = { ...body };
      for (const key of ['column', 'focus', 'slug', 'id', 'expected_revision', 'revision']) delete rest[key];
      if (Object.keys(rest).some((key) => rest[key] !== undefined)) {
        const existing = mapRow(row);
        const name = rest.name !== undefined ? String(rest.name).trim() : existing.name;
        if (!name) throw badRequest('name required');
        const next = { ...existing, name };
        for (const field of TEXT_FIELDS) {
          if (field === 'name') continue;
          if (rest[field] !== undefined) next[field] = String(rest[field]);
        }
        if (!PROJECT_KINDS.includes(next.kind)) next.kind = existing.kind || 'produto';
        if (rest.live !== undefined) next.live = rest.live ? 1 : 0;
        if (rest.sort_order !== undefined) next.sort_order = Number(rest.sort_order);
        next.parent_slug = rest.parent_slug !== undefined
          ? resolveParentSlug(state, existing.slug, rest.parent_slug)
          : (existing.parent_slug || '');
        const order = ['name', 'tagline', 'kind', 'live', 'objective', 'status_summary', 'current_slice', 'next_step',
          'last_move_at', 'last_move_note', 'last_reviewed_at', 'notes', 'shipped_note', 'blocked_note', 'prod_url',
          'repo_path', 'sort_order', 'parent_slug'];
        const values = bindPositional(order.map((field) => (field === 'live' ? (next.live ? 1 : 0) : next[field])), order.length);
        order.forEach((field, i) => { row[field] = values[i]; });
        row.updated_date = stamp();
        bumps += 1;
      }

      if (!bumps) return mapRow(row);
      if (timeline) await tx.projectUpdates.create(timeline);
      const changes = { revision: original.revision + bumps };
      for (const [field, value] of Object.entries(row)) if (field !== 'revision' && !Object.is(value, original[field])) changes[field] = value;
      if (!('updated_date' in changes)) changes.updated_date = row.updated_date;
      await tx.projects.patch(row.id, changes);
      return mapRow({ ...row, revision: changes.revision });
    });
  }

  return Object.freeze({ list, get, create, addUpdate, listUpdates, completeNextStep, patch });
}
