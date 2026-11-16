import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Habits router — mounted at /api/habits
 * registerHabitLogRoutes mounts /api/habit-logs
 *
 * Regras no serviço (`services/routine/habits.js`); envelope igual ao da rota antiga, congelada em
 * `test-support/oracles/habits.bcbadad.js` para a prova de paridade.
 * Status: active | paused | archived — pause/archive preserve habit_logs (see docs/HABITS-LIFECYCLE.md)
 */
export function createHabitsRouter({ habits }) {
  if (!habits) throw new TypeError('createHabitsRouter: informe o serviço habits');
  const router = Router();
  const send = (res, { status, body }) => res.status(status).json(body);

  router.get('/', asyncRoute(async (req, res) => send(res, await habits.list({ status: req.query.status, date: req.query.date }))));
  router.patch('/reorder', asyncRoute(async (req, res) => send(res, await habits.reorder(req.body))));
  router.post('/', asyncRoute(async (req, res) => send(res, await habits.create(req.body))));
  router.patch('/:id/children', asyncRoute(async (req, res) => send(res, await habits.syncChildren(req.params.id, req.body))));
  router.put('/:id', asyncRoute(async (req, res) => send(res, await habits.update(req.params.id, req.body))));
  router.delete('/:id', asyncRoute(async (req, res) => send(res, await habits.remove(req.params.id))));
  router.get('/:id/streak', asyncRoute(async (req, res) => send(res, await habits.streak(req.params.id))));

  return router;
}

export function registerHabitLogRoutes(app, { habitLogs }) {
  if (!habitLogs) throw new TypeError('registerHabitLogRoutes: informe o serviço habitLogs');
  const send = (res, { status, body }) => res.status(status).json(body);

  app.get('/api/habit-logs', asyncRoute(async (req, res) => res.json(await habitLogs.list(req.query))));
  app.post('/api/habit-logs', asyncRoute(async (req, res) => send(res, await habitLogs.save(req.body))));
  app.delete('/api/habit-logs/:id', asyncRoute(async (req, res) => send(res, await habitLogs.remove(req.params.id))));
}
