/** Nutrição — labels e helpers de UI (fase 0) */

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];

export const MEAL_SLOT_LABELS = {
  breakfast: 'Café',
  lunch: 'Almoço',
  snack: 'Lanche',
  dinner: 'Jantar',
  other: 'Outro',
};

/** Cores fixas p/ barras (fase 4 reutiliza) */
export const MACRO_COLORS = {
  kcal: 'bg-primary',
  protein: 'bg-blue-500/80',
  carbs: 'bg-amber-500/80',
  fat: 'bg-violet-500/80',
};

export function formatKcal(n) {
  const v = Math.round(Number(n) || 0);
  return `${v.toLocaleString('pt-BR')} kcal`;
}

export function formatGrams(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  const text = Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR');
  return `${text} g`;
}

export function isNutritionEnabled(settings) {
  if (!settings) return true;
  const flag = settings.nutrition_enabled;
  if (flag === 0 || flag === false || flag === '0') return false;
  return true;
}

export function isNutritionShowOnToday(settings) {
  if (!settings) return true;
  const flag = settings.nutrition_show_on_today;
  if (flag === 0 || flag === false || flag === '0') return false;
  return true;
}
