/**
 * Leitura dos insights no SQLite: as consultas da rota antiga (commit bcbadad), uma por método, com a mesma
 * ordem, os mesmos tetos e o mesmo tratamento de NULL. Só leitura. `projects` e `project_updates` ausentes
 * (banco sem o esquema das frentes) dão lista vazia, como `tableHas` fazia na lib antiga.
 */
export function sqliteInsightsRead(db) {
  const hasTable = (name) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
  return {
    // --- best-hours / correlação ---
    async focusSessionsSince(cutoff) {
      return db.prepare('SELECT created_date, duration_seconds FROM focus_sessions WHERE created_date >= ? ORDER BY created_date DESC').all(cutoff);
    },
    async wellnessSince(from) {
      return db.prepare('SELECT date, sleep_hours, sleep_quality, mood, productivity FROM wellness_checks WHERE date >= ? ORDER BY date ASC').all(from);
    },
    // --- semanal ---
    async completedTasksOfWeek(from, to) {
      return db.prepare(`
        SELECT id, title, priority, category, date, completed_date
        FROM tasks
        WHERE status = 'completed'
          AND category != 'ideias'
          AND (
            (date IS NOT NULL AND date BETWEEN ? AND ?)
            OR (completed_date IS NOT NULL AND completed_date BETWEEN ? AND ?)
          )
        ORDER BY completed_date DESC, updated_date DESC
        LIMIT 50
      `).all(from, to, from, to);
    },
    async stalePendingTasks(before) {
      return db.prepare(`
        SELECT title FROM tasks
        WHERE status = 'pending'
          AND category != 'ideias'
          AND date IS NOT NULL
          AND date < ?
        ORDER BY date ASC
        LIMIT 10
      `).all(before);
    },
    async activeHabits() { return db.prepare("SELECT * FROM habits WHERE status = 'active'").all(); },
    async habitLogs(from, to) {
      return db.prepare('SELECT habit_id, date, completed, outcome, skip_reason FROM habit_logs WHERE date BETWEEN ? AND ? ORDER BY habit_id, date').all(from, to);
    },
    async taskDayCounts(from, to) {
      return db.prepare(`
        SELECT substr(date, 1, 10) AS day,
               COUNT(*) AS total,
               SUM(CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END) AS done
        FROM tasks
        WHERE date IS NOT NULL
          AND substr(date, 1, 10) BETWEEN ? AND ?
          AND COALESCE(category, '') != 'ideias'
          AND COALESCE(status, 'pending') != 'cancelled'
        GROUP BY substr(date, 1, 10)
        ORDER BY day
      `).all(from, to);
    },
    async focusTotals(from, to) {
      return db.prepare('SELECT COUNT(*) as sessions, COALESCE(SUM(duration_seconds), 0) as total_seconds FROM focus_sessions WHERE date BETWEEN ? AND ?').get(from, to);
    },
    async wellnessBetween(from, to) {
      return db.prepare('SELECT date, sleep_hours, sleep_quality, mood, productivity FROM wellness_checks WHERE date BETWEEN ? AND ?').all(from, to);
    },
    async ideaCounts(from, to) {
      const created = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE category = 'ideias' AND substr(created_date, 1, 10) BETWEEN ? AND ?").get(from, to).c;
      const promoted = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE category = 'ideias' AND idea_status = 'virou_tarefa' AND substr(updated_date, 1, 10) BETWEEN ? AND ?").get(from, to).c;
      return { created, promoted };
    },
    async promissoras() {
      return db.prepare("SELECT title FROM tasks WHERE category = 'ideias' AND idea_status = 'promissora' ORDER BY updated_date DESC LIMIT 5").all();
    },
    async projectNames() { return hasTable('projects') ? db.prepare('SELECT id, slug, name FROM projects').all() : []; },
    async projectUpdatesBetween(from, to) {
      if (!hasTable('project_updates')) return [];
      return db.prepare('SELECT date, project_id, summary, source FROM project_updates WHERE date BETWEEN ? AND ? ORDER BY date ASC, created_at ASC').all(from, to);
    },
    async completedTasksForHistory(from, to) {
      return db.prepare(`
        SELECT title, category
        FROM tasks
        WHERE status IN ('completed','done')
          AND category != 'ideias'
          AND (
            (date IS NOT NULL AND date BETWEEN ? AND ?)
            OR (completed_date IS NOT NULL AND completed_date BETWEEN ? AND ?)
          )
        ORDER BY COALESCE(completed_date, date) DESC
        LIMIT 80
      `).all(from, to, from, to);
    },
    // --- cockpit "o que estou evitando" ---
    async overdueTasks(today) {
      return db.prepare(`
        SELECT id, title, date, priority, category
        FROM tasks
        WHERE status NOT IN ('completed', 'done', 'cancelled')
          AND category != 'ideias'
          AND date IS NOT NULL AND date < ?
        ORDER BY date ASC, priority DESC
        LIMIT 24
      `).all(today);
    },
    async floatingTasks(before) {
      return db.prepare(`
        SELECT id, title, priority, created_date
        FROM tasks
        WHERE status NOT IN ('completed', 'done', 'cancelled')
          AND category != 'ideias'
          AND date IS NULL
          AND substr(created_date, 1, 10) <= ?
        ORDER BY created_date ASC
        LIMIT 5
      `).all(before);
    },
    async staleIdeas(before) {
      return db.prepare(`
        SELECT id, title, idea_status, updated_date
        FROM tasks
        WHERE category = 'ideias'
          AND idea_status IN ('capturada', 'promissora')
          AND substr(COALESCE(updated_date, created_date), 1, 10) <= ?
        ORDER BY updated_date ASC
        LIMIT 5
      `).all(before);
    },
    async closedHabitIds(date) {
      return db.prepare("SELECT habit_id FROM habit_logs WHERE date = ? AND (completed = 1 OR outcome = 'skipped' OR outcome = 'done')").all(date).map((r) => r.habit_id);
    },
    async skippedHabitIds(date) {
      return db.prepare("SELECT habit_id FROM habit_logs WHERE date = ? AND outcome = 'skipped'").all(date).map((r) => r.habit_id);
    },
    async skippedHabitCounts(after, upto) {
      return db.prepare(`
        SELECT habit_id, COUNT(*) AS skips
        FROM habit_logs
        WHERE outcome = 'skipped' AND date > ? AND date <= ?
        GROUP BY habit_id
        HAVING skips >= 3
        ORDER BY habit_id
      `).all(after, upto);
    },
    async failedCaptureCount() { return db.prepare("SELECT COUNT(*) AS n FROM capture_queue WHERE status = 'failed'").get().n; },
    async pendingTodayCount(today) {
      return db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ('completed', 'done', 'cancelled') AND category != 'ideias' AND date = ?").get(today).n;
    },
  };
}
