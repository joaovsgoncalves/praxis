export const projectsApiModule = (request) => ({
  projects: {
    list: () => request('/api/projects'),
    get: (id) => request(`/api/projects/${encodeURIComponent(id)}`),
    create: (data) => request('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      request(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
});
