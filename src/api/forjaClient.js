// Forja API Client — unified client for the Forja do Jota backend
// Replaces Base44 SDK calls with direct API calls

// Em produção, usa API relativa para passar pelo proxy /api do Vercel.
// Em dev local, .env define VITE_FORJA_API para o backend da Forja.
const FORJA_API = import.meta.env.PROD ? '' : (import.meta.env.VITE_FORJA_API || '');
const FORJA_KEY = import.meta.env.VITE_FORJA_API_KEY || '';

// Endpoints whose GET responses we mirror to localStorage so the UI keeps
// working when the backend is unreachable (Tailscale offline, VPS down, etc).
const OFFLINE_CACHEABLE = [
  '/api/tasks',
  '/api/habits',
  '/api/habit-logs',
  '/api/wellness',
  '/api/rituals',
  '/api/goals',
  '/api/gamification',
  '/api/calendar/today',
];

const OFFLINE_KEY_PREFIX = 'forja:offline:';

function isCacheable(path) {
  return OFFLINE_CACHEABLE.some(p => path === p || path.startsWith(p + '?') || path.startsWith(p + '/'));
}

function readOfflineCache(path) {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY_PREFIX + path);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeOfflineCache(path, data) {
  try {
    localStorage.setItem(
      OFFLINE_KEY_PREFIX + path,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {}
}

export function getOfflineStatus() {
  // Heuristic: most-recently-cached entry; UI uses this to show a stale banner.
  let mostRecent = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(OFFLINE_KEY_PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key));
      if (entry?.timestamp > mostRecent) mostRecent = entry.timestamp;
    } catch {}
  }
  return { lastSyncAt: mostRecent || null };
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (FORJA_KEY) headers['Authorization'] = `Bearer ${FORJA_KEY}`;

  const isGet = !options.method || options.method === 'GET';

  try {
    const res = await fetch(`${FORJA_API}${path}`, { ...options, headers });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    if (isGet && isCacheable(path)) writeOfflineCache(path, data);
    return data;
  } catch (err) {
    // Fall back to cached payload only on cacheable GETs — never silently swallow writes.
    if (isGet && isCacheable(path)) {
      const cached = readOfflineCache(path);
      if (cached) {
        const stale = { __stale: true, __cachedAt: cached.timestamp };
        return Array.isArray(cached.data)
          ? Object.assign(cached.data.slice(), stale)
          : { ...cached.data, ...stale };
      }
    }
    throw err;
  }
}

export const forjaApi = {
  // Health
  health: () => request('/api/health'),

  // Tasks
  tasks: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/tasks${query ? '?' + query : ''}`);
    },
    get: (id) => request(`/api/tasks/${id}`),
    create: (data) => request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  },

  // Habits
  habits: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/habits${query ? '?' + query : ''}`);
    },
    create: (data) => request('/api/habits', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/habits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/api/habits/${id}`, { method: 'DELETE' }),
  },

  // Habit Logs
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

  // Rituals
  rituals: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/api/rituals${query ? '?' + query : ''}`);
    },
    get: (id) => request(`/api/rituals/${id}`),
    getProgress: (id, date) => request(`/api/rituals/${id}/progress?date=${date}`),
    create: (data) => request('/api/rituals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/rituals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/api/rituals/${id}`, { method: 'DELETE' }),
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
  user: {
    getSettings: () => request('/api/user/settings'),
    updateSettings: (data) => request('/api/user/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },

  // Parse Voice (LLM)
  parseVoice: (text) => request('/api/parse-voice', { method: 'POST', body: JSON.stringify({ text }) }),

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
    const headers = {};
    if (FORJA_KEY) headers['Authorization'] = `Bearer ${FORJA_KEY}`;
    const res = await fetch(`${FORJA_API}/api/transcribe`, {
      method: 'POST',
      body: formData,
      headers,
    });
    if (!res.ok) throw new Error('Transcription failed');
    return res.json();
  },
};

export default forjaApi;
