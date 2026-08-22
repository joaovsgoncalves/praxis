/**
 * Praxis Treinos V4 — Muscle Vocabulary & Aliasing
 *
 * Defines the canonical 18-muscle anatomy (head-to-toe) and normalizes
 * dataset / raw input strings into canonical muscle identifiers.
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
