/**
 * ORÁCULO CONGELADO: cópia literal de `git show bcbadad:api/routes/gamification.js` (só imports ajustados).
 * Não editar: é a referência da prova de paridade HTTP da fase 3.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getLevel, checkAchievements } from './gamification-lib.bcbadad.js';
import { awardXp, getXpSince, getXpTotal, recomputeXp } from './xpEvents.bcbadad.js';

/** Segunda-feira 00:00 em America/Fortaleza (UTC-3, sem horário de verão) como 'YYYY-MM-DD HH:MM:SS' UTC. */
function weekStartUtc(todayYmd) {
  const [y, m, d] = todayYmd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return `${date.toISOString().slice(0, 10)} 03:00:00`;
}

/** Gamification — mounted at /api/gamification */
export function createGamificationRouter({ db, getLocalDateString }) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const xpTotal = getXpTotal(db);
      const levelInfo = getLevel(xpTotal);
      let progress_pct = 100;
      if (levelInfo.next_level_xp !== null) {
        const xpInLevel = xpTotal - levelInfo.current_xp;
        const xpNeeded = levelInfo.next_level_xp - levelInfo.current_xp;
        progress_pct = xpNeeded > 0 ? Math.round((xpInLevel / xpNeeded) * 100) : 0;
      }
      const achievements = db.prepare('SELECT * FROM achievements ORDER BY unlocked_date DESC NULLS LAST, id').all();
      res.json({
        xp_total: xpTotal,
        level: levelInfo.level,
        level_name: levelInfo.name,
        next_level_xp: levelInfo.next_level_xp,
        progress_pct,
        achievements,
        xp_week: getXpSince(db, weekStartUtc(getLocalDateString())),
      });
    } catch (error) {
      console.error('Gamification GET error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/add-xp', (req, res) => {
    try {
      const { amount, reason } = req.body;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }

      const award = awardXp(db, {
        sourceType: 'manual',
        sourceId: randomUUID(),
        amount,
        reason: typeof reason === 'string' ? reason : null,
      });
      const newLevelInfo = getLevel(award.xp_total);

      const newAchievements = checkAchievements(db, { getLocalDateString });

      res.json({
        xp_total: award.xp_total,
        level: newLevelInfo.level,
        level_name: newLevelInfo.name,
        leveled_up: award.leveled_up,
        new_achievements: newAchievements,
        reason: reason || null,
      });
    } catch (error) {
      console.error('Add XP error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/check-achievements', (req, res) => {
    try {
      const newAchievements = checkAchievements(db, { getLocalDateString });

      let totalBonusXp = 0;
      db.transaction(() => {
        for (const a of newAchievements) {
          totalBonusXp += awardXp(db, {
            sourceType: 'achievement',
            sourceId: a.id,
            amount: a.xp_reward || 0,
            reason: `Conquista: ${a.name}`,
          }).awarded;
        }
        recomputeXp(db);
      })();

      res.json({
        new_achievements: newAchievements,
        bonus_xp: totalBonusXp,
      });
    } catch (error) {
      console.error('Check achievements error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
