import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Focus sessions — mounted at /api/focus (includes /stats).
 * Regras no serviço (`services/routine/focusWellness.js`); envelope igual ao da rota antiga,
 * congelada em `test-support/oracles/focus.bcbadad.js` para a prova de paridade.
 */
export function createFocusRouter({ focus }) {
  if (!focus) throw new TypeError('createFocusRouter: informe o serviço focus');
  const router = Router();

  router.get('/', asyncRoute(async (req, res) => {
    res.json(await focus.list({ date: req.query.date }));
  }));

  router.post('/', asyncRoute(async (req, res) => {
    res.status(201).json(await focus.create(req.body));
  }));

  // GET /api/focus/stats?days=30
  router.get('/stats', asyncRoute(async (req, res) => {
    try {
      res.json(await focus.stats(req.query.days));
    } catch (error) {
      console.error('Focus stats error:', error);
      res.status(500).json({ error: error.message });
    }
  }));

  return router;
}
