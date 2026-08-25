export const PROJECT_COLUMNS = ['radar', 'andando', 'no_ar', 'parado'];

export const PROJECT_COLUMN_LABELS = {
  radar: 'Radar',
  andando: 'Andando',
  no_ar: 'No ar',
  parado: 'Parado',
};

export const PROJECT_COLUMN_EMPTY = {
  radar: 'Nada no radar.',
  andando: 'Nada andando agora.',
  no_ar: 'Nada no ar.',
  parado: 'Nada parado.',
};

export function formatProjectMoveDate(value) {
  if (!value) return null;
  const key = String(value).slice(0, 10);
  const parts = key.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return `${d}/${m}`;
}
