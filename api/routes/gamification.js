import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Gamification — mounted at /api/gamification.
 * Regras no serviço (`services/routine/gamification.js`); envelope igual ao da rota antiga, congelada em
 * `test-support/oracles/gamification.bcbadad.js` para a prova de paridade.
 */
export function createGamificationRouter({ gamification }) {
  if (!gamification) throw new TypeError('createGamificationRouter: informe o serviço gamification');
  const router = Router();

  router.get('/', asyncRoute(async (req, res) => {
    try {
      res.json(await gamification.summary());
    } catch (error) {
      console.error('Gamification GET error:', error);
      res.status(500).json({ error: error.message });
    }
  }));

  router.post('/add-xp', asyncRoute(async (req, res) => {
    try {
      const { amount, reason } = req.body;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }
      res.json(await gamification.addXp({ amount, reason }));
    } catch (error) {
      console.error('Add XP error:', error);
      res.status(500).json({ error: error.message });
    }
  }));

  router.post('/check-achievements', asyncRoute(async (req, res) => {
    try {
      res.json(await gamification.checkAchievements());
    } catch (error) {
      console.error('Check achievements error:', error);
      res.status(500).json({ error: error.message });
    }
  }));

  return router;
}
