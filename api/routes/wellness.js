import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Wellness router — mounted at /api/wellness.
 * Regras no serviço (`services/routine/focusWellness.js`); envelope igual ao da rota antiga,
 * congelada em `test-support/oracles/wellness.bcbadad.js` para a prova de paridade.
 */
export function createWellnessRouter({ wellness }) {
  if (!wellness) throw new TypeError('createWellnessRouter: informe o serviço wellness');
  const router = Router();

  router.get('/', asyncRoute(async (req, res) => {
    res.json(await wellness.list({ date: req.query.date }));
  }));

  router.post('/', asyncRoute(async (req, res) => {
    if (!req.body.date) return res.status(400).json({ error: 'date required' });
    const { created, row } = await wellness.upsert(req.body);
    res.status(created ? 201 : 200).json(row);
  }));

  return router;
}
