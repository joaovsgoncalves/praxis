/**
 * Tarefas sobre a camada assíncrona, com o comportamento da rota antiga (oráculos em
 * test-support/oracles/tasks.bcbadad.js, taskSeries, taskCalendarQueue, goalLinks e xpEvents):
 *
 * - leitura: lista com filtros e janela e, no modo operacional, abertas + concluídas hoje + "não rolou"
 *   recentes, tudo num retrato só, com a contagem do checklist; detalhe e checklist com o mesmo 404;
 * - criar, editar, excluir e adiar: status, XP, próxima ocorrência da série, estorno e a INTENÇÃO de
 *   agenda (`task_calendar_queue`) valem na MESMA transação: ou tudo, ou nada (500 `task_write_failed`).
 *   Todas as leituras (XP, ocorrência, posição, fichas de ordem, fila) vêm antes da primeira escrita;
 * - a agenda nunca roda aqui: o serviço grava a intenção e, depois do commit, chama
 *   `scheduleCalendarDrain` (a fila é drenada fora de transação, `services/routine/calendarQueue.js`).
 *
 * Ligação e afinidade de cada parâmetro vêm de `affinity.js` (provadas contra o SQLite real).
 *
 * Diferenças intencionais (nenhum consumidor manda; tela e Alfred mandam texto, inteiro e data):
 * (1) `sort_order`/`duration_minutes` que não viram inteiro seguro (1.5) e lista/objeto que desloca
 *     parâmetros viram erro explícito (500 `task_write_failed` ou `sqlite_coercion_unsupported`); a
 *     antiga gravava REAL;
 * (2) filtros repetidos na URL (`?date=a&date=b`): erro de ligação igual ao do SQLite quando a contagem
 *     não fecha, recusa explícita quando fecha mas desloca;
 * (3) id com mais de 1500 bytes no caminho responde como "não existe" (nenhum registro pode ter esse id);
 * (4) a posição `MAX(sort_order) + 1` é lida DENTRO da transação (a antiga lia antes dela);
 * (5) o estorno por exclusão e o reordenar leem a lista inteira no Firestore (ceiling declarado).
 */
import { randomUUID } from 'node:crypto';
import { recordId, taskRow } from '../../storage/contract.js';
import { CHECKLIST_FIELDS } from '../../storage/domains/phase3.js';
import { maxSqlite } from '../../storage/sqliteOrder.js';
import { bindPositional, sqliteLimit } from '../../storage/sqliteSemantics.js';
import { GOAL_NOT_FOUND } from '../../lib/goalLinks.js';
import { enrichCategory as defaultEnrichCategory } from '../../lib/categories.js';
import { bindRow, nextSort, shifted, sqlStamp, unsupported } from './affinity.js';
import { planXp, applyXp } from './xp.js';
import { planSpawn } from './taskSeries.js';

const TASK_INSERT = [
  ['id', 'TEXT'], ['title', 'TEXT'], ['description', 'TEXT'], ['date', 'TEXT'], ['time', 'TEXT'], ['status', 'TEXT'], ['priority', 'TEXT'],
  ['category', 'TEXT'], ['goal_id', 'TEXT'], ['source', 'TEXT'], ['duration_minutes', 'INTEGER'], ['calendar_event_id', 'TEXT'],
  ['sort_order', 'INTEGER'], ['recurrence', 'TEXT'], ['recurrence_days', 'TEXT'], ['recurrence_parent_id', 'TEXT'],
  ['completed_date', 'TEXT'], ['completed_at', 'TEXT'], ['idea_status', 'TEXT'], ['source_idea_id', 'TEXT'],
];
// Os 20 marcadores do UPDATE da antiga, na ordem. `flagGoal` é o 0/1 do `CASE WHEN ? = 1`.
const TASK_UPDATE = [
  ['title', 'TEXT'], ['description', 'TEXT'], ['date', 'TEXT'], ['time', 'TEXT'], ['status', 'TEXT'], ['priority', 'TEXT'], ['category', 'TEXT'],
  ['flagGoal', 'INTEGER'], ['goal_id', 'TEXT'], ['source', 'TEXT'], ['duration_minutes', 'INTEGER'], ['calendar_event_id', 'TEXT'],
  ['sort_order', 'INTEGER'], ['recurrence', 'TEXT'], ['recurrence_days', 'TEXT'], ['idea_status', 'TEXT'], ['source_idea_id', 'TEXT'],
  ['completed_date', 'TEXT'], ['completed_at', 'TEXT'], ['id', 'TEXT'],
];
const COALESCED = ['title', 'description', 'date', 'time', 'status', 'priority', 'category', 'source', 'duration_minutes', 'calendar_event_id',
  'sort_order', 'recurrence', 'recurrence_days', 'idea_status', 'source_idea_id'];
const IDEA_INSERT = [['id', 'TEXT'], ['title', 'TEXT'], ['description', 'TEXT'], ['date', 'TEXT'], ['priority', 'TEXT'], ['category', 'TEXT'], ['sort_order', 'INTEGER'], ['source_idea_id', 'TEXT']];
const CHECKLIST_INSERT = [['id', 'TEXT'], ['task_id', 'TEXT'], ['title', 'TEXT'], ['sort_order', 'INTEGER']];

const NOT_FOUND = { status: 404, body: { error: 'Task not found' } };
const ITEM_NOT_FOUND = { status: 404, body: { error: 'Checklist item not found' } };
const WRITE_FAILED = { error: 'Não foi possível salvar a tarefa. Nada foi alterado.', code: 'task_write_failed' };
const IDEA_FAILED = { error: 'Não foi possível virar tarefa. Nada foi alterado.', code: 'task_write_failed' };
const isDoneStatus = (status) => status === 'completed' || status === 'done';
const isClosed = (status) => ['completed', 'done', 'cancelled'].includes(status);
const validId = (id) => { try { recordId(id); return true; } catch { return false; } };
const isEmpty = (value) => value === null || value === undefined || value === '';
/** Fichas de ordem de inserção consecutivas a partir da reservada por `nextRow()` (null no SQLite). */
const slots = (base) => () => { if (base === null) return null; const value = base; base += 1; return value; };

export function createTasksService({
  storage, getLocalDateString, addDaysLocal, stripPriorityPrefix, SKIP_REASONS,
  enrichCategory = defaultEnrichCategory,
  // Agenda: `taskNeedsCalendarSync(task)` decide se a tarefa pede sincronia (ausente = sempre);
  // `calendarEnabled()` diz se esta conta tem agenda (sem agenda a intenção não é gravada).
  taskNeedsCalendarSync = null, calendarEnabled = () => true, scheduleCalendarDrain = () => {},
  now = () => new Date(), newId = randomUUID, log = console,
}) {
  if (!storage?.tasks || !storage?.taskChecklistItems || typeof storage.transaction !== 'function') throw new TypeError('tasks service requires storage');
  for (const [name, fn] of Object.entries({ getLocalDateString, addDaysLocal, stripPriorityPrefix })) if (typeof fn !== 'function') throw new TypeError(`tasks service requires ${name}`);
  if (!SKIP_REASONS || typeof SKIP_REASONS.has !== 'function') throw new TypeError('tasks service requires SKIP_REASONS');
  const deps = { now, newId };

  function failed(where, error, body = WRITE_FAILED) {
    log.error(`[${where === 'to-task' ? 'ideas' : 'tasks'}] ${where} falhou e foi desfeito:`, error?.message || error);
    return { status: 500, body };
  }

  // ---- vínculo com meta (lib/goalLinks.js, sobre o storage) ----
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

  // ---- intenção de agenda: lida antes, gravada depois, na mesma transação ----
  function queueIntents() {
    const intents = [];
    return {
      /** `queueCalendar` da antiga: só quando a tarefa pede sincronia. */
      async forTask(tx, task, options) {
        if (!task) return { skipped: true };
        if (taskNeedsCalendarSync && !taskNeedsCalendarSync(task)) return { skipped: true };
        return this.enqueue(tx, task.id, options);
      },
      /** `calendarQueue.enqueue` da antiga (a conta sem agenda responde `queued: false`). */
      async enqueue(tx, taskId, { snapshot = null } = {}) {
        if (!taskId) return { queued: false };
        if (!calendarEnabled()) return { queued: false };
        const id = String(taskId);
        intents.push({ id, snapshot, existing: await tx.taskCalendarQueue.get(id) });
        return { queued: true };
      },
      /** Leitura da ficha de ordem, ainda antes das escritas. */
      async reserve(tx) { return intents.some((intent) => !intent.existing) ? tx.taskCalendarQueue.nextRow() : null; },
      async write(tx, token) {
        const next = slots(token), iso = now().toISOString(), stamp = sqlStamp(now());
        for (const { id, snapshot, existing } of intents) {
          const revisionStamp = existing && Date.parse(existing.updated_date) >= Date.parse(iso) ? new Date(Date.parse(existing.updated_date) + 1).toISOString() : iso;
          const fields = { snapshot: snapshot ? JSON.stringify(snapshot) : null, status: 'pending', attempts: 0, last_error: null, next_attempt_at: iso, updated_date: revisionStamp };
          if (existing) await tx.taskCalendarQueue.patch(id, fields);
          else await tx.taskCalendarQueue.createAt({ task_id: id, ...fields, created_date: stamp }, next());
        }
      },
    };
  }

  // ---- checklist: contagens e itens ----
  async function withCounts(tx, rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const counts = new Map((await tx.taskChecklistItems.counts(rows.map((row) => row.id))).map((row) => [row.task_id, row]));
    return rows.map((row) => {
      const c = counts.get(row.id);
      return { ...row, checklist_total: c ? Number(c.total) : 0, checklist_done: c ? Number(c.done) : 0 };
    });
  }
  const shown = (item) => ({ ...item, done: Boolean(item.done) });

  // ---- leitura ----
  async function list(query) {
    const { date, status, category, idea_status, limit = 100, offset = 0, include_overdue, today: todayParam } = query;
    const limitN = Math.min(1000, Math.max(1, Number(limit) || 100));
    const offsetN = Math.max(0, Number(offset) || 0);
    const today = String(todayParam || getLocalDateString()).slice(0, 10);
    const mergeOverdue = include_overdue === '1' || include_overdue === 'true';

    // Mesma ligação do driver: filtros repetidos/estruturados na URL erram como o SQLite errava.
    const names = [], raw = [];
    for (const [name, value] of [['date', date], ['status', status], ['category', category], ['idea_status', idea_status]]) {
      if (value) { names.push(name); raw.push(value); }
    }
    raw.push(limitN, offsetN);
    const bound = bindPositional(raw, raw.length);
    if (shifted(raw)) throw unsupported('filtros da lista com parâmetros deslocados por lista ou objeto');
    const filters = { date: null, status: null, category: null, idea_status: null };
    names.forEach((name, i) => { filters[name] = bound[i]; });
    // LIMIT/OFFSET fracionário ou infinito: o mesmo erro "datatype mismatch" do SQLite.
    const window = { limit: sqliteLimit(bound[names.length]), offset: sqliteLimit(bound[names.length + 1]) };

    return storage.transaction(async (tx) => {
      const recent = await tx.tasks.search({ ...filters, ...window });
      // Leitura não altera nada: o fechamento das vencidas é da virada do dia.
      if (!mergeOverdue) return (await withCounts(tx, recent)).map(enrichCategory);

      // Modo operacional: abertas (atrasadas, de hoje e futuras) + concluídas hoje + "não rolou" recentes.
      const operationalRows = await tx.tasks.operational();
      const completedTodayRows = await tx.tasks.completedOn(today);
      const missedRecentRows = await tx.tasks.missedSince(addDaysLocal(today, -14));

      const byId = new Map();
      for (const t of operationalRows) byId.set(t.id, t);
      for (const t of completedTodayRows) byId.set(t.id, t);
      for (const t of missedRecentRows) byId.set(t.id, t);
      // Keep any explicit filters from the base query (status/date/category) if set.
      for (const t of recent) {
        if (!category && t.category === 'ideias') continue;
        byId.set(t.id, t);
      }

      const merged = [...byId.values()].sort((a, b) => {
        const aOpen = !['completed', 'done', 'cancelled'].includes(a.status);
        const bOpen = !['completed', 'done', 'cancelled'].includes(b.status);
        const aOver = aOpen && a.date && a.date < today;
        const bOver = bOpen && b.date && b.date < today;

        if (aOver !== bOver) return aOver ? -1 : 1;
        if (aOpen !== bOpen) return aOpen ? -1 : 1;

        const so = (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9);
        if (so !== 0) return so;
        return String(b.created_date || '').localeCompare(String(a.created_date || ''));
      });
      return (await withCounts(tx, merged)).map(enrichCategory);
    });
  }

  async function get(id) {
    if (!validId(id)) return NOT_FOUND;
    return storage.transaction(async (tx) => {
      const task = await tx.tasks.get(id);
      if (!task) return NOT_FOUND;
      return { status: 200, body: enrichCategory((await withCounts(tx, [task]))[0]) };
    });
  }

  async function reorder(body) {
    // `reorderItems('tasks', ...)` da antiga: nada a fazer sem lista; ids únicos, texto, na ordem recebida.
    const input = body?.ordered_ids || body?.ids;
    let updated = 0;
    if (Array.isArray(input) && input.length > 0) {
      const uniqueIds = [...new Set(input.filter(Boolean).map(String))];
      const entries = uniqueIds.map((id, index) => [id, index]).filter(([id]) => validId(id));
      await storage.transaction((tx) => tx.tasks.reorder(entries));
      updated = uniqueIds.length;
    }
    const tasks = await storage.tasks.all();
    return { status: 200, body: { success: true, updated, tasks: tasks.map(enrichCategory) } };
  }

  // ---- checklist ----
  async function listChecklist(taskId) {
    if (!validId(taskId)) return NOT_FOUND;
    return storage.transaction(async (tx) => {
      if (!(await tx.tasks.get(taskId))) return NOT_FOUND;
      return { status: 200, body: (await tx.taskChecklistItems.list(taskId)).map(shown) };
    });
  }

  async function addChecklistItem(taskId, body) {
    if (!validId(taskId)) return NOT_FOUND;
    return storage.transaction(async (tx) => {
      if (!(await tx.tasks.get(taskId))) return NOT_FOUND;
      const title = String(body?.title ?? '').trim();
      if (!title) return { status: 400, body: { error: 'Title is required' } };

      const top = await tx.taskChecklistItems.maxSort(taskId);
      const token = await tx.taskChecklistItems.nextRow();
      const stamp = sqlStamp(now());
      const values = bindRow(CHECKLIST_INSERT, [newId(), taskId, title, nextSort(top)]);
      const item = Object.fromEntries(CHECKLIST_FIELDS.map((field) => [field, { ...values, done: 0, created_date: stamp, updated_date: stamp }[field] ?? null]));
      await tx.taskChecklistItems.createAt(item, token);
      return { status: 201, body: shown(item) };
    });
  }

  async function reorderChecklist(taskId, body) {
    if (!validId(taskId)) return NOT_FOUND;
    const ids = body?.ordered_ids;
    const found = await storage.transaction(async (tx) => {
      if (!(await tx.tasks.get(taskId))) return null;
      if (!Array.isArray(ids)) return { bad: true };
      const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
      const own = [];
      for (const [index, itemId] of uniqueIds.entries()) if (validId(itemId) && await tx.taskChecklistItems.get(itemId, taskId)) own.push([itemId, index]);
      const stamp = sqlStamp(now());
      for (const [itemId, index] of own) await tx.taskChecklistItems.patch(itemId, { sort_order: index, updated_date: stamp });
      return { ok: true };
    });
    if (!found) return NOT_FOUND;
    if (found.bad) return { status: 400, body: { error: 'ordered_ids must be an array' } };
    return { status: 200, body: { success: true, items: (await storage.taskChecklistItems.list(taskId)).map(shown) } };
  }

  async function patchChecklistItem(taskId, itemId, body) {
    if (!validId(taskId) || !validId(itemId)) return ITEM_NOT_FOUND;
    return storage.transaction(async (tx) => {
      const existing = await tx.taskChecklistItems.get(itemId, taskId);
      if (!existing) return ITEM_NOT_FOUND;

      const { title, done } = body || {};
      let nextTitle = existing.title;
      if (title !== undefined) {
        nextTitle = String(title).trim();
        if (!nextTitle) return { status: 400, body: { error: 'Title cannot be empty' } };
      }
      const nextDone = done !== undefined ? (done ? 1 : 0) : existing.done;
      const fields = { title: nextTitle, done: nextDone, updated_date: sqlStamp(now()) };
      await tx.taskChecklistItems.patch(existing.id, fields);
      return { status: 200, body: shown({ ...existing, ...fields }) };
    });
  }

  async function removeChecklistItem(taskId, itemId) {
    if (!validId(taskId) || !validId(itemId)) return ITEM_NOT_FOUND;
    return storage.transaction(async (tx) => {
      if (!(await tx.taskChecklistItems.get(itemId, taskId))) return ITEM_NOT_FOUND;
      await tx.taskChecklistItems.remove(itemId);
      return { status: 200, body: { success: true } };
    });
  }

  // ---- transição de status: XP + próxima ocorrência, planejadas (leituras) e depois gravadas ----
  /**
   * Efeitos de entrar ou sair de concluída: XP (+10 uma vez, estorno ao reabrir) e próxima
   * ocorrência. `top` = `MAX(sort_order)` da tabela com a tarefa já no estado final (função preguiçosa).
   */
  async function planTransition(tx, { wasDone, task, today, topWithTask, queue }) {
    const isDone = isDoneStatus(task.status);
    const plan = { xp: null, reason: null, spawn: null, spawnQueue: null };
    if (!wasDone && isDone) {
      plan.reason = task.date && task.date < today ? 'Tarefa atrasada limpa hoje' : 'Tarefa concluída';
      plan.xp = { kind: 'award', plan: await planXp(tx, { awards: [{ sourceType: 'task', sourceId: task.id, amount: 10, reason: plan.reason }] }) };
      plan.spawn = await planSpawn(tx, task, { completedDate: task.completed_date, today, top: await topWithTask(), ...deps });
      if (plan.spawn?.created) plan.spawnQueue = await queue.forTask(tx, plan.spawn.row);
    } else if (wasDone && !isDone) {
      plan.reason = 'Tarefa desmarcada';
      plan.xp = { kind: 'reverse', plan: await planXp(tx, { reverses: [{ sourceType: 'task', sourceId: task.id }] }) };
    }
    return plan;
  }

  /**
   * Grava o XP (primeiro: o estorno do Firestore lê o evento, e leitura não vem depois de escrita) e
   * devolve `xpSync` como a antiga.
   */
  async function applyXpPart(tx, plan) {
    let xpSync = null;
    if (plan.xp) {
      const out = await applyXp(tx, plan.xp.plan, deps);
      if (plan.xp.kind === 'award') {
        const awarded = out.results[0].awarded;
        if (awarded > 0) xpSync = { awarded, reason: plan.reason, xp_total: out.xp_total, level: out.level, leveled_up: out.leveled_up };
      } else if (out.results[0].reversed !== 0) {
        xpSync = { awarded: -out.results[0].reversed, reason: plan.reason, xp_total: out.xp_total, level: out.level };
      }
    }
    return xpSync;
  }

  /** Grava o filho da série (se for novo) e devolve `next_occurrence` como a antiga. */
  async function applySpawnPart(tx, plan, spawnSlot) {
    if (!plan.spawn) return null;
    if (plan.spawn.created) await tx.tasks.createAt(plan.spawn.row, spawnSlot);
    return { id: plan.spawn.id, date: plan.spawn.date, created: plan.spawn.created };
  }

  // ---- criar ----
  async function create(body) {
    const id = newId();
    const {
      title, description = '', date, time, status = 'pending',
      priority = 'medium', category = 'pessoal', goal_id = null, source = 'manual', duration_minutes,
      calendar_event_id, sort_order, recurrence = 'none', recurrence_days = [], recurrence_parent_id,
      idea_status, source_idea_id,
    } = body;

    if (!title) return { status: 400, body: { error: 'Title is required' } };

    const isIdea = category === 'ideias';
    const taskPriority = isIdea ? (priority || 'low') : priority;
    const taskIdeaStatus = isIdea ? (idea_status || 'capturada') : (idea_status || null);
    const taskDate = isIdea ? (date || null) : date;
    const taskTime = isIdea ? (time || null) : time;
    const isDoneOnCreate = isDoneStatus(status);
    const taskTitle = stripPriorityPrefix(title);

    try {
      const outcome = await storage.transaction(async (tx) => {
        const goalLink = await goalLinkForCreate(tx, goal_id);
        if (!goalLink.ok) return { early: { status: 400, body: GOAL_NOT_FOUND } };

        const clockNow = now();
        const top = await tx.tasks.maxSort();
        const taskSortOrder = sort_order !== undefined ? Number(sort_order) : nextSort(top);
        const values = bindRow(TASK_INSERT, [
          id, taskTitle, description, taskDate || null, taskTime || null, status, taskPriority, category,
          goalLink.value, source || 'manual', duration_minutes ? Number(duration_minutes) : null,
          calendar_event_id || null, taskSortOrder, recurrence,
          JSON.stringify(Array.isArray(recurrence_days) ? recurrence_days : []),
          recurrence_parent_id || null,
          isDoneOnCreate ? getLocalDateString() : null,
          isDoneOnCreate ? clockNow.toISOString() : null,
          taskIdeaStatus,
          source_idea_id || null,
        ]);
        const task = taskRow(values, clockNow);

        const queue = queueIntents();
        // Nascer concluída passa pela mesma transição de quem é concluída depois.
        const plan = await planTransition(tx, {
          wasDone: false, task, today: getLocalDateString(),
          topWithTask: async () => maxSqlite([top, task.sort_order]), queue,
        });
        const calendarSync = await queue.forTask(tx, task);
        const taskSlots = slots(await tx.tasks.nextRow());
        const queueToken = await queue.reserve(tx);

        const xpSync = await applyXpPart(tx, plan);
        await tx.tasks.createAt(task, taskSlots());
        const nextOccurrence = await applySpawnPart(tx, plan, taskSlots());
        await queue.write(tx, queueToken);
        return { task, calendarSync, xpSync, nextOccurrence };
      });
      if (outcome.early) return outcome.early;
      scheduleCalendarDrain();
      return { status: 201, body: { ...outcome.task, calendar_sync: outcome.calendarSync, next_occurrence: outcome.nextOccurrence, xp_sync: outcome.xpSync } };
    } catch (error) {
      return failed('POST', error);
    }
  }

  // ---- editar ----
  async function update(id, body) {
    if (!validId(id)) return NOT_FOUND;
    try {
      const outcome = await storage.transaction(async (tx) => {
        const existing = await tx.tasks.get(id);
        if (!existing) return { early: NOT_FOUND };

        const goalLink = await goalLinkForUpdate(tx, body, existing.goal_id);
        if (!goalLink.ok) return { early: { status: 400, body: GOAL_NOT_FOUND } };

        const { title, description, date, time, status, priority, category, source, duration_minutes, calendar_event_id, sort_order, recurrence, recurrence_days, idea_status, source_idea_id } = body;

        const wasDone = isDoneStatus(existing.status);
        const willBeDone = isDoneStatus(status);
        const clockNow = now();
        const today = getLocalDateString(clockNow);
        let completedDate = existing.completed_date || null;
        let completedAt = existing.completed_at || null;

        if (status !== undefined) {
          if (willBeDone) {
            completedDate = existing.completed_date || today;
            completedAt = existing.completed_at || clockNow.toISOString();
          } else {
            completedDate = null;
            completedAt = null;
          }
        }

        const values = bindRow(TASK_UPDATE, [
          title !== undefined ? stripPriorityPrefix(title) : null, description, date, time, status, priority, category,
          goalLink.change ? 1 : 0, goalLink.value,
          source, duration_minutes !== undefined ? Number(duration_minutes) : null, calendar_event_id,
          sort_order !== undefined ? Number(sort_order) : null,
          recurrence,
          recurrence_days !== undefined ? JSON.stringify(Array.isArray(recurrence_days) ? recurrence_days : []) : null,
          idea_status !== undefined ? idea_status : null,
          source_idea_id !== undefined ? source_idea_id : null,
          completedDate,
          completedAt,
          id,
        ]);
        // `COALESCE(?, coluna)`: NULL mantém o gravado; meta, conclusão e carimbo são sempre gravados.
        const fields = {};
        for (const key of COALESCED) if (values[key] !== null) fields[key] = values[key];
        if (goalLink.change) fields.goal_id = values.goal_id;
        fields.completed_date = values.completed_date;
        fields.completed_at = values.completed_at;
        fields.updated_date = sqlStamp(clockNow);
        const task = { ...existing, ...fields };

        const queue = queueIntents();
        // Status, XP e próxima ocorrência valem juntos ou nenhum vale.
        const plan = await planTransition(tx, {
          wasDone, task, today,
          topWithTask: async () => maxSqlite([await tx.tasks.maxSortExcept(id), task.sort_order]), queue,
        });
        const calendarSync = await queue.forTask(tx, task);
        const spawnSlot = plan.spawn?.created ? await tx.tasks.nextRow() : null;
        const queueToken = await queue.reserve(tx);

        const xpSync = await applyXpPart(tx, plan);
        await tx.tasks.patch(id, fields);
        const nextOccurrence = await applySpawnPart(tx, plan, spawnSlot);
        await queue.write(tx, queueToken);
        return { task, calendarSync, xpSync, nextOccurrence };
      });
      if (outcome.early) return outcome.early;
      scheduleCalendarDrain();
      return { status: 200, body: { ...outcome.task, calendar_sync: outcome.calendarSync, next_occurrence: outcome.nextOccurrence, xp_sync: outcome.xpSync } };
    } catch (error) {
      return failed('PUT', error);
    }
  }

  // ---- excluir ----
  async function remove(id) {
    if (!validId(id)) return NOT_FOUND;
    try {
      const outcome = await storage.transaction(async (tx) => {
        const existing = await tx.tasks.get(id);
        if (!existing) return { early: NOT_FOUND };

        const queue = queueIntents();
        const xp = await planXp(tx, { reverses: [{ sourceType: 'task', sourceId: id }] });
        const itemIds = (await tx.taskChecklistItems.list(id)).map((row) => row.id);
        // A tarefa some agora; o evento sai da agenda depois, pelo retrato guardado na fila.
        const calendarSync = existing.calendar_event_id
          ? await queue.enqueue(tx, id, { snapshot: { id, calendar_event_id: existing.calendar_event_id } })
          : { skipped: true };
        const queueToken = await queue.reserve(tx);

        const out = await applyXp(tx, xp, deps);
        await tx.taskChecklistItems.removeMany(itemIds);
        await tx.tasks.remove(id);
        await queue.write(tx, queueToken);
        const reversed = out.results[0].reversed;
        const xpSync = reversed === 0 ? null : { awarded: -reversed, reason: 'Tarefa excluída', xp_total: out.xp_total, level: out.level };
        return { calendarSync, xpSync };
      });
      if (outcome.early) return outcome.early;
      scheduleCalendarDrain();
      return { status: 200, body: { success: true, calendar_sync: outcome.calendarSync, ...(outcome.xpSync ? { xp_sync: outcome.xpSync } : {}) } };
    } catch (error) {
      return failed('DELETE', error);
    }
  }

  // ---- adiar para amanhã ----
  /** Empurra tarefa para amanhã (local), mantém status aberto, registra day_outcome. */
  async function notToday(id, body) {
    if (!validId(id)) return NOT_FOUND;
    try {
      const outcome = await storage.transaction(async (tx) => {
        const existing = await tx.tasks.get(id);
        if (!existing) return { early: NOT_FOUND };

        if (isClosed(existing.status)) return { early: { status: 400, body: { error: 'Only open tasks can be marked not-today' } } };
        if (existing.category === 'ideias') return { early: { status: 400, body: { error: 'Ideas cannot use not-today' } } };

        const today = getLocalDateString();
        const tomorrow = addDaysLocal(today, 1);
        let reason = null;
        if (body?.reason != null && body.reason !== '') {
          const r = String(body.reason).toLowerCase().trim();
          if (!SKIP_REASONS.has(r)) return { early: { status: 400, body: { error: 'reason must be time|energy|context|other' } } };
          reason = r;
        }

        // Keep open status (pending / in_progress); only move date forward
        const keep = existing.status === 'in_progress' ? 'in_progress' : 'pending';
        const values = bindRow([['date', 'TEXT'], ['status', 'TEXT'], ['day_outcome_date', 'TEXT'], ['day_outcome_reason', 'TEXT'], ['id', 'TEXT']], [tomorrow, keep, today, reason, id]);
        const fields = { date: values.date, status: values.status, day_outcome: 'not_today', day_outcome_date: values.day_outcome_date, day_outcome_reason: values.day_outcome_reason, updated_date: sqlStamp(now()) };
        const task = { ...existing, ...fields };

        const queue = queueIntents();
        const calendarSync = await queue.forTask(tx, task);
        const queueToken = await queue.reserve(tx);
        await tx.tasks.patch(id, fields);
        await queue.write(tx, queueToken);
        return { task, calendarSync };
      });
      if (outcome.early) return outcome.early;
      scheduleCalendarDrain();
      return { status: 200, body: { ...outcome.task, calendar_sync: outcome.calendarSync } };
    } catch (error) {
      return failed('not-today', error);
    }
  }

  // ---- ideia -> tarefa ----
  async function ideaToTask(ideaId, body) {
    if (!validId(ideaId)) return { status: 404, body: { error: 'Idea not found' } };
    try {
      const outcome = await storage.transaction(async (tx) => {
        const idea = await tx.tasks.get(ideaId);
        if (!idea || idea.category !== 'ideias') return { early: { status: 404, body: { error: 'Idea not found' } } };
        if (idea.idea_status === 'virou_tarefa') return { early: { status: 409, body: { error: 'Idea already promoted to task' } } };

        const { category = 'pessoal', date, priority = 'medium' } = body || {};
        const taskDate = date || getLocalDateString();
        const top = await tx.tasks.maxSort();
        const clockNow = now();
        const values = bindRow(IDEA_INSERT, [newId(), idea.title, idea.description || '', taskDate, priority, category, nextSort(top), idea.id]);
        const created = taskRow({ ...values, time: null, status: 'pending', source: 'from_idea' }, clockNow);
        const updatedIdea = { ...idea, idea_status: 'virou_tarefa', updated_date: sqlStamp(clockNow) };

        const queue = queueIntents();
        const calendarSync = await queue.forTask(tx, created);
        const taskSlots = slots(await tx.tasks.nextRow());
        const queueToken = await queue.reserve(tx);

        await tx.tasks.createAt(created, taskSlots());
        await tx.tasks.patch(idea.id, { idea_status: updatedIdea.idea_status, updated_date: updatedIdea.updated_date });
        await queue.write(tx, queueToken);
        return { created, updatedIdea, calendarSync };
      });
      if (outcome.early) return outcome.early;
      scheduleCalendarDrain();
      return { status: 201, body: { task: enrichCategory(outcome.created), idea: enrichCategory(outcome.updatedIdea), calendar_sync: outcome.calendarSync } };
    } catch (error) {
      return failed('to-task', error, IDEA_FAILED);
    }
  }

  return Object.freeze({
    list, get, reorder, create, update, remove, notToday, ideaToTask,
    listChecklist, addChecklistItem, reorderChecklist, patchChecklistItem, removeChecklistItem,
  });
}
