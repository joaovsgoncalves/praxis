/**
 * Agregação semanal para /api/insights/weekly (Praxis onda 8).
 *
 * Lê pelo repositório de leitura `insightsRead` (storage/domains/phase4.js), SQLite ou Firestore, com
 * o mesmo resultado da versão antiga sobre o banco (oráculo em test-support/oracles/weeklyInsights.bcbadad.js).
 * Diferença intencional: erro numa das leituras da camada factual agora falha o pedido em vez de virar
 * "sem movimento" (a consulta só falha com esquema quebrado; a ausência das tabelas de frentes continua
 * valendo como lista vazia, no repositório).
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
  if (habit.tracking_mode === 'since') return false;
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
 * @param {object} read repositório `insightsRead` (storage.insightsRead ou tx.insightsRead)
 * @param {string} weekStart YYYY-MM-DD (segunda)
 * @param {{ today?: string }} [options] today = 'YYYY-MM-DD' (default: data local)
 */
export async function buildWeeklyInsights(read, weekStart, options = {}) {
  const weekEnd = addDaysYmd(weekStart, 6);
  const today = String(options.today || localYmd());
  // Semana em andamento: só conta dias já transcorridos (não pune o futuro).
  const effEnd = today < weekEnd ? today : weekEnd;
  const weekDates = [];
  for (let i = 0; i < 7; i++) weekDates.push(addDaysYmd(weekStart, i));

  const completedTasks = await read.completedTasksOfWeek(weekStart, weekEnd);

  const stalePending = await read.stalePendingTasks(weekStart);

  const overdueCount = stalePending.length;

  const activeHabits = await read.activeHabits();
  let habitSlots = 0;
  let habitDone = 0;
  let habitSkipped = 0;
  let habitOpenSlots = 0;
  const missByHabit = {};
  const skipByHabit = {};
  const skipReasonByHabit = {};

  // Por dia (seg a dom): hábitos folha devidos, sem contar "não rolou" (decisão, não pendência).
  // A rotina (kind = compound) é contêiner: os passos já entram, então ela fica fora do dia
  // e vai para `days_routines`, que fecha a conta com `victories`.
  const habitDayStats = Object.fromEntries(weekDates.map((d) => [d, { done: 0, total: 0 }]));
  const routineSlots = { slots: 0, done: 0, skipped: 0 };
  // Um registro por hábito e dia (índice único): a semana inteira numa leitura só.
  const logsByHabit = new Map();
  for (const row of await read.habitLogs(weekStart, weekEnd)) {
    if (!logsByHabit.has(row.habit_id)) logsByHabit.set(row.habit_id, new Map());
    logsByHabit.get(row.habit_id).set(row.date, row);
  }

  for (const day of weekDates) {
    const isFuture = day > effEnd;
    for (const h of activeHabits) {
      if (!isHabitDueOnDate(h, day)) continue;
      const log = logsByHabit.get(h.id)?.get(day);
      const isSkipped = log && log.outcome === 'skipped';
      const isDone = log && !isSkipped && (
        log.outcome === 'done' || log.completed === 1 || log.completed === true
      );
      const isRoutine = h.kind === 'compound';
      if (!isSkipped && !isRoutine) habitDayStats[day].total += 1;
      // Futuro: só o que está agendado entra no ponto; nada conta como feito nem nos totais da semana.
      if (isFuture) continue;
      habitSlots += 1;
      if (isRoutine) {
        routineSlots.slots += 1;
        if (isDone) routineSlots.done += 1;
        if (isSkipped) routineSlots.skipped += 1;
      }
      if (isDone) {
        habitDone += 1;
        if (!isRoutine) habitDayStats[day].done += 1;
      } else if (isSkipped) {
        habitSkipped += 1;
        const key = h.title || h.id;
        skipByHabit[key] = (skipByHabit[key] || 0) + 1;
        if (log.skip_reason) {
          if (!skipReasonByHabit[key]) skipReasonByHabit[key] = {};
          const r = log.skip_reason;
          skipReasonByHabit[key][r] = (skipReasonByHabit[key][r] || 0) + 1;
        }
      } else {
        habitOpenSlots += 1;
        const key = h.title || h.id;
        missByHabit[key] = (missByHabit[key] || 0) + 1;
      }
    }
  }

  const habitPct = habitSlots > 0 ? Math.round((habitDone / habitSlots) * 100) : null;

  // Tarefas do dia: data no dia, fora ideias e canceladas (inclui "não rolou").
  const taskDayRows = await read.taskDayCounts(weekStart, weekEnd);
  const taskDayStats = Object.fromEntries(taskDayRows.map((r) => [r.day, r]));

  const dayItems = weekDates.map((date) => {
    const isFuture = date > today;
    const taskRow = taskDayStats[date];
    const tasksTotal = Number(taskRow?.total) || 0;
    const tasksDone = isFuture ? 0 : Number(taskRow?.done) || 0;
    const habitsTotal = habitDayStats[date].total;
    const habitsDone = isFuture ? 0 : habitDayStats[date].done;
    return {
      date,
      weekday: new Date(`${date}T12:00:00`).getDay(),
      is_today: date === today,
      is_future: isFuture,
      done: tasksDone + habitsDone,
      total: tasksTotal + habitsTotal,
      tasks_done: tasksDone,
      tasks_total: tasksTotal,
      habits_done: habitsDone,
      habits_total: habitsTotal,
    };
  });

  const focusAgg = await read.focusTotals(weekStart, weekEnd);

  const focusMinutes = Math.round((focusAgg?.total_seconds || 0) / 60);
  const focusSessions = focusAgg?.sessions || 0;

  const wellnessRows = await read.wellnessBetween(weekStart, weekEnd);

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

  const { created: ideasNew, promoted: ideasPromoted } = await read.ideaCounts(weekStart, weekEnd);

  const promissoras = await read.promissoras();

  const topMissed = Object.entries(missByHabit)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, misses]) => ({ title: cleanTitle(title), misses }));

  const topSkipped = Object.entries(skipByHabit)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, skips]) => {
      const reasons = skipReasonByHabit[title] || {};
      const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      return { title: cleanTitle(title), skips, top_reason: topReason };
    });

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
    suggested_priorities.push(
      `Reforçar hábito em aberto: ${topMissed[0].title} (${topMissed[0].misses} slot(s) sem registro)`,
    );
  } else if (topSkipped[0]) {
    const reasonLabel = {
      time: 'tempo',
      energy: 'energia',
      context: 'contexto',
      other: 'outro',
    }[topSkipped[0].top_reason] || null;
    suggested_priorities.push(
      reasonLabel
        ? `${topSkipped[0].title}: não rolou ${topSkipped[0].skips}× (${reasonLabel}) — encolher janela?`
        : `${topSkipped[0].title}: não rolou ${topSkipped[0].skips}× — rever frequência?`,
    );
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
    topMissed[0] ? `Hábito ${topMissed[0].title} ficou em aberto ${topMissed[0].misses}x.` : null,
    topSkipped[0] ? `${topSkipped[0].title}: não rolou ${topSkipped[0].skips}x.` : null,
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
      habits_skipped: habitSkipped,
      habits_open_slots: habitOpenSlots,
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
      top_skipped: topSkipped,
      habits_skipped: habitSkipped,
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
    life_history: await buildLifeHistory(read, weekStart, weekEnd),
    days: dayItems,
    days_routines: routineSlots,
  };
}

/** Data local YYYY-MM-DD (evita depender do fuso UTC na ausência de options.today). */
function localYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Normaliza título removendo prefixos P1/P2/P3 usados pelo app. */
function cleanTitleSafe(title) {
  return String(title || '').replace(/^P\d+\s*[-–—:]?\s*/i, '').trim();
}

const AREA_OF_CATEGORY = {
  rca: 'rca',
  trabalho: 'rca',
  comercial: 'rca',
  whatsapp: 'rca',
  farmacia: 'rca',
  facul: 'faculdade',
  estudo: 'faculdade',
  educacao: 'faculdade',
  treino: 'saude',
  saude: 'saude',
  nutricao: 'saude',
  fitness: 'saude',
  gofluxo: 'gofluxo',
  animalia: 'gofluxo',
  projeto: 'projetos',
  tecnologia: 'projetos',
  site: 'projetos',
  catalogo: 'projetos',
  pessoal: 'vida-pratica',
  rotina: 'vida-pratica',
  familia: 'vida-pratica',
};

function areaFor(category, slug = '') {
  const cat = (category || '').toLowerCase().trim();
  if (AREA_OF_CATEGORY[cat]) return AREA_OF_CATEGORY[cat];
  if (!slug) return 'projetos';
  if (['rca', 'fidelize', 'opella', 'nazaria'].some((k) => slug.includes(k))) return 'rca';
  // Animália é serviço de implementação da GoFluxo → agrupa na área GoFluxo.
  if (['gofluxo', 'animalia'].some((k) => slug.includes(k))) return 'gofluxo';
  if (['facul', 'unifacex', 'estudo'].some((k) => slug.includes(k))) return 'faculdade';
  return 'projetos';
}

const STOP_WORDS = new Set([
  'e', 'de', 'da', 'do', 'das', 'dos', 'para', 'com', 'ou', 'se', 'hoje',
  'quando', 'foi', 'o', 'a', 'os', 'as', 'um', 'uma', 'um', 'ter', 'quando',
]);

/** Normaliza o texto para um conjunto de tokens significativos (sem acentos/pontuação). */
function sigTokens(text) {
  let t = String(text || '')
    .toLowerCase()
    .normalize('NFD');
  t = t.replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/^P\d+\s*[-–—:]?\s*/i, '');
  t = t.replace(/conclu[ií]do[:.-]?/g, ' ');
  t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return new Set(
    t.split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

/** Verdadeiro se dois conjuntos de tokens significativos representam a mesma coisa. */
function sameSig(A, B) {
  if (!A || !B || !A.size || !B.size) return false;
  const inter = [...A].filter((t) => B.has(t)).length;
  const aInB = inter / A.size;
  const bInA = inter / B.size;
  return aInB >= 0.8 || bInA >= 0.8;
}

/**
 * Camada factual da semana: não é opinião nem cobrança. Junta avanços reais da
 * continuidade (project_updates) e tarefas concluídas, agrupando por área e em
 * uma timeline curta. Nunca muda a frente; apenas lê o que já aconteceu.
 */
async function buildLifeHistory(read, weekStart, weekEnd) {
  const updates = [];
  const projectName = new Map();

  for (const p of await read.projectNames()) projectName.set(p.id, { slug: p.slug, name: p.name });

  for (const r of await read.projectUpdatesBetween(weekStart, weekEnd)) {
    const meta = projectName.get(r.project_id) || { slug: String(r.project_id), name: '' };
    updates.push({
      date: r.date,
      front: meta.slug,
      name: meta.name || meta.slug,
      summary: String(r.summary || '').trim(),
      source: r.source || 'manual',
      kind: 'continuidade',
    });
  }

  // Tarefas concluídas na semana, excluídas ideias (fontes e amostras honestas).
  const completed = await read.completedTasksForHistory(weekStart, weekEnd);

  const byArea = {};
  const timeline = [];
  const seen = new Set();

  for (const u of updates) {
    const area = areaFor('', u.front);
    byArea[area] = byArea[area] || { area, count: 0, samples: [] };
    byArea[area].count += 1;
    if (byArea[area].samples.length < 4) {
      byArea[area].samples.push(u.summary || u.name);
    }
    if (timeline.length < 10) {
      timeline.push({
        date: u.date,
        front: u.front,
        name: u.name,
        text: u.summary,
        kind: u.kind,
        source: u.source,
      });
    }
  }

  const updateItems = updates.map((u) => ({
    area: areaFor('', u.front),
    sig: sigTokens(u.summary || u.name),
  }));

  for (const t of completed) {
    const area = areaFor(t.category);
    const sample = cleanTitleSafe(t.title);
    if (!sample) continue;
    const key = `${area}|${sample.toLowerCase()}`;
    if (seen.has(key)) continue;
    // Dedup: se um update da continuidade (mesma área) já "é" este entregável,
    // não conta em dobro no chip área.
    const tSig = sigTokens(sample);
    const covered = updateItems.some(
      (u) => u.area === area && u.sig.size && sameSig(u.sig, tSig),
    );
    if (covered) continue;
    seen.add(key);
    byArea[area] = byArea[area] || { area, count: 0, samples: [] };
    byArea[area].count += 1;
    if (byArea[area].samples.length < 4) byArea[area].samples.push(sample);
  }

  const summaryParts = [];
  const overallUpdates = updates.length;
  const overallTasks = completed.length;
  if (overallUpdates > 0) {
    summaryParts.push(`${overallUpdates} avanço(s) registrado(s) na continuidade`);
  }
  if (overallTasks > 0) {
    summaryParts.push(`${overallTasks} tarefa(s) concluída(s)`);
  }
  const summary =
    summaryParts.length > 0
      ? `Semana com ${summaryParts.join(' e ')}.`
      : 'Sem movimento registrado nesta semana.';
  return {
    summary,
    project_updates: updates,
    completed_by_area: Object.values(byArea).sort((a, b) => b.count - a.count),
    timeline,
  };
}