import { StorageError } from '../contract.js';
import { documentId, originalId } from '../schema.mjs';
import { compareSqlite } from '../sqliteOrder.js';
import {
  XP_EVENT_FIELDS, GAMIFICATION_FIELDS, ACHIEVEMENT_FIELDS, HABIT_LOG_FIELDS, RITUAL_FIELDS, HABIT_FIELDS,
  FOCUS_FIELDS, WELLNESS_FIELDS,
} from '../domains/phase3.js';
import { phase3Rows } from './phase3Rows.js';

const unsupported = (detail) => new StorageError('sqlite_coercion_unsupported', `sqlite_coercion_unsupported: ${detail}`);
const readWith = (transaction) => (target) => (transaction ? transaction.get(target) : target.get());
const project = (fields) => (doc) => {
  const row = doc.data();
  originalId(doc.id, row.id);
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
};

/** COALESCE(SUM(x), 0) do SQLite só no subconjunto exato: inteiros seguros e NULL. */
function sumIntegers(values, what) {
  let total = 0;
  for (const value of values) {
    if (value === null) continue;
    if (!Number.isInteger(value)) throw unsupported(`SUM de ${what} com ${typeof value} ${value}`);
    total += value;
    if (!Number.isSafeInteger(total)) throw unsupported(`SUM de ${what} fora da faixa segura`);
  }
  return total;
}

/**
 * `users/{uid}/xpEvents/{id}`. O índice único parcial do SQLite (source_type, source_id) WHERE
 * reversed_date IS NULL vira a sentinela `uniqueKeys/xpEvents.active:[tipo,id]`, criada no mesmo
 * commit do evento ativo. ceiling: somas leem a coleção inteira da conta.
 */
export function firestoreXpEvents(userDoc, transaction, client) {
  const col = userDoc.collection('xpEvents'), keys = userDoc.collection('uniqueKeys');
  const read = readWith(transaction), rowOf = project(XP_EVENT_FIELDS);
  const keyRef = (type, id) => keys.doc(documentId(`xpEvents.active:${JSON.stringify([type, id])}`));
  const created = new Set(), released = new Set();
  const all = async () => (await read(col)).docs.map(rowOf);
  return {
    async activeTotal() { return sumIntegers((await all()).filter((r) => r.reversed_date === null).map((r) => r.amount), 'amount'); },
    async list() { return (await all()).sort((a, b) => compareSqlite(a.created_date, b.created_date) || compareSqlite(a.id, b.id)); },
    async weekTotal(since) {
      return sumIntegers((await all()).filter((r) => r.reversed_date === null && r.source_type !== 'baseline'
        && r.created_date !== null && compareSqlite(r.created_date, since) >= 0).map((r) => r.amount), 'amount');
    },
    async findActive(type, id) {
      return (await all()).find((r) => r.source_type === type && r.source_id === id && r.reversed_date === null) ?? null;
    },
    async create(row) {
      const ref = col.doc(documentId(row.id));
      const sentinel = row.reversed_date === null ? keyRef(row.source_type, row.source_id) : null;
      const marker = { domain: 'xpEvents', field: 'source_type,source_id', value: [row.source_type, row.source_id].join('\u0000'), record_id: row.id };
      if (transaction) {
        for (const target of [ref, sentinel].filter(Boolean)) { if (created.has(target.path)) throw new StorageError('already_exists'); created.add(target.path); }
        // Estornou e premiou a mesma origem na mesma transação (o SQLite deixa): apagar e recriar o
        // mesmo documento no commit não pode ser `create` (a pré-condição vê o documento antigo).
        if (sentinel) { if (released.delete(sentinel.path)) transaction.set(sentinel, marker); else transaction.create(sentinel, marker); }
        transaction.create(ref, row);
      } else {
        const batch = client.batch();
        if (sentinel) batch.create(sentinel, marker);
        await batch.create(ref, row).commit();
      }
      return structuredClone(row);
    },
    /** Estorna o evento `id`: grava `reversed_date` e, se estava ativo, apaga a sentinela no mesmo commit. */
    async reverse(id, stamp) {
      const ref = col.doc(documentId(id));
      const run = async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new StorageError('not_found');
        const row = rowOf(snap);
        tx.update(ref, { reversed_date: stamp });
        if (row.reversed_date === null) {
          const sentinel = keyRef(row.source_type, row.source_id);
          tx.delete(sentinel);
          if (tx === transaction) released.add(sentinel.path);
        }
      };
      if (transaction) await run(transaction); else await client.runTransaction(run, { maxAttempts: 5 });
    },
  };
}

/** `users/{uid}/gamification/main`: tabela de linha única, documento de id fixo. */
export function firestoreGamification(userDoc, transaction) {
  const col = userDoc.collection('gamification'), read = readWith(transaction), rowOf = project(GAMIFICATION_FIELDS);
  return {
    async get(id) { const snap = await read(col.doc(documentId(id))); return snap.exists ? rowOf(snap) : null; },
    async create(row) {
      const ref = col.doc(documentId(row.id));
      if (transaction) transaction.create(ref, row); else await ref.create(row);
      return structuredClone(row);
    },
    async patch(id, fields) {
      const ref = col.doc(documentId(id));
      if (transaction) transaction.update(ref, fields); else await ref.update(fields);
    },
  };
}

/** `users/{uid}/achievements`: ORDER BY unlocked_date DESC NULLS LAST, id. */
export function firestoreAchievements(userDoc, transaction, client) {
  const base = phase3Rows(userDoc, transaction, client, 'achievements', ACHIEVEMENT_FIELDS);
  return {
    create: base.create,
    patch: base.patch,
    async list() {
      const rows = (await base.all()).map(({ row }) => row);
      return rows.sort((a, b) => ((a.unlocked_date === null) - (b.unlocked_date === null)) || compareSqlite(b.unlocked_date, a.unlocked_date) || compareSqlite(a.id, b.id));
    },
  };
}

/** `users/{uid}/habitLogs`: UNIQUE(habit_id, date) do SQLite = sentinela no mesmo commit. */
export function firestoreHabitLogs(userDoc, transaction, client) {
  const base = phase3Rows(userDoc, transaction, client, 'habitLogs', HABIT_LOG_FIELDS, { uniqueKey: (row) => `habitLogs.habit_date:${JSON.stringify([row.habit_id, row.date])}` });
  return { create: base.create };
}
export function firestoreRituals(userDoc, transaction, client) {
  return { create: phase3Rows(userDoc, transaction, client, 'rituals', RITUAL_FIELDS).create };
}

/** Mesmo resultado de storage/sqlite/xp.js (sqliteAchievementFacts), em memória sobre as coleções. */
export function firestoreAchievementFacts(userDoc, transaction, client) {
  const rows = (collection, fields) => phase3Rows(userDoc, transaction, client, collection, fields).all();
  const read = readWith(transaction);
  return {
    async load() {
      const tasks = (await read(userDoc.collection('tasks'))).docs.map((doc) => doc.data());
      const habits = await rows('habits', HABIT_FIELDS), logs = await rows('habitLogs', HABIT_LOG_FIELDS);
      const rituals = (await rows('rituals', RITUAL_FIELDS)).map(({ row }) => row);
      const focus = await rows('focusSessions', FOCUS_FIELDS), wellness = await rows('wellnessChecks', WELLNESS_FIELDS);
      const logsOf = (id) => logs.filter(({ row }) => row.habit_id === id).map(({ row }) => row)
        .sort((a, b) => compareSqlite(b.date, a.date)).map(({ date, completed, outcome }) => ({ date, completed, outcome }));
      const childrenOf = (id) => habits.filter(({ row }) => row.parent_id === id && row.kind === 'simple')
        .sort((a, b) => ((a.row.position_in_parent === null) - (b.row.position_in_parent === null))
          || compareSqlite(a.row.position_in_parent, b.row.position_in_parent) || compareSqlite(a.row.sort_order, b.row.sort_order) || a.seq - b.seq)
        .map(({ row }) => row.id);
      const morning = rituals.filter((r) => r.time_of_day === 'morning');
      const wellnessDates = [...new Set(wellness.map(({ row }) => row.date))].sort((a, b) => compareSqlite(b, a));
      return {
        completedTasks: tasks.filter((t) => t.status === 'completed' || t.status === 'done').length,
        jotavTasks: tasks.filter((t) => t.category === 'jotav_fit').length,
        activeSimpleHabits: habits.filter(({ row }) => row.status === 'active' && row.kind === 'simple').map(({ row }) => ({ id: row.id, logs: logsOf(row.id) })),
        focusTotal: sumIntegers(focus.map(({ row }) => row.duration_seconds), 'duration_seconds'),
        morningCompounds: habits.filter(({ row }) => row.kind === 'compound' && row.status === 'active'
          && morning.some((r) => r.id !== null && row.source === `ritual_migration:${r.id}`)).map(({ row }) => ({ id: row.id, childIds: childrenOf(row.id) })),
        legacyMorningOrders: morning.filter((r) => r.status === 'active').map((r) => r.habits_order),
        completedLogs: logs.filter(({ row }) => row.completed === 1).map(({ row }) => ({ habit_id: row.habit_id, date: row.date })),
        wellnessDates,
      };
    },
  };
}
