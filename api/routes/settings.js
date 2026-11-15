import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

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

/**
 * User settings — mounted at /api/user (paths: /settings).
 * Gravação no serviço (`services/personal/settings.js`); envelope igual ao da rota antiga, congelada
 * em `test-support/oracles/settings.bcbadad.js` para a prova de paridade.
 */
export function createSettingsRouter({ settings }) {
  if (!settings) throw new TypeError('createSettingsRouter: informe o serviço settings');
  const router = Router();

  router.get('/settings', asyncRoute(async (req, res) => {
    res.json(settingsPayload(await settings.get()));
  }));

  router.put('/settings', asyncRoute(async (req, res) => {
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

    let density = list_density;
    if (density !== undefined && density !== null) {
      const d = String(density);
      if (!['compact', 'comfortable'].includes(d)) {
        return res.status(400).json({ error: 'list_density must be compact or comfortable' });
      }
      density = d;
    }

    const saved = await settings.update(
      { full_name, avatar_url, pomodoro_focus, pomodoro_break, notif_habits, notif_goals, list_density: density ?? null },
      hasFocusGoal ? { value: req.body.focus_weekly_goal_minutes } : null,
    );
    res.json(settingsPayload(saved));
  }));

  return router;
}
