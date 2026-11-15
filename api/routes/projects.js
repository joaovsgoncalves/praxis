import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';
import { todayFortaleza } from '../projects.js';
import { getContinuityGuidance, writeContinuityGuidance } from '../continuityGuidance.js';

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

/**
 * Projects — mounted at /api/projects.
 * Frentes e timeline pelo serviço (`services/personal/projects.js`) sobre a camada assíncrona;
 * envelope igual ao da rota antiga, congelada em `test-support/oracles/projectsRoute.bcbadad.js`.
 * Orientação do dia ainda no banco legado (`db`).
 */
export function createProjectsRouter({ projects, db, getLocalDateString = todayFortaleza }) {
  if (!projects) throw new TypeError('createProjectsRouter: informe o serviço projects');
  const router = Router();

  router.get('/', asyncRoute(async (_req, res) => {
    res.json(await projects.list());
  }));

  router.get('/:id/updates', asyncRoute(async (req, res) => {
    const rows = await projects.listUpdates(req.params.id, req.query.limit);
    if (!rows) return res.status(404).json({ error: 'Not found' });
    res.json(rows);
  }));

  router.post('/:id/updates', asyncRoute(async (req, res) => {
    try {
      const row = await projects.addUpdate(req.params.id, req.body || {});
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.status(201).json(row);
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.post('/:id/complete-next-step', asyncRoute(async (req, res) => {
    try {
      const result = await projects.completeNextStep(req.params.id, req.body || {});
      if (!result) return res.status(404).json({ error: 'Not found' });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  }));

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

  router.get('/:id', asyncRoute(async (req, res) => {
    const row = await projects.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.post('/', asyncRoute(async (req, res) => {
    try {
      const row = await projects.create(req.body || {});
      res.status(201).json(row);
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.patch('/:id', asyncRoute(async (req, res) => {
    try {
      const row = await projects.patch(req.params.id, req.body || {});
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  }));

  return router;
}
