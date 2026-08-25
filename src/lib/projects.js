export const PROJECT_COLUMNS = ['andando', 'radar', 'aguardando', 'pausado'];

export const PROJECT_COLUMN_LABELS = {
  andando: 'Andando',
  radar: 'Radar',
  aguardando: 'Aguardando',
  pausado: 'Pausado',
};

export const PROJECT_COLUMN_EMPTY = {
  andando: 'Nada andando agora.',
  radar: 'Nada no radar.',
  aguardando: 'Nada aguardando.',
  pausado: 'Nada pausado.',
};

export const PROJECT_KIND_LABELS = {
  produto: 'Produto',
  cliente: 'Cliente',
  trabalho: 'Trabalho',
  estudo: 'Faculdade',
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

export function formatProjectUpdateDate(value) {
  if (!value) return '';
  const key = String(value).slice(0, 10);
  const [y, m, d] = key.split('-');
  if (!y || !m || !d) return key;
  return `${d}/${m}/${y}`;
}
