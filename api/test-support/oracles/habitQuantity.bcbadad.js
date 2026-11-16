/**
 * ORÁCULO CONGELADO: cópia literal de `git show bcbadad:api/lib/habitQuantity.js` (só imports ajustados).
 * Não editar: é a referência da prova de paridade HTTP da fase 3.
 */
/**
 * Quantidade registrada num hábito (ex.: 0,5 L de 3 L).
 *
 * Valor ausente continua valendo (formato antigo: só `completed: true`, que o servidor
 * completa com a meta). Valor EXPLÍCITO precisa ser número de verdade: texto, NaN, infinito
 * ou negativo é recusado, em vez de virar "hábito feito".
 */
const MAX_QUANTITY = 1_000_000;
const absent = (raw) => raw === undefined || raw === null || raw === '';

function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  // Aceita "0.5" e também "0,5" (teclado brasileiro); nada de "1e3", "0x10" ou texto.
  const text = raw.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * @returns {{ value: number|null } | { error: string }}
 * value null = nenhuma quantidade informada.
 */
export function readHabitQuantity({ value, increment, currentValue }) {
  let result = null;

  if (!absent(value)) {
    const parsed = parseNumber(value);
    if (parsed === null) return { error: 'Quantidade inválida. Informe um número, como 0,5.' };
    if (parsed < 0) return { error: 'A quantidade não pode ser negativa.' };
    result = parsed;
  }

  if (!absent(increment)) {
    const step = parseNumber(increment);
    if (step === null) return { error: 'Quantidade inválida. Informe um número, como 0,5.' };
    const base = Number.isFinite(Number(currentValue)) && currentValue !== null ? Number(currentValue) : 0;
    result = round3(base + step);
    if (result < 0) return { error: 'A quantidade não pode ficar abaixo de zero.' };
  }

  if (result !== null && result > MAX_QUANTITY) return { error: 'Quantidade alta demais para um dia.' };
  return { value: result === null ? null : round3(result) };
}
