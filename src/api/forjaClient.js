// Forja API Client — unified client for the Forja do Jota backend
// Replaces Base44 SDK calls with direct API calls

const FORJA_API = import.meta.env.VITE_FORJA_API || 'http://100.110.93.24:18556';

async function request(path, options = {}) {
  const res = await fetch(`${FORJA_API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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
  },

  // Calendar
  getTodayCalendar: () => request('/api/calendar/today'),

  // Transcription
  transcribe: async (audioBlob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    const res = await fetch(`${FORJA_API}/api/transcribe`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Transcription failed');
    return res.json();
  },
};

export default forjaApi;
