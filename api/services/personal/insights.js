/**
 * Insights de leitura sobre a camada assíncrona, com a resposta de routes/insights.js no commit bcbadad
 * (oráculo em test-support/oracles/insightsRoute.bcbadad.js).
 *
 * - Só leitura: nada grava. Cada relatório lê dentro de uma transação para enxergar um retrato único,
 *   como a rota antiga, que montava tudo de uma vez no SQLite síncrono.
 * - Nada externo dentro da transação: a chamada à OpenAI do confronto da PraxIA fica na rota, depois que
 *   `avoidance()` terminou.
 * - Relógio: `now` só decide o corte de 30 dias e de N dias das duas leituras que usam "agora".
 */
import { buildWeeklyInsights } from '../../lib/weeklyInsights.js';
import { buildAvoidanceInsights } from '../../lib/avoidanceInsights.js';

export function createInsightsService({ storage, now = () => new Date() }) {
  if (!storage?.insightsRead || typeof storage.transaction !== 'function') throw new TypeError('insights service requires storage');
  const snapshot = (callback) => storage.transaction((tx) => callback(tx.insightsRead));

  async function bestHours() {
    const thirtyDaysAgo = new Date(now());
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sessions = await storage.insightsRead.focusSessionsSince(thirtyDaysAgo.toISOString());

    if (sessions.length < 3) {
      return {
        best_hours: [],
        summary: 'Preciso de mais sessões de foco para sugerir horários',
        total_sessions: sessions.length,
      };
    }

    const hourMap = {};
    for (const session of sessions) {
      if (!session.created_date) continue;
      const d = new Date(session.created_date);
      if (isNaN(d.getTime())) continue;
      const hour = d.getHours();
      if (!hourMap[hour]) {
        hourMap[hour] = { hour, total_minutes: 0, sessions: 0 };
      }
      hourMap[hour].total_minutes += Math.round((session.duration_seconds || 0) / 60);
      hourMap[hour].sessions += 1;
    }

    const hourEntries = Object.values(hourMap)
      .map((h) => ({
        hour: h.hour,
        label: String(h.hour).padStart(2, '0') + ':00',
        total_minutes: h.total_minutes,
        sessions: h.sessions,
      }))
      .sort((a, b) => b.total_minutes - a.total_minutes);

    const best = hourEntries.slice(0, 3);

    let summary = 'Preciso de mais sessões de foco para sugerir horários';
    if (best.length >= 2) {
      const hours = best.map((h) => h.hour).sort((a, b) => a - b);
      const hourLabels = hours.map((h) => h + 'h');
      summary = `Seus melhores horários de foco são ${hourLabels.join('-')}`;
    } else if (best.length === 1) {
      summary = `Seu melhor horário de foco é ${best[0].hour}h`;
    }

    return { best_hours: best, summary, total_sessions: sessions.length };
  }

  /** `daysQuery`: o valor cru de `?days=` (texto, lista ou ausente), com a mesma conversão da rota antiga. */
  async function correlation(daysQuery) {
    const days = Math.min(Number(daysQuery) || 60, 180);
    const cutoff = new Date(now());
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return snapshot(async (read) => {
      const wellnessRows = await read.wellnessSince(cutoffStr);

      if (wellnessRows.length < 5) {
        return {
          enough_data: false,
          message: 'Preciso de pelo menos 5 dias com check-in de bem-estar para comparar.',
          days_analyzed: wellnessRows.length,
        };
      }

      const activeHabits = await read.activeHabits();
      const activeHabitsCount = activeHabits.length;
      if (activeHabitsCount === 0) {
        return {
          enough_data: false,
          message: 'Nenhum hábito ativo para correlacionar.',
          days_analyzed: wellnessRows.length,
        };
      }

      // Hábitos ativos concluídos por dia (contagem de hábitos distintos), a partir dos registros da faixa.
      const activeIds = new Set(activeHabits.map((h) => h.id));
      const doneByDate = new Map();
      for (const log of await read.habitLogs(wellnessRows[0].date, wellnessRows[wellnessRows.length - 1].date)) {
        if (log.completed !== 1 || !activeIds.has(log.habit_id)) continue;
        if (!doneByDate.has(log.date)) doneByDate.set(log.date, new Set());
        doneByDate.get(log.date).add(log.habit_id);
      }

      const high = { mood: 0, sleep_hours: 0, productivity: 0, count: 0 };
      const low = { mood: 0, sleep_hours: 0, productivity: 0, count: 0 };

      for (const w of wellnessRows) {
        const completed = doneByDate.get(w.date)?.size ?? 0;
        const rate = completed / activeHabitsCount;
        const bucket = rate >= 0.8 ? high : low;
        bucket.mood += w.mood || 0;
        bucket.sleep_hours += w.sleep_hours || 0;
        bucket.productivity += w.productivity || 0;
        bucket.count += 1;
      }

      const avg = (b) => (b.count === 0 ? null : {
        mood: +(b.mood / b.count).toFixed(2),
        sleep_hours: +(b.sleep_hours / b.count).toFixed(2),
        productivity: +(b.productivity / b.count).toFixed(2),
        days: b.count,
      });

      const highAvg = avg(high);
      const lowAvg = avg(low);

      let insight = null;
      if (highAvg && lowAvg) {
        insight = {
          mood_delta: +(highAvg.mood - lowAvg.mood).toFixed(2),
          sleep_delta: +(highAvg.sleep_hours - lowAvg.sleep_hours).toFixed(2),
          productivity_delta: +(highAvg.productivity - lowAvg.productivity).toFixed(2),
        };
      }

      return {
        enough_data: true,
        days_analyzed: wellnessRows.length,
        high_completion: highAvg,
        low_completion: lowAvg,
        insight,
      };
    });
  }

  const weekly = (weekStart, today) => snapshot((read) => buildWeeklyInsights(read, weekStart, { today }));
  const avoidance = (today) => snapshot((read) => buildAvoidanceInsights(read, today));

  return Object.freeze({ bestHours, correlation, weekly, avoidance });
}
