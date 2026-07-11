export const WORKOUT_TRACKING_TYPES = [
  { value: 'reps', label: 'Repetições' },
  { value: 'weight_reps', label: 'Carga + repetições' },
  { value: 'duration', label: 'Tempo / isometria' },
  { value: 'distance', label: 'Distância' },
  { value: 'distance_duration', label: 'Distância + tempo' },
];

export const WORKOUT_CATEGORIES = [
  { value: 'strength', label: 'Musculação' },
  { value: 'calisthenics', label: 'Calistenia' },
  { value: 'skill', label: 'Skill' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobilidade' },
  { value: 'other', label: 'Outro' },
];

export const TRACKING_LABELS = Object.fromEntries(WORKOUT_TRACKING_TYPES.map((item) => [item.value, item.label]));
export const WORKOUT_CATEGORY_LABELS = Object.fromEntries(WORKOUT_CATEGORIES.map((item) => [item.value, item.label]));

export function formatSeconds(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (total < 60) return `${Math.round(total)}s`;
  const min = Math.floor(total / 60);
  const sec = Math.round(total % 60);
  return sec ? `${min}min ${sec}s` : `${min}min`;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatWorkoutTarget(item = {}) {
  const sets = Number(item.target_sets) || 0;
  const tracking = item.tracking_type || 'reps';
  let target = '';

  if (tracking === 'duration') {
    target = item.target_duration_seconds ? formatSeconds(item.target_duration_seconds) : 'tempo livre';
  } else if (tracking === 'distance') {
    target = item.target_distance_m ? formatDistance(item.target_distance_m) : 'distância livre';
  } else if (tracking === 'distance_duration') {
    target = item.target_duration_seconds ? formatSeconds(item.target_duration_seconds) : 'distância + tempo';
  } else if (item.rep_min != null && item.rep_max != null) {
    target = item.rep_min === item.rep_max ? `${item.rep_min} reps` : `${item.rep_min}–${item.rep_max} reps`;
  } else if (item.rep_min != null) {
    target = `${item.rep_min}+ reps`;
  } else if (item.rep_max != null) {
    target = `até ${item.rep_max} reps`;
  } else {
    target = 'reps livres';
  }

  return `${sets || 1} ${sets === 1 ? 'série' : 'séries'} · ${target}`;
}

export function formatDistance(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} km`;
  return `${Math.round(value)} m`;
}

export function formatSetResult(set = {}, trackingType = 'reps') {
  const parts = [];
  if (trackingType === 'weight_reps') {
    if (set.weight_kg != null) parts.push(`${Number(set.weight_kg).toLocaleString('pt-BR')} kg`);
    if (set.reps != null) parts.push(`${set.reps} rep${Number(set.reps) === 1 ? '' : 's'}`);
  } else if (trackingType === 'duration') {
    if (set.duration_seconds != null) parts.push(formatSeconds(set.duration_seconds));
  } else if (trackingType === 'distance') {
    if (set.distance_m != null) parts.push(formatDistance(set.distance_m));
  } else if (trackingType === 'distance_duration') {
    if (set.distance_m != null) parts.push(formatDistance(set.distance_m));
    if (set.duration_seconds != null) parts.push(formatSeconds(set.duration_seconds));
  } else if (set.reps != null) {
    parts.push(`${set.reps} rep${Number(set.reps) === 1 ? '' : 's'}`);
  }
  return parts.join(' · ') || '—';
}

export function formatSessionDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '—';
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function workoutDateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function workoutDayShortLabel(day = {}) {
  if (day.day_type === 'rest') return 'Descanso';
  const count = Number(day.exercise_count ?? day.exercises?.length ?? 0);
  const duration = day.estimated_duration_minutes ? ` · ~${day.estimated_duration_minutes} min` : '';
  return `${count} ${count === 1 ? 'exercício' : 'exercícios'}${duration}`;
}
