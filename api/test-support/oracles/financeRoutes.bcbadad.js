/**
 * ORÁCULO CONGELADO: cópia literal do commit bcbadad (produção), usada só por testes de paridade.
 * Não importar no servidor.
 */
import { Router } from 'express';
import { installFixedConfirmationRoutes } from './finance.fixed-confirmation.candidate.bcbadad.mjs';
import {
  createAccount,
  createBalance,
  createDebt,
  createGoal,
  createInstallment,
  createSubscription,
  deleteInstallment,
  deleteSubscription,
  createTransactionOnce,
  createFixedExpense,
  deleteFixedExpense,
  getInsights,
  getMonthSummary,
  getOverview,
  getSettings,
  lastSync,
  listAccounts,
  listBalances,
  listBudgets,
  listDebts,
  listFixedExpenses,
  listGoals,
  listInstallments,
  listSubscriptions,
  listTransactions,
  markFixedPaid,
  payDebt,
  saveBudgets,
  updateFixedExpense,
  seedFinanceIfEmpty,
  updateAccount,
  updateDebt,
  updateGoal,
  updateInstallment,
  updateSettings,
  updateSubscription,
  updateTransaction,
  listPendingTransactions,
  getCoverageFor,
} from './finance.bcbadad.js';
import { ingestPluggy } from './pluggyIngest.bcbadad.js';
import { syncPierre } from './pierreSync.bcbadad.js';

function sendError(res, err) {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'error', ...(err.code ? { code: err.code } : {}) });
}

/** Chave de intenção: cabeçalho Idempotency-Key ou intent_key no corpo (o cabeçalho vence). */
function withIntentKey(req) {
  const body = req.body || {};
  const header = req.get('Idempotency-Key');
  return header ? { ...body, intent_key: header } : body;
}

/** Finanças — mounted at /api/finance */
export function createFinanceRouter({ db, getLocalDateString }) {
  const router = Router();
  installFixedConfirmationRoutes(router, db);
  const localToday = () => (typeof getLocalDateString === 'function' ? getLocalDateString() : undefined);

  router.get('/overview', (req, res) => {
    try {
      res.json(getOverview(db, { today: localToday() }));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/month', (req, res) => {
    try {
      res.json(getMonthSummary(db, { month: req.query.month, today: localToday(), entity: req.query.entity }));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/budgets', (_req, res) => {
    res.json(listBudgets(db));
  });

  router.put('/budgets', (req, res) => {
    try {
      res.json(saveBudgets(db, req.body));
    } catch (err) {
      sendError(res, err);
    }
  });

  // despesas fixas mensais (faculdade, carro, contador…) — entram no "pode gastar até o salário"
  router.get('/fixed', (_req, res) => {
    res.json(listFixedExpenses(db, { today: localToday() }));
  });

  router.post('/fixed', (req, res) => {
    try {
      res.status(201).json(createFixedExpense(db, req.body || {}, { today: localToday() }));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/fixed/:id', (req, res) => {
    try {
      const row = updateFixedExpense(db, req.params.id, req.body || {}, { today: localToday() });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/fixed/:id', (req, res) => {
    const row = deleteFixedExpense(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, id: row.id });
  });

  router.post('/fixed/:id/paid', (req, res) => {
    try {
      const row = markFixedPaid(db, req.params.id, { month: req.body?.month, today: localToday() });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/fixed/:id/paid', (req, res) => {
    const row = markFixedPaid(db, req.params.id, { month: null, today: localToday() });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.get('/settings', (_req, res) => {
    res.json(getSettings(db));
  });

  router.patch('/settings', (req, res) => {
    try {
      res.json(updateSettings(db, req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/accounts', (req, res) => {
    try {
      res.json(listAccounts(db, { status: req.query.status, entity: req.query.entity }));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/accounts', (req, res) => {
    try {
      res.status(201).json(createAccount(db, req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/accounts/:id', (req, res) => {
    try {
      const row = updateAccount(db, req.params.id, req.body || {});
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/balances', (req, res) => {
    res.json(listBalances(db, { account_id: req.query.account_id }));
  });

  router.post('/balances', (req, res) => {
    try {
      res.status(201).json(createBalance(db, req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/debts', (req, res) => {
    res.json(listDebts(db, { status: req.query.status }));
  });

  router.post('/debts', (req, res) => {
    try {
      res.status(201).json(createDebt(db, req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/debts/:id', (req, res) => {
    const row = updateDebt(db, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.post('/debts/:id/pay', (req, res) => {
    try {
      const row = payDebt(db, req.params.id, withIntentKey(req));
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/subscriptions', (req, res) => {
    res.json(listSubscriptions(db, { lane: req.query.lane, status: req.query.status }));
  });

  router.post('/subscriptions', (req, res) => {
    try {
      res.status(201).json(createSubscription(db, req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/subscriptions/:id', (req, res) => {
    const row = updateSubscription(db, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.delete('/subscriptions/:id', (req, res) => {
    const row = deleteSubscription(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, id: row.id });
  });

  router.get('/installments', (req, res) => {
    res.json(listInstallments(db, { status: req.query.status }));
  });

  router.post('/installments', (req, res) => {
    try {
      res.status(201).json(createInstallment(db, req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/installments/:id', (req, res) => {
    const row = updateInstallment(db, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.delete('/installments/:id', (req, res) => {
    const row = deleteInstallment(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, id: row.id });
  });

  router.get('/transactions', (req, res) => {
    try {
      res.json(listTransactions(db, {
        from: req.query.from,
        to: req.query.to,
        account_id: req.query.account_id,
        category: req.query.category,
        q: req.query.q,
        limit: req.query.limit,
        entity: req.query.entity,
      }));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/transactions', (req, res) => {
    try {
      const body = withIntentKey(req);
      const { row, replayed } = createTransactionOnce(db, { ...body, posted_on: body.posted_on ?? localToday() });
      // reenvio da mesma intenção: devolve o primeiro lançamento, sem criar outro
      res.status(replayed ? 200 : 201).json(replayed ? { ...row, replayed: true } : row);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/transactions/:id', (req, res) => {
    const row = updateTransaction(db, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.get('/insights', (req, res) => {
    try {
      res.json(getInsights(db, { from: req.query.from, to: req.query.to, entity: req.query.entity, today: localToday() }));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/goals', (_req, res) => {
    res.json(listGoals(db));
  });

  router.post('/goals', (req, res) => {
    try {
      res.status(201).json(createGoal(db, req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/goals/:id', (req, res) => {
    const row = updateGoal(db, req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.post('/seed', (req, res) => {
    const result = seedFinanceIfEmpty(db, { force: Boolean(req.body?.force) });
    res.json(result);
  });

  // Midas manda o JSON normalizado do Pluggy de hora em hora
  router.post('/ingest/pluggy', (req, res) => {
    try {
      res.json(ingestPluggy(db, req.body, { today: localToday() }));
    } catch (err) {
      sendError(res, err);
    }
  });

  /** O que se sabe do extrato no período (separado da data do saldo); PF por padrão, como mês e insights. */
  router.get('/coverage', (req, res) => {
    try {
      res.json(getCoverageFor(db, { from: req.query.from, to: req.query.to, today: localToday(), entity: req.query.entity }));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/pending', (_req, res) => {
    try {
      res.json({ pending: listPendingTransactions(db) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/sync/last', (_req, res) => {
    res.json(lastSync(db) || { ok: false, error: 'never' });
  });

  router.post('/sync', async (req, res) => {
    try {
      const actor = req.body?.actor || 'joao';
      const result = await syncPierre(db, { actor, getLocalDateString });
      if (!result.configured) {
        return res.status(503).json({
          error: 'pierre_not_configured',
          last_sync: result.last_sync || lastSync(db),
        });
      }
      if (!result.ok) {
        return res.status(502).json({
          error: 'pierre_sync_failed',
          message: result.error || 'sync failed',
          last_sync: result.last_sync,
        });
      }
      res.json({
        ok: true,
        accounts_n: result.accounts_n,
        tx_n: result.tx_n,
        last_sync: result.last_sync,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
