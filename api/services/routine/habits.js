/**
 * Hábitos, registros de hábito e rituais (somente leitura) sobre a camada assíncrona, com o
 * comportamento das rotas antigas (oráculos em test-support/oracles/habits.bcbadad.js e
 * rituals.bcbadad.js):
 *
 * - leitura canônica em árvore (`listHabitTree`): só os de topo, filhos dentro do composto, sequência
 *   (streak) de cada passo, contador "desde" e o dia (feito, pulado, aberto);
 * - criar/editar: mesma ordem de validação e mesmas mensagens; composto e filhos na MESMA transação,
 *   com todas as leituras antes das gravações; erro na validação dos filhos desfaz o composto (400);
 * - excluir: arquiva os passos do composto, apaga os registros do hábito, tira o id da ordem dos
 *   rituais antigos e apaga o hábito, tudo numa transação;
 * - registros: um por hábito e dia (cria 201, regrava 200); quantidade e meta pela regra de
 *   `lib/habitQuantity.js`.
 *
 * Ligação e afinidade de cada parâmetro vêm de `affinity.js` (provadas contra o SQLite real); erro de
 * ligação (ex.: objeto numa coluna) sai com a mesma mensagem, no mesmo ponto: 400 em criar/editar
 * (a antiga os pegava no try/catch), 500 sem tratador nas demais.
 *
 * Diferenças intencionais (nenhum consumidor manda; tela e Alfred mandam texto e número):
 * (1) lista/objeto que desloca parâmetros, número não finito em coluna e texto em coluna REAL viram
 *     `sqlite_coercion_unsupported` (500), em vez de gravar o que o SQLite converteria;
 * (2) filtro de `habit-logs` repetido na URL: erro de ligação igual ao do SQLite quando a contagem não fecha,
 *     recusa explícita (`sqlite_coercion_unsupported`) quando fecha mas desloca os parâmetros;
 * (3) id com mais de 1500 bytes no caminho responde como "não existe" (nenhum registro pode ter esse id);
 * (4) a ordem de `GET /api/habit-logs` (sem ORDER BY na antiga) segue o plano do SQLite: com `habit_id`
 *     pelo índice (habit_id, date), sem ele na ordem de inserção.
 */
import { randomUUID } from 'node:crypto';
import { recordId, StorageError } from '../../storage/contract.js';
import { maxSqlite } from '../../storage/sqliteOrder.js';
import { habitRow } from '../../storage/domains/phase3.js';
import { isHabitLogDone, isHabitLogSkipped, streaksFromLogs } from '../../lib/habitStreaks.js';
import {
  daysSinceDate, decorateSinceHabit, isSinceHabit, normalizeSinceDate, normalizeTrackingMode,
} from '../../lib/habitSinceCounter.js';
import { GOAL_NOT_FOUND } from '../../lib/goalLinks.js';
import { readHabitQuantity } from '../../lib/habitQuantity.js';
import { bindPositional } from '../../storage/sqliteSemantics.js';
import { bindRow, nextSort, sqlStamp, unsupported } from './affinity.js';

const HABIT_KINDS = new Set(['simple', 'compound']);
const HABIT_STATUSES = new Set(['active', 'paused', 'archived']);
const HABIT_FREQUENCIES = new Set(['daily', 'weekdays', 'weekends', 'weekly']);

const HABIT_INSERT = [
  ['id', 'TEXT'], ['title', 'TEXT'], ['description', 'TEXT'], ['emoji', 'TEXT'], ['frequency', 'TEXT'], ['category', 'TEXT'],
  ['streak_target', 'INTEGER'], ['goal_id', 'TEXT'], ['source', 'TEXT'], ['sort_order', 'INTEGER'], ['recurrence_days', 'TEXT'],
  ['target_value', 'REAL'], ['unit', 'TEXT'], ['preferred_time', 'TEXT'], ['kind', 'TEXT'], ['parent_id', 'TEXT'],
  ['position_in_parent', 'INTEGER'], ['tracking_mode', 'TEXT'], ['since_date', 'TEXT'], ['quick_increment', 'REAL'],
];
// Os 26 marcadores do UPDATE da antiga, na ordem. `flag*` são o 0/1 dos `CASE WHEN ? = 1`.
const HABIT_UPDATE = [
  ['title', 'TEXT'], ['description', 'TEXT'], ['flagEmoji', 'INTEGER'], ['emoji', 'TEXT'], ['frequency', 'TEXT'], ['category', 'TEXT'],
  ['streak_target', 'INTEGER'], ['flagGoal', 'INTEGER'], ['goal_id', 'TEXT'], ['source', 'TEXT'], ['status', 'TEXT'], ['sort_order', 'INTEGER'],
  ['recurrence_days', 'TEXT'], ['target_value', 'REAL'], ['unit', 'TEXT'], ['preferred_time', 'TEXT'], ['kind', 'TEXT'],
  ['flagParent', 'INTEGER'], ['parent_id', 'TEXT'], ['flagPosition', 'INTEGER'], ['position_in_parent', 'INTEGER'],
  ['tracking_mode', 'TEXT'], ['since_date', 'TEXT'], ['flagQuick', 'INTEGER'], ['quick_increment', 'REAL'], ['id', 'TEXT'],
];
const LOG_INSERT = [['id', 'TEXT'], ['habit_id', 'TEXT'], ['date', 'TEXT'], ['completed', 'INTEGER'], ['value', 'REAL'], ['outcome', 'TEXT'], ['skip_reason', 'TEXT'], ['note', 'TEXT']];
const LOG_UPDATE = [['completed', 'INTEGER'], ['value', 'REAL'], ['outcome', 'TEXT'], ['skip_reason', 'TEXT'], ['note', 'TEXT'], ['id', 'TEXT']];
const NOT_FOUND = { status: 404, body: { error: 'Habit not found' } };
const bad = (error, extra = {}) => ({ status: 400, body: { error, ...extra } });

// ---- regras puras da leitura em árvore (copiadas da rota antiga) ----
function compareHabitOrder(a, b) {
  const aPosition = a.position_in_parent ?? Number.MAX_SAFE_INTEGER;
  const bPosition = b.position_in_parent ?? Number.MAX_SAFE_INTEGER;
  if (aPosition !== bPosition) return aPosition - bPosition;
  const aSort = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) return aSort - bSort;
  return String(a.created_date || '').localeCompare(String(b.created_date || ''));
}
function preferredTimeBucket(preferredTime) {
  const raw = String(preferredTime || '');
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const hour = Number(raw.slice(0, 2));
  if (!Number.isInteger(hour)) return null;
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}
function deriveCompoundTimeOfDay(children) {
  const buckets = new Set(children.map((child) => preferredTimeBucket(child.preferred_time)).filter(Boolean));
  return buckets.size === 1 ? [...buckets][0] : null;
}
function findHabitInTree(tree, habitId) {
  for (const habit of tree) {
    if (habit.id === habitId) return habit;
    const child = habit.children?.find((item) => item.id === habitId);
    if (child) return child;
  }
  return null;
}
function normalizeRecurrenceDays(input) {
  if (input === undefined || input === null) return null;
  let arr = input;
  if (typeof input === 'string') {
    try { arr = JSON.parse(input); } catch { return '[]'; }
  }
  if (!Array.isArray(arr)) return '[]';
  const days = [...new Set(arr.map(Number).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b);
  return JSON.stringify(days);
}
function normalizePreferredTime(input) {
  if (input === undefined) return undefined;
  if (input === null || input === '') return '';
  const raw = String(input).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Valor como o SQLite o compararia com uma coluna TEXT (ligação + afinidade). `null`: nada casa. */
const textKey = (value) => bindRow([['key', 'TEXT']], [value]).key;
const validId = (id) => { try { recordId(id); return true; } catch { return false; } };
/** Id longo demais não existe. Checar antes: operação que falha dentro da transação a marca como falha. */
const getHabit = async (r, id) => {
  const key = textKey(id);
  return key === null || !validId(key) ? null : r.habits.get(key);
};
const isStorageError = (error) => error instanceof StorageError;

export function createHabitsService({
  storage, getLocalDateString, stripPriorityPrefix, now = () => new Date(), newId = randomUUID,
}) {
  if (!storage?.habits || !storage?.habitLogs || !storage?.rituals || !storage?.goals || typeof storage.transaction !== 'function') throw new TypeError('habits service requires storage');
  if (typeof getLocalDateString !== 'function' || typeof stripPriorityPrefix !== 'function') throw new TypeError('habits service requires getLocalDateString and stripPriorityPrefix');

  /** Leitura canônica em árvore; `r` é o storage ou uma transação. */
  async function readTree(r, { status = 'active', date } = {}) {
    const rows = await r.habits.list({ status: status === 'all' ? null : status });
    const today = date || getLocalDateString();
    const logsByHabit = new Map((await r.habitLogs.forDate(today)).map((log) => [log.habit_id, log]));
    const legacyMetadata = new Map((await r.rituals.list()).map((row) => [`ritual_migration:${row.id}`, row]));
    const streakLogs = new Map();
    for (const log of await r.habitLogs.forHabits(rows.filter((habit) => habit.kind !== 'compound').map((habit) => habit.id))) {
      if (!streakLogs.has(log.habit_id)) streakLogs.set(log.habit_id, []);
      streakLogs.get(log.habit_id).push(log);
    }

    const enriched = rows.map((habit) => {
      const log = logsByHabit.get(habit.id);
      const done = habit.kind !== 'compound' && isHabitLogDone(log);
      const skipped = habit.kind !== 'compound' && isHabitLogSkipped(log);
      const streaks = habit.kind === 'compound'
        ? { current_streak: null, best_streak: null }
        : streaksFromLogs(streakLogs.get(habit.id) || [], getLocalDateString);
      const legacy = habit.kind === 'compound' ? legacyMetadata.get(habit.source) : null;
      let result = {
        ...habit,
        ...streaks,
        completed_today: done,
        skipped_today: skipped,
        day_outcome: skipped ? 'skipped' : done ? 'done' : 'open',
        skip_reason: log?.skip_reason || null,
        skip_note: (log?.note && String(log.note).trim()) || null,
        value_today: log?.value ?? null,
        ...(habit.kind === 'compound'
          ? { emoji: habit.emoji || legacy?.emoji || '🔗', time_of_day: legacy?.time_of_day || null }
          : {}),
      };
      if (isSinceHabit(result)) result = decorateSinceHabit(result, today);
      return result;
    });

    const childrenByParent = new Map();
    for (const habit of enriched) {
      if (!habit.parent_id) continue;
      const children = childrenByParent.get(habit.parent_id) || [];
      children.push(habit);
      childrenByParent.set(habit.parent_id, children);
    }
    return enriched.filter((habit) => !habit.parent_id).map((habit) => {
      if (habit.kind !== 'compound') return habit;
      const children = (childrenByParent.get(habit.id) || []).sort(compareHabitOrder);
      const completedSteps = children.filter((child) => child.completed_today).length;
      const skippedSteps = children.filter((child) => child.skipped_today).length;
      return {
        ...habit,
        children,
        completed_steps: completedSteps,
        skipped_steps: skippedSteps,
        total_steps: children.length,
        time_of_day: habit.time_of_day || deriveCompoundTimeOfDay(children),
        day_outcome: children.length > 0 && completedSteps + skippedSteps === children.length ? 'done' : 'open',
      };
    });
  }
  const tree = (options) => storage.transaction((tx) => readTree(tx, options));

  // ---- vínculo com meta (lib/goalLinks.js, sobre o storage) ----
  const isEmpty = (value) => value === null || value === undefined || value === '';
  const goalExists = async (r, goalId) => validId(String(goalId)) && Boolean(await r.goals.get(String(goalId)));
  async function goalLinkForCreate(r, goalId) {
    if (isEmpty(goalId)) return { ok: true, value: null };
    if (!(await goalExists(r, goalId))) return { ok: false };
    return { ok: true, value: String(goalId) };
  }
  async function goalLinkForUpdate(r, body, existingGoalId) {
    if (!Object.prototype.hasOwnProperty.call(body || {}, 'goal_id')) return { ok: true, change: false, value: null };
    const requested = body.goal_id;
    if (isEmpty(requested)) return { ok: true, change: true, value: null };
    if (String(requested) === String(existingGoalId ?? '')) return { ok: true, change: false, value: null };
    if (!(await goalExists(r, requested))) return { ok: false };
    return { ok: true, change: true, value: String(requested) };
  }

  async function validateParent(r, parentId, kind, habitId = null) {
    if (!parentId) return null;
    if (kind === 'compound') return 'Compound habits cannot be children';
    if (parentId === habitId) return 'A habit cannot be its own parent';
    const parent = await getHabit(r, parentId);
    if (!parent || parent.kind !== 'compound') return 'parent_id must reference a compound habit';
    return null;
  }
  /** `COALESCE(MAX(position_in_parent), -1) + 1` e `Number(... || 0)`. */
  async function nextChildPosition(r, parentId) {
    const key = textKey(parentId);
    const top = key === null ? null : await r.habits.maxPosition(key);
    if (top === null) return 0;
    if (typeof top !== 'number') throw unsupported(`MAX(position_in_parent) com ${typeof top}`);
    return Number(top + 1 || 0);
  }

  /**
   * `syncCompoundChildren` da antiga em duas fases. plan: só LÊ e valida (`{ error }` ou o plano);
   * apply: grava. `compound` é a linha do composto como ficará (o composto novo ainda nem existe).
   * `topOf()` devolve o MAX(sort_order) da tabela já com o composto como ficará.
   */
  async function planChildren(r, compound, requested, { topOf, currentIds }) {
    if (!compound || compound.kind !== 'compound') return { error: 'Habit must be compound' };
    if (!Array.isArray(requested)) return { error: 'children must be an array' };

    const normalized = [];
    const seenIds = new Set();
    for (const rawChild of requested) {
      const child = typeof rawChild === 'string' ? { id: rawChild } : rawChild;
      if (!child || typeof child !== 'object') return { error: 'Each child must be an id or an object' };
      const id = child.id ? String(child.id) : null;
      if (id && seenIds.has(id)) return { error: 'Child ids must be unique' };
      if (id) seenIds.add(id);

      const existing = id ? await getHabit(r, id) : null;
      if (id && (!existing || existing.kind !== 'simple' || existing.id === compound.id)) return { error: 'Every existing child must be a simple habit' };
      if (existing?.parent_id && existing.parent_id !== compound.id) return { error: 'A child cannot belong to two compound habits' };

      const title = child.title !== undefined ? stripPriorityPrefix(String(child.title)).trim() : existing?.title;
      if (!title) return { error: 'Every child needs a title' };
      const preferredTime = normalizePreferredTime(child.preferred_time !== undefined ? child.preferred_time : existing?.preferred_time || '');
      if (preferredTime === null) return { error: 'Child preferred_time must be HH:MM or empty' };
      normalized.push({ id, title, preferred_time: preferredTime || '' });
    }

    const retained = new Set(normalized.map((child) => child.id).filter(Boolean));
    const archive = (await currentIds()).filter((id) => !retained.has(id));
    let top = null;
    const steps = normalized.map((child, index) => {
      const shared = {
        title: child.title, preferred_time: child.preferred_time, frequency: compound.frequency, category: compound.category,
        recurrence_days: compound.recurrence_days || '[]', status: compound.status, parent_id: compound.id, position_in_parent: index,
      };
      if (child.id) return { id: child.id, fields: shared };
      return { id: newId(), isNew: true, shared, index };
    });
    if (steps.some((step) => step.isNew)) top = await topOf();
    const stamp = sqlStamp(now());
    for (const step of steps) {
      if (!step.isNew) continue;
      const sortOrder = nextSort(top);
      top = sortOrder;
      step.row = habitRow({
        ...step.shared, id: step.id, description: '', emoji: '', streak_target: 30, source: `compound:${compound.id}`,
        sort_order: sortOrder, target_value: null, unit: '', kind: 'simple', created_date: stamp,
      });
    }
    return { archive, steps, updated: normalized.length, ids: steps.map((step) => step.id) };
  }
  async function applyChildren(tx, plan, slot, { childStatus } = {}) {
    for (const id of plan.archive) await tx.habits.patch(id, { status: 'archived', parent_id: null, position_in_parent: null });
    let offset = 0;
    for (const step of plan.steps) {
      if (step.isNew) {
        if (childStatus !== undefined) step.row.status = childStatus;
        await tx.habits.createAt(step.row, slot === null ? null : slot + offset);
        offset += 1;
      } else {
        await tx.habits.patch(step.id, childStatus !== undefined ? { ...step.fields, status: childStatus } : step.fields);
      }
    }
    return offset;
  }

  async function list({ status: rawStatus, date }) {
    const raw = String(rawStatus ?? 'active');
    if (raw !== 'all' && !HABIT_STATUSES.has(raw)) return { status: 400, body: { error: 'Invalid status. Use active, paused, archived, or all' } };
    return { status: 200, body: await tree({ status: raw, date: date ? String(date) : undefined }) };
  }

  async function reorder(body) {
    const orderedIds = body?.ordered_ids || body?.ids;
    let updated = 0;
    if (Array.isArray(orderedIds) && orderedIds.length > 0) {
      const uniqueIds = [...new Set(orderedIds.filter(Boolean).map(String))];
      // Id que não pode existir só consome a posição, como o UPDATE que não casa com nada.
      const entries = uniqueIds.map((id, index) => [id, index]).filter(([id]) => validId(id));
      await storage.transaction((tx) => tx.habits.reorder(entries));
      updated = uniqueIds.length;
    }
    return { status: 200, body: { success: true, updated, habits: await tree({ status: 'active' }) } };
  }

  async function create(body) {
    const id = newId();
    const {
      title, description = '', frequency = 'daily', category = 'pessoal', streak_target = 30, goal_id = null, source = 'manual',
      sort_order, recurrence_days, target_value, unit = '', preferred_time = '', kind = 'simple', parent_id = null,
      position_in_parent, children_ids, children, emoji, tracking_mode, since_date, quick_increment,
    } = body;

    const normTrackingMode = normalizeTrackingMode(tracking_mode);
    if (normTrackingMode === null) return bad('Invalid tracking_mode');
    const habitTrackingMode = normTrackingMode || 'check';
    const normSinceDate = normalizeSinceDate(since_date);
    if (normSinceDate === null) return bad('Invalid since_date (must be YYYY-MM-DD)');
    if (habitTrackingMode === 'since' && !normSinceDate) return bad('Valid since_date is required for tracking_mode=since');
    const habitSinceDate = normSinceDate || '';
    const habitQuickIncrement = quick_increment !== undefined && quick_increment !== null && quick_increment !== '' ? Number(quick_increment) : null;
    if (!title) return bad('Title is required');

    const outcome = await storage.transaction(async (tx) => {
      const goalLink = await goalLinkForCreate(tx, goal_id);
      if (!goalLink.ok) return { early: bad(GOAL_NOT_FOUND.error, { code: GOAL_NOT_FOUND.code }) };
      if (!HABIT_KINDS.has(kind)) return { early: bad('Invalid habit kind') };
      const parentError = await validateParent(tx, parent_id, kind);
      if (parentError) return { early: bad(parentError) };
      const freq = HABIT_FREQUENCIES.has(frequency) ? frequency : 'daily';
      const prefTime = normalizePreferredTime(preferred_time);
      if (prefTime === null) return { early: bad('preferred_time must be HH:MM or empty') };

      const habitTitle = stripPriorityPrefix(title);
      const top = await tx.habits.maxSort();
      const habitSortOrder = sort_order !== undefined ? Number(sort_order) : nextSort(top);
      const recDays = normalizeRecurrenceDays(recurrence_days) ?? '[]';
      const tgt = target_value === undefined || target_value === null || target_value === '' ? null : Number(target_value);
      const childPosition = parent_id
        ? (position_in_parent !== undefined ? Number(position_in_parent) : await nextChildPosition(tx, parent_id))
        : null;
      const slot = await tx.habits.nextRow();
      const stamp = sqlStamp(now());

      // A partir daqui os erros da antiga viravam 400 (o `create()` estava num try/catch).
      try {
        const bound = bindRow(HABIT_INSERT, [
          id, habitTitle, description, kind === 'compound' ? String(emoji || '') : '', freq, category, Number(streak_target) || 30,
          goalLink.value, source || 'manual', habitSortOrder, recDays, tgt, unit || '', prefTime || '', kind, parent_id || null,
          childPosition, habitTrackingMode, habitSinceDate, habitQuickIncrement,
        ]);
        const row = habitRow({ ...bound, created_date: stamp });
        const requested = children_ids ?? children;
        let plan = null;
        if (kind === 'compound' && requested !== undefined) {
          const compound = { ...row };
          plan = await planChildren(tx, compound, requested, {
            topOf: async () => maxSqlite([top, row.sort_order]),
            currentIds: async () => [],
          });
          if (plan.error) return { early: bad(plan.error) };
        }
        await tx.habits.createAt(row, slot);
        if (plan) await applyChildren(tx, plan, slot === null ? null : slot + 1);
        return { id };
      } catch (error) {
        if (isStorageError(error)) throw error;
        return { early: bad(error.message) };
      }
    });
    if (outcome.early) return outcome.early;
    const habit = findHabitInTree(await tree({ status: 'all' }), id);
    return { status: 201, body: habit };
  }

  async function syncChildren(id, body) {
    const requested = body?.ordered_ids ?? body?.children_ids ?? body?.children;
    let result;
    try {
      result = await storage.transaction(async (tx) => {
        const compound = await getHabit(tx, id);
        const currentIds = async () => (compound ? tx.habits.idsByParent(compound.id) : []);
        let plan = compound ? null : { error: 'Habit must be compound' };
        if (compound) {
          plan = await planChildren(tx, compound, requested, {
            topOf: async () => maxSqlite((await tx.habits.list({ status: null })).map((habit) => habit.sort_order)),
            currentIds,
          });
        }
        if (plan.error) return { error: plan.error };
        const slot = plan.steps.some((step) => step.isNew) ? await tx.habits.nextRow() : null;
        await applyChildren(tx, plan, slot);
        return { updated: plan.updated };
      });
    } catch (error) {
      if (isStorageError(error)) throw error;
      return bad(error.message);
    }
    if (result.error) return bad(result.error);
    const habit = (await tree({ status: 'all' })).find((item) => item.id === id);
    return { status: 200, body: { success: true, updated: result.updated, habit } };
  }

  async function update(id, body) {
    const early = await storage.transaction(async (tx) => {
      const existing = await getHabit(tx, id);
      if (!existing) return { early: NOT_FOUND };

      const goalLink = await goalLinkForUpdate(tx, body, existing.goal_id);
      if (!goalLink.ok) return { early: bad(GOAL_NOT_FOUND.error, { code: GOAL_NOT_FOUND.code }) };

      const {
        title, description, frequency, category, streak_target, source, status, sort_order, recurrence_days, target_value, unit,
        preferred_time, kind, parent_id, position_in_parent, children_ids, children, emoji, tracking_mode, since_date, quick_increment,
      } = body;

      let normTrackingMode;
      if (tracking_mode !== undefined) {
        normTrackingMode = normalizeTrackingMode(tracking_mode);
        if (normTrackingMode === null) return { early: bad('Invalid tracking_mode') };
      }
      let normSinceDate;
      if (since_date !== undefined) {
        normSinceDate = normalizeSinceDate(since_date);
        if (normSinceDate === null) return { early: bad('Invalid since_date (must be YYYY-MM-DD)') };
      }
      const effectiveTrackingMode = normTrackingMode ?? existing.tracking_mode ?? 'check';
      const effectiveSinceDate = normSinceDate !== undefined ? normSinceDate : (existing.since_date || '');
      if (effectiveTrackingMode === 'since' && !effectiveSinceDate) return { early: bad('Valid since_date is required for tracking_mode=since') };

      if (status !== undefined && status !== null && !HABIT_STATUSES.has(status)) return { early: bad('Invalid status') };
      if (frequency !== undefined && frequency !== null && !HABIT_FREQUENCIES.has(frequency)) return { early: bad('Invalid frequency') };
      if (kind !== undefined && !HABIT_KINDS.has(kind)) return { early: bad('Invalid habit kind') };
      const nextKind = kind ?? existing.kind;
      const nextParentId = parent_id !== undefined ? parent_id : existing.parent_id;
      const parentError = await validateParent(tx, nextParentId, nextKind, existing.id);
      if (parentError) return { early: bad(parentError) };

      const recDays = recurrence_days !== undefined ? normalizeRecurrenceDays(recurrence_days) : null;
      const tgt = target_value !== undefined ? (target_value === null || target_value === '' ? null : Number(target_value)) : undefined;
      let prefTime;
      if (preferred_time !== undefined) {
        prefTime = normalizePreferredTime(preferred_time);
        if (prefTime === null) return { early: bad('preferred_time must be HH:MM or empty') };
      }
      const habitQuickIncrement = quick_increment !== undefined ? (quick_increment === null || quick_increment === '' ? null : Number(quick_increment)) : undefined;
      const shouldUpdatePosition = position_in_parent !== undefined || parent_id !== undefined;
      const nextPosition = position_in_parent !== undefined
        ? (position_in_parent === null ? null : Number(position_in_parent))
        : parent_id ? await nextChildPosition(tx, parent_id) : null;

      const requested = children_ids ?? children;
      // Leituras que o resto da gravação precisa, todas antes da primeira escrita.
      const compoundSource = nextKind === 'compound' && (requested !== undefined || status !== undefined);
      const currentChildren = compoundSource ? await tx.habits.idsByParent(existing.id) : [];

      try {
        const bound = bindRow(HABIT_UPDATE, [
          title !== undefined ? stripPriorityPrefix(title) : null, description, emoji !== undefined ? 1 : 0, emoji !== undefined ? String(emoji || '') : null,
          frequency, category, streak_target !== undefined ? Number(streak_target) : null, goalLink.change ? 1 : 0, goalLink.value, source, status,
          sort_order !== undefined ? Number(sort_order) : null, recDays, tgt !== undefined ? tgt : null, unit, prefTime !== undefined ? prefTime : null,
          kind ?? null, parent_id !== undefined ? 1 : 0, parent_id || null, shouldUpdatePosition ? 1 : 0, nextPosition, normTrackingMode ?? null,
          normSinceDate ?? null, quick_increment !== undefined ? 1 : 0, habitQuickIncrement !== undefined ? habitQuickIncrement : null, id,
        ]);
        // `coluna = COALESCE(?, coluna)`: NULL mantém; `CASE WHEN ? = 1 THEN ? ELSE coluna END`: a bandeira manda.
        const fields = {};
        for (const column of ['title', 'description', 'frequency', 'category', 'streak_target', 'source', 'status', 'sort_order', 'recurrence_days',
          'target_value', 'unit', 'preferred_time', 'kind', 'tracking_mode', 'since_date']) if (bound[column] !== null) fields[column] = bound[column];
        for (const [flag, column] of [['flagEmoji', 'emoji'], ['flagGoal', 'goal_id'], ['flagParent', 'parent_id'], ['flagPosition', 'position_in_parent'], ['flagQuick', 'quick_increment']]) {
          if (bound[flag] === 1) fields[column] = bound[column];
        }
        const compound = { ...existing, ...fields };

        let plan = null;
        if (requested !== undefined) {
          plan = await planChildren(tx, compound, requested, {
            topOf: async () => maxSqlite((await tx.habits.list({ status: null })).map((habit) => (habit.id === existing.id ? compound.sort_order : habit.sort_order))),
            currentIds: async () => currentChildren,
          });
          if (plan.error) return { early: bad(plan.error) };
        }
        const slot = plan?.steps.some((step) => step.isNew) ? await tx.habits.nextRow() : null;

        if (Object.keys(fields).length) await tx.habits.patch(id, fields);
        // `UPDATE habits SET status = ? WHERE parent_id = ?` depois da sincronização: os filhos que ficaram.
        const childStatus = nextKind === 'compound' && status !== undefined ? bound.status : undefined;
        if (plan) await applyChildren(tx, plan, slot, { childStatus });
        else if (childStatus !== undefined) for (const childId of currentChildren) await tx.habits.patch(childId, { status: childStatus });
        return {};
      } catch (error) {
        if (isStorageError(error)) throw error;
        return { early: bad(error.message) };
      }
    });
    if (early.early) return early.early;
    const habit = findHabitInTree(await tree({ status: 'all' }), id) || await getHabit(storage, id);
    return { status: 200, body: habit };
  }

  async function remove(id) {
    const key = validId(id) ? id : null;
    if (key !== null) {
      await storage.transaction(async (tx) => {
        const habit = await tx.habits.get(key);
        const children = habit?.kind === 'compound' ? await tx.habits.idsByParent(key) : [];
        const rituals = await tx.rituals.list();
        const edits = [];
        for (const r of rituals) {
          try {
            const order = JSON.parse(r.habits_order || '[]');
            if (order.includes(key)) edits.push([r.id, JSON.stringify(order.filter((h) => h !== key))]);
          } catch { /* ordem antiga ilegível: a antiga ignorava */ }
        }
        // `removeByHabit` também lê (Firestore): primeiro, antes de qualquer outra escrita.
        await tx.habitLogs.removeByHabit(key);
        for (const childId of children) await tx.habits.patch(childId, { status: 'archived', parent_id: null, position_in_parent: null });
        for (const [ritualId, order] of edits) await tx.rituals.patch(ritualId, { habits_order: order });
        await tx.habits.remove(key);
      });
    }
    return { status: 200, body: { success: true } };
  }

  async function streak(id) {
    const habit = await getHabit(storage, id);
    if (!habit) return NOT_FOUND;
    if (habit.kind === 'compound') return { status: 200, body: { habit_id: habit.id, title: habit.title, current_streak: null, best_streak: null } };
    if (isSinceHabit(habit)) {
      const days = daysSinceDate(habit.since_date, getLocalDateString());
      return { status: 200, body: { habit_id: habit.id, title: habit.title, current_streak: days, best_streak: Math.max(Number(habit.best_streak) || 0, days) } };
    }
    const logs = await storage.habitLogs.forHabits([habit.id]);
    const { current_streak, best_streak } = streaksFromLogs(logs, getLocalDateString);
    return { status: 200, body: { habit_id: habit.id, title: habit.title, current_streak, best_streak } };
  }

  return Object.freeze({ tree, list, reorder, create, syncChildren, update, remove, streak });
}

export function createHabitLogsService({
  storage, now = () => new Date(), newId = randomUUID, HABIT_OUTCOMES, SKIP_REASONS,
}) {
  if (!storage?.habitLogs || !storage?.habits || typeof storage.transaction !== 'function') throw new TypeError('habit logs service requires storage');
  if (!HABIT_OUTCOMES || !SKIP_REASONS) throw new TypeError('habit logs service requires HABIT_OUTCOMES and SKIP_REASONS');

  function normalizeHabitOutcome(body = {}) {
    const rawOutcome = body.outcome != null ? String(body.outcome).toLowerCase().trim() : null;
    let outcome = rawOutcome && HABIT_OUTCOMES.has(rawOutcome) ? rawOutcome : null;
    if (!outcome) {
      // Compat: completed:true → done; completed:false alone is invalid without outcome
      if (body.completed === false || body.completed === 0 || body.completed === '0') outcome = null;
      else outcome = 'done';
    }
    if (!outcome) return { error: 'outcome required (done|skipped), or completed:true for done' };

    let skip_reason = null;
    if (body.skip_reason != null && body.skip_reason !== '') {
      const r = String(body.skip_reason).toLowerCase().trim();
      if (!SKIP_REASONS.has(r)) return { error: 'skip_reason must be time|energy|context|other' };
      skip_reason = r;
    }
    // Free-text honest name of the miss ("eu escolhi o fácil")
    let note = '';
    const rawNote = body.note != null ? body.note : body.skip_note;
    if (rawNote != null && String(rawNote).trim() !== '') note = String(rawNote).trim().slice(0, 280);

    if (outcome === 'skipped') return { outcome: 'skipped', completed: 0, skip_reason, note, value: null };
    return { outcome: 'done', completed: 1, skip_reason: null, note: '', value: body.value };
  }

  async function list(query) {
    const filters = {}, params = [];
    for (const key of ['date', 'from', 'to', 'habit_id']) {
      const value = query[key];
      filters[key] = value || null;
      if (value) params.push(value);
    }
    // Filtro repetido ou aninhado na URL (lista/objeto): mesmo erro de ligação do SQLite; se a contagem
    // fecha mas os parâmetros se deslocam, recusa explícita.
    bindPositional(params, params.length);
    if (params.some((value) => typeof value !== 'string')) throw unsupported('filtro repetido ou aninhado na URL');
    return storage.habitLogs.list(filters);
  }

  async function save(body) {
    const { habit_id, date } = body || {};
    if (!habit_id || !date) return bad('habit_id and date required');
    return storage.transaction(async (tx) => {
      const habitKey = textKey(habit_id);
      const habit = await getHabit(tx, habit_id);
      if (!habit) return NOT_FOUND;
      if (habit.kind === 'compound') return bad('Compound habits are completed through their steps');
      if (isSinceHabit(habit)) return bad('Hábitos do tipo since são contadores e não aceitam check diário');

      const normalized = normalizeHabitOutcome(body || {});
      if (normalized.error) return bad(normalized.error);

      let completedFlag = normalized.completed;
      const dateKey = textKey(date);
      const existing = dateKey === null ? null : await tx.habitLogs.find(habitKey, dateKey);
      const quantity = readHabitQuantity({
        value: normalized.outcome === 'skipped' ? undefined : normalized.value,
        increment: normalized.outcome === 'skipped' ? undefined : (body?.increment ?? body?.delta),
        currentValue: existing?.value,
      });
      if (quantity.error) return bad(quantity.error, { code: 'habit_log_invalid_value' });
      let logValue = quantity.value;

      let outcome = normalized.outcome;
      let skipReason = normalized.skip_reason;
      let note = normalized.note || '';

      if (outcome === 'done' && habit.target_value != null && Number(habit.target_value) > 0) {
        if (logValue == null || Number.isNaN(logValue)) {
          logValue = Number(habit.target_value);
          completedFlag = 1;
          outcome = 'done';
        } else if (logValue >= Number(habit.target_value)) {
          completedFlag = 1;
          outcome = 'done';
        } else {
          completedFlag = 0;
          outcome = null;
        }
      }
      if (outcome === 'skipped') {
        completedFlag = 0;
        logValue = null;
      } else {
        skipReason = null;
        note = '';
      }

      if (existing) {
        const fields = bindRow(LOG_UPDATE, [completedFlag, logValue, outcome, skipReason, note, existing.id]);
        delete fields.id;
        await tx.habitLogs.patch(existing.id, fields);
        return { status: 200, body: { ...existing, ...fields } };
      }
      const row = bindRow(LOG_INSERT, [newId(), habit_id, date, completedFlag, logValue, outcome, skipReason, note]);
      const created = await tx.habitLogs.create(habitLogRow(row, now));
      return { status: 201, body: created };
    });
  }

  async function remove(id) {
    if (validId(id)) await storage.habitLogs.remove(id);
    return { status: 200, body: { success: true } };
  }

  return Object.freeze({ list, save, remove });
}

/** Linha completa de `habit_logs` como o INSERT com colunas omitidas gravaria (`created_date` = agora). */
function habitLogRow(values, now) {
  return {
    id: values.id, habit_id: values.habit_id, date: values.date, completed: values.completed, created_date: sqlStamp(now()),
    value: values.value, outcome: values.outcome, skip_reason: values.skip_reason, note: values.note,
  };
}
