/**
 * Gravação como o SQLite faria, para as rotas de rotina (fase 3). Ligação e afinidades TEXT/INTEGER
 * vêm de `storage/sqliteSemantics.js` (provadas contra o SQLite real). REAL fica no subconjunto
 * exato: número finito passa igual e NULL é NULL; texto em coluna REAL é recusado (o SQLite converteria
 * "7.5" em 7.5, regra não provada aqui). Nenhum consumidor real (tela, Alfred) manda texto nessas colunas.
 */
import { bindPositional, applyAffinity } from '../../storage/sqliteSemantics.js';
import { StorageError } from '../../storage/contract.js';

export const unsupported = (detail) => new StorageError('sqlite_coercion_unsupported', `sqlite_coercion_unsupported: ${detail}`);

/** Lista ou objeto que mudaria a posição dos parâmetros sem mudar a contagem. */
export function shifted(values) {
  return values.some((value) => (Array.isArray(value) && value.length !== 1) || (value && typeof value === 'object' && !Array.isArray(value)));
}

function real(value, name) {
  if (value === null) return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null; // o SQLite grava NaN como NULL
    if (!Number.isFinite(value)) throw unsupported(`${value} em coluna REAL ${name}`);
    return value;
  }
  throw unsupported(`${typeof value} em coluna REAL ${name}`);
}

/** `Number(COALESCE(MAX(coluna), -1) + 1 || 0)` do `nextSortOrder` do servidor, dado o `MAX` cru. */
export function nextSort(top) {
  if (top === null) return 0;
  if (typeof top !== 'number') throw unsupported(`MAX(sort_order) com ${typeof top}`);
  return Number(top + 1 || 0);
}

/**
 * Liga `args` como o better-sqlite3 ligaria a um statement de `columns.length` marcadores (mesmos
 * erros e mensagens), recusa deslocamento e aplica a afinidade de cada coluna [nome, afinidade].
 */
export function bindRow(columns, args) {
  const bound = bindPositional(args, columns.length);
  if (shifted(args)) throw unsupported('parâmetros deslocados por lista ou objeto');
  return Object.fromEntries(columns.map(([name, affinity], i) => [name, affinity === 'REAL' ? real(bound[i], name) : applyAffinity(bound[i], affinity)]));
}

/** Erro com o mesmo nome, código e mensagem do better-sqlite3 (o corpo do 500 sai igual). */
export function sqliteError(code, message) {
  const error = new Error(message);
  error.name = 'SqliteError';
  error.code = code;
  return error;
}

export const sqlStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
