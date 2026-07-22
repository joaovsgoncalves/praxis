import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getStreaks as getStreaksForHabit } from '../lib/habitStreaks.js';

/**
 * Habits router — mounted at /api/habits
 * registerHabitLogRoutes mounts /api/habit-logs
 */
export function createHabitsRouter(ctx) {
  const {
    db,
    getLocalDateString,
    stripPriorityPrefix,
    nextSortOrder,
    reorderItems,
  } = ctx;

  const HABIT_STATUSES = new Set(['active', 'paused', 'archived']);
  const HABIT_FREQUENCIES = new Set(['daily', 'weekdays', 'weekends', 'weekly']);

  const router = Router();

  function getStreaks(habitId) {
    return getStreaksForHabit(db, habitId, getLocalDateString);
  }

  // ==================== HABITS ====================
  // Status: active | paused | archived — pause/archive preserve habit_logs (see docs/HABITS-LIFECYCLE.md)

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

  function listHabitsQuery(statusFilter) {
    const order = 'ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC';
    if (statusFilter === 'all') {
      return db.prepare(`SELECT * FROM habits ${order}`).all();
    }
    return db.prepare(`SELECT * FROM habits WHERE status = ? ${order}`).all(statusFilter);
  }

  router.get('/', (req, res) => {
    const raw = String(req.query.status ?? 'active');
    if (raw !== 'all' && !HABIT_STATUSES.has(raw)) {
      return res.status(400).json({ error: 'Invalid status. Use active, paused, archived, or all' });
    }
    const habits = listHabitsQuery(raw);
    const enriched = habits.map(h => {
      const { current_streak, best_streak } = getStreaks(h.id);
      return { ...h, current_streak, best_streak };
    });
    res.json(enriched);
  });

  router.patch('/reorder', (req, res) => {
    const updated = reorderItems('habits', req.body?.ordered_ids || req.body?.ids);
    const habits = db.prepare('SELECT * FROM habits WHERE status = ? ORDER BY sort_order IS NULL, sort_order ASC, created_date DESC').all('active');
    const enriched = habits.map(h => {
      const { current_streak, best_streak } = getStreaks(h.id);
      return { ...h, current_streak, best_streak };
    });
    res.json({ success: true, updated, habits: enriched });
  });

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

  router.post('/', (req, res) => {
    const id = randomUUID();
    const {
      title,
      description = '',
      frequency = 'daily',
      category = 'pessoal',
      streak_target = 30,
      goal_id = null,
      source = 'manual',
      sort_order,
      recurrence_days,
      target_value,
      unit = '',
      preferred_time = '',
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });
    const freq = HABIT_FREQUENCIES.has(frequency) ? frequency : 'daily';
    const prefTime = normalizePreferredTime(preferred_time);
    if (prefTime === null) {
      return res.status(400).json({ error: 'preferred_time must be HH:MM or empty' });
    }

    const habitTitle = stripPriorityPrefix(title);
    const habitSortOrder = sort_order !== undefined ? Number(sort_order) : nextSortOrder('habits');
    const recDays = normalizeRecurrenceDays(recurrence_days) ?? '[]';
    const tgt = target_value === undefined || target_value === null || target_value === ''
      ? null
      : Number(target_value);

    db.prepare(`
      INSERT INTO habits (id, title, description, frequency, category, streak_target, goal_id, source, sort_order, recurrence_days, target_value, unit, preferred_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, habitTitle, description, freq, category, Number(streak_target) || 30,
      goal_id || null, source || 'manual', habitSortOrder, recDays, tgt, unit || '', prefTime || ''
    );

    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
    res.status(201).json(habit);
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Habit not found' });

    const {
      title, description, frequency, category, streak_target, goal_id, source, status,
      sort_order, recurrence_days, target_value, unit, preferred_time,
    } = req.body;

    if (status !== undefined && status !== null && !HABIT_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (frequency !== undefined && frequency !== null && !HABIT_FREQUENCIES.has(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }

    const recDays = recurrence_days !== undefined ? normalizeRecurrenceDays(recurrence_days) : null;
    const tgt = target_value !== undefined
      ? (target_value === null || target_value === '' ? null : Number(target_value))
      : undefined;
    let prefTime;
    if (preferred_time !== undefined) {
      prefTime = normalizePreferredTime(preferred_time);
      if (prefTime === null) {
        return res.status(400).json({ error: 'preferred_time must be HH:MM or empty' });
      }
    }

    db.prepare(`
      UPDATE habits SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        frequency = COALESCE(?, frequency),
        category = COALESCE(?, category),
        streak_target = COALESCE(?, streak_target),
        goal_id = COALESCE(?, goal_id),
        source = COALESCE(?, source),
        status = COALESCE(?, status),
        sort_order = COALESCE(?, sort_order),
        recurrence_days = COALESCE(?, recurrence_days),
        target_value = COALESCE(?, target_value),
        unit = COALESCE(?, unit),
        preferred_time = COALESCE(?, preferred_time)
      WHERE id = ?
    `).run(
      title !== undefined ? stripPriorityPrefix(title) : null,
      description,
      frequency,
      category,
      streak_target !== undefined ? Number(streak_target) : null,
      goal_id,
      source,
      status,
      sort_order !== undefined ? Number(sort_order) : null,
      recDays,
      tgt !== undefined ? tgt : null,
      unit,
      prefTime !== undefined ? prefTime : null,
      req.params.id
    );

    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
    res.json(habit);
  });

  router.delete('/:id', (req, res) => {
    const habitId = req.params.id;
    // Delete logs first (FK dependency)
    db.prepare('DELETE FROM habit_logs WHERE habit_id = ?').run(habitId);
    // Remove from rituals (habits_order JSON arrays)
    const rituals = db.prepare('SELECT id, habits_order FROM rituals').all();
    for (const r of rituals) {
      try {
        const order = JSON.parse(r.habits_order || '[]');
        if (order.includes(habitId)) {
          const updated = order.filter(h => h !== habitId);
          db.prepare('UPDATE rituals SET habits_order = ? WHERE id = ?').run(JSON.stringify(updated), r.id);
        }
      } catch {}
    }
    // Delete the habit
    db.prepare('DELETE FROM habits WHERE id = ?').run(habitId);
    res.json({ success: true });
  });

  router.get('/:id/streak', (req, res) => {
    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    const { current_streak, best_streak } = getStreaks(req.params.id);
    res.json({ habit_id: habit.id, title: habit.title, current_streak, best_streak });
  });



  return router;
}

export function registerHabitLogRoutes(app, ctx) {
  const { db, HABIT_OUTCOMES, SKIP_REASONS } = ctx;

  // ==================== HABIT LOGS ====================
  app.get('/api/habit-logs', (req, res) => {
    const { date, habit_id, from, to } = req.query;
    let query = 'SELECT * FROM habit_logs WHERE 1=1';
    const params = [];

    if (date) { query += ' AND date = ?'; params.push(date); }
    if (from) { query += ' AND date >= ?'; params.push(from); }
    if (to) { query += ' AND date <= ?'; params.push(to); }
    if (habit_id) { query += ' AND habit_id = ?'; params.push(habit_id); }

    const logs = db.prepare(query).all(...params);
    res.json(logs);
  });

  function normalizeHabitOutcome(body = {}) {
    const rawOutcome = body.outcome != null ? String(body.outcome).toLowerCase().trim() : null;
    let outcome = rawOutcome && HABIT_OUTCOMES.has(rawOutcome) ? rawOutcome : null;
    if (!outcome) {
      // Compat: completed:true → done; completed:false alone is invalid without outcome
      if (body.completed === false || body.completed === 0 || body.completed === '0') {
        outcome = null;
      } else {
        outcome = 'done';
      }
    }
    if (!outcome) {
      return { error: 'outcome required (done|skipped), or completed:true for done' };
    }

    let skip_reason = null;
    if (body.skip_reason != null && body.skip_reason !== '') {
      const r = String(body.skip_reason).toLowerCase().trim();
      if (!SKIP_REASONS.has(r)) {
        return { error: 'skip_reason must be time|energy|context|other' };
      }
      skip_reason = r;
    }

    // Free-text honest name of the miss ("eu escolhi o fácil")
    let note = '';
    const rawNote = body.note != null ? body.note : body.skip_note;
    if (rawNote != null && String(rawNote).trim() !== '') {
      note = String(rawNote).trim().slice(0, 280);
    }

    if (outcome === 'skipped') {
      return { outcome: 'skipped', completed: 0, skip_reason, note, value: null };
    }

    return {
      outcome: 'done',
      completed: 1,
      skip_reason: null,
      note: '',
      value: body.value,
    };
  }

  app.post('/api/habit-logs', (req, res) => {
    const { habit_id, date } = req.body || {};

    if (!habit_id || !date) return res.status(400).json({ error: 'habit_id and date required' });

    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(habit_id);
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    const normalized = normalizeHabitOutcome(req.body || {});
    if (normalized.error) return res.status(400).json({ error: normalized.error });

    let completedFlag = normalized.completed;
    let logValue = normalized.value === undefined || normalized.value === null || normalized.value === ''
      ? null
      : Number(normalized.value);
    let outcome = normalized.outcome;
    let skipReason = normalized.skip_reason;
    let note = normalized.note || '';

    if (outcome === 'done' && habit.target_value != null && Number(habit.target_value) > 0) {
      if (logValue == null || Number.isNaN(logValue)) {
        logValue = Number(habit.target_value);
      }
      if (logValue >= Number(habit.target_value)) {
        completedFlag = 1;
        outcome = 'done';
      }
    }

    if (outcome === 'skipped') {
      completedFlag = 0;
      logValue = null;
    } else {
      completedFlag = 1;
      skipReason = null;
      note = '';
    }

    const existing = db.prepare('SELECT id FROM habit_logs WHERE habit_id = ? AND date = ?').get(habit_id, date);
    if (existing) {
      db.prepare(
        'UPDATE habit_logs SET completed = ?, value = ?, outcome = ?, skip_reason = ?, note = ? WHERE id = ?',
      ).run(completedFlag, logValue, outcome, skipReason, note, existing.id);
      const row = db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(existing.id);
      return res.json(row);
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO habit_logs (id, habit_id, date, completed, value, outcome, skip_reason, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, habit_id, date, completedFlag, logValue, outcome, skipReason, note);

    const row = db.prepare('SELECT * FROM habit_logs WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  app.delete('/api/habit-logs/:id', (req, res) => {
    db.prepare('DELETE FROM habit_logs WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });
}
