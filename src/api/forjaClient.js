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
