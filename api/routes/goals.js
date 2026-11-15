import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Goals — mounted at /api/goals.
 * Regras no serviço (`services/routine/goals.js`); envelope igual ao da rota antiga, congelada em
 * `test-support/oracles/goals.bcbadad.js` para a prova de paridade.
 */
export function createGoalsRouter({ goals }) {
  if (!goals) throw new TypeError('createGoalsRouter: informe o serviço goals');
  const router = Router();
  const send = (res, { status, body }) => res.status(status).json(body);

  router.get('/', asyncRoute(async (req, res) => {
    res.json(await goals.list());
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    const goal = await goals.get(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  }));

  router.post('/', asyncRoute(async (req, res) => send(res, await goals.create(req.body))));
  router.put('/:id', asyncRoute(async (req, res) => send(res, await goals.update(req.params.id, req.body))));
  router.delete('/:id', asyncRoute(async (req, res) => send(res, await goals.remove(req.params.id))));

  return router;
}
