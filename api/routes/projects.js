import { Router } from 'express';
import {
  applyProjectPatch,
  createProject,
  getProject,
  listProjects,
} from '../projects.js';

function sendError(res, err) {
  const status = err.status || 500;
  const code = err.code || err.message;
  if (status === 409 && (code === 'FOCUS_LIMIT' || err.message === 'FOCUS_LIMIT')) {
    return res.status(409).json({ error: 'FOCUS_LIMIT' });
  }
  res.status(status).json({ error: err.message || 'error' });
}

/** Projects — mounted at /api/projects */
export function createProjectsRouter({ db }) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(listProjects(db));
  });

  router.get('/:id', (req, res) => {
    const row = getProject(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.post('/', (req, res) => {
    try {
      const row = createProject(db, req.body || {});
      res.status(201).json(row);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/:id', (req, res) => {
    try {
      const row = applyProjectPatch(db, req.params.id, req.body || {});
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
