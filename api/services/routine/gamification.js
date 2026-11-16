/**
 * Gamificação sobre a camada assíncrona, com o comportamento da rota antiga (oráculos em
 * test-support/oracles/gamification.bcbadad.js, xpEvents e gamification-lib):
 *
 * - GET /: total = soma dos eventos ativos (nunca negativo), nível e progresso, conquistas
 *   `unlocked_date DESC` (NULL por último, depois id), XP da semana (segunda 00:00 de Fortaleza em UTC,
 *   sem o saldo inicial). Leituras na mesma transação: um retrato só.
 * - POST /add-xp: prêmio manual com origem única nova (UUID); depois avalia conquistas (sem bônus).
 *   O prêmio e a avaliação são duas transações, como na antiga.
 * - POST /check-achievements: avalia, desbloqueia e paga o bônus de cada conquista nova
 *   (`achievement`/id, `xp_reward`) e recalcula o espelho, tudo na MESMA transação.
 *
 * Conquistas novas voltam ordenadas por id (a antiga lia `WHERE id IN (...)` pelo índice da chave).
 * O dia do desbloqueio é a data UTC do relógio injetado (`new Date().toISOString()` da antiga).
 *
 * Diferenças intencionais (nenhum consumidor manda; tela e Alfred mandam inteiro positivo):
 * (1) falha no bônus desfaz também o desbloqueio (a antiga deixava a conquista aberta sem XP);
 * (2) valor de XP que não vira inteiro seguro e id não textual em `habits_order` de ritual antigo
 *     viram `sqlite_coercion_unsupported`.
 */
import { randomUUID } from 'node:crypto';
import { getLevel, pendingAchievements } from '../../lib/gamification.js';
import { compareSqlite } from '../../storage/sqliteOrder.js';
import { planXp, applyXp, awardXp, clampTotal } from './xp.js';

/** Segunda-feira 00:00 em America/Fortaleza (UTC-3, sem horário de verão) como 'YYYY-MM-DD HH:MM:SS' UTC. */
export function weekStartUtc(todayYmd) {
  const [y, m, d] = todayYmd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return `${date.toISOString().slice(0, 10)} 03:00:00`;
}

export function createGamificationService({ storage, getLocalDateString, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.xpEvents || !storage?.achievementFacts || typeof storage.transaction !== 'function') throw new TypeError('gamification service requires storage');
  if (typeof getLocalDateString !== 'function') throw new TypeError('gamification service requires getLocalDateString');
  const deps = { now, newId };

  /** Avalia e desbloqueia dentro da transação; devolve as linhas novas, por id. Só LÊ antes de gravar. */
  async function readUnlocks(tx) {
    const achievements = await tx.achievements.list();
    const facts = await tx.achievementFacts.load();
    const today = now().toISOString().split('T')[0];
    const ids = pendingAchievements(facts, achievements, { getLocalDateString });
    return { today, fresh: ids.map((id) => achievements.find((a) => a.id === id)) };
  }
  async function writeUnlocks(tx, { today, fresh }) {
    for (const a of fresh) await tx.achievements.patch(a.id, { unlocked_date: today });
    return fresh.map((a) => ({ ...a, unlocked_date: today })).sort((a, b) => compareSqlite(a.id, b.id));
  }

  async function summary() {
    const since = weekStartUtc(getLocalDateString());
    const { raw, achievements, week } = await storage.transaction(async (tx) => ({
      raw: await tx.xpEvents.activeTotal(),
      achievements: await tx.achievements.list(),
      week: await tx.xpEvents.weekTotal(since),
    }));
    const xpTotal = clampTotal(raw);
    const levelInfo = getLevel(xpTotal);
    let progress_pct = 100;
    if (levelInfo.next_level_xp !== null) {
      const xpInLevel = xpTotal - levelInfo.current_xp;
      const xpNeeded = levelInfo.next_level_xp - levelInfo.current_xp;
      progress_pct = xpNeeded > 0 ? Math.round((xpInLevel / xpNeeded) * 100) : 0;
    }
    return {
      xp_total: xpTotal,
      level: levelInfo.level,
      level_name: levelInfo.name,
      next_level_xp: levelInfo.next_level_xp,
      progress_pct,
      achievements,
      xp_week: Number(week) || 0,
    };
  }

  /** `amount` e `reason` já validados pela rota (400). */
  async function addXp({ amount, reason }) {
    const award = await storage.transaction((tx) => awardXp(tx, {
      sourceType: 'manual', sourceId: newId(), amount, reason: typeof reason === 'string' ? reason : null,
    }, deps));
    const newLevelInfo = getLevel(award.xp_total);
    const new_achievements = await storage.transaction(async (tx) => {
      const unlocks = await readUnlocks(tx);
      return writeUnlocks(tx, unlocks);
    });
    return {
      xp_total: award.xp_total,
      level: newLevelInfo.level,
      level_name: newLevelInfo.name,
      leveled_up: award.leveled_up,
      new_achievements,
      reason: reason || null,
    };
  }

  async function checkAchievements() {
    return storage.transaction(async (tx) => {
      const unlocks = await readUnlocks(tx);
      const awards = [...unlocks.fresh].sort((a, b) => compareSqlite(a.id, b.id)).map((a) => ({
        sourceType: 'achievement', sourceId: a.id, amount: a.xp_reward || 0, reason: `Conquista: ${a.name}`,
      }));
      const plan = await planXp(tx, { awards });
      const new_achievements = await writeUnlocks(tx, unlocks);
      const out = await applyXp(tx, plan, deps);
      return { new_achievements, bonus_xp: out.results.reduce((sum, r) => sum + r.awarded, 0) };
    });
  }

  return Object.freeze({ summary, addXp, checkAchievements });
}
