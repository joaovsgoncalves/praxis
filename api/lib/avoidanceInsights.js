/**
 * Cockpit "o que estou evitando" — agregação determinística (onda 16).
 */
import { addDaysYmd, isHabitDueOnDate } from './weeklyInsights.js';

function cleanTitle(title) {
  return String(title || '').replace(/^P\d+\s*[-–—:]?\s*/i, '').trim();
}

function daysBetween(ymdA, ymdB) {
  const a = new Date(`${ymdA}T12:00:00`);
  const b = new Date(`${ymdB}T12:00:00`);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} today YYYY-MM-DD
 */
export function buildAvoidanceInsights(db, today) {
  const yesterday = addDaysYmd(today, -1);
  const weekAgo = addDaysYmd(today, -7);
  const items = [];

  const overdue = db.prepare(`
    SELECT id, title, date, priority, category
    FROM tasks
    WHERE status NOT IN ('completed', 'done', 'cancelled')
      AND category != 'ideias'
      AND date IS NOT NULL AND date < ?
    ORDER BY date ASC, priority DESC
    LIMIT 8
  `).all(today);

  for (const t of overdue) {
    const days = daysBetween(t.date, today);
    items.push({
      id: `task-overdue-${t.id}`,
      entity_id: t.id,
      type: 'task',
      title: cleanTitle(t.title),
      reason: `Atrasada há ${days} dia(s) (prevista ${t.date})`,
      severity: days >= 3 || t.priority === 'high' ? 'high' : 'medium',
      action: { label: 'Abrir em tarefas', href: '/habitos-tarefas?tab=tasks' },
    });
  }

  const floating = db.prepare(`
    SELECT id, title, priority, created_date
    FROM tasks
    WHERE status NOT IN ('completed', 'done', 'cancelled')
      AND category != 'ideias'
      AND date IS NULL
      AND substr(created_date, 1, 10) <= ?
    ORDER BY created_date ASC
    LIMIT 5
  `).all(weekAgo);

  for (const t of floating) {
    items.push({
      id: `task-floating-${t.id}`,
      entity_id: t.id,
      type: 'task',
      title: cleanTitle(t.title),
      reason: 'Sem data — fácil de empurrar para sempre',
      severity: t.priority === 'high' ? 'high' : 'medium',
      action: { label: 'Definir data', href: '/habitos-tarefas?tab=tasks' },
    });
  }

  const activeHabits = db.prepare("SELECT * FROM habits WHERE status = 'active'").all();
  const todayLogs = new Set(
    db.prepare('SELECT habit_id FROM habit_logs WHERE date = ? AND completed = 1').all(today).map((r) => r.habit_id),
  );
  const yesterdayLogs = new Set(
    db.prepare('SELECT habit_id FROM habit_logs WHERE date = ? AND completed = 1').all(yesterday).map((r) => r.habit_id),
  );

  for (const h of activeHabits) {
    const dueToday = isHabitDueOnDate(h, today);
    const dueYesterday = isHabitDueOnDate(h, yesterday);
    if (dueToday && dueYesterday && !todayLogs.has(h.id) && !yesterdayLogs.has(h.id)) {
      items.push({
        id: `habit-skip-${h.id}`,
        entity_id: h.id,
        type: 'habit',
        title: cleanTitle(h.title),
        reason: 'Devia rodar ontem e hoje — ainda sem check',
        severity: 'medium',
        action: { label: 'Marcar hábito', href: '/habitos-tarefas?tab=habits' },
      });
    }
  }

  const staleIdeas = db.prepare(`
    SELECT id, title, idea_status, updated_date
    FROM tasks
    WHERE category = 'ideias'
      AND idea_status IN ('capturada', 'promissora')
      AND substr(COALESCE(updated_date, created_date), 1, 10) <= ?
    ORDER BY updated_date ASC
    LIMIT 5
  `).all(weekAgo);

  for (const idea of staleIdeas) {
    items.push({
      id: `idea-stale-${idea.id}`,
      entity_id: idea.id,
      type: 'idea',
      title: cleanTitle(idea.title),
      reason: idea.idea_status === 'promissora'
        ? 'Promissora parada há mais de uma semana'
        : 'Ideia capturada sem revisão',
      severity: 'low',
      action: { label: 'Revisar ideias', href: '/ideias' },
    });
  }

  const failedCaptures = db.prepare(`
    SELECT COUNT(*) AS n FROM capture_queue WHERE status = 'failed'
  `).get();
  if (failedCaptures?.n > 0) {
    items.push({
      id: 'capture-failed',
      type: 'capture',
      title: `${failedCaptures.n} áudio(s) sem transcrição`,
      reason: 'STT falhou — vale retentar antes de gravar de novo',
      severity: 'medium',
      action: { label: 'Revisar capturas', href: '/capturas' },
    });
  }

  const pendingToday = db.prepare(`
    SELECT COUNT(*) AS n FROM tasks
    WHERE status NOT IN ('completed', 'done', 'cancelled')
      AND category != 'ideias'
      AND date = ?
  `).get(today).n;

  const focusToday = db.prepare(`
    SELECT COALESCE(SUM(duration_seconds), 0) AS sec FROM focus_sessions WHERE date = ?
  `).get(today);
  const focusSec = focusToday?.sec || 0;

  if (pendingToday >= 3 && focusSec < 15 * 60) {
    items.push({
      id: 'focus-gap',
      type: 'focus',
      title: 'Dia cheio de pendências, pouco foco',
      reason: `${pendingToday} tarefa(s) hoje e menos de 15 min de foco registrados`,
      severity: 'medium',
      action: { label: 'Modo foco', href: '/foco' },
    });
  }

  const wellnessToday = db.prepare('SELECT id FROM wellness_checks WHERE date = ? LIMIT 1').get(today);
  if (!wellnessToday && (pendingToday > 0 || overdue.length > 0)) {
    items.push({
      id: 'wellness-missing',
      type: 'wellness',
      title: 'Check-in de bem-estar',
      reason: 'Sem registro hoje — difícil calibrar energia vs. carga',
      severity: 'low',
      action: { label: 'No dashboard', href: '/' },
    });
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));

  const highCount = items.filter((i) => i.severity === 'high').length;
  const pressure = Math.min(100, highCount * 25 + items.length * 8);

  let headline = 'Nada gritando no radar — bom sinal.';
  if (items.length === 1) headline = '1 coisa pedindo atenção';
  else if (items.length > 1) headline = `${items.length} coisas que você pode estar empurrando`;

  const bullets = items.slice(0, 6).map((i) => `${i.title}: ${i.reason}`);

  return {
    today,
    pressure,
    headline,
    items: items.slice(0, 8),
    bullets,
    stats: {
      overdue_count: overdue.length,
      floating_count: floating.length,
      pending_today: pendingToday,
      focus_minutes: Math.round(focusSec / 60),
    },
  };
}

export function buildRuleBasedPraxiaMirror(avoidance) {
  const lines = [];
  if (!avoidance?.items?.length) {
    return {
      source: 'rules',
      lines: [
        'Pouco atrito visível hoje.',
        'Se ainda assim estiver pesado, nomeia uma única vitória de 15 min.',
        'PraxIA não decide por você — só espelha padrões.',
      ],
    };
  }
  const top = avoidance.items.slice(0, 3);
  lines.push(`Espelho: ${avoidance.headline}`);
  for (const it of top) {
    lines.push(`• ${it.title} — ${it.reason}`);
  }
  if (avoidance.stats?.overdue_count > 0) {
    lines.push('Padrão comum: tarefas com data passada costumam ser medo de fechar ou de errar — escolhe UMA para encerrar ou renegociar hoje.');
  } else if (avoidance.stats?.floating_count > 0) {
    lines.push('Padrão: sem data não há compromisso — coloca data em uma pendência ou arquiva.');
  } else {
    lines.push('Sugestão: pega o item de maior severidade e faz só o próximo passo físico (não o projeto inteiro).');
  }
  return { source: 'rules', lines: lines.slice(0, 5) };
}