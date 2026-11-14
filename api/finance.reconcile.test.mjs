/**
 * Fase 3 do PRD — a carga das duas origens não duplica contas e os totais fecham em centavos.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { createTransaction, getOverview, initFinanceSchema, seedFinanceIfEmpty } from './finance.js';
import { diffTotals, financeTotals, toCents } from './lib/financeReconcile.js';
import { ingestPluggy } from './pluggyIngest.js';
import { syncPierre } from './pierreSync.js';
import { createTestDb, startTestServer } from './test-support/helpers.mjs';

const TODAY = '2026-11-14';

function seeded(t) {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  t.after(() => db.close());
  return db;
}

/** Pierre de mentira: Inter com conta e cartão, Nubank com conta. */
function mockPierre(t) {
  const original = globalThis.fetch;
  const previousKey = process.env.PIERRE_API_KEY;
  process.env.PIERRE_API_KEY = 'chave-de-teste';
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (!u.includes('pierre.finance')) return original(url, options);
    const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.includes('get-accounts')) {
      return json({
        accounts: [
          { id: 'p-inter-conta', name: 'Inter', connectorName: 'Banco Inter', type: 'BANK', mask: '1111' },
          { id: 'p-inter-cartao', name: 'Inter Gold', connectorName: 'Banco Inter', type: 'CREDIT', mask: '2222' },
          { id: 'p-nu-conta', name: 'Nubank', connectorName: 'Nubank', type: 'BANK', mask: '3333' },
        ],
      });
    }
    if (u.includes('get-balance')) {
      return json({ balances: [
        { accountId: 'p-inter-conta', amount: 120.5, date: TODAY },
        { accountId: 'p-nu-conta', amount: 30, date: TODAY },
      ] });
    }
    if (u.includes('get-bank-statement')) return json({ transactions: [] });
    return json({});
  };
  t.after(() => {
    globalThis.fetch = original;
    if (previousKey === undefined) delete process.env.PIERRE_API_KEY;
    else process.env.PIERRE_API_KEY = previousKey;
  });
}

function pluggyBody(minute) {
  const at = `2026-11-14T18:${String(minute).padStart(2, '0')}:00Z`;
  return {
    source: 'pluggy',
    fetched_at: at,
    institutions: ['inter', 'nubank'].map((institution) => ({
      institution,
      updated_at: at,
      status: 'UPDATED',
      bank: { balance: 99.9, reserved: [] },
      card: null,
    })),
  };
}

const accountRows = (db) => db.prepare(
  'SELECT id, institution, kind, pierre_account_id FROM finance_accounts ORDER BY id',
).all();

test('Pierre e Pluggy carregando a mesma base, em qualquer ordem e repetidas vezes, não duplicam contas', async (t) => {
  const db = seeded(t);
  mockPierre(t);
  const seedIds = accountRows(db).map((a) => a.id);

  ingestPluggy(db, pluggyBody(1), { today: TODAY });
  assert.deepEqual(accountRows(db).map((a) => a.id), seedIds, 'Pluggy nunca cria conta');

  const first = await syncPierre(db, { actor: 'joao', getLocalDateString: () => TODAY });
  assert.equal(first.ok, true);
  const afterFirst = accountRows(db);
  // a conta do Inter e a do Nubank casam com as que já existem; só o cartão do Inter é novo
  assert.equal(afterFirst.length, seedIds.length + 1);
  const link = (pid) => afterFirst.filter((a) => a.pierre_account_id === pid).map((a) => a.id);
  assert.deepEqual(link('p-inter-conta'), ['acc-inter']);
  assert.deepEqual(link('p-nu-conta'), ['acc-nubank']);
  assert.equal(link('p-inter-cartao').length, 1);
  assert.notEqual(link('p-inter-cartao')[0], 'acc-inter', 'o cartão não toma o vínculo da conta');

  for (let round = 2; round <= 4; round += 1) {
    ingestPluggy(db, pluggyBody(round), { today: TODAY });
    await syncPierre(db, { actor: 'joao', getLocalDateString: () => TODAY });
    assert.deepEqual(accountRows(db), afterFirst, `rodada ${round}: mesmas contas, mesmos vínculos`);
  }

  const repeated = db.prepare(`
    SELECT pierre_account_id, COUNT(*) n FROM finance_accounts
    WHERE pierre_account_id IS NOT NULL GROUP BY 1 HAVING n > 1
  `).all();
  assert.deepEqual(repeated, []);
  // as duas origens gravaram saldo na mesma conta, cada uma com o seu nome
  const sources = db.prepare(`
    SELECT DISTINCT source FROM finance_balances WHERE account_id = 'acc-inter' AND amount_kind = 'available' ORDER BY 1
  `).all().map((r) => r.source);
  assert.ok(sources.includes('pierre') && sources.includes('pluggy'));
});

test('totais em centavos por conta, mês e categoria batem com a conta feita à mão', (t) => {
  const db = seeded(t);
  const base = financeTotals(db);
  // valores que escorregam em ponto flutuante: 0,10 + 0,20 e 33,33 x 3
  createTransaction(db, { amount: -0.1, posted_on: '2026-11-03', category: 'Alimentação', source: 'joao', account_id: 'acc-inter' });
  createTransaction(db, { amount: -0.2, posted_on: '2026-11-04', category: 'Alimentação', source: 'joao', account_id: 'acc-inter' });
  for (const day of ['05', '06', '07']) {
    createTransaction(db, { amount: -33.33, posted_on: `2026-11-${day}`, category: 'Transporte', source: 'agent', account_id: 'acc-c6' });
  }
  createTransaction(db, { amount: -19.99, posted_on: '2026-10-31', category: 'Alimentação', source: 'joao', account_id: 'acc-inter' });
  createTransaction(db, { amount: 1500, posted_on: '2026-11-05', category: 'Receita', source: 'joao', account_id: 'acc-inter' });

  const totals = financeTotals(db);
  const row = (account, month, category, direction) => totals.transactions.filter(
    (r) => r.account_id === account && r.month === month && r.category === category && r.direction === direction,
  ).reduce((acc, r) => ({ n: acc.n + r.n, cents: acc.cents + r.cents }), { n: 0, cents: 0 });

  assert.deepEqual(row('acc-inter', '2026-11', 'Alimentação', 'outflow'), { n: 2, cents: -30 });
  assert.deepEqual(row('acc-c6', '2026-11', 'Transporte', 'outflow'), { n: 3, cents: -9999 });
  assert.deepEqual(row('acc-inter', '2026-10', 'Alimentação', 'outflow'), { n: 1, cents: -1999 });
  assert.deepEqual(row('acc-inter', '2026-11', 'Receita', 'inflow'), { n: 1, cents: 150000 });
  assert.equal(totals.summary.transactions_n, base.summary.transactions_n + 7);
  assert.equal(totals.summary.outflow_cents, base.summary.outflow_cents - 30 - 9999 - 1999);
  assert.equal(totals.summary.inflow_cents, base.summary.inflow_cents + 150000);
  for (const r of totals.transactions) assert.ok(Number.isInteger(r.cents), 'centavos inteiros');
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(33.33 * 3), 9999);

  assert.notEqual(totals.hash, base.hash);
  assert.ok(diffTotals(base, totals).some((line) => line.startsWith('lançamentos acc-c6|2026-11|Transporte')));
});

test('subir a migração de novo e reenviar a mesma baixa não mexem em nenhum total', async (t) => {
  const db = seeded(t);
  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, getLocalDateString: () => '2026-08-12' }));
  const server = await startTestServer(app);
  t.after(() => server.close());
  const pay = (intent) => fetch(`${server.base}/api/finance/debts/debt-carro/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': intent },
    body: JSON.stringify({ amount: 25, paid_on: '2026-08-12' }),
  }).then((r) => r.json());

  const before = financeTotals(db);
  initFinanceSchema(db);
  initFinanceSchema(db);
  assert.equal(financeTotals(db).hash, before.hash, 'migração repetida');
  assert.deepEqual(diffTotals(before, financeTotals(db)), []);

  await pay('baixa-0001');
  const once = financeTotals(db);
  assert.equal(once.summary.payments_cents, before.summary.payments_cents + 2500);
  assert.equal(once.summary.debts_open_cents, before.summary.debts_open_cents - 2500);

  const again = await pay('baixa-0001');
  assert.equal(again.replayed, true);
  assert.equal(financeTotals(db).hash, once.hash, 'reenvio');

  await pay('baixa-0002');
  const twice = financeTotals(db);
  assert.equal(twice.summary.payments_cents, before.summary.payments_cents + 5000, 'segunda intenção legítima conta');
  assert.deepEqual(
    diffTotals(once, twice).map((line) => line.split(' ')[0]).sort(),
    ['baixas', 'dívida', 'lançamentos'],
  );
});

test('"O banco mostrou": uma linha por conta, a origem mais recente vence e conta só com Pluggy entra', (t) => {
  const db = seeded(t);
  db.prepare("DELETE FROM finance_balances").run();
  const put = (account, kind, amount, source, asOf, createdAt) => db.prepare(`
    INSERT INTO finance_balances (id, account_id, amount, amount_kind, source, as_of, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(`${account}-${kind}-${source}-${asOf}`, account, amount, kind, source, asOf, createdAt || `${asOf}T12:00:00.000Z`);
  // Inter: Pierre antigo, Pluggy novo e, por último, um saldo digitado
  put('acc-inter', 'available', 100, 'pierre', '2026-09-14');
  put('acc-inter', 'available', 250.5, 'pluggy', '2026-11-13');
  put('acc-inter', 'available', 999, 'joao', '2026-11-14');
  put('acc-inter', 'invested', 40, 'pierre', '2026-09-14');
  // Nubank: só Pluggy, sem vínculo com o Pierre (era a conta que ficava de fora)
  put('acc-nubank', 'available', 0, 'pluggy', '2026-11-14');
  // C6: só Pierre, velho
  put('acc-c6', 'available', 12, 'pierre', '2026-08-27');
  // PicPay: só digitado; Santander: arquivada
  put('acc-picpay', 'available', 70, 'joao', '2026-11-14');
  put('acc-santander', 'available', 5, 'pluggy', '2026-11-14');
  db.prepare("UPDATE finance_accounts SET status = 'archived' WHERE id = 'acc-santander'").run();

  const shown = getOverview(db, { today: TODAY }).bank_shown;
  assert.deepEqual(shown.map((e) => [e.account_id, e.amount_kind, e.amount, e.source, e.as_of, e.stale]), [
    ['acc-inter', 'available', 250.5, 'pluggy', '2026-11-13', false],
    ['acc-inter', 'invested', 40, 'pierre', '2026-09-14', true],
    ['acc-c6', 'available', 12, 'pierre', '2026-08-27', true],
    ['acc-nubank', 'available', 0, 'pluggy', '2026-11-14', false],
  ]);
  assert.equal(new Set(shown.map((e) => e.id)).size, shown.length, 'nenhuma conta contada duas vezes');
});

test('categoria do banco: "pagamento" não vira Lazer e os nomes em inglês do Pluggy têm destino', async () => {
  const { mapBankCategory } = await import('./finance.js');
  const map = (category, description, amount = -10, type = 'BANK') => mapBankCategory(category, description, amount, type);
  // "game" casava dentro de "paGAMEnto": o boleto do carro aparecia como Lazer
  assert.equal(map('Transfers', 'Pagamento efetuado - BANCO ITAU UNIBANCO S.A.', -1270.9), 'Outros');
  assert.equal(map('Transfers', 'Pagamento de Título - BANCO ITAU UNIBANCO S.A.', -1270.9), 'Outros');
  assert.equal(map('Entertainment', 'STEAM GAMES', -50, 'CREDIT'), 'Lazer');
  assert.equal(map('Tickets', 'SYMPLA', -90, 'CREDIT'), 'Lazer');
  assert.equal(map('Vehicle maintenance', 'AUTO CENTER', -200, 'CREDIT'), 'Transporte');
  assert.equal(map('Automotive', 'LOJA X', -100, 'CREDIT'), 'Transporte');
  assert.equal(map('Optometry', 'OTICAS Y', -120, 'CREDIT'), 'Saúde');
  assert.equal(map('Wellness and fitness', 'ACADEMIA Z', -59, 'CREDIT'), 'Fitness');
  assert.equal(map('Same person transfer', 'PIX ENVIADO', -500), 'Transferência');
  assert.equal(map('Credit card payment', 'Pagamento de fatura', -900), 'Pagamento de fatura');
});
