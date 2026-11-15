/**
 * ORÁCULO CONGELADO: cópia literal de api/routes/settings.js no commit bcbadad (produção), usada só
 * por testes de paridade. Não importar no servidor.
 */
import { Router } from 'express';

function settingsPayload(settings) {
  return {
    id: 'default',
    full_name: settings.full_name,
    email: 'joao@praxis.local',
    avatar_url: settings.avatar_url,
    pomodoro_focus: settings.pomodoro_focus,
    pomodoro_break: settings.pomodoro_break,
    notif_habits: settings.notif_habits,
    notif_goals: settings.notif_goals,
    list_density: settings.list_density || 'comfortable',
    focus_weekly_goal_minutes: settings.focus_weekly_goal_minutes ?? null,
  };
}

const FOCUS_GOAL_MIN = 30;
const FOCUS_GOAL_MAX = 3000;

function isValidFocusGoal(value) {
  return value === null
    || (Number.isInteger(value) && value >= FOCUS_GOAL_MIN && value <= FOCUS_GOAL_MAX);
}

/** User settings — mounted at /api/user (paths: /settings) */
export function createSettingsRouter({ db }) {
  const router = Router();

  router.get('/settings', (req, res) => {
    let settings = db.prepare('SELECT * FROM user_settings WHERE id = ?').get('default');
    if (!settings) {
      db.prepare('INSERT INTO user_settings (id) VALUES (?)').run('default');
      settings = db.prepare('SELECT * FROM user_settings WHERE id = ?').get('default');
    }
    res.json(settingsPayload(settings));
  });

  router.put('/settings', (req, res) => {
    const {
      full_name,
      avatar_url,
      pomodoro_focus,
      pomodoro_break,
      notif_habits,
      notif_goals,
      list_density,
    } = req.body;

    // Meta semanal de foco: ausente preserva; null explícito desliga.
    const hasFocusGoal = Object.prototype.hasOwnProperty.call(req.body || {}, 'focus_weekly_goal_minutes');
    if (hasFocusGoal && !isValidFocusGoal(req.body.focus_weekly_goal_minutes)) {
      return res.status(400).json({
        error: `focus_weekly_goal_minutes must be an integer between ${FOCUS_GOAL_MIN} and ${FOCUS_GOAL_MAX}, or null`,
      });
    }

    const existing = db.prepare('SELECT id FROM user_settings WHERE id = ?').get('default');
    if (!existing) {
      db.prepare('INSERT INTO user_settings (id) VALUES (?)').run('default');
    }

    let density = list_density;
    if (density !== undefined && density !== null) {
      const d = String(density);
      if (!['compact', 'comfortable'].includes(d)) {
        return res.status(400).json({ error: 'list_density must be compact or comfortable' });
      }
      density = d;
    }

    db.prepare(`
      UPDATE user_settings SET
        full_name = COALESCE(?, full_name),
        avatar_url = COALESCE(?, avatar_url),
        pomodoro_focus = COALESCE(?, pomodoro_focus),
        pomodoro_break = COALESCE(?, pomodoro_break),
        notif_habits = COALESCE(?, notif_habits),
        notif_goals = COALESCE(?, notif_goals),
        list_density = COALESCE(?, list_density)
      WHERE id = 'default'
    `).run(
      full_name,
      avatar_url,
      pomodoro_focus,
      pomodoro_break,
      notif_habits,
      notif_goals,
      density ?? null,
    );
    if (hasFocusGoal) {
      db.prepare("UPDATE user_settings SET focus_weekly_goal_minutes = ? WHERE id = 'default'")
        .run(req.body.focus_weekly_goal_minutes);
    }

    const settings = db.prepare('SELECT * FROM user_settings WHERE id = ?').get('default');
    res.json(settingsPayload(settings));
  });

  return router;
}
