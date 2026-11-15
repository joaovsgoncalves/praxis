/**
 * Comparação de valores como o SQLite faz em ORDER BY/MAX com colação BINARY:
 * NULL < números < texto (bytes UTF-8). Usado por motores sem a mesma ordenação nativa.
 */
const rank = (value) => (value === null || value === undefined ? 0 : typeof value === 'number' ? 1 : 2);

export function compareSqlite(a, b) {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (ra === 1) return a < b ? -1 : a > b ? 1 : 0;
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** MAX() do SQLite: ignora NULL; sem valores, NULL. */
export function maxSqlite(values) {
  let best = null;
  for (const value of values) if (value !== null && value !== undefined && (best === null || compareSqlite(value, best) > 0)) best = value;
  return best;
}
