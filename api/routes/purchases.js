import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Purchases / wishlist — mounted at /api/purchases.
 * Regras no serviço (`services/purchases.js`); envelope igual ao da rota antiga, congelada em
 * `test-support/oracles/purchases.bcbadad.js` para a prova de paridade.
 */
export function createPurchasesRouter({ purchases }) {
  if (!purchases) throw new TypeError('createPurchasesRouter: informe o serviço purchases');
  const router = Router();

  router.get('/', asyncRoute(async (req, res) => {
    const { horizon, status } = req.query;
    res.json(await purchases.list({ horizon, status }));
  }));

  router.post('/', asyncRoute(async (req, res) => {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });
    res.status(201).json(await purchases.create(req.body));
  }));

  router.patch('/:id', asyncRoute(async (req, res) => {
    const row = await purchases.update(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.delete('/:id', asyncRoute(async (req, res) => {
    if (!(await purchases.remove(req.params.id))) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  }));

  return router;
}
