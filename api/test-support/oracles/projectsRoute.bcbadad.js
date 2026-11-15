/**
 * ORÁCULO CONGELADO: cópia literal de api/routes/projects.js no commit bcbadad (produção), usada só por testes
 * de paridade. Só os imports foram ajustados. Não importar no servidor.
 */
import { Router } from 'express';
import {
  applyProjectPatch,
  completeProjectNextStep,
  createProject,
  createProjectUpdate,
  getProject,
  listProjectUpdates,
  listProjects,
  todayFortaleza,
} from './projects.bcbadad.js';
import { getContinuityGuidance, writeContinuityGuidance } from './continuityGuidance.bcbadad.js';

function sendError(res, err) {
  const status = err.status || 500;
  const code = err.code || err.message;
  if (status === 409 && (code === 'FOCUS_LIMIT' || err.message === 'FOCUS_LIMIT')) {
    return res.status(409).json({ error: 'FOCUS_LIMIT' });
  }
  if (status === 409 && code === 'REVISION_CHANGED') {
    return res.status(409).json({ error: 'REVISION_CHANGED', current_revision: err.current_revision });
  }
  if (status === 409 && code === 'GUIDANCE_CHANGED') {
    return res.status(409).json({ error: 'GUIDANCE_CHANGED', current_generated_at: err.current_generated_at });
  }
  res.status(status).json({ error: err.message || 'error' });
}

/** Projects — mounted at /api/projects */
export function createProjectsRouter({ db, getLocalDateString = todayFortaleza }) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(listProjects(db));
  });

  router.get('/:id/updates', (req, res) => {
    const rows = listProjectUpdates(db, req.params.id, req.query.limit);
    if (!rows) return res.status(404).json({ error: 'Not found' });
    res.json(rows);
  });

  router.post('/:id/updates', (req, res) => {
    try {
      const row = createProjectUpdate(db, req.params.id, req.body || {});
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.status(201).json(row);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/:id/complete-next-step', (req, res) => {
    try {
      const result = completeProjectNextStep(db, req.params.id, req.body || {});
      if (!result) return res.status(404).json({ error: 'Not found' });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/guidance/today', (_req, res) => {
    try {
      const today = typeof getLocalDateString === 'function'
        ? getLocalDateString()
        : todayFortaleza();
      const guidance = getContinuityGuidance(db, today);
      res.json(guidance);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put('/guidance/:date', (req, res) => {
    try {
      res.json(writeContinuityGuidance(db, req.params.date, req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
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
