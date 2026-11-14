// Uma chave por intenção de gravar dinheiro (baixa de dívida, gasto à mão).
// Reenviar a mesma intenção (mesma chave) devolve o primeiro resultado na API, sem duplicar.
// A chave fica nesta aba por um tempo, então fechar o diálogo ou recarregar depois de uma queda
// de rede e mandar a MESMA coisa de novo continua seguro. Mudou o conteúdo, é outra intenção.
import { classifyFailure } from './apiFailure.js';

const KEY = 'praxis:finance:intents';
const TTL_MS = 30 * 60 * 1000;

function defaultStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function defaultKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readAll(storage, now) {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) || '{}');
    const live = {};
    for (const [scope, entry] of Object.entries(raw || {})) {
      if (entry && entry.key && now - Number(entry.at || 0) <= TTL_MS) live[scope] = entry;
    }
    return live;
  } catch {
    return {};
  }
}

function writeAll(storage, all) {
  try {
    storage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // sem armazenamento: a chave vale só para esta tentativa
  }
}

const signatureOf = (payload) => JSON.stringify(payload ?? null);

/** Chave da intenção: a mesma enquanto escopo e conteúdo forem iguais e ela não tiver sido concluída. */
export function intentKeyFor(scope, payload, { storage = defaultStorage(), now = Date.now(), makeKey = defaultKey } = {}) {
  const all = readAll(storage, now);
  const signature = signatureOf(payload);
  const current = all[scope];
  if (current && current.signature === signature) return current.key;
  const key = makeKey();
  all[scope] = { key, signature, at: now };
  writeAll(storage, all);
  return key;
}

/** Existe uma tentativa deste escopo que não se sabe se gravou? Devolve o conteúdo dela. */
export function pendingIntent(scope, { storage = defaultStorage(), now = Date.now() } = {}) {
  const entry = readAll(storage, now)[scope];
  if (!entry || !entry.unconfirmed) return null;
  try {
    return { key: entry.key, payload: JSON.parse(entry.signature) };
  } catch {
    return null;
  }
}

/** A resposta não voltou: guarda que a intenção pode ter gravado, para o reenvio usar a mesma chave. */
export function markUnconfirmed(scope, { storage = defaultStorage(), now = Date.now() } = {}) {
  const all = readAll(storage, now);
  if (!all[scope]) return;
  all[scope] = { ...all[scope], unconfirmed: true };
  writeAll(storage, all);
}

/** Terminou (gravou ou o servidor recusou): a próxima é outra intenção. */
export function settleIntent(scope, { storage = defaultStorage(), now = Date.now() } = {}) {
  const all = readAll(storage, now);
  if (!all[scope]) return;
  delete all[scope];
  writeAll(storage, all);
}

/** A falha deixa dúvida se gravou? (queda de rede depois de enviar, ou erro do servidor) */
export function outcomeUnknown(err) {
  const kind = classifyFailure(err);
  return kind === 'network' || kind === 'server' || kind === 'unknown';
}

export const UNCONFIRMED_MESSAGE =
  'Não deu para confirmar se gravou. Pode tentar de novo igual: o mesmo lançamento não entra duas vezes.';
