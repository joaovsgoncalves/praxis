import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';

/**
 * Tasks router — mounted at /api/tasks
 * Also exports registerIdeaToTaskRoute for POST /api/ideas/:id/to-task
 *
 * Regras no serviço (`services/routine/tasks.js`); envelope igual ao da rota antiga, congelada em
 * `test-support/oracles/tasks.bcbadad.js` para a prova de paridade. A agenda nunca roda dentro da
 * transação da tarefa: o serviço grava a intenção e chama `scheduleCalendarDrain` depois do commit.
 */
export function createTasksRouter({ tasks }) {
  if (!tasks) throw new TypeError('createTasksRouter: informe o serviço tasks');
  const router = Router();
  const send = (res, { status, body }) => res.status(status).json(body);

  router.get('/', asyncRoute(async (req, res) => res.json(await tasks.list(req.query))));
  router.patch('/reorder', asyncRoute(async (req, res) => send(res, await tasks.reorder(req.body))));
  router.get('/:id', asyncRoute(async (req, res) => send(res, await tasks.get(req.params.id))));

  // Checklist da tarefa — /reorder antes de /:itemId.
  router.get('/:id/checklist', asyncRoute(async (req, res) => send(res, await tasks.listChecklist(req.params.id))));
  router.post('/:id/checklist', asyncRoute(async (req, res) => send(res, await tasks.addChecklistItem(req.params.id, req.body))));
  router.patch('/:id/checklist/reorder', asyncRoute(async (req, res) => send(res, await tasks.reorderChecklist(req.params.id, req.body))));
  router.patch('/:id/checklist/:itemId', asyncRoute(async (req, res) => send(res, await tasks.patchChecklistItem(req.params.id, req.params.itemId, req.body))));
  router.delete('/:id/checklist/:itemId', asyncRoute(async (req, res) => send(res, await tasks.removeChecklistItem(req.params.id, req.params.itemId))));

  router.post('/', asyncRoute(async (req, res) => send(res, await tasks.create(req.body))));
  router.put('/:id', asyncRoute(async (req, res) => send(res, await tasks.update(req.params.id, req.body))));
  router.delete('/:id', asyncRoute(async (req, res) => send(res, await tasks.remove(req.params.id))));
  router.post('/:id/not-today', asyncRoute(async (req, res) => send(res, await tasks.notToday(req.params.id, req.body))));

  return router;
}

export function registerIdeaToTaskRoute(app, { tasks }) {
  if (!tasks) throw new TypeError('registerIdeaToTaskRoute: informe o serviço tasks');
  app.post('/api/ideas/:id/to-task', asyncRoute(async (req, res) => {
    const { status, body } = await tasks.ideaToTask(req.params.id, req.body);
    res.status(status).json(body);
  }));
}
