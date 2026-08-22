/**
 * Praxis Treinos V4 Core — Muscle vocabulary, CDN media helpers, and feature flags.
 * Isomorphic pure functions used across API and frontend.
 */

export const MUSCLES = [
  'trapezius',
  'deltoids',
  'chest',
  'upper-back',
  'serratus',
  'biceps',
  'triceps',
  'forearm',
  'abs',
  'obliques',
  'lower-back',
  'gluteal',
  'quadriceps',
  'hamstring',
  'adductors',
  'hip-flexors',
  'calves',
  'tibialis',
];

export const MUSCLE_LABEL_PT = {
  'trapezius': 'Trapézio',
  'deltoids': 'Deltoides',
  'chest': 'Peitoral',
  'upper-back': 'Dorsal',
  'serratus': 'Serrátil',
  'biceps': 'Bíceps',
  'triceps': 'Tríceps',
  'forearm': 'Antebraço',
  'abs': 'Abdômen',
  'obliques': 'Oblíquos',
  'lower-back': 'Lombar',
  'gluteal': 'Glúteos',
  'quadriceps': 'Quadríceps',
  'hamstring': 'Posteriores',
  'adductors': 'Adutores',
  'hip-flexors': 'Flexores de quadril',
  'calves': 'Panturrilhas',
  'tibialis': 'Tibial',
};

export const BODY_PART_LABEL_PT = {
  'chest': 'Peitoral',
  'back': 'Costas',
  'upper arms': 'Braços',
  'shoulders': 'Ombros',
  'upper legs': 'Pernas',
  'waist': 'Abdômen',
  'lower legs': 'Panturrilhas',
  'lower arms': 'Antebraço',
  'cardio': 'Cardio',
  'neck': 'Pescoço',
};

export const EQUIPMENT_LABEL_PT = {
  'body weight': 'Peso corporal',
  'dumbbell': 'Halteres',
  'barbell': 'Barra',
  'cable': 'Polia / Cabo',
  'leverage machine': 'Máquina',
  'band': 'Elástico',
  'smith machine': 'Smith',
  'kettlebell': 'Kettlebell',
  'weighted': 'Com carga',
  'stability ball': 'Bola suíça',
  'medicine ball': 'Medicine ball',
  'ez barbell': 'Barra W / EZ',
  'roller': 'Rolo de liberação',
  'wheel roller': 'Roda abdominal',
  'assisted': 'Assistido',
  'trap bar': 'Barra hexagonal',
  'rope': 'Corda',
  'bosu ball': 'Bosu',
};

const MUSCLE_ALIAS_MAP = {
  // trapezius
  'trapezius': 'trapezius',
  'traps': 'trapezius',
  'trap': 'trapezius',
  'neck': 'trapezius',
  'levator scapulae': 'trapezius',
  'sternocleidomastoid': 'trapezius',

  // deltoids
  'deltoids': 'deltoids',
  'deltoid': 'deltoids',
  'delts': 'deltoids',
  'delt': 'deltoids',
  'shoulders': 'deltoids',
  'shoulder': 'deltoids',
  'rear deltoids': 'deltoids',
  'rear delts': 'deltoids',
  'front delts': 'deltoids',
  'side delts': 'deltoids',
  'lateral delts': 'deltoids',
  'rotator cuff': 'deltoids',

  // chest
  'chest': 'chest',
  'pectorals': 'chest',
  'pectoral': 'chest',
  'pecs': 'chest',
  'pec': 'chest',
  'upper chest': 'chest',
  'lower chest': 'chest',

  // upper-back
  'upper-back': 'upper-back',
  'upper back': 'upper-back',
  'upperback': 'upper-back',
  'lats': 'upper-back',
  'lat': 'upper-back',
  'latissimus dorsi': 'upper-back',
  'rhomboids': 'upper-back',
  'rhomboid': 'upper-back',
  'back': 'upper-back',
  'middle back': 'upper-back',

  // serratus
  'serratus': 'serratus',
  'serratus anterior': 'serratus',

  // biceps
  'biceps': 'biceps',
  'bicep': 'biceps',
  'brachialis': 'biceps',

  // triceps
  'triceps': 'triceps',
  'tricep': 'triceps',

  // forearm
  'forearm': 'forearm',
  'forearms': 'forearm',
  'lower arms': 'forearm',
  'lower arm': 'forearm',
  'wrist flexors': 'forearm',
  'wrist extensors': 'forearm',
  'wrists': 'forearm',
  'wrist': 'forearm',
  'grip muscles': 'forearm',
  'grip': 'forearm',
  'hands': 'forearm',
  'hand': 'forearm',

  // abs
  'abs': 'abs',
  'abdominals': 'abs',
  'abdominal': 'abs',
  'core': 'abs',
  'lower abs': 'abs',
  'upper abs': 'abs',
  'waist': 'abs',

  // obliques
  'obliques': 'obliques',
  'oblique': 'obliques',
  'side abs': 'obliques',

  // lower-back
  'lower-back': 'lower-back',
  'lower back': 'lower-back',
  'lowerback': 'lower-back',
  'spine': 'lower-back',
  'erector spinae': 'lower-back',

  // gluteal
  'gluteal': 'gluteal',
  'glutes': 'gluteal',
  'glute': 'gluteal',
  'gluteus': 'gluteal',
  'gluteus maximus': 'gluteal',
  'gluteus medius': 'gluteal',
  'buttocks': 'gluteal',
  'abductors': 'gluteal',
  'abductor': 'gluteal',
  'hips': 'gluteal',
  'hip': 'gluteal',

  // quadriceps
  'quadriceps': 'quadriceps',
  'quads': 'quadriceps',
  'quad': 'quadriceps',
  'upper legs': 'quadriceps',
  'thighs': 'quadriceps',
  'thigh': 'quadriceps',

  // hamstring
  'hamstring': 'hamstring',
  'hamstrings': 'hamstring',
  'rear thighs': 'hamstring',
  'biceps femoris': 'hamstring',

  // adductors
  'adductors': 'adductors',
  'adductor': 'adductors',
  'groin': 'adductors',
  'inner thighs': 'adductors',
  'inner thigh': 'adductors',

  // hip-flexors
  'hip-flexors': 'hip-flexors',
  'hip flexors': 'hip-flexors',
  'hip flexor': 'hip-flexors',
  'iliopsoas': 'hip-flexors',
  'psoas': 'hip-flexors',

  // calves
  'calves': 'calves',
  'calf': 'calves',
  'gastrocnemius': 'calves',
  'soleus': 'calves',
  'lower legs': 'calves',
  'lower leg': 'calves',
  'ankles': 'calves',
  'ankle': 'calves',
  'ankle stabilizers': 'calves',
  'feet': 'calves',
  'foot': 'calves',

  // tibialis
  'tibialis': 'tibialis',
  'tibialis anterior': 'tibialis',
  'shins': 'tibialis',
  'shin': 'tibialis',
};

export function aliasMuscle(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (!normalized) return null;

  if (MUSCLE_ALIAS_MAP[normalized]) {
    return MUSCLE_ALIAS_MAP[normalized];
  }

  const hyphenated = normalized.replace(/\s+/g, '-');
  if (MUSCLE_ALIAS_MAP[hyphenated]) {
    return MUSCLE_ALIAS_MAP[hyphenated];
  }

  return null;
}

export const CDN_IMG_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/images/';
export const CDN_GIF_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/videos/';
export const MEDIA_ATTRIBUTION = '© Gym visual — https://gymvisual.com/';

function cleanMediaPath(raw, prefix) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  let path = trimmed.replace(/^\/+/, '');
  if (path.toLowerCase().startsWith('images/')) {
    path = path.slice('images/'.length);
  } else if (path.toLowerCase().startsWith('videos/')) {
    path = path.slice('videos/'.length);
  }
  path = path.replace(/^\/+/, '');
  if (!path) return null;

  return prefix + path;
}

export function thumbUrl(exerciseOrPath) {
  if (!exerciseOrPath) return null;
  if (typeof exerciseOrPath === 'string') {
    return cleanMediaPath(exerciseOrPath, CDN_IMG_BASE);
  }
  const raw = exerciseOrPath.thumb_path || exerciseOrPath.image || exerciseOrPath.thumbUrl || null;
  return cleanMediaPath(raw, CDN_IMG_BASE);
}

export function gifUrl(exerciseOrPath) {
  if (!exerciseOrPath) return null;
  if (typeof exerciseOrPath === 'string') {
    return cleanMediaPath(exerciseOrPath, CDN_GIF_BASE);
  }
  const raw = exerciseOrPath.gif_path || exerciseOrPath.gif_url || exerciseOrPath.gifUrl || null;
  return cleanMediaPath(raw, CDN_GIF_BASE);
}

export function isTreinosV4Enabled(envOverride) {
  const envSource =
    envOverride !== undefined
      ? envOverride
      : typeof import.meta !== 'undefined' && import.meta.env
        ? import.meta.env
        : typeof process !== 'undefined' && process.env
          ? process.env
          : {};

  const val = envSource?.VITE_TREINOS_V4;
  return val === '1' || val === 'true' || val === true;
}

export function formatBodyPart(bodyPart) {
  if (!bodyPart || typeof bodyPart !== 'string') return null;
  const key = bodyPart.trim().toLowerCase();
  return BODY_PART_LABEL_PT[key] || bodyPart;
}

export function formatEquipment(equipment) {
  if (!equipment || typeof equipment !== 'string') return null;
  const key = equipment.trim().toLowerCase();
  return EQUIPMENT_LABEL_PT[key] || equipment;
}

export function formatMuscleName(muscle) {
  if (!muscle || typeof muscle !== 'string') return null;
  const canonical = aliasMuscle(muscle);
  if (canonical && MUSCLE_LABEL_PT[canonical]) {
    return MUSCLE_LABEL_PT[canonical];
  }
  return muscle;
}

export function extractInstructionSteps(exercise) {
  if (!exercise) return [];

  if (exercise.instructions_json) {
    try {
      const parsed =
        typeof exercise.instructions_json === 'string'
          ? JSON.parse(exercise.instructions_json)
          : exercise.instructions_json;

      if (parsed) {
        if (Array.isArray(parsed.pt) && parsed.pt.length > 0) {
          return parsed.pt;
        }
        if (Array.isArray(parsed.en) && parsed.en.length > 0) {
          return parsed.en;
        }
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fall through to plain text
    }
  }

  if (exercise.instructions && typeof exercise.instructions === 'string') {
    const raw = exercise.instructions.trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // Fall through
      }
    }
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) return lines;
  }

  return [];
}

export function extractSecondaryMuscles(exercise) {
  if (!exercise) return [];
  const raw = exercise.secondary_muscles_json || exercise.secondary_muscles;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function isWarmupSet(set) {
  return set?.set_role === "warmup";
}

export function isWakeLockSupported(navigatorOverride) {
  const nav =
    navigatorOverride !== undefined
      ? navigatorOverride
      : typeof navigator !== "undefined"
        ? navigator
        : undefined;

  return Boolean(nav && "wakeLock" in nav && typeof nav.wakeLock?.request === "function");
}

export function detectPersonalRecord(candidateSet, previousHistoricalSets = []) {
  if (!candidateSet) return { is_pr: false, pr_type: null, reason: null };
  if (candidateSet.set_role === "warmup" || isWarmupSet(candidateSet)) {
    return { is_pr: false, pr_type: null, reason: null };
  }

  const workHistory = (previousHistoricalSets || []).filter((s) => {
    if (!s) return false;
    if (s.id && candidateSet.id && s.id === candidateSet.id) return false;
    if (s.set_role === "warmup") return false;
    return true;
  });

  if (workHistory.length === 0) {
    return { is_pr: false, pr_type: null, reason: null };
  }

  const weight =
    candidateSet.weight_kg != null && Number.isFinite(Number(candidateSet.weight_kg))
      ? Number(candidateSet.weight_kg)
      : null;
  const reps =
    candidateSet.reps != null && Number.isFinite(Number(candidateSet.reps))
      ? Number(candidateSet.reps)
      : null;
  const duration =
    candidateSet.duration_seconds != null && Number.isFinite(Number(candidateSet.duration_seconds))
      ? Number(candidateSet.duration_seconds)
      : null;
  const distance =
    candidateSet.distance_m != null && Number.isFinite(Number(candidateSet.distance_m))
      ? Number(candidateSet.distance_m)
      : null;

  if (weight != null && weight > 0) {
    let maxPrevWeight = 0;
    for (const s of workHistory) {
      const w = Number(s.weight_kg);
      if (Number.isFinite(w) && w > maxPrevWeight) {
        maxPrevWeight = w;
      }
    }

    if (weight > maxPrevWeight) {
      return {
        is_pr: true,
        pr_type: "weight",
        reason:
          maxPrevWeight > 0
            ? `Superou a carga anterior de ${maxPrevWeight} kg`
            : `Nova carga máxima: ${weight} kg`,
      };
    }

    if (weight === maxPrevWeight && reps != null && reps > 0) {
      const setsAtMaxWeight = workHistory.filter((s) => Number(s.weight_kg) === weight);
      let maxRepsAtWeight = 0;
      for (const s of setsAtMaxWeight) {
        const r = Number(s.reps);
        if (Number.isFinite(r) && r > maxRepsAtWeight) {
          maxRepsAtWeight = r;
        }
      }

      if (reps > maxRepsAtWeight) {
        return {
          is_pr: true,
          pr_type: "reps",
          reason:
            maxRepsAtWeight > 0
              ? `Superou ${maxRepsAtWeight} reps com ${weight} kg`
              : `${reps} reps com ${weight} kg`,
        };
      }
    }

    return { is_pr: false, pr_type: null, reason: null };
  }

  if (reps != null && reps > 0) {
    let maxPrevReps = 0;
    for (const s of workHistory) {
      const r = Number(s.reps);
      if (Number.isFinite(r) && r > maxPrevReps) {
        maxPrevReps = r;
      }
    }

    if (reps > maxPrevReps) {
      return {
        is_pr: true,
        pr_type: "reps",
        reason:
          maxPrevReps > 0
            ? `Superou o recorde anterior de ${maxPrevReps} reps`
            : `Novo recorde: ${reps} reps`,
      };
    }

    return { is_pr: false, pr_type: null, reason: null };
  }

  if (duration != null && duration > 0 && (distance == null || distance <= 0)) {
    let maxPrevDuration = 0;
    for (const s of workHistory) {
      const d = Number(s.duration_seconds);
      if (Number.isFinite(d) && d > maxPrevDuration) {
        maxPrevDuration = d;
      }
    }

    if (duration > maxPrevDuration) {
      return {
        is_pr: true,
        pr_type: "duration",
        reason:
          maxPrevDuration > 0
            ? `Superou a duração anterior de ${maxPrevDuration}s`
            : `Novo recorde de duração: ${duration}s`,
      };
    }

    return { is_pr: false, pr_type: null, reason: null };
  }

  if (distance != null && distance > 0) {
    let maxPrevDistance = 0;
    for (const s of workHistory) {
      const dist = Number(s.distance_m);
      if (Number.isFinite(dist) && dist > maxPrevDistance) {
        maxPrevDistance = dist;
      }
    }

    if (distance > maxPrevDistance) {
      return {
        is_pr: true,
        pr_type: "distance",
        reason:
          maxPrevDistance > 0
            ? `Superou a distância anterior de ${maxPrevDistance}m`
            : `Novo recorde de distância: ${distance}m`,
      };
    }

    if (distance === maxPrevDistance && duration != null && duration > 0) {
      const setsAtDistance = workHistory.filter((s) => Number(s.distance_m) === distance);
      let minDurationAtDist = Infinity;
      for (const s of setsAtDistance) {
        const d = Number(s.duration_seconds);
        if (Number.isFinite(d) && d > 0 && d < minDurationAtDist) {
          minDurationAtDist = d;
        }
      }

      if (minDurationAtDist < Infinity && duration < minDurationAtDist) {
        return {
          is_pr: true,
          pr_type: "duration",
          reason: `Completou ${distance}m mais rápido: ${duration}s (era ${minDurationAtDist}s)`,
        };
      }
    }

    return { is_pr: false, pr_type: null, reason: null };
  }

  return { is_pr: false, pr_type: null, reason: null };
}

export function formatPrToastDescription(set, exercise = {}) {
  const name = exercise?.exercise_name_snapshot || exercise?.name || "Exercício";
  if (!set) return `${name}: Novo recorde!`;

  if (
    set.pr_type === "weight" ||
    (set.weight_kg != null && Number(set.weight_kg) > 0 && !set.pr_type)
  ) {
    const weightStr = `${Number(set.weight_kg).toLocaleString("pt-BR")} kg`;
    const repsStr =
      set.reps != null && Number(set.reps) > 0 ? ` (${set.reps} reps)` : "";
    return `${name}: ${weightStr}${repsStr}`;
  }

  if (set.pr_type === "reps" || (set.reps != null && Number(set.reps) > 0)) {
    const weightStr =
      set.weight_kg != null && Number(set.weight_kg) > 0
        ? ` com ${Number(set.weight_kg).toLocaleString("pt-BR")} kg`
        : "";
    return `${name}: ${set.reps} reps${weightStr}`;
  }

  if (
    set.pr_type === "duration" ||
    (set.duration_seconds != null && Number(set.duration_seconds) > 0)
  ) {
    return `${name}: ${set.duration_seconds}s`;
  }

  if (
    set.pr_type === "distance" ||
    (set.distance_m != null && Number(set.distance_m) > 0)
  ) {
    return `${name}: ${set.distance_m} m`;
  }

  return `${name}: Novo recorde!`;
}

export const EMPTY_SET_FORM = {
  weight_kg: "",
  reps: "",
  duration_seconds: "",
  distance_m: "",
  band_level: "",
  set_role: "work",
  rir: "",
  technical_quality: "",
  note: "",
};

export function getWorkSets(sets = []) {
  if (!Array.isArray(sets)) return [];
  return sets.filter((set) => !isWarmupSet(set));
}

export function getWarmupSets(sets = []) {
  if (!Array.isArray(sets)) return [];
  return sets.filter((set) => isWarmupSet(set));
}

export function getLastWorkSet(sets = []) {
  const work = getWorkSets(sets);
  return work.length > 0 ? work[work.length - 1] : null;
}

export function getLastWarmupSet(sets = []) {
  const warmup = getWarmupSets(sets);
  return warmup.length > 0 ? warmup[warmup.length - 1] : null;
}

export function cascadeWeightToUnfilledSlots(exercise, newWeight) {
  if (!exercise) return [];
  const targetSets = Math.max(1, Number(exercise.target_sets || 1));
  const workDone = getWorkSets(exercise.sets).length;
  const remaining = Math.max(0, targetSets - workDone);
  return Array.from({ length: remaining }, (_, i) => ({
    slot_index: workDone + i,
    suggested_weight_kg: newWeight,
  }));
}

export function computeSetPrefill(exercise, role = "work", options = {}) {
  const { cascadeWeight = true, targetSlotIndex } = options;
  const targetRole = role === "warmup" ? "warmup" : "work";
  const currentSets = exercise?.sets || [];
  const currentWorkSets = getWorkSets(currentSets);
  const currentWarmupSets = getWarmupSets(currentSets);
  const previousSets = exercise?.previous_sets || [];
  const previousWorkSets = getWorkSets(previousSets);
  const previousWarmupSets = getWarmupSets(previousSets);

  if (targetRole === "warmup") {
    const lastWarmup = currentWarmupSets.length > 0
      ? currentWarmupSets[currentWarmupSets.length - 1]
      : (previousWarmupSets.length > 0 ? previousWarmupSets[0] : null);

    return {
      ...EMPTY_SET_FORM,
      weight_kg: lastWarmup?.weight_kg != null ? lastWarmup.weight_kg : "",
      reps: lastWarmup?.reps != null ? lastWarmup.reps : "",
      duration_seconds: lastWarmup?.duration_seconds != null
        ? lastWarmup.duration_seconds
        : (exercise?.target_duration_seconds ?? ""),
      distance_m: lastWarmup?.distance_m != null ? lastWarmup.distance_m : "",
      band_level: lastWarmup?.band_level != null ? lastWarmup.band_level : "",
      set_role: "warmup",
      rir: "",
      technical_quality: "",
      note: "",
    };
  }

  if (currentWorkSets.length > 0) {
    const lastWork = currentWorkSets[currentWorkSets.length - 1];
    return {
      ...EMPTY_SET_FORM,
      weight_kg: lastWork.weight_kg != null ? lastWork.weight_kg : "",
      reps: lastWork.reps != null ? lastWork.reps : "",
      duration_seconds: lastWork.duration_seconds != null
        ? lastWork.duration_seconds
        : (exercise?.target_duration_seconds ?? ""),
      distance_m: lastWork.distance_m != null ? lastWork.distance_m : "",
      band_level: lastWork.band_level != null ? lastWork.band_level : "",
      set_role: "work",
      rir: lastWork.rir != null ? String(lastWork.rir) : "",
      technical_quality: "",
      note: "",
    };
  }

  if (previousWorkSets.length > 0) {
    const slotIdx = typeof targetSlotIndex === "number" ? targetSlotIndex : 0;
    const prevWork = previousWorkSets[slotIdx] || previousWorkSets[previousWorkSets.length - 1];
    return {
      ...EMPTY_SET_FORM,
      weight_kg: prevWork.weight_kg != null ? prevWork.weight_kg : "",
      reps: prevWork.reps != null ? prevWork.reps : "",
      duration_seconds: prevWork.duration_seconds != null
        ? prevWork.duration_seconds
        : (exercise?.target_duration_seconds ?? ""),
      distance_m: prevWork.distance_m != null ? prevWork.distance_m : "",
      band_level: prevWork.band_level != null ? prevWork.band_level : "",
      set_role: "work",
      rir: prevWork.rir != null ? String(prevWork.rir) : "",
      technical_quality: "",
      note: "",
    };
  }

  return {
    ...EMPTY_SET_FORM,
    weight_kg: "",
    reps: "",
    duration_seconds: exercise?.target_duration_seconds ?? "",
    distance_m: "",
    band_level: "",
    set_role: "work",
    rir: "",
    technical_quality: "",
    note: "",
  };
}
