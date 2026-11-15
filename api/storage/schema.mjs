import { createHash } from 'node:crypto';
import { StorageError, recordId } from './contract.js';

/** Literal legacy keys stay in row.id. Reserved/path keys receive collision-free encoding.
 * Oversized encoded keys use a digest locator; row.id is the reversible manifest.
 */
export function documentId(raw) {
  recordId(raw);
  const unsafe=raw.startsWith('~')||raw.includes('/')||raw==='.'||raw==='..'||/^__.*__$/.test(raw)||/[\x00-\x1f\x7f]/.test(raw);
  if(!unsafe)return raw;
  const encoded='~b'+Buffer.from(raw,'utf8').toString('base64url');
  return Buffer.byteLength(encoded)<=1500?encoded:'~h'+createHash('sha256').update(raw,'utf8').digest('hex');
}
export function originalId(pathId, storedId) {
  if(typeof storedId!=='string'||documentId(storedId)!==pathId)throw new StorageError('record_identity_mismatch');
  return storedId;
}

/** No implicit financial rounding. Only binary representation noise is tolerated. */
export function moneyToCents(value) {
  if(typeof value==='number') {
    if(!Number.isFinite(value))throw new StorageError('invalid_money');
    // Parse the JSON-visible decimal first; multiplying a large float can silently gain a cent.
    const decimal=String(value);
    if(/^-?\d+(?:\.\d{1,2})?$/.test(decimal))return moneyToCents(decimal);
    const scaled=value*100, nearest=Math.round(scaled);
    const tolerance=Math.min(1e-7,Number.EPSILON*Math.max(1,Math.abs(scaled))*8);
    if(!Number.isSafeInteger(nearest)||Math.abs(scaled-nearest)>tolerance)throw new StorageError('fractional_cent_or_overflow');
    return Object.is(nearest,-0)?0:nearest;
  }
  if(typeof value!=='string'||! /^-?\d+(?:\.\d{1,2})?$/.test(value))throw new StorageError('invalid_money');
  const negative=value.startsWith('-'), [whole,fraction='']=value.replace(/^-/,'').split('.');
  const cents=(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))*(negative?-1n:1n);
  if(cents>BigInt(Number.MAX_SAFE_INTEGER)||cents<BigInt(Number.MIN_SAFE_INTEGER))throw new StorageError('fractional_cent_or_overflow');
  return Number(cents);
}
export function centsToMoney(value) {
  if(!Number.isSafeInteger(value))throw new StorageError('invalid_cents');
  const amount=value/100;
  if(moneyToCents(amount)!==value)throw new StorageError('unrepresentable_json_money');
  return amount;
}
