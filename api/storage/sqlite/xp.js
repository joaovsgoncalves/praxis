import { StorageError } from '../contract.js';
import {
  XP_EVENT_FIELDS, GAMIFICATION_FIELDS, ACHIEVEMENT_FIELDS, HABIT_LOG_FIELDS, RITUAL_FIELDS,
} from '../domains/phase3.js';

const insert = (db, table, fields, row) => {
  db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...fields.map((field) => row[field]));
  return structuredClone(row);
};
const patch = (db, table, id, fields) => {
  const keys = Object.keys(fields);
  const result = db.prepare(`UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((key) => fields[key]), id);
  if (!result.changes) throw new StorageError('not_found');
};

/** Tabela `xp_events`; mesmas somas de lib/xpEvents.js (getXpTotal/getXpSince). */
export function sqliteXpEvents(db) {
  return {
    async activeTotal() { return db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events WHERE reversed_date IS NULL').get().total; },
    async list() { return db.prepare(`SELECT ${XP_EVENT_FIELDS.join(', ')} FROM xp_events ORDER BY created_date, id`).all(); },
    async weekTotal(since) {
      return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events
        WHERE reversed_date IS NULL AND source_type != 'baseline' AND created_date >= ?`).get(since).total;
    },
    async findActive(type, id) {
      return db.prepare(`SELECT ${XP_EVENT_FIELDS.join(', ')} FROM xp_events WHERE source_type = ? AND source_id = ? AND reversed_date IS NULL`).get(type, id) ?? null;
    },
    async create(row) { return insert(db, 'xp_events', XP_EVENT_FIELDS, row); },
    async reverse(id, stamp) { patch(db, 'xp_events', id, { reversed_date: stamp }); },
  };
}

/** Tabela de linha única `gamification` (id 'main'). */
export function sqliteGamification(db) {
  return {
    async get(id) { return db.prepare(`SELECT ${GAMIFICATION_FIELDS.join(', ')} FROM gamification WHERE id = ?`).get(id) ?? null; },
    async create(row) { return insert(db, 'gamification', GAMIFICATION_FIELDS, row); },
    async patch(id, fields) { patch(db, 'gamification', id, fields); },
  };
}

export function sqliteAchievements(db) {
  return {
    async list() { return db.prepare(`SELECT ${ACHIEVEMENT_FIELDS.join(', ')} FROM achievements ORDER BY unlocked_date DESC NULLS LAST, id`).all(); },
    async create(row) { return insert(db, 'achievements', ACHIEVEMENT_FIELDS, row); },
    async patch(id, fields) { patch(db, 'achievements', id, fields); },
  };
}

export function sqliteHabitLogs(db) {
  const cols = HABIT_LOG_FIELDS.join(', ');
  return {
    async create(row) { return insert(db, 'habit_logs', HABIT_LOG_FIELDS, row); },
    async get(id) { return db.prepare(`SELECT ${cols} FROM habit_logs WHERE id = ?`).get(id) ?? null; },
    async find(habitId, date) { return db.prepare(`SELECT ${cols} FROM habit_logs WHERE habit_id = ? AND date = ?`).get(habitId, date) ?? null; },
    // Mesma montagem da antiga (sem ORDER BY): o plano do SQLite decide a ordem.
    async list({ date, from, to, habit_id }) {
      let query = `SELECT ${cols} FROM habit_logs WHERE 1=1`;
      const params = [];
      if (date) { query += ' AND date = ?'; params.push(date); }
      if (from) { query += ' AND date >= ?'; params.push(from); }
      if (to) { query += ' AND date <= ?'; params.push(to); }
      if (habit_id) { query += ' AND habit_id = ?'; params.push(habit_id); }
      return db.prepare(query).all(...params);
    },
    async forDate(date) { return db.prepare('SELECT habit_id, completed, outcome, skip_reason, note, value FROM habit_logs WHERE date = ?').all(date); },
    async forHabits(ids) {
      if (!ids.length) return [];
      return db.prepare(`SELECT habit_id, date, completed, outcome FROM habit_logs WHERE habit_id IN (${ids.map(() => '?').join(',')}) ORDER BY date DESC`).all(...ids);
    },
    async patch(id, fields) { patch(db, 'habit_logs', id, fields); },
    async remove(id) { db.prepare('DELETE FROM habit_logs WHERE id = ?').run(id); },
    async removeByHabit(habitId) { db.prepare('DELETE FROM habit_logs WHERE habit_id = ?').run(habitId); },
  };
}
export function sqliteRituals(db) {
  return {
    async create(row) { return insert(db, 'rituals', RITUAL_FIELDS, row); },
    async list() { return db.prepare(`SELECT ${RITUAL_FIELDS.join(', ')} FROM rituals ORDER BY rowid`).all(); },
    async patch(id, fields) { patch(db, 'rituals', id, fields); },
  };
}

/** As consultas de lib/gamification.js (checkAchievements), cruas, em ordem canônica de rowid. */
export function sqliteAchievementFacts(db) {
  return {
    async load() {
      const activeSimple = db.prepare("SELECT id FROM habits WHERE status = 'active' AND kind = 'simple' ORDER BY rowid").pluck().all();
      const logsOf = db.prepare('SELECT date, completed, outcome FROM habit_logs WHERE habit_id = ? ORDER BY date DESC');
      const childrenOf = db.prepare(`SELECT id FROM habits WHERE parent_id = ? AND kind = 'simple'
        ORDER BY position_in_parent IS NULL, position_in_parent ASC, sort_order ASC, rowid`).pluck();
      return {
        completedTasks: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('completed', 'done')").get().c,
        jotavTasks: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE category = 'jotav_fit'").get().c,
        activeSimpleHabits: activeSimple.map((id) => ({ id, logs: logsOf.all(id) })),
        focusTotal: db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) as total FROM focus_sessions').get().total,
        morningCompounds: db.prepare(`SELECT h.id FROM habits h JOIN rituals r ON h.source = 'ritual_migration:' || r.id
          WHERE h.kind = 'compound' AND h.status = 'active' AND r.time_of_day = 'morning' ORDER BY h.rowid`).pluck().all()
          .map((id) => ({ id, childIds: childrenOf.all(id) })),
        legacyMorningOrders: db.prepare("SELECT habits_order FROM rituals WHERE time_of_day = 'morning' AND status = 'active' ORDER BY rowid").pluck().all(),
        completedLogs: db.prepare('SELECT habit_id, date FROM habit_logs WHERE completed = 1 ORDER BY rowid').all(),
        wellnessDates: db.prepare('SELECT DISTINCT date FROM wellness_checks ORDER BY date DESC').pluck().all(),
      };
    },
  };
}
