/** Pilha de cartões no desktop — lógica pura (sem imports, testada em api/finance.wallet.test.mjs). */

export const STACK_CARD_WIDTH = 288;
export const STACK_MAX_VISIBLE = 4;
export const STACK_MIN_STEP = 56;
export const STACK_MAX_STEP = 96;

/** Quantos cartões cabem com fatia de pelo menos minStep px (nunca mais que max, nunca menos que 1). */
export function stackVisibleCount(
  width,
  total,
  { cardWidth = STACK_CARD_WIDTH, minStep = STACK_MIN_STEP, max = STACK_MAX_VISIBLE } = {},
) {
  if (total <= 0) return 0;
  const fit = 1 + Math.floor(Math.max(0, width - cardWidth) / minStep);
  return Math.max(1, Math.min(max, total, fit));
}

/** Largura da fatia de cada cartão de trás. */
export function stackStep(width, count, { cardWidth = STACK_CARD_WIDTH, maxStep = STACK_MAX_STEP } = {}) {
  if (count <= 1) return 0;
  return Math.max(0, Math.min(maxStep, (width - cardWidth) / (count - 1)));
}

/**
 * Índices visíveis, da fatia mais ao fundo (esquerda) até o ativo (frente, direita).
 * Atrás do ativo ficam os próximos da lista, em ciclo: "›" traz a fatia vizinha.
 */
export function stackWindow(total, activeIndex, count = STACK_MAX_VISIBLE) {
  if (total <= 0 || count <= 0) return [];
  const n = Math.min(count, total);
  const active = ((activeIndex % total) + total) % total;
  return Array.from({ length: n }, (_, k) => (active + n - 1 - k) % total);
}

/** Próximo índice ao navegar (‹ = -1, › = +1), em ciclo. */
export function stackStepIndex(total, activeIndex, delta) {
  if (total <= 0) return 0;
  return (((activeIndex + delta) % total) + total) % total;
}
