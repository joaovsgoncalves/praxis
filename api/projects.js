/** Projetos — produtos vivos (não tarefa do dia). */

import { randomUUID } from 'crypto';

export const PROJECT_COLUMNS = ['radar', 'andando', 'no_ar', 'parado'];
export const FOCUS_LIMIT = 2;

export const PROJECT_COLUMN_LABELS = {
  radar: 'Radar',
  andando: 'Andando',
  no_ar: 'No ar',
  parado: 'Parado',
};

const COLUMN_MOVE_NOTES = {
  radar: 'Foi pro radar',
  andando: 'Entrou em andando',
  no_ar: 'Foi pro ar',
  parado: 'Pausou de propósito',
};

const SEED_PROJECTS = [
  {
    slug: 'praxis',
    name: 'Praxis',
    tagline: 'O app do dia: hábitos, tarefas e treino.',
    column: 'andando',
    focus: 1,
    current_slice: 'Jota Fit sessão academia',
    last_move_at: '',
    last_move_note: '',
    notes: '',
    shipped_note: '',
    blocked_note: '',
    prod_url: 'https://dopraxis.vercel.app',
    repo_path: 'apps/praxis',
    sort_order: 1,
  },
  {
    slug: 'catalogozap',
    name: 'CatálogoZap',
    tagline: 'Catálogo no WhatsApp pra vender na farmácia.',
    column: 'radar',
    focus: 0,
    current_slice: '',
    last_move_at: '',
    last_move_note: '',
    notes: '',
    shipped_note: '',
    blocked_note: '',
    prod_url: 'https://catalogo-zap.vercel.app',
    repo_path: 'apps/catalogozap',
    sort_order: 2,
  },
  {
    slug: 'encartezap',
    name: 'EncarteZap',
    tagline: 'Encarte da farmácia no Zap do cliente.',
    column: 'parado',
    focus: 0,
    current_slice: 'pausa consciente',
    last_move_at: '',
    last_move_note: '',
    notes: '',
    shipped_note: '',
    blocked_note: '',
    prod_url: '',
    repo_path: 'apps/encartezap',
    sort_order: 3,
  },
  {
    slug: 'carteirazap',
    name: 'CarteiraZap',
    tagline: 'CRM do RCA no WhatsApp.',
    column: 'radar',
    focus: 0,
    current_slice: '',
    last_move_at: '',
    last_move_note: '',
    notes: '',
    shipped_note: '',
    blocked_note: '',
    prod_url: '',
    repo_path: 'apps/carteirazap',
    sort_order: 4,
  },
];

export function todayFortaleza(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(date);
}

export function initProjectsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT DEFAULT '',
      column TEXT NOT NULL DEFAULT 'radar',
      focus INTEGER NOT NULL DEFAULT 0,
      current_slice TEXT DEFAULT '',
      last_move_at TEXT DEFAULT '',
      last_move_note TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      shipped_note TEXT DEFAULT '',
      blocked_note TEXT DEFAULT '',
      prod_url TEXT DEFAULT '',
      repo_path TEXT DEFAULT '',
      sort_order INTEGER,
      created_date TEXT DEFAULT (datetime('now')),
      updated_date TEXT DEFAULT (datetime('now'))
    );
  `);
}

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    focus: row.focus ? 1 : 0,
  };
}

function nextSort(db) {
  const row = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM projects').get();
  return (row?.m || 0) + 1;
}

function countFocused(db, exceptId) {
  if (exceptId) {
    const row = db.prepare(
      'SELECT COUNT(*) AS n FROM projects WHERE focus = 1 AND id != ?',
    ).get(exceptId);
    return row?.n || 0;
  }
  const row = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE focus = 1').get();
  return row?.n || 0;
}

function focusLimitError() {
  const err = new Error('FOCUS_LIMIT');
  err.status = 409;
  err.code = 'FOCUS_LIMIT';
  return err;
}

function notFoundError() {
  const err = new Error('Not found');
  err.status = 404;
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function getProject(db, idOrSlug) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? OR slug = ?').get(idOrSlug, idOrSlug);
  return mapRow(row);
}

export function listProjects(db) {
  return db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, name ASC').all().map(mapRow);
}

/** Insert the 4 seed products if missing. Never overwrites an existing slug. */
export function seedProjectsIfEmpty(db) {
  const insert = db.prepare(`
    INSERT INTO projects (
      id, slug, name, tagline, column, focus, current_slice,
      last_move_at, last_move_note, notes, shipped_note, blocked_note,
      prod_url, repo_path, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  const run = db.transaction(() => {
    for (const seed of SEED_PROJECTS) {
      const exists = db.prepare('SELECT 1 AS ok FROM projects WHERE slug = ?').get(seed.slug);
      if (exists) continue;
      insert.run(
        seed.slug,
        seed.slug,
        seed.name,
        seed.tagline,
        seed.column,
        seed.focus ? 1 : 0,
        seed.current_slice,
        seed.last_move_at,
        seed.last_move_note,
        seed.notes,
        seed.shipped_note,
        seed.blocked_note,
        seed.prod_url,
        seed.repo_path,
        seed.sort_order,
      );
      inserted += 1;
    }
  });
  run();
  return { seeded: inserted > 0, inserted };
}

export function createProject(db, body) {
  const slug = String(body.slug || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  if (!slug) throw badRequest('slug required');
  if (!name) throw badRequest('name required');
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(slug)) throw badRequest('invalid slug');

  const existing = db.prepare('SELECT 1 AS ok FROM projects WHERE slug = ?').get(slug);
  if (existing) throw badRequest('slug already exists');

  const column = PROJECT_COLUMNS.includes(body.column) ? body.column : 'radar';
  const focus = body.focus ? 1 : 0;
  if (focus && countFocused(db) >= FOCUS_LIMIT) throw focusLimitError();

  const id = body.id || randomUUID();
  const sort = body.sort_order != null ? Number(body.sort_order) : nextSort(db);

  db.prepare(`
    INSERT INTO projects (
      id, slug, name, tagline, column, focus, current_slice,
      last_move_at, last_move_note, notes, shipped_note, blocked_note,
      prod_url, repo_path, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    slug,
    name,
    String(body.tagline || ''),
    column,
    focus,
    String(body.current_slice || ''),
    String(body.last_move_at || ''),
    String(body.last_move_note || ''),
    String(body.notes || ''),
    String(body.shipped_note || ''),
    String(body.blocked_note || ''),
    String(body.prod_url || ''),
    String(body.repo_path || ''),
    sort,
  );

  return getProject(db, id);
}

export function setProjectFocus(db, idOrSlug, focus) {
  const existing = getProject(db, idOrSlug);
  if (!existing) return null;

  const next = focus ? 1 : 0;
  if (existing.focus === next) return existing;

  if (next === 1 && countFocused(db, existing.id) >= FOCUS_LIMIT) {
    throw focusLimitError();
  }

  db.prepare(`
    UPDATE projects SET focus = ?, updated_date = datetime('now') WHERE id = ?
  `).run(next, existing.id);

  return getProject(db, existing.id);
}

export function moveProjectColumn(db, idOrSlug, column, { note } = {}) {
  const existing = getProject(db, idOrSlug);
  if (!existing) return null;
  if (!PROJECT_COLUMNS.includes(column)) throw badRequest('invalid column');
  if (existing.column === column) return existing;

  const moveNote = note != null && String(note).trim()
    ? String(note).trim()
    : (COLUMN_MOVE_NOTES[column] || '');

  db.prepare(`
    UPDATE projects SET
      column = ?,
      last_move_at = ?,
      last_move_note = ?,
      updated_date = datetime('now')
    WHERE id = ?
  `).run(column, todayFortaleza(), moveNote, existing.id);

  return getProject(db, existing.id);
}

const TEXT_FIELDS = [
  'name',
  'tagline',
  'current_slice',
  'last_move_at',
  'last_move_note',
  'notes',
  'shipped_note',
  'blocked_note',
  'prod_url',
  'repo_path',
];

export function updateProject(db, idOrSlug, body = {}) {
  const existing = getProject(db, idOrSlug);
  if (!existing) return null;

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) throw badRequest('name required');

  const next = { ...existing, name };
  for (const field of TEXT_FIELDS) {
    if (field === 'name') continue;
    if (body[field] !== undefined) next[field] = String(body[field]);
  }
  if (body.sort_order !== undefined) next.sort_order = Number(body.sort_order);

  db.prepare(`
    UPDATE projects SET
      name = ?,
      tagline = ?,
      current_slice = ?,
      last_move_at = ?,
      last_move_note = ?,
      notes = ?,
      shipped_note = ?,
      blocked_note = ?,
      prod_url = ?,
      repo_path = ?,
      sort_order = ?,
      updated_date = datetime('now')
    WHERE id = ?
  `).run(
    next.name,
    next.tagline,
    next.current_slice,
    next.last_move_at,
    next.last_move_note,
    next.notes,
    next.shipped_note,
    next.blocked_note,
    next.prod_url,
    next.repo_path,
    next.sort_order,
    existing.id,
  );

  return getProject(db, existing.id);
}

/** Apply column / focus / field patch in one transaction. */
export function applyProjectPatch(db, idOrSlug, body = {}) {
  const existing = getProject(db, idOrSlug);
  if (!existing) return null;

  const run = db.transaction(() => {
    if (body.column !== undefined) {
      const moved = moveProjectColumn(db, existing.id, body.column, { note: body.last_move_note });
      if (!moved) throw notFoundError();
    }
    if (body.focus !== undefined) {
      const focused = setProjectFocus(db, existing.id, body.focus);
      if (!focused) throw notFoundError();
    }
    const rest = { ...body };
    delete rest.column;
    delete rest.focus;
    delete rest.slug;
    delete rest.id;
    const hasFields = Object.keys(rest).some((key) => rest[key] !== undefined);
    if (hasFields) updateProject(db, existing.id, rest);
    return getProject(db, existing.id);
  });

  return run();
}
