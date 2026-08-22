/**
 * Praxis Treinos V4 — Muscle Map Balance (Fase 9)
 *
 * Computes work-set volume aggregated by canonical muscle over a time window.
 */
import {
  MUSCLES,
  MUSCLE_LABEL_PT,
  aliasMuscle,
  extractSecondaryMuscles,
} from './muscles.js';
import { isWarmupSet } from './pr.js';

/**
 * Aggregates work-set volume by canonical muscle over a time window.
 *
 * @param {Array<Object>} setsWithExerciseMeta List of completed set records with exercise metadata.
 * @param {Object} [options] Configuration options ({ days, now, mode }).
 * @returns {Object} Muscle balance map payload.
 */
export function computeBalanceMap(setsWithExerciseMeta = [], options = {}) {
  const {
    days = 14,
    now = new Date(),
    mode = 'balance',
  } = options || {};

  const numDays = Math.max(1, Number(days) || 14);
  const nowMs =
    typeof now === 'number'
      ? now
      : typeof now === 'string'
        ? new Date(now).getTime()
        : now instanceof Date
          ? now.getTime()
          : Date.now();

  const fromMs = nowMs - numDays * 24 * 60 * 60 * 1000;
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(nowMs).toISOString();

  // Initialize accumulator for all 18 canonical muscles
  const rawAccumulator = {};
  for (const m of MUSCLES) {
    rawAccumulator[m] = 0;
  }

  if (Array.isArray(setsWithExerciseMeta)) {
    for (const set of setsWithExerciseMeta) {
      if (!set) continue;

      // Exclude warmup sets
      if (set.set_role === 'warmup' || isWarmupSet(set)) {
        continue;
      }

      // Exclude abandoned or incomplete sessions if session status is provided
      if (set.session_status && set.session_status !== 'completed') {
        continue;
      }

      // Check date window if set or session has a timestamp
      const setDateStr =
        set.session_completed_at ||
        set.completed_at ||
        set.session_started_at ||
        set.started_at ||
        set.created_at ||
        null;

      if (setDateStr) {
        const setMs = new Date(setDateStr).getTime();
        if (Number.isFinite(setMs)) {
          if (setMs < fromMs || setMs > nowMs) {
            continue;
          }
        }
      }

      // Primary muscle resolution: target_muscle -> muscle_group -> body_part
      const primaryCandidate =
        set.target_muscle ||
        set.muscle_group ||
        set.body_part ||
        set.exercise_target_muscle ||
        set.exercise_muscle_group ||
        set.exercise_body_part ||
        null;

      const primaryCanonical = aliasMuscle(primaryCandidate);

      if (primaryCanonical && rawAccumulator[primaryCanonical] !== undefined) {
        rawAccumulator[primaryCanonical] += 1.0;
      }

      // Secondary muscles resolution: each secondary contributes 0.4
      const secondaries = extractSecondaryMuscles(set);
      if (Array.isArray(secondaries) && secondaries.length > 0) {
        const seenInThisSet = new Set();
        if (primaryCanonical) {
          seenInThisSet.add(primaryCanonical);
        }

        for (const sec of secondaries) {
          const secCanonical = aliasMuscle(sec);
          if (
            secCanonical &&
            rawAccumulator[secCanonical] !== undefined &&
            !seenInThisSet.has(secCanonical)
          ) {
            rawAccumulator[secCanonical] += 0.4;
            seenInThisSet.add(secCanonical);
          }
        }
      }
    }
  }

  // Round raw volumes to 1 decimal place and determine max volume
  let maxRaw = 0;
  for (const m of MUSCLES) {
    const rounded = Math.round(rawAccumulator[m] * 10) / 10;
    rawAccumulator[m] = rounded;
    if (rounded > maxRaw) {
      maxRaw = rounded;
    }
  }

  // Format muscles array in canonical order
  const muscles = MUSCLES.map((id) => {
    const raw = rawAccumulator[id] || 0;
    const score = maxRaw > 0 ? Math.round((raw / maxRaw) * 100) / 100 : 0;
    return {
      id,
      label: MUSCLE_LABEL_PT[id] || id,
      score,
      raw,
      unit: 'sets',
    };
  });

  // Calculate ranked lists
  const mostTrained = muscles
    .filter((m) => m.raw > 0)
    .sort((a, b) => b.raw - a.raw || MUSCLES.indexOf(a.id) - MUSCLES.indexOf(b.id))
    .map((m) => m.id);

  const leastTrained = [...muscles]
    .sort((a, b) => a.raw - b.raw || MUSCLES.indexOf(a.id) - MUSCLES.indexOf(b.id))
    .map((m) => m.id);

  return {
    mode: mode || 'balance',
    days: numDays,
    muscles,
    window: {
      from: fromIso,
      to: toIso,
    },
    ranked: {
      most: mostTrained,
      least: leastTrained,
    },
  };
}
