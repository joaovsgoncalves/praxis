/**
 * O que o SQLite (via better-sqlite3) faz com um valor antes de gravá-lo, reproduzido em JS para
 * que outro motor grave exatamente o mesmo dado e a API devolva o mesmo envelope.
 *
 * Cobre só o subconjunto provado contra o SQLite real (`sqliteSemantics.test.mjs`): valores que
 * chegam de JSON (texto, número, booleano, null, lista, objeto) e `undefined`, nas afinidades
 * TEXT e INTEGER. Fora disso, recusa com `sqlite_coercion_unsupported` em vez de adivinhar.
 * ceiling: REAL/NUMERIC, BLOB, bigint e parâmetros nomeados entram quando um domínio precisar.
 */
import { StorageError } from './contract.js';

export const SQLITE_BIND_TYPE_MESSAGE = 'SQLite3 can only bind numbers, strings, bigints, buffers, and null';
const SPACE = '[ \\t\\n\\v\\f\\r]*';
const NUMERIC_TEXT = new RegExp(`^${SPACE}[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?${SPACE}$`);
const TRIM = new RegExp(`^${SPACE}|${SPACE}$`, 'g');

function unsupported(detail) {
  return new StorageError('sqlite_coercion_unsupported', `sqlite_coercion_unsupported: ${detail}`);
}

function isNamedBag(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scalar(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (typeof value === 'bigint' || ArrayBuffer.isView(value)) throw unsupported(typeof value);
  throw new TypeError(SQLITE_BIND_TYPE_MESSAGE);
}

/**
 * Lista posicional que o better-sqlite3 ligaria a um statement com `expected` marcadores `?`.
 * Lista de primeiro nível é achatada; objeto simples é o saco de parâmetros nomeados (ignorado em
 * statement só posicional); mesmos erros e mensagens do driver.
 */
export function bindPositional(args, expected) {
  if (!Array.isArray(args) || !Number.isInteger(expected) || expected < 0) throw new TypeError('bindPositional(args[], expected)');
  const out = [];
  let bag = false;
  // Na ordem: primeiro o tipo do valor, depois se ele passou da quantidade de marcadores.
  const push = (value) => {
    const bound = scalar(value);
    if (out.length >= expected) throw new RangeError('Too many parameter values were provided');
    out.push(bound);
  };
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const item of arg) {
        if (item !== null && typeof item === 'object' && !ArrayBuffer.isView(item)) throw new TypeError(SQLITE_BIND_TYPE_MESSAGE);
        push(item);
      }
    } else if (isNamedBag(arg)) {
      if (bag) throw new TypeError('You cannot specify named parameters in two different objects');
      bag = true;
    } else {
      push(arg);
    }
  }
  if (out.length < expected) throw new RangeError('Too few parameter values were provided');
  return out;
}

function significantDigits(text) {
  const mantissa = text.replace(/^[+-]/, '').split(/[eE]/)[0].replace('.', '').replace(/^0+/, '');
  return mantissa.replace(/0+$/, '').length || 1;
}

/** Valor que fica gravado e volta numa leitura, dado o valor ligado e a afinidade da coluna. */
export function applyAffinity(value, affinity) {
  if (value === null) return null;
  if (affinity === 'TEXT') {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (Math.abs(value) < 1e15) return `${Object.is(value, -0) ? 0 : value}.0`;
        throw unsupported(`inteiro ${value} em coluna TEXT`);
      }
      const text = String(value);
      if (Number.isFinite(value) && !/e/i.test(text) && Math.abs(value) >= 1e-4 && significantDigits(text) <= 15) return text;
      throw unsupported(`número ${text} em coluna TEXT`);
    }
  }
  if (affinity === 'INTEGER') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw unsupported(`número ${value} em coluna INTEGER`);
      if (Number.isInteger(value)) {
        if (!Number.isSafeInteger(value)) throw unsupported(`inteiro ${value} fora da faixa segura`);
        return value === 0 ? 0 : value;
      }
      return value;
    }
    if (typeof value === 'string') {
      if (!NUMERIC_TEXT.test(value)) return value;
      const trimmed = value.replace(TRIM, ''), number = Number(trimmed);
      if (!Number.isFinite(number)) throw unsupported(`texto numérico ${trimmed} sem representação finita`);
      if (Number.isInteger(number)) {
        if (!Number.isSafeInteger(number)) throw unsupported(`texto ${trimmed} fora da faixa segura`);
        return number === 0 ? 0 : number;
      }
      if (significantDigits(trimmed) > 15) throw unsupported(`texto ${trimmed} com mais de 15 dígitos`);
      return number;
    }
  }
  throw unsupported(`afinidade ${affinity} com ${typeof value}`);
}

/** Linha inteira: liga `args` como o driver ligaria e aplica a afinidade de cada coluna. */
export function sqliteRow(columns, args) {
  const bound = bindPositional(args, columns.length);
  return Object.fromEntries(columns.map(([name, affinity], index) => [name, applyAffinity(bound[index], affinity)]));
}

/** `LIMIT ?` com número JS: negativo = sem limite (null); fracionário/infinito = erro do SQLite. */
export function sqliteLimit(value) {
  if (typeof value !== 'number') throw unsupported(`LIMIT com ${typeof value}`);
  if (Number.isSafeInteger(value)) return value < 0 ? null : value;
  if (Number.isInteger(value) && Math.abs(value) < 2 ** 63) throw unsupported(`LIMIT ${value} fora da faixa segura`);
  const error = new Error('datatype mismatch');
  error.name = 'SqliteError';
  error.code = 'SQLITE_MISMATCH';
  throw error;
}

/**
 * Afinidade REAL (fase 5, finanças; oráculo em `sqliteSemantics.real.test.mjs`): número vira ponto
 * flutuante (-0 volta 0), texto numérico vira número, o resto do texto fica texto. Infinito, inteiro
 * fora da faixa segura e texto com mais de 15 dígitos significativos são recusados.
 */
export function applyRealAffinity(value) {
  if (value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw unsupported(`número ${value} em coluna REAL`);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw unsupported(`inteiro ${value} fora da faixa segura`);
    return value === 0 ? 0 : value;
  }
  if (typeof value === 'string') {
    if (!NUMERIC_TEXT.test(value)) return value;
    const trimmed = value.replace(TRIM, ''), number = Number(trimmed);
    if (!Number.isFinite(number)) throw unsupported(`texto numérico ${trimmed} sem representação finita`);
    if (significantDigits(trimmed) > 15) throw unsupported(`texto ${trimmed} com mais de 15 dígitos`);
    return number === 0 ? 0 : number;
  }
  throw unsupported(`afinidade REAL com ${typeof value}`);
}

/** Como `sqliteRow`, aceitando também colunas REAL. */
export function sqliteRowWithReal(columns, args) {
  const bound = bindPositional(args, columns.length);
  return Object.fromEntries(columns.map(([name, affinity], index) => [name,
    affinity === 'REAL' ? applyRealAffinity(bound[index]) : applyAffinity(bound[index], affinity)]));
}
