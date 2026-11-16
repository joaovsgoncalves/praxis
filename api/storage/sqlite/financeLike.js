import { StorageError } from '../contract.js';

/** Limite do SQLite para o tamanho (em bytes) do padrão de LIKE; acima disso ele recusa. */
export const SQLITE_LIKE_MAX_PATTERN = 50000;

const lower = (code) => (code >= 0x41 && code <= 0x5a ? code + 0x20 : code);

/**
 * `value LIKE pattern` do SQLite (sem ESCAPE, `case_sensitive_like` desligado): `%` = qualquer
 * sequência, `_` = qualquer caractere, minúsculas só nas letras ASCII (acento e emoji comparam
 * exatos), NULL em qualquer lado dá NULL (`null`). Usado pelo motor que não tem LIKE próprio; o
 * oráculo é o SQLite real (`financeLike.real.test.mjs`). Só texto e NULL: outro tipo é recusado.
 */
export function sqliteLike(value, pattern) {
  if (value === null || value === undefined || pattern === null || pattern === undefined) return null;
  if (typeof value !== 'string' || typeof pattern !== 'string') {
    throw new StorageError('sqlite_coercion_unsupported', 'sqlite_coercion_unsupported: LIKE só com texto');
  }
  if (Buffer.byteLength(pattern) > SQLITE_LIKE_MAX_PATTERN) {
    const error = new Error('LIKE or GLOB pattern too complex');
    error.name = 'SqliteError';
    error.code = 'SQLITE_ERROR';
    throw error;
  }
  const text = Array.from(value, (char) => char.codePointAt(0));
  const glob = Array.from(pattern, (char) => char.codePointAt(0));
  let i = 0, j = 0, star = -1, mark = 0;
  while (i < text.length) {
    if (j < glob.length && glob[j] === 0x25) { star = j; mark = i; j += 1; continue; }
    if (j < glob.length && (glob[j] === 0x5f || lower(glob[j]) === lower(text[i]))) { i += 1; j += 1; continue; }
    if (star === -1) return false;
    j = star + 1; mark += 1; i = mark;
  }
  while (j < glob.length && glob[j] === 0x25) j += 1;
  return j === glob.length;
}
