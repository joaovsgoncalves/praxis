import { Router } from 'express';
import { randomUUID } from 'crypto';
import { isHabitLogDone, isHabitLogSkipped } from '../lib/habitStreaks.js';

const RITUAL_TEMPLATES = {
  day_open: {
    name: 'Abertura do dia',
    emoji: '🌅',
    time_of_day: 'morning',
    habitTitles: ['Água ao acordar', '5 min de movimento', 'Uma prioridade para hoje'],
  },
  day_close: {
    name: 'Fechamento do dia',
    emoji: '🌙',
    time_of_day: 'evening',
    habitTitles: ['Revisar o dia (2 min)', 'Preparar o amanhã', 'Desligar telas'],
  },
};

/** Rituals — mounted at /api/rituals */
export function createRitualsRouter({ db, getLocalDateString, nextSortOrder }) {
  const router = Router();

  function findOrCreateHabitForTemplate(title) {
    const existing = db.prepare("SELECT id FROM habits WHERE title = ? AND status = 'active' LIMIT 1").get(title);
    if (existing) return existing.id;
    const id = randomUUID();
    const sort = nextSortOrder('habits');
    db.prepare(`
      INSERT INTO habits (id, title, frequency, category, status, sort_order, source)
      VALUES (?, ?, 'daily', 'wellness', 'active', ?, 'ritual_template')
    `).run(id, title, sort);
    return id;
  }

  router.get('/', (req, res) => {
    const { status } = req.query;
    let query = 'SELECT * FROM rituals';
    const params = [];
    if (status) { query += ' WHERE status = ?'; params.push(status); }
    query += ' ORDER BY created_date DESC';

    const rituals = db.prepare(query).all(...params);
    const today = getLocalDateString();

    const enriched = rituals.map(ritual => {
      const habitIds = JSON.parse(ritual.habits_order || '[]');
      const habits = habitIds.map(hid => {
        const habit = db.prepare('SELECT id, title FROM habits WHERE id = ?').get(hid);
        if (!habit) return null;
        const log = db.prepare(
          'SELECT completed, outcome, skip_reason, note FROM habit_logs WHERE habit_id = ? AND date = ?',
        ).get(hid, today);
        const done = isHabitLogDone(log);
        const skipped = isHabitLogSkipped(log);
        return {
          id: habit.id,
          title: habit.title,
          completed_today: done,
          skipped_today: skipped,
          day_outcome: skipped ? 'skipped' : done ? 'done' : 'open',
          skip_reason: log?.skip_reason || null,
          skip_note: (log?.note && String(log.note).trim()) || null,
        };
      }).filter(Boolean);
      return { ...ritual, habits_order: habitIds, habits };
    });

    res.json(enriched);
  });

  router.get('/:id/progress', (req, res) => {
    const ritual = db.prepare('SELECT * FROM rituals WHERE id = ?').get(req.params.id);
    if (!ritual) return res.status(404).json({ error: 'Ritual not found' });

    const date = req.query.date || new Date().toISOString().split('T')[0];
    const habitIds = JSON.parse(ritual.habits_order || '[]');

    const habits = habitIds.map(hid => {
      const habit = db.prepare('SELECT id, title FROM habits WHERE id = ?').get(hid);
      if (!habit) return null;
      const log = db.prepare(
        'SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ? AND completed = 1',
      ).get(hid, date);
      return { id: habit.id, title: habit.title, completed: !!log };
    }).filter(Boolean);

    const completedCount = habits.filter(h => h.completed).length;

    res.json({
      ...ritual,
      habits_order: habitIds,
      date,
      habits,
      total: habits.length,
      completed: completedCount,
      progress: habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0,
    });
  });

  // POST /api/rituals/from-template — presets abertura/fechamento
  router.post('/from-template', (req, res) => {
    try {
      const templateId = req.body?.template;
      const tpl = RITUAL_TEMPLATES[templateId];
      if (!tpl) {
        return res.status(400).json({ error: 'Unknown template', code: 'invalid_template' });
      }

      const existing = db.prepare(
        "SELECT * FROM rituals WHERE name = ? AND status = 'active' LIMIT 1",
      ).get(tpl.name);
      if (existing) {
        const habitIds = JSON.parse(existing.habits_order || '[]');
        return res.status(200).json({
          ritual: { ...existing, habits_order: habitIds },
          created: false,
          message: 'Ritual já existe',
        });
      }

      const habitIds = tpl.habitTitles.map((t) => findOrCreateHabitForTemplate(t));
      const id = randomUUID();
      db.prepare(`
        INSERT INTO rituals (id, name, emoji, time_of_day, habits_order, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(id, tpl.name, tpl.emoji, tpl.time_of_day, JSON.stringify(habitIds));

      const ritual = db.prepare('SELECT * FROM rituals WHERE id = ?').get(id);
      res.status(201).json({
        ritual: { ...ritual, habits_order: habitIds },
        created: true,
        habits_created: habitIds.length,
      });
    } catch (err) {
      console.error('[rituals/from-template]', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', (req, res) => {
    const id = randomUUID();
    const { name, emoji = '🔗', time_of_day = 'morning', habits_order = [] } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    db.prepare(`
      INSERT INTO rituals (id, name, emoji, time_of_day, habits_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, emoji, time_of_day, JSON.stringify(habits_order));

    const ritual = db.prepare('SELECT * FROM rituals WHERE id = ?').get(id);
    res.status(201).json({ ...ritual, habits_order: JSON.parse(ritual.habits_order) });
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM rituals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ritual not found' });

    const { name, emoji, time_of_day, habits_order, status } = req.body;

    db.prepare(`
      UPDATE rituals SET
        name = COALESCE(?, name),
        emoji = COALESCE(?, emoji),
        time_of_day = COALESCE(?, time_of_day),
        habits_order = COALESCE(?, habits_order),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      name,
      emoji,
      time_of_day,
      habits_order ? JSON.stringify(habits_order) : null,
      status,
      req.params.id,
    );

    const ritual = db.prepare('SELECT * FROM rituals WHERE id = ?').get(req.params.id);
    res.json({ ...ritual, habits_order: JSON.parse(ritual.habits_order) });
  });

  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM rituals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ritual not found' });

    db.prepare('DELETE FROM rituals WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  return router;
}
