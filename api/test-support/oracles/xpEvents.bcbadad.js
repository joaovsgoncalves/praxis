/**
 * ORÁCULO CONGELADO: cópia literal de `git show bcbadad:api/lib/xpEvents.js` (só imports ajustados).
 * Não editar: é a referência da prova de paridade HTTP da fase 3.
 */
import { randomUUID } from 'crypto';
import { getLevel } from './gamification-lib.bcbadad.js';

/**
 * Registro de XP por origem. O total e o nível da gamification SEMPRE saem da soma
 * dos eventos ativos (reversed_date IS NULL); a coluna xp_total é só um espelho.
 */

export function initXpEventsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS xp_events (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT,
      created_date TEXT DEFAULT (datetime('now')),
      reversed_date TEXT
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_active_source
    ON xp_events(source_type, source_id) WHERE reversed_date IS NULL
  `);

  // Saldo inicial: o XP acumulado antes do registro vira UM evento, sem mexer em xp_total nem level.
  db.transaction(() => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM xp_events').get().c;
    if (count > 0) return;
    const gam = db.prepare("SELECT xp_total FROM gamification WHERE id = 'main'").get();
    const xpTotal = Number(gam?.xp_total) || 0;
    if (xpTotal <= 0) return;
    db.prepare(`
      INSERT INTO xp_events (id, source_type, source_id, amount, reason)
      VALUES (?, 'baseline', 'main', ?, 'Saldo antes do registro de XP')
    `).run(randomUUID(), xpTotal);
  })();
}

export function getXpTotal(db) {
  const row = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events WHERE reversed_date IS NULL').get();
  return Math.max(0, Number(row?.total) || 0);
}

/** Soma dos eventos ativos desde `sinceUtc` ('YYYY-MM-DD HH:MM:SS'), sem o saldo inicial. */
export function getXpSince(db, sinceUtc) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events
    WHERE reversed_date IS NULL AND source_type != 'baseline' AND created_date >= ?
  `).get(sinceUtc);
  return Number(row?.total) || 0;
}

export function recomputeXp(db) {
  const xpTotal = getXpTotal(db);
  const level = getLevel(xpTotal).level;
  db.prepare("UPDATE gamification SET xp_total = ?, level = ?, updated_date = datetime('now') WHERE id = 'main'")
    .run(xpTotal, level);
  return { xp_total: xpTotal, level };
}

const findActiveStmt = (db) => db.prepare(
  'SELECT * FROM xp_events WHERE source_type = ? AND source_id = ? AND reversed_date IS NULL',
);

/** Premia uma origem uma única vez enquanto o evento estiver ativo. */
export function awardXp(db, { sourceType, sourceId, amount, reason = null }) {
  return db.transaction(() => {
    const oldLevel = getLevel(getXpTotal(db)).level;
    const active = findActiveStmt(db).get(sourceType, String(sourceId));
    if (active || !amount) {
      return { awarded: 0, ...recomputeXp(db), leveled_up: false };
    }
    db.prepare('INSERT INTO xp_events (id, source_type, source_id, amount, reason) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), sourceType, String(sourceId), Math.trunc(amount), reason);
    const totals = recomputeXp(db);
    return { awarded: Math.trunc(amount), ...totals, leveled_up: totals.level > oldLevel };
  })();
}

/** Estorna o evento ativo da origem (se houver). Devolve o valor estornado. */
export function reverseXp(db, { sourceType, sourceId }) {
  return db.transaction(() => {
    const active = findActiveStmt(db).get(sourceType, String(sourceId));
    if (!active) return { reversed: 0, ...recomputeXp(db) };
    db.prepare("UPDATE xp_events SET reversed_date = datetime('now') WHERE id = ?").run(active.id);
    return { reversed: active.amount, ...recomputeXp(db) };
  })();
}
