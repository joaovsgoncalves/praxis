import { Router } from 'express';
import { randomUUID } from 'crypto';
import { spawnNextRecurringTask as spawnInSeries } from '../lib/taskSeries.js';
import { GOAL_NOT_FOUND, goalLinkForCreate, goalLinkForUpdate } from '../lib/goalLinks.js';
import { awardXp, reverseXp } from '../lib/xpEvents.js';
import { createTaskCalendarQueue } from '../lib/taskCalendarQueue.js';

/**
 * Tasks router — mounted at /api/tasks
 * Also exports registerIdeaToTaskRoute for POST /api/ideas/:id/to-task
 */
export function createTasksRouter(ctx) {
  const {
    db,
    enrichCategory,
    getLocalDateString,
    addDaysLocal,
    stripPriorityPrefix,
    nextSortOrder,
    reorderItems,
    syncTaskToCalendar,
    SKIP_REASONS,
  } = ctx;

  const router = Router();

  // A agenda nunca roda dentro da transação da tarefa: a rota grava a intenção e responde.
  const calendarQueue = ctx.calendarQueue || createTaskCalendarQueue({ db, syncTaskToCalendar });
  const kickCalendar = ctx.scheduleCalendarDrain || (() => setImmediate(() => calendarQueue.drain()));

  /** Registra a intenção de agenda da tarefa. Chamar dentro da transação que a alterou. */
  function queueCalendar(task, options) {
    if (!task) return { skipped: true };
    // Sem evento ligado e fora do critério de hoje não há o que mexer no Google.
    if (ctx.taskNeedsCalendarSync && !ctx.taskNeedsCalendarSync(task)) return { skipped: true };
    return calendarQueue.enqueue(task.id, options);
  }

  // Uma consulta agregada para a lista inteira (json_each evita estourar o limite de parâmetros).
  const checklistCountsStmt = db.prepare(`
    SELECT task_id, COUNT(*) AS total, COALESCE(SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END), 0) AS done
    FROM task_checklist_items
    WHERE task_id IN (SELECT value FROM json_each(?))
    GROUP BY task_id
  `);

  function withChecklistCounts(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const counts = new Map(
      checklistCountsStmt.all(JSON.stringify(rows.map((row) => row.id))).map((row) => [row.task_id, row]),
    );
    return rows.map((row) => {
      const c = counts.get(row.id);
      return { ...row, checklist_total: c ? Number(c.total) : 0, checklist_done: c ? Number(c.done) : 0 };
    });
  }

  /** Estorna o XP ativo da tarefa; devolve xp_sync (sem leveled_up) ou null se não havia nada. */
  function taskXpReversalSync(taskId, reason) {
    const reversal = reverseXp(db, { sourceType: 'task', sourceId: taskId });
    if (reversal.reversed === 0) return null;
    return { awarded: -reversal.reversed, reason, xp_total: reversal.xp_total, level: reversal.level };
  }

  function findTask(id) {
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }

  function listChecklist(taskId) {
    return db
      .prepare('SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY sort_order IS NULL, sort_order ASC, created_date ASC')
      .all(taskId)
      .map((item) => ({ ...item, done: Boolean(item.done) }));
  }

  router.get('/', (req, res) => {
    const { date, status, category, idea_status, limit = 100, offset = 0, include_overdue, today: todayParam } = req.query;
    const limitN = Math.min(1000, Math.max(1, Number(limit) || 100));
    const offsetN = Math.max(0, Number(offset) || 0);
    const today = String(todayParam || getLocalDateString()).slice(0, 10);
    const mergeOverdue = include_overdue === '1' || include_overdue === 'true';

    // Leitura não altera nada: o fechamento das vencidas é da virada do dia (lib/dayRollover.js).

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (date) { query += ' AND date = ?'; params.push(date); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (idea_status) { query += ' AND idea_status = ?'; params.push(idea_status); }

    query += ' ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC LIMIT ? OFFSET ?';
    params.push(limitN, offsetN);

    const recent = db.prepare(query).all(...params);

    if (!mergeOverdue) {
      return res.json(withChecklistCounts(recent).map(enrichCategory));
    }

    // The frontend uses this mode for the operational payload. Include all open
    // non-ideia tasks (overdue, today, and upcoming) + completions closed today,
    // so upcoming pending tasks are never drowned out by old completed history.
    const operationalRows = db.prepare(`
      SELECT * FROM tasks
      WHERE status NOT IN ('completed', 'done', 'cancelled')
        AND category != 'ideias'
      ORDER BY (date IS NULL) ASC, date ASC, priority DESC, sort_order IS NULL, sort_order ASC
      LIMIT 150
    `).all();

    const completedTodayRows = db.prepare(`
      SELECT * FROM tasks
      WHERE status IN ('completed', 'done')
        AND category != 'ideias'
        AND (
          completed_date = ?
          OR (
            (completed_date IS NULL OR completed_date = '')
            AND substr(COALESCE(completed_at, updated_date, ''), 1, 10) = ?
          )
        )
      ORDER BY updated_date DESC
      LIMIT 80
    `).all(today, today);

    // Desfecho "não rolou" recente, para o histórico do dia na aba Hábitos e tarefas.
    const missedRecentRows = db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'cancelled'
        AND day_outcome = 'missed'
        AND day_outcome_date >= ?
      ORDER BY day_outcome_date DESC
      LIMIT 60
    `).all(addDaysLocal(today, -14));

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

    res.json(withChecklistCounts(merged).map(enrichCategory));
  });

  router.patch('/reorder', (req, res) => {
    const updated = reorderItems('tasks', req.body?.ordered_ids || req.body?.ids);
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC').all();
    res.json({ success: true, updated, tasks: tasks.map(enrichCategory) });
  });

  router.get('/:id', (req, res) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(enrichCategory(withChecklistCounts([task])[0]));
  });

  // Checklist da tarefa — /reorder antes de /:itemId.
  router.get('/:id/checklist', (req, res) => {
    if (!findTask(req.params.id)) return res.status(404).json({ error: 'Task not found' });
    res.json(listChecklist(req.params.id));
  });

  router.post('/:id/checklist', (req, res) => {
    if (!findTask(req.params.id)) return res.status(404).json({ error: 'Task not found' });
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const id = randomUUID();
    const next = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM task_checklist_items WHERE task_id = ?')
      .get(req.params.id);
    db.prepare(`
      INSERT INTO task_checklist_items (id, task_id, title, done, sort_order)
      VALUES (?, ?, ?, 0, ?)
    `).run(id, req.params.id, title, Number(next?.next_order || 0));

    const item = db.prepare('SELECT * FROM task_checklist_items WHERE id = ?').get(id);
    res.status(201).json({ ...item, done: Boolean(item.done) });
  });

  router.patch('/:id/checklist/reorder', (req, res) => {
    if (!findTask(req.params.id)) return res.status(404).json({ error: 'Task not found' });
    const ids = req.body?.ordered_ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ordered_ids must be an array' });

    const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
    const update = db.prepare(`
      UPDATE task_checklist_items SET sort_order = ?, updated_date = datetime('now')
      WHERE id = ? AND task_id = ?
    `);
    const run = db.transaction((list) => {
      list.forEach((itemId, index) => update.run(index, itemId, req.params.id));
    });
    run(uniqueIds);
    res.json({ success: true, items: listChecklist(req.params.id) });
  });

  router.patch('/:id/checklist/:itemId', (req, res) => {
    const existing = db
      .prepare('SELECT * FROM task_checklist_items WHERE id = ? AND task_id = ?')
      .get(req.params.itemId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Checklist item not found' });

    const { title, done } = req.body || {};
    let nextTitle = existing.title;
    if (title !== undefined) {
      nextTitle = String(title).trim();
      if (!nextTitle) return res.status(400).json({ error: 'Title cannot be empty' });
    }
    const nextDone = done !== undefined ? (done ? 1 : 0) : existing.done;

    db.prepare(`
      UPDATE task_checklist_items SET title = ?, done = ?, updated_date = datetime('now')
      WHERE id = ?
    `).run(nextTitle, nextDone, existing.id);

    const item = db.prepare('SELECT * FROM task_checklist_items WHERE id = ?').get(existing.id);
    res.json({ ...item, done: Boolean(item.done) });
  });

  router.delete('/:id/checklist/:itemId', (req, res) => {
    const result = db
      .prepare('DELETE FROM task_checklist_items WHERE id = ? AND task_id = ?')
      .run(req.params.itemId, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Checklist item not found' });
    res.json({ success: true });
  });

  const spawnNextRecurringTask = (database, task, options) =>
    spawnInSeries(database, task, { ...options, nextSortOrder });

  /**
   * Efeitos de entrar ou sair de concluída: XP (+10 uma vez, estorno ao reabrir) e próxima
   * ocorrência. Roda DENTRO da transação que gravou o status, para a operação inteira valer
   * uma vez ou ser desfeita. Usada por criar-já-feita e por atualizar.
   */
  function applyStatusTransition({ wasDone, task, today }) {
    const isDone = task.status === 'completed' || task.status === 'done';
    let xpSync = null;
    let nextOccurrence = null;

    if (!wasDone && isDone) {
      const reason = task.date && task.date < today ? 'Tarefa atrasada limpa hoje' : 'Tarefa concluída';
      const award = awardXp(db, { sourceType: 'task', sourceId: task.id, amount: 10, reason });
      if (award.awarded > 0) {
        xpSync = {
          awarded: award.awarded,
          reason,
          xp_total: award.xp_total,
          level: award.level,
          leveled_up: award.leveled_up,
        };
      }
      const spawned = spawnNextRecurringTask(db, task, { completedDate: task.completed_date, today });
      if (spawned) {
        nextOccurrence = { id: spawned.id, date: spawned.date, created: spawned.created };
        if (spawned.created) queueCalendar(findTask(spawned.id));
      }
    } else if (wasDone && !isDone) {
      xpSync = taskXpReversalSync(task.id, 'Tarefa desmarcada');
    }

    return { xpSync, nextOccurrence };
  }

  /** Falha no meio da gravação: a transação já desfez tudo; o cliente pode repetir sem medo. */
  function sendWriteFailure(res, where, error) {
    console.error(`[tasks] ${where} falhou e foi desfeito:`, error?.message || error);
    return res.status(500).json({
      error: 'Não foi possível salvar a tarefa. Nada foi alterado.',
      code: 'task_write_failed',
    });
  }

  router.post('/', (req, res) => {
    const id = randomUUID();
    const {
      title, description = '', date, time, status = 'pending',
      priority = 'medium', category = 'pessoal', goal_id = null, source = 'manual', duration_minutes,
      calendar_event_id, sort_order, recurrence = 'none', recurrence_days = [], recurrence_parent_id,
      idea_status, source_idea_id,
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });
    const goalLink = goalLinkForCreate(db, goal_id);
    if (!goalLink.ok) return res.status(400).json(GOAL_NOT_FOUND);

    const isIdea = category === 'ideias';
    const taskPriority = isIdea ? (priority || 'low') : priority;
    const taskIdeaStatus = isIdea ? (idea_status || 'capturada') : (idea_status || null);
    const taskDate = isIdea ? (date || null) : date;
    const taskTime = isIdea ? (time || null) : time;

    const isDoneOnCreate = status === 'completed' || status === 'done';
    const completedDate = isDoneOnCreate ? getLocalDateString() : null;
    const completedAt = isDoneOnCreate ? new Date().toISOString() : null;
    const taskTitle = stripPriorityPrefix(title);
    const taskSortOrder = sort_order !== undefined ? Number(sort_order) : nextSortOrder('tasks');

    let outcome;
    try {
      outcome = db.transaction(() => {
        db.prepare(`
          INSERT INTO tasks (id, title, description, date, time, status, priority, category, goal_id, source, duration_minutes, calendar_event_id, sort_order, recurrence, recurrence_days, recurrence_parent_id, completed_date, completed_at, idea_status, source_idea_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, taskTitle, description, taskDate || null, taskTime || null, status, taskPriority, category,
          goalLink.value, source || 'manual', duration_minutes ? Number(duration_minutes) : null,
          calendar_event_id || null, taskSortOrder, recurrence,
          JSON.stringify(Array.isArray(recurrence_days) ? recurrence_days : []),
          recurrence_parent_id || null,
          completedDate,
          completedAt,
          taskIdeaStatus,
          source_idea_id || null,
        );

        const task = findTask(id);
        // Nascer concluída passa pela mesma transição de quem é concluída depois.
        const effects = applyStatusTransition({ wasDone: false, task, today: getLocalDateString() });
        return { ...effects, calendarSync: queueCalendar(task) };
      })();
    } catch (error) {
      return sendWriteFailure(res, 'POST', error);
    }

    kickCalendar();
    res.status(201).json({
      ...findTask(id),
      calendar_sync: outcome.calendarSync,
      next_occurrence: outcome.nextOccurrence,
      xp_sync: outcome.xpSync,
    });
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const goalLink = goalLinkForUpdate(db, req.body, existing.goal_id);
    if (!goalLink.ok) return res.status(400).json(GOAL_NOT_FOUND);

    const { title, description, date, time, status, priority, category, source, duration_minutes, calendar_event_id, sort_order, recurrence, recurrence_days, idea_status, source_idea_id } = req.body;

    const wasDone = existing.status === 'completed' || existing.status === 'done';
    const willBeDone = status === 'completed' || status === 'done';
    const now = new Date();
    const today = getLocalDateString(now);
    let completedDate = existing.completed_date || null;
    let completedAt = existing.completed_at || null;

    if (status !== undefined) {
      if (willBeDone) {
        completedDate = existing.completed_date || today;
        completedAt = existing.completed_at || now.toISOString();
      } else {
        completedDate = null;
        completedAt = null;
      }
    }

    let outcome;
    try {
      outcome = db.transaction(() => {
        db.prepare(`
          UPDATE tasks SET
            title = COALESCE(?, title),
            description = COALESCE(?, description),
            date = COALESCE(?, date),
            time = COALESCE(?, time),
            status = COALESCE(?, status),
            priority = COALESCE(?, priority),
            category = COALESCE(?, category),
            goal_id = CASE WHEN ? = 1 THEN ? ELSE goal_id END,
            source = COALESCE(?, source),
            duration_minutes = COALESCE(?, duration_minutes),
            calendar_event_id = COALESCE(?, calendar_event_id),
            sort_order = COALESCE(?, sort_order),
            recurrence = COALESCE(?, recurrence),
            recurrence_days = COALESCE(?, recurrence_days),
            idea_status = COALESCE(?, idea_status),
            source_idea_id = COALESCE(?, source_idea_id),
            completed_date = ?,
            completed_at = ?,
            updated_date = datetime('now')
          WHERE id = ?
        `).run(
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
          req.params.id
        );

        const task = findTask(req.params.id);
        // Status, XP e próxima ocorrência valem juntos ou nenhum vale.
        const effects = applyStatusTransition({ wasDone, task, today });
        return { ...effects, calendarSync: queueCalendar(task) };
      })();
    } catch (error) {
      return sendWriteFailure(res, 'PUT', error);
    }

    kickCalendar();
    res.json({
      ...findTask(req.params.id),
      calendar_sync: outcome.calendarSync,
      next_occurrence: outcome.nextOccurrence,
      xp_sync: outcome.xpSync,
    });
  });


  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    let outcome;
    try {
      outcome = db.transaction((taskId) => {
        db.prepare('DELETE FROM task_checklist_items WHERE task_id = ?').run(taskId);
        db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
        const xpSync = taskXpReversalSync(taskId, 'Tarefa excluída');
        // A tarefa some agora; o evento sai da agenda depois, pelo retrato guardado na fila.
        const calendarSync = existing.calendar_event_id
          ? calendarQueue.enqueue(taskId, { snapshot: { id: taskId, calendar_event_id: existing.calendar_event_id } })
          : { skipped: true };
        return { xpSync, calendarSync };
      })(req.params.id);
    } catch (error) {
      return sendWriteFailure(res, 'DELETE', error);
    }
    kickCalendar();
    res.json({
      success: true,
      calendar_sync: outcome.calendarSync,
      ...(outcome.xpSync ? { xp_sync: outcome.xpSync } : {}),
    });
  });

  /** Empurra tarefa para amanhã (local), mantém status aberto, registra day_outcome. */
  router.post('/:id/not-today', (req, res) => {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    if (existing.status === 'completed' || existing.status === 'done' || existing.status === 'cancelled') {
      return res.status(400).json({ error: 'Only open tasks can be marked not-today' });
    }
    if (existing.category === 'ideias') {
      return res.status(400).json({ error: 'Ideas cannot use not-today' });
    }

    const today = getLocalDateString();
    const tomorrow = addDaysLocal(today, 1);
    let reason = null;
    if (req.body?.reason != null && req.body.reason !== '') {
      const r = String(req.body.reason).toLowerCase().trim();
      if (!SKIP_REASONS.has(r)) {
        return res.status(400).json({ error: 'reason must be time|energy|context|other' });
      }
      reason = r;
    }

    // Keep open status (pending / in_progress); only move date forward
    const status = existing.status === 'in_progress' ? 'in_progress' : 'pending';

    let calendarSync;
    try {
      calendarSync = db.transaction(() => {
        db.prepare(`
          UPDATE tasks SET
            date = ?,
            status = ?,
            day_outcome = 'not_today',
            day_outcome_date = ?,
            day_outcome_reason = ?,
            updated_date = datetime('now')
          WHERE id = ?
        `).run(tomorrow, status, today, reason, req.params.id);
        return queueCalendar(findTask(req.params.id));
      })();
    } catch (error) {
      return sendWriteFailure(res, 'not-today', error);
    }

    kickCalendar();
    res.json({
      ...findTask(req.params.id),
      calendar_sync: calendarSync,
    });
  });


  return router;
}

export function registerIdeaToTaskRoute(app, ctx) {
  const {
    db,
    enrichCategory,
    getLocalDateString,
    nextSortOrder,
    syncTaskToCalendar,
  } = ctx;

  const calendarQueue = ctx.calendarQueue || createTaskCalendarQueue({ db, syncTaskToCalendar });
  const kickCalendar = ctx.scheduleCalendarDrain || (() => setImmediate(() => calendarQueue.drain()));

  app.post('/api/ideas/:id/to-task', (req, res) => {
    const idea = db.prepare('SELECT * FROM tasks WHERE id = ? AND category = ?').get(req.params.id, 'ideias');
    if (!idea) return res.status(404).json({ error: 'Idea not found' });
    if (idea.idea_status === 'virou_tarefa') {
      return res.status(409).json({ error: 'Idea already promoted to task' });
    }

    const { category = 'pessoal', date, priority = 'medium' } = req.body || {};
    const newId = randomUUID();
    const taskDate = date || getLocalDateString();
    const sort = nextSortOrder('tasks');

    let calendarSync;
    try {
      calendarSync = db.transaction(() => {
        db.prepare(`
          INSERT INTO tasks (id, title, description, date, time, status, priority, category, source, sort_order, source_idea_id)
          VALUES (?, ?, ?, ?, NULL, 'pending', ?, ?, 'from_idea', ?, ?)
        `).run(
          newId,
          idea.title,
          idea.description || '',
          taskDate,
          priority,
          category,
          sort,
          idea.id,
        );

        db.prepare(`UPDATE tasks SET idea_status = 'virou_tarefa', updated_date = datetime('now') WHERE id = ?`).run(idea.id);

        const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newId);
        if (ctx.taskNeedsCalendarSync && !ctx.taskNeedsCalendarSync(created)) return { skipped: true };
        return calendarQueue.enqueue(newId);
      })();
    } catch (error) {
      console.error('[ideas] to-task falhou e foi desfeito:', error?.message || error);
      return res.status(500).json({
        error: 'Não foi possível virar tarefa. Nada foi alterado.',
        code: 'task_write_failed',
      });
    }

    kickCalendar();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newId);
    const updatedIdea = db.prepare('SELECT * FROM tasks WHERE id = ?').get(idea.id);
    res.status(201).json({
      task: enrichCategory(task),
      idea: enrichCategory(updatedIdea),
      calendar_sync: calendarSync,
    });
  });
}
