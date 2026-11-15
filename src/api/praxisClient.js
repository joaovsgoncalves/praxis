// Praxis API Client — unified client for the Praxis backend
import { tasksApiModule } from './tasksApi';
import { financeApiModule } from './financeApi';
import { projectsApiModule } from './projectsApi';
import { kindFromStatus } from '@/lib/apiFailure';
import { isSessionLost, markSessionLost } from '@/lib/sessionGate';
import { activeAccount, isForeignResponse, readOfflineEntry, reportAccountChanged, writeOfflineEntry } from '@/lib/accountScope';

// Em produção, usa API relativa para passar pelo proxy /api do Vercel.
// Em dev local, .env define VITE_PRAXIS_API/VITE_FORJA_API para o backend da Praxis.
// Nunca colocar segredo administrativo em VITE_*: tudo que começa com VITE é exposto no bundle.
const PRAXIS_API = import.meta.env.PROD ? '' : (import.meta.env.VITE_PRAXIS_API || import.meta.env.VITE_FORJA_API || '');

// Endpoints whose GET responses we mirror to localStorage so the UI keeps
// working when the backend is unreachable (Tailscale offline, VPS down, etc).
const OFFLINE_CACHEABLE = [
  '/api/tasks',
  '/api/habits',
  '/api/habit-logs',
  '/api/wellness',
  '/api/goals',
  '/api/gamification',
  '/api/calendar/today',
  '/api/focus/stats',
  '/api/insights/best-hours',
  '/api/insights/correlation',
  '/api/insights/weekly',
  '/api/insights/avoidance',
  '/api/weekly-reviews',
  '/api/finance/overview',
  '/api/projects',
];

const OFFLINE_KEY_PREFIX = 'praxis:offline:';

function isCacheable(path) {
  if (path.startsWith('/api/projects/guidance')) return false;
  return OFFLINE_CACHEABLE.some(p => path === p || path.startsWith(p + '?') || path.startsWith(p + '/'));
}

// A cópia offline tem dono: só é lida e gravada para a conta que o servidor confirmou
// (src/lib/accountScope.js). Cópia sem dono, ou de outra conta, não existe para a tela.
const readOfflineCache = (path) => readOfflineEntry(path);
const writeOfflineCache = (path, data, account) => writeOfflineEntry(path, data, account);

export function getOfflineStatus() {
  // Heuristic: most-recently-cached entry; UI uses this to show a stale banner.
  let mostRecent = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !(key.startsWith('praxis:offline:') || key.startsWith('forja:offline:'))) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key));
      if (entry?.timestamp > mostRecent) mostRecent = entry.timestamp;
    } catch {}
  }
  return { lastSyncAt: mostRecent || null };
}

// ---------------------------------------------------------------------------
// Stale-serving signal.
// A cacheable GET that falls back to localStorage returns data flagged with
// __stale, but every screen would have to read that flag to warn the user.
// Instead the client broadcasts the transition once and OfflineBanner (mounted
// in AppLayout) renders the warning for whatever page is open.
// ---------------------------------------------------------------------------
const OFFLINE_STATE_EVENT = 'praxis:offline-state';
let servingStale = false;
let servingStaleSince = null;

function emitOfflineState(stale, cachedAt = null) {
  if (stale === servingStale && cachedAt === servingStaleSince) return;
  servingStale = stale;
  servingStaleSince = stale ? cachedAt : null;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OFFLINE_STATE_EVENT, {
      detail: { stale: servingStale, cachedAt: servingStaleSince },
    }),
  );
}

/** Current stale state — for components mounting after the last transition. */
export function getStaleState() {
  return { stale: servingStale, cachedAt: servingStaleSince };
}

/** Subscribe to stale transitions. Returns an unsubscribe function. */
export function subscribeStaleState(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => listener(event.detail);
  window.addEventListener(OFFLINE_STATE_EVENT, handler);
  return () => window.removeEventListener(OFFLINE_STATE_EVENT, handler);
}

// Versão do front que fez a chamada; aparece no registro da API junto da correlação.
const CLIENT_TAG = `web-${import.meta.env.VITE_PRAXIS_BUILD || 'dev'}`;
// Rotas que funcionam sem sessão: nunca são cortadas nem contam como "sessão perdida".
const SESSION_FREE = ['/api/auth/', '/api/health'];

function newRequestId() {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function apiError(message, fields) {
  return Object.assign(new Error(message), fields);
}

/** Cabeçalhos de correlação, também para as chamadas com fetch direto (áudio). */
function traceHeaders(requestId = newRequestId()) {
  return { 'X-Request-Id': requestId, 'X-Praxis-Client': CLIENT_TAG };
}

/** Resposta com erro vira Error com status, classe e correlação; 401 protegido fecha a sessão. */
function failedResponse(res, body, path, requestId, fallbackMessage) {
  const sessionFree = SESSION_FREE.some((prefix) => path.startsWith(prefix));
  if (res.status === 401 && !sessionFree) markSessionLost(body?.reason || null);
  return apiError(body?.error || body?.detail || fallbackMessage || `API error: ${res.status}`, {
    status: res.status,
    kind: kindFromStatus(res.status),
    body,
    requestId,
  });
}

/**
 * Opções além das do fetch:
 *  - fresh: GET que não aceita resposta do cache offline (confirmar estado real).
 *  - requestId: correlação escolhida por quem chama.
 */
async function request(path, options = {}) {
  const { fresh = false, requestId: givenRequestId, ...fetchOptions } = options;
  const requestId = givenRequestId || newRequestId();
  const headers = { 'Content-Type': 'application/json', ...traceHeaders(requestId), ...fetchOptions.headers };

  const isGet = !fetchOptions.method || fetchOptions.method === 'GET';
  const sessionFree = SESSION_FREE.some((prefix) => path.startsWith(prefix));
  // De quem é este pedido: a conta ativa quando ele sai. A resposta só vale para ela.
  const account = activeAccount();

  // A sessão já caiu: mandar mais chamadas só renderia uma fila de 401.
  if (!sessionFree && isSessionLost()) {
    throw apiError('Sessão encerrada', { status: 401, kind: 'session', blocked: true, requestId });
  }
  // Sem rede, escrita não sai: quem chamou fica sabendo na hora, sem "talvez tenha ido".
  if (!isGet && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw apiError('Sem conexão', { kind: 'offline', sent: false, requestId });
  }

  try {
    let res;
    try {
      res = await fetch(`${PRAXIS_API}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
    } catch (cause) {
      // Saiu do aparelho e a resposta não voltou: o resultado é desconhecido.
      throw apiError(cause?.message || 'Falha de rede', { kind: 'network', sent: true, requestId, cause });
    }
    // O servidor diz por qual conta respondeu. Se não é a desta aba (outra aba trocou de conta),
    // a resposta não é mostrada nem guardada: a tela recomeça com a conta certa.
    if (!sessionFree && isForeignResponse(res.headers.get('X-Praxis-Account'), account)) {
      reportAccountChanged({ source: 'resposta' });
      throw apiError('A conta deste navegador mudou', { kind: 'session', accountChanged: true, requestId });
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw failedResponse(res, body, path, requestId);
    }
    if (res.status === 204) return null;
    const data = await res.json();
    if (isGet && isCacheable(path)) {
      writeOfflineCache(path, data, account);
      emitOfflineState(false);
    }
    return data;
  } catch (err) {
    // Resposta do servidor não é falta de rede: sessão, permissão e "não existe" sobem como são.
    if (err?.status === 401 || err?.status === 403 || err?.status === 404 || err?.accountChanged) throw err;
    // Fall back to cached payload only on cacheable GETs — never silently swallow writes.
    if (isGet && !fresh && isCacheable(path)) {
      const cached = readOfflineCache(path);
      if (cached) {
        emitOfflineState(true, cached.timestamp);
        const stale = { __stale: true, __cachedAt: cached.timestamp };
        return Array.isArray(cached.data)
          ? Object.assign(cached.data.slice(), stale)
          : { ...cached.data, ...stale };
      }
    }
    throw err;
  }
}

export const praxisApi = {
  // Health
  health: () => request('/api/health'),

  auth: {
    config: () => request('/api/auth/config'),
    me: () => request('/api/auth/me'),
    login: (password, username = '') => {
      const name = String(username ?? '').trim();
      return request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password: String(password ?? '').trim(), ...(name ? { username: name } : {}) }),
      });
    },
    logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  },

  ...tasksApiModule(request),
  ...financeApiModule(request),
  ...projectsApiModule(request),


  ideas: {
    list: (params = {}) => {
      const query = new URLSearchParams({ category: 'ideias', limit: 100, ...params }).toString();
      return request(`/api/tasks?${query}`);
    },
    promoteToTask: (id, data = {}) =>
      request(`/api/ideas/${id}/to-task`, { method: 'POST', body: JSON.stringify(data) }),
  },

  purchases: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/purchases${query ? `?${query}` : ''}`);
    },
    create: (data) => request('/api/purchases', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/purchases/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => request(`/api/purchases/${id}`, { method: 'DELETE' }),
  },

  // Habits
  habits: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/habits${query ? '?' + query : ''}`);
    },
    create: (data) => request('/api/habits', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/habits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    reorder: (orderedIds) => request('/api/habits/reorder', { method: 'PATCH', body: JSON.stringify({ ordered_ids: orderedIds }) }),
    reorderChildren: (id, orderedIds) =>
      request(`/api/habits/${id}/children`, {
        method: 'PATCH',
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
    delete: (id) => request(`/api/habits/${id}`, { method: 'DELETE' }),
  },

  // Habit Logs — body: { habit_id, date, outcome?: 'done'|'skipped', skip_reason?, note?, completed?, value? }
  habitLogs: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/habit-logs${query ? '?' + query : ''}`);
    },
    create: (data) => request('/api/habit-logs', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/api/habit-logs/${id}`, { method: 'DELETE' }),
  },

  // Wellness
  wellness: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/wellness${query ? '?' + query : ''}`);
    },
    create: (data) => request('/api/wellness', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Focus Sessions
  focus: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/focus${query ? '?' + query : ''}`);
    },
    create: (data) => request('/api/focus', { method: 'POST', body: JSON.stringify(data) }),
    stats: (days = 30) => request(`/api/focus/stats?days=${days}`),
  },

  // Goals
  goals: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/goals${query ? '?' + query : ''}`);
    },
    get: (id) => request(`/api/goals/${id}`),
    create: (data) => request('/api/goals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/api/goals/${id}`, { method: 'DELETE' }),
  },

  // User Settings
  ops: {
    backupMeta: () => request('/api/ops/backup-meta'),
  },

  user: {
    getSettings: () => request('/api/user/settings'),
    updateSettings: (data) => request('/api/user/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },

  // Parse Voice (LLM)
  parseVoice: (text) => request('/api/parse-voice', { method: 'POST', body: JSON.stringify({ text }) }),

  captures: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/captures${q ? `?${q}` : ''}`);
    },
    pendingCount: () => request('/api/captures/pending-count'),
    get: (id) => request(`/api/captures/${id}`),
    createText: (text, source = 'share') =>
      request('/api/captures/text', {
        method: 'POST',
        body: JSON.stringify({ text, source }),
      }),
    retry: async (id) => {
      const res = await fetch(`${PRAXIS_API}/api/captures/${id}/retry`, {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'application/json', ...traceHeaders() },
        credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw failedResponse(res, body, '/api/captures', res.headers.get('x-request-id'), 'Retry failed');
      return body;
    },
    saveParsed: (id, parsedItems) =>
      request(`/api/captures/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ parsed_items: parsedItems }),
      }),
    archive: (id) =>
      request(`/api/captures/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      }),
    submitAudio: async (audioBlob) => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      const res = await fetch(`${PRAXIS_API}/api/captures`, {
        method: 'POST',
        body: formData,
        headers: traceHeaders(),
        credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw failedResponse(res, body, '/api/captures', res.headers.get('x-request-id'), 'Capture failed');
      return body;
    },
  },

  // Gamification
  gamification: {
    get: () => request('/api/gamification'),
    addXp: (amount, reason) =>
      request('/api/gamification/add-xp', {
        method: 'POST',
        body: JSON.stringify({ amount, reason }),
      }),
    checkAchievements: () =>
      request('/api/gamification/check-achievements', {
        method: 'POST',
      }),
  },

  // Insights
  insights: {
    bestHours: () => request('/api/insights/best-hours'),
    correlation: (days = 60) => request(`/api/insights/correlation?days=${days}`),
    weekly: (weekStart) =>
      request(`/api/insights/weekly${weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : ''}`),
    avoidance: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/insights/avoidance${q ? `?${q}` : ''}`);
    },
  },

  praxia: {
    confront: (body = {}) =>
      request('/api/praxia/confront', { method: 'POST', body: JSON.stringify(body) }),
  },

  // Weekly reviews
  weeklyReviews: {
    list: (limit = 12) => request(`/api/weekly-reviews?limit=${limit}`),
    current: (date) => request(`/api/weekly-reviews/current${date ? '?date=' + date : ''}`),
    save: (data) => request('/api/weekly-reviews', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/api/weekly-reviews/${id}`, { method: 'DELETE' }),
  },

  // Calendar
  getTodayCalendar: () => request('/api/calendar/today'),

  // Transcription
  transcribe: async (audioBlob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    const res = await fetch(`${PRAXIS_API}/api/transcribe`, {
      method: 'POST',
      body: formData,
      headers: traceHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw failedResponse(res, body, '/api/transcribe', res.headers.get('x-request-id'), 'Transcription failed');
    }
    return res.json();
  },
};

export default praxisApi;
