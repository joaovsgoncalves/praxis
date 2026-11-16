import { Router } from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';
import { createFinanceCoreService } from '../services/finance/core.js';
import { createFinanceRecordsService } from '../services/finance/records.js';
import { createFinanceLedgerService } from '../services/finance/ledger.js';
import { createFinanceReadsService } from '../services/finance/reads.js';
import { createFinanceIngestService } from '../services/finance/ingest.js';
import { installFixedConfirmationRoutes } from '../finance.fixed-confirmation.candidate.mjs';
import { seedFinanceIfEmpty, lastSync } from '../finance.js';
import { syncPierre } from '../pierreSync.js';

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

/**
 * Finanças — mounted at /api/finance.
 * Migração (fase 5): configuração, contas e saldos (services/finance/core.js), cadastros — fixas,
 * orçamento, assinaturas, parcelas, metas (services/finance/records.js) — e dívidas, baixas e lançamentos
 * (services/finance/ledger.js) saem da camada assíncrona (`storage`); o resto ainda usa `db`. Envelope igual ao da rota antiga, congelada em
 * test-support/oracles/financeRoutes.bcbadad.js para a prova de paridade.
 */
export function createFinanceRouter({ db, getLocalDateString, storage, now }) {
  if (!storage) throw new TypeError('createFinanceRouter: informe storage (camada assíncrona)');
  const core = createFinanceCoreService({ storage, now });
  const records = createFinanceRecordsService({ storage, now });
  const ledger = createFinanceLedgerService({ storage, now });
  const reads = createFinanceReadsService({ storage, now });
  const ingest = createFinanceIngestService({ storage, now });
  const router = Router();
  installFixedConfirmationRoutes(router, db);
  const localToday = () => (typeof getLocalDateString === 'function' ? getLocalDateString() : undefined);

  router.get('/overview', asyncRoute(async (req, res) => {
    try {
      res.json(await reads.getOverview({ today: localToday() }));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/month', asyncRoute(async (req, res) => {
    try {
      res.json(await reads.getMonthSummary({ month: req.query.month, today: localToday(), entity: req.query.entity }));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/budgets', asyncRoute(async (_req, res) => {
    res.json(await records.listBudgets());
  }));

  router.put('/budgets', asyncRoute(async (req, res) => {
    try {
      res.json(await records.saveBudgets(req.body));
    } catch (err) {
      sendError(res, err);
    }
  }));

  // despesas fixas mensais (faculdade, carro, contador…) — entram no "pode gastar até o salário"
  router.get('/fixed', asyncRoute(async (_req, res) => {
    res.json(await records.listFixedExpenses({ today: localToday() }));
  }));

  router.post('/fixed', asyncRoute(async (req, res) => {
    try {
      res.status(201).json(await records.createFixedExpense(req.body || {}, { today: localToday() }));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.patch('/fixed/:id', asyncRoute(async (req, res) => {
    try {
      const row = await records.updateFixedExpense(req.params.id, req.body || {}, { today: localToday() });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.delete('/fixed/:id', asyncRoute(async (req, res) => {
    const row = await records.deleteFixedExpense(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, id: row.id });
  }));

  router.post('/fixed/:id/paid', asyncRoute(async (req, res) => {
    try {
      const row = await records.markFixedPaid(req.params.id, { month: req.body?.month, today: localToday() });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.delete('/fixed/:id/paid', asyncRoute(async (req, res) => {
    const row = await records.markFixedPaid(req.params.id, { month: null, today: localToday() });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.get('/settings', asyncRoute(async (_req, res) => {
    res.json(await core.getSettings());
  }));

  router.patch('/settings', asyncRoute(async (req, res) => {
    try {
      res.json(await core.updateSettings(req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/accounts', asyncRoute(async (req, res) => {
    try {
      res.json(await core.listAccounts({ status: req.query.status, entity: req.query.entity }));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.post('/accounts', asyncRoute(async (req, res) => {
    try {
      res.status(201).json(await core.createAccount(req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.patch('/accounts/:id', asyncRoute(async (req, res) => {
    try {
      const row = await core.updateAccount(req.params.id, req.body || {});
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/balances', asyncRoute(async (req, res) => {
    res.json(await core.listBalances({ account_id: req.query.account_id }));
  }));

  router.post('/balances', asyncRoute(async (req, res) => {
    try {
      res.status(201).json(await core.createBalance(req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/debts', asyncRoute(async (req, res) => {
    res.json(await ledger.listDebts({ status: req.query.status }));
  }));

  router.post('/debts', asyncRoute(async (req, res) => {
    try {
      res.status(201).json(await ledger.createDebt(req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.patch('/debts/:id', asyncRoute(async (req, res) => {
    const row = await ledger.updateDebt(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.post('/debts/:id/pay', asyncRoute(async (req, res) => {
    try {
      const row = await ledger.payDebt(req.params.id, withIntentKey(req));
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/subscriptions', asyncRoute(async (req, res) => {
    res.json(await records.listSubscriptions({ lane: req.query.lane, status: req.query.status }));
  }));

  router.post('/subscriptions', asyncRoute(async (req, res) => {
    try {
      res.status(201).json(await records.createSubscription(req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.patch('/subscriptions/:id', asyncRoute(async (req, res) => {
    const row = await records.updateSubscription(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.delete('/subscriptions/:id', asyncRoute(async (req, res) => {
    const row = await records.deleteSubscription(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, id: row.id });
  }));

  router.get('/installments', asyncRoute(async (req, res) => {
    res.json(await records.listInstallments({ status: req.query.status }));
  }));

  router.post('/installments', asyncRoute(async (req, res) => {
    try {
      res.status(201).json(await records.createInstallment(req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.patch('/installments/:id', asyncRoute(async (req, res) => {
    const row = await records.updateInstallment(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.delete('/installments/:id', asyncRoute(async (req, res) => {
    const row = await records.deleteInstallment(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, id: row.id });
  }));

  router.get('/transactions', asyncRoute(async (req, res) => {
    try {
      res.json(await ledger.listTransactions({
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
  }));

  router.post('/transactions', asyncRoute(async (req, res) => {
    try {
      const body = withIntentKey(req);
      const { row, replayed } = await ledger.createTransactionOnce({ ...body, posted_on: body.posted_on ?? localToday() });
      // reenvio da mesma intenção: devolve o primeiro lançamento, sem criar outro
      res.status(replayed ? 200 : 201).json(replayed ? { ...row, replayed: true } : row);
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.patch('/transactions/:id', asyncRoute(async (req, res) => {
    const row = await ledger.updateTransaction(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.get('/insights', asyncRoute(async (req, res) => {
    try {
      res.json(await reads.getInsights({ from: req.query.from, to: req.query.to, entity: req.query.entity, today: localToday() }));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/goals', asyncRoute(async (_req, res) => {
    res.json(await records.listGoals());
  }));

  router.post('/goals', asyncRoute(async (req, res) => {
    try {
      res.status(201).json(await records.createGoal(req.body || {}));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.patch('/goals/:id', asyncRoute(async (req, res) => {
    const row = await records.updateGoal(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  router.post('/seed', (req, res) => {
    const result = seedFinanceIfEmpty(db, { force: Boolean(req.body?.force) });
    res.json(result);
  });

  // Midas manda o JSON normalizado do Pluggy de hora em hora
  router.post('/ingest/pluggy', asyncRoute(async (req, res) => {
    try {
      res.json(await ingest.ingestPluggy(req.body, { today: localToday() }));
    } catch (err) {
      sendError(res, err);
    }
  }));

  /** O que se sabe do extrato no período (separado da data do saldo); PF por padrão, como mês e insights. */
  router.get('/coverage', asyncRoute(async (req, res) => {
    try {
      res.json(await reads.getCoverageFor({ from: req.query.from, to: req.query.to, today: localToday(), entity: req.query.entity }));
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/pending', asyncRoute(async (_req, res) => {
    try {
      res.json({ pending: await reads.listPending() });
    } catch (err) {
      sendError(res, err);
    }
  }));

  router.get('/sync/last', asyncRoute(async (_req, res) => {
    res.json(await reads.lastSync() || { ok: false, error: 'never' });
  }));

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
