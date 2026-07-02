/**
 * Agregação semanal para /api/insights/weekly (Praxis onda 8).
 */

export function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function parseRecurrenceDays(habit) {
  if (!habit?.recurrence_days) return [];
  try {
    const raw = typeof habit.recurrence_days === 'string'
      ? JSON.parse(habit.recurrence_days)
      : habit.recurrence_days;
    return Array.isArray(raw)
      ? [...new Set(raw.map(Number).filter((n) => n >= 0 && n <= 6))]
      : [];
  } catch {
    return [];
  }
}

export function isHabitDueOnDate(habit, dateStr) {
  if (!habit || habit.status !== 'active') return false;
  const d = new Date(`${dateStr}T12:00:00`);
  const dow = d.getDay();
  const freq = habit.frequency || 'daily';
  if (freq === 'daily') return true;
  if (freq === 'weekdays') return dow >= 1 && dow <= 5;
  if (freq === 'weekends') return dow === 0 || dow === 6;
  if (freq === 'weekly') {
    const days = parseRecurrenceDays(habit);
    return days.length ? days.includes(dow) : true;
  }
  return true;
}

function cleanTitle(title) {
  return String(title || '').replace(/^P\d+\s*[-–—:]?\s*/i, '').trim();
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} weekStart YYYY-MM-DD (segunda)
 */
export function buildWeeklyInsights(db, weekStart) {
  const weekEnd = addDaysYmd(weekStart, 6);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDaysYmd(weekStart, i));

  const completedTasks = db.prepare(`
    SELECT id, title, priority, category, date, completed_date
    FROM tasks
    WHERE status = 'completed'
      AND category != 'ideias'
      AND (
        (date IS NOT NULL AND date BETWEEN ? AND ?)
        OR (completed_date IS NOT NULL AND completed_date BETWEEN ? AND ?)
      )
    ORDER BY completed_date DESC, updated_date DESC
    LIMIT 50
  `).all(weekStart, weekEnd, weekStart, weekEnd);

  const stalePending = db.prepare(`
    SELECT title FROM tasks
    WHERE status = 'pending'
      AND category != 'ideias'
      AND date IS NOT NULL
      AND date < ?
    ORDER BY date ASC
    LIMIT 10
  `).all(weekStart);

  const overdueCount = stalePending.length;

  const activeHabits = db.prepare("SELECT * FROM habits WHERE status = 'active'").all();
  let habitSlots = 0;
  let habitDone = 0;
  const missByHabit = {};

  for (const day of days) {
    for (const h of activeHabits) {
      if (!isHabitDueOnDate(h, day)) continue;
      habitSlots += 1;
      const log = db.prepare(
        'SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?',
      ).get(h.id, day);
      const ok = log && (log.completed === 1 || log.completed === true);
      if (ok) habitDone += 1;
      else {
        const key = h.title || h.id;
        missByHabit[key] = (missByHabit[key] || 0) + 1;
      }
    }
  }

  const habitPct = habitSlots > 0 ? Math.round((habitDone / habitSlots) * 100) : null;

  const focusAgg = db.prepare(`
    SELECT COUNT(*) as sessions, COALESCE(SUM(duration_seconds), 0) as total_seconds
    FROM focus_sessions
    WHERE date BETWEEN ? AND ?
  `).get(weekStart, weekEnd);

  const focusMinutes = Math.round((focusAgg?.total_seconds || 0) / 60);
  const focusSessions = focusAgg?.sessions || 0;

  const wellnessRows = db.prepare(`
    SELECT mood, productivity, sleep_hours, sleep_quality
    FROM wellness_checks
    WHERE date BETWEEN ? AND ?
  `).all(weekStart, weekEnd);

  let avgMood = null;
  let avgProductivity = null;
  let avgSleep = null;
  if (wellnessRows.length > 0) {
    const sum = wellnessRows.reduce(
      (acc, w) => ({
        mood: acc.mood + (w.mood || 0),
        productivity: acc.productivity + (w.productivity || 0),
        sleep: acc.sleep + (w.sleep_hours || 0),
      }),
      { mood: 0, productivity: 0, sleep: 0 },
    );
    const n = wellnessRows.length;
    avgMood = +(sum.mood / n).toFixed(1);
    avgProductivity = +(sum.productivity / n).toFixed(1);
    avgSleep = +(sum.sleep / n).toFixed(1);
  }

  const ideasNew = db.prepare(`
    SELECT COUNT(*) as c FROM tasks
    WHERE category = 'ideias'
      AND substr(created_date, 1, 10) BETWEEN ? AND ?
  `).get(weekStart, weekEnd).c;

  const ideasPromoted = db.prepare(`
    SELECT COUNT(*) as c FROM tasks
    WHERE category = 'ideias'
      AND idea_status = 'virou_tarefa'
      AND substr(updated_date, 1, 10) BETWEEN ? AND ?
  `).get(weekStart, weekEnd).c;

  const promissoras = db.prepare(`
    SELECT title FROM tasks
    WHERE category = 'ideias' AND idea_status = 'promissora'
    ORDER BY updated_date DESC
    LIMIT 5
  `).all();

  const topMissed = Object.entries(missByHabit)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, misses]) => ({ title: cleanTitle(title), misses }));

  const victoryTitles = completedTasks
    .slice(0, 5)
    .map((t) => cleanTitle(t.title))
    .filter(Boolean);

  const suggested_priorities = [];

  if (overdueCount > 0) {
    const first = cleanTitle(stalePending[0]?.title);
    suggested_priorities.push(
      first
        ? `Fechar pendência atrasada: ${first}${overdueCount > 1 ? ` (+${overdueCount - 1})` : ''}`
        : `Fechar ${overdueCount} tarefa(s) atrasada(s)`,
    );
  }

  if (topMissed[0]) {
    suggested_priorities.push(`Reforçar hábito: ${topMissed[0].title} (${topMissed[0].misses} falha(s) na semana)`);
  }

  if (promissoras[0]) {
    suggested_priorities.push(`Ideia promissora → tarefa: ${cleanTitle(promissoras[0].title)}`);
  } else if (ideasNew > 0) {
    suggested_priorities.push(`Revisar ${ideasNew} ideia(s) capturada(s) nesta semana`);
  }

  if (focusMinutes < 60 && focusSessions < 3) {
    suggested_priorities.push('Reservar 2–3 blocos de foco na próxima semana');
  }

  while (suggested_priorities.length < 3) {
    if (habitPct !== null && habitPct < 70) {
      suggested_priorities.push('Subir consistência de hábitos (meta: 70%+ na semana)');
      break;
    }
    suggested_priorities.push('Escolher uma meta da semana e quebrar em 3 tarefas concretas');
    break;
  }

  const uniquePriorities = [...new Set(suggested_priorities)].slice(0, 3);

  const patternParts = [];
  if (habitPct !== null) patternParts.push(`Hábitos em ${habitPct}% (${habitDone}/${habitSlots})`);
  if (focusMinutes > 0) patternParts.push(`${focusMinutes} min de foco em ${focusSessions} sessão(ões)`);
  if (avgMood !== null) patternParts.push(`humor médio ${avgMood}/5`);
  const pattern_summary = patternParts.length
    ? patternParts.join(' · ')
    : 'Poucos dados nesta semana — vale registrar hábitos, foco e bem-estar.';

  const bottleneckParts = [];
  if (overdueCount > 0) bottleneckParts.push(`${overdueCount} tarefa(s) atrasada(s) no radar`);
  if (topMissed.length > 0) bottleneckParts.push(`hábito mais fraco: ${topMissed[0].title}`);
  if (wellnessRows.length < 3) bottleneckParts.push('poucos check-ins de bem-estar');
  const bottleneck_summary = bottleneckParts.length
    ? bottleneckParts.join('; ')
    : 'Nenhum gargalo óbvio — mantém o ritmo.';

  const draft_highlights = [
    victoryTitles.length ? `Tarefas concluídas: ${victoryTitles.join('; ')}` : null,
    habitPct !== null && habitPct >= 70 ? `Hábitos consistentes (${habitPct}%).` : null,
    focusMinutes >= 90 ? `${focusMinutes} minutos de foco registrados.` : null,
    ideasPromoted > 0 ? `${ideasPromoted} ideia(s) viraram tarefa.` : null,
  ].filter(Boolean).join('\n') || 'Registre aqui o que você sente que funcionou.';

  const draft_blockers = [
    overdueCount > 0 ? `${overdueCount} pendência(s) atrasada(s).` : null,
    topMissed[0] ? `Hábito ${topMissed[0].title} falhou ${topMissed[0].misses}x.` : null,
    habitPct !== null && habitPct < 50 ? 'Consistência de hábitos abaixo de 50%.' : null,
  ].filter(Boolean).join('\n') || 'O que travou energia ou atenção?';

  const draft_learnings = pattern_summary;

  const draft_next_week_focus = uniquePriorities.map((p, i) => `${i + 1}. ${p}`).join('\n');

  return {
    week_start: weekStart,
    week_end: weekEnd,
    generated_at: new Date().toISOString(),
    victories: {
      tasks_completed_count: completedTasks.length,
      tasks_completed_samples: victoryTitles,
      habits_done: habitDone,
      habits_target: habitSlots,
      habits_completion_pct: habitPct,
      focus_minutes: focusMinutes,
      focus_sessions: focusSessions,
      ideas_promoted: ideasPromoted,
    },
    patterns: {
      summary: pattern_summary,
      wellness_days: wellnessRows.length,
      avg_mood: avgMood,
      avg_productivity: avgProductivity,
      avg_sleep_hours: avgSleep,
    },
    bottlenecks: {
      summary: bottleneck_summary,
      overdue_tasks_count: overdueCount,
      overdue_samples: stalePending.map((t) => cleanTitle(t.title)).filter(Boolean),
      missed_habits: topMissed,
    },
    ideas: {
      new_captures: ideasNew,
      promissoras_count: promissoras.length,
      promoted: ideasPromoted,
      promissora_samples: promissoras.map((i) => cleanTitle(i.title)),
    },
    suggested_priorities: uniquePriorities,
    drafts: {
      highlights: draft_highlights,
      blockers: draft_blockers,
      learnings: draft_learnings,
      next_week_focus: draft_next_week_focus,
    },
  };
}