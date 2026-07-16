import { Router } from 'express';
import { randomUUID } from 'crypto';

/** Goals — mounted at /api/goals */
export function createGoalsRouter({ db, getLocalDateString, nextSortOrder }) {
  const router = Router();

  router.get('/', (req, res) => {
    const goals = db.prepare('SELECT * FROM goals ORDER BY created_date DESC').all();
    res.json(goals);
  });

  router.get('/:id', (req, res) => {
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  });

  router.post('/', (req, res) => {
    const id = randomUUID();
    const {
      title, description = '', deadline, timeframe = 'short', category = 'personal',
      status = 'active', manual_progress = 0, initial_link,
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!deadline) {
      return res.status(400).json({ error: 'Deadline is required', code: 'goal_deadline_required' });
    }
    if (!initial_link || !initial_link.type || !['task', 'habit'].includes(initial_link.type)) {
      return res.status(400).json({
        error: 'Goal must include initial_link (task or habit)',
        code: 'goal_link_required',
      });
    }
    const linkTitle = (initial_link.title || title).trim();
    if (!linkTitle) {
      return res.status(400).json({ error: 'Link title is required', code: 'goal_link_title_required' });
    }

    db.prepare(`
      INSERT INTO goals (id, title, description, deadline, timeframe, category, status, manual_progress)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, description, deadline, timeframe, category, status, manual_progress);

    let linked = null;
    if (initial_link.type === 'task') {
      const taskId = randomUUID();
      const taskDate = initial_link.date || deadline || getLocalDateString();
      const sort = nextSortOrder('tasks');
      db.prepare(`
        INSERT INTO tasks (id, title, description, date, status, priority, category, goal_id, source, sort_order)
        VALUES (?, ?, ?, ?, 'pending', 'medium', 'pessoal', ?, 'goal_wizard', ?)
      `).run(taskId, linkTitle, description || '', taskDate, id, sort);
      linked = { type: 'task', id: taskId, title: linkTitle };
    } else {
      const habitId = randomUUID();
      const sort = nextSortOrder('habits');
      const freq = initial_link.frequency || 'daily';
      db.prepare(`
        INSERT INTO habits (id, title, description, frequency, category, goal_id, source, sort_order, status)
        VALUES (?, ?, ?, ?, 'wellness', ?, 'goal_wizard', ?, 'active')
      `).run(habitId, linkTitle, description || '', freq, id, sort);
      linked = { type: 'habit', id: habitId, title: linkTitle };
    }

    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
    res.status(201).json({ goal, linked });
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Goal not found' });

    const { title, description, deadline, timeframe, category, status, manual_progress } = req.body;

    db.prepare(`
      UPDATE goals SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        deadline = COALESCE(?, deadline),
        timeframe = COALESCE(?, timeframe),
        category = COALESCE(?, category),
        status = COALESCE(?, status),
        manual_progress = COALESCE(?, manual_progress)
      WHERE id = ?
    `).run(title, description, deadline, timeframe, category, status, manual_progress, req.params.id);

    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    res.json(goal);
  });

  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Goal not found' });

    db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  return router;
}
