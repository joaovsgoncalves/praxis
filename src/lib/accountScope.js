// De quem são os dados guardados neste navegador (fase 4).
//
// Tudo o que a Praxis guarda aqui (cópia offline das telas, intenção pendente, preferências de
// uso) pertence a UMA conta. Entrou outra conta, ou saiu: o que era da anterior é apagado antes
// de qualquer tela pintar. Cópia offline sem dono, ou de outro dono, não é lida.
// Quem decide quem é a conta é a resposta do servidor (/api/auth/me e login), nunca este arquivo.
const ACCOUNT_KEY = 'praxis:account';
const OFFLINE_PREFIX = 'praxis:offline:';
const PERSONAL_PREFIXES = ['praxis:', 'forja:'];
// Do aparelho, não da pessoa: sobrevive à troca de conta.
const DEVICE_KEYS = new Set([ACCOUNT_KEY, 'praxis:session-hint', 'praxis:last-seen-release', 'praxis:open-whats-new']);

let active = null;
const listeners = new Set();

function browserStorages() {
  const pick = (name) => {
    try {
      return typeof globalThis[name] !== 'undefined' ? globalThis[name] : null;
    } catch {
      return null;
    }
  };
  return { local: pick('localStorage'), session: pick('sessionStorage') };
}

export function accountKeyOf(user) {
  return user ? String(user.id || user.username || '') : '';
}

/** Conta ativa nesta aba (a última que o servidor confirmou). */
export function activeAccount() {
  return active;
}

export function storedAccount(storages = browserStorages()) {
  try {
    return storages.local?.getItem(ACCOUNT_KEY) || null;
  } catch {
    return null;
  }
}

export function isPersonalKey(key) {
  if (!key || DEVICE_KEYS.has(key)) return false;
  return PERSONAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function purgeStorage(storage) {
  if (!storage) return 0;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (isPersonalKey(key)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
    return keys.length;
  } catch {
    return 0;
  }
}

/** Apaga o que é pessoal neste navegador (as duas gavetas: a do aparelho e a da aba). */
export function purgePersonalData(storages = browserStorages()) {
  return purgeStorage(storages.local) + purgeStorage(storages.session);
}

/** Só a gaveta desta aba: usado quando OUTRA aba trocou de conta e já limpou a do aparelho. */
export function purgeTabData(storages = browserStorages()) {
  return purgeStorage(storages.session);
}

/**
 * O servidor confirmou quem está logado. Se não é a mesma conta dos dados guardados
 * (ou os dados não têm dono), apaga tudo antes de seguir.
 */
export function adoptAccount(accountId, storages = browserStorages()) {
  const id = String(accountId || '');
  if (!id) return { switched: false, previous: storedAccount(storages) };
  const previous = storedAccount(storages);
  const switched = previous !== id;
  if (switched) {
    purgePersonalData(storages);
    try {
      storages.local?.setItem(ACCOUNT_KEY, id);
    } catch {
      // sem armazenamento: nada fica guardado, então nada vaza
    }
  }
  active = id;
  return { switched, previous };
}

/** Saiu da conta: nada dela fica no navegador. */
export function releaseAccount(storages = browserStorages()) {
  purgePersonalData(storages);
  try {
    storages.local?.removeItem(ACCOUNT_KEY);
  } catch {
    // nada a remover
  }
  active = null;
}

// ---------- cópia offline das telas, com dono ----------

export function readOfflineEntry(path, storages = browserStorages()) {
  if (!active) return null;
  try {
    const entry = JSON.parse(storages.local?.getItem(OFFLINE_PREFIX + path) || 'null');
    if (!entry || entry.account !== active) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * `account` é a conta ativa quando o pedido SAIU. Se a conta mudou enquanto a resposta
 * viajava, a resposta é da conta anterior e não é guardada.
 */
export function writeOfflineEntry(path, data, account, storages = browserStorages()) {
  if (!account || account !== active) return false;
  try {
    storages.local?.setItem(OFFLINE_PREFIX + path, JSON.stringify({ data, timestamp: Date.now(), account }));
    return true;
  } catch {
    return false;
  }
}

// ---------- a conta mudou por fora desta aba ----------

export function subscribeAccountChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Uma resposta veio assinada por outra conta, ou outra aba trocou a conta do navegador. */
export function reportAccountChanged(detail = {}) {
  for (const listener of [...listeners]) {
    try {
      listener(detail);
    } catch {
      // um ouvinte quebrado não impede os outros
    }
  }
}

/** True quando o servidor respondeu por uma conta diferente da ativa nesta aba. */
export function isForeignResponse(responder, accountAtStart) {
  return Boolean(responder && accountAtStart && responder !== accountAtStart);
}

/** Ouve a troca de conta feita em outra aba do mesmo navegador. */
export function watchOtherTabs(target = typeof window !== 'undefined' ? window : null) {
  if (!target?.addEventListener) return () => {};
  const onStorage = (event) => {
    if (event.key !== ACCOUNT_KEY || !active) return;
    if ((event.newValue || null) !== active) reportAccountChanged({ source: 'outra-aba' });
  };
  target.addEventListener('storage', onStorage);
  return () => target.removeEventListener('storage', onStorage);
}

export const __test = { ACCOUNT_KEY, OFFLINE_PREFIX, reset: () => { active = null; listeners.clear(); } };
