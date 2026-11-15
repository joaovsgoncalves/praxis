import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Weekly reviews — mounted at /api/weekly-reviews.
 * Regras no serviço (`services/weeklyReviews.js`); envelope igual ao da rota antiga, congelada em
 * `test-support/oracles/weeklyReviews.bcbadad.js` para a prova de paridade.
 */
export function createWeeklyReviewsRouter({ weeklyReviews }) {
  if (!weeklyReviews) throw new TypeError('createWeeklyReviewsRouter: informe o serviço weeklyReviews');
  const router = Router();

  router.get('/', asyncRoute(async (req, res) => {
    res.json(await weeklyReviews.list(req.query.limit));
  }));

  router.get('/current', asyncRoute(async (req, res) => {
    res.json(await weeklyReviews.current(req.query.date));
  }));

  router.post('/', asyncRoute(async (req, res) => {
    const { status, review } = await weeklyReviews.save(req.body);
    res.status(status).json(review);
  }));

  router.delete('/:id', asyncRoute(async (req, res) => {
    res.json(await weeklyReviews.remove(req.params.id));
  }));

  return router;
}
