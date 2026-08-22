// Domain API helper for Workouts (Exercises, Programs, Sessions, Summary)
export const workoutsApiModule = (request) => ({
  workouts: {
    summary: () => request('/api/workouts/summary'),
    exercises: {
      list: (params = {}) => {
        const q = new URLSearchParams(params).toString();
        return request(`/api/workouts/exercises${q ? `?${q}` : ''}`);
      },
      get: (id) => request(`/api/workouts/exercises/${id}`),
      create: (data) =>
        request('/api/workouts/exercises', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) =>
        request(`/api/workouts/exercises/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id) => request(`/api/workouts/exercises/${id}`, { method: 'DELETE' }),
      stats: (id) => request(`/api/workouts/exercises/${id}/stats`),
    },
    programs: {
      list: () => request('/api/workouts/programs'),
      get: (id) => request(`/api/workouts/programs/${id}`),
      active: () => request('/api/workouts/programs/active'),
      save: (data) =>
        request('/api/workouts/programs', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) =>
        request(`/api/workouts/programs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      setActive: (id) =>
        request(`/api/workouts/programs/${id}/activate`, { method: 'POST' }),
      delete: (id) => request(`/api/workouts/programs/${id}`, { method: 'DELETE' }),
    },
    sessions: {
      list: (params = {}) => {
        const q = new URLSearchParams(params).toString();
        return request(`/api/workouts/sessions${q ? `?${q}` : ''}`);
      },
      get: (id) => request(`/api/workouts/sessions/${id}`),
      start: (data) =>
        request('/api/workouts/sessions', { method: 'POST', body: JSON.stringify(data) }),
      save: (id, data) =>
        request(`/api/workouts/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      finish: (id, data = {}) =>
        request(`/api/workouts/sessions/${id}/finish`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      delete: (id) => request(`/api/workouts/sessions/${id}`, { method: 'DELETE' }),
    },
  },
});
