/**
 * Fase 3 do PRD — uma baixa por intenção.
 * O reenvio da mesma chave devolve o primeiro resultado; duas intenções iguais em valor seguem valendo.
 * Falhas são provocadas com TRIGGER no SQLite, sem gancho de teste no código de produção.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createFinanceRouter } from './routes/finance.js';
import { sqliteTestStorage } from './test-support/httpParity.fase5.mjs';
import { initFinanceSchema, linkPaymentsToTransactions, seedFinanceIfEmpty } from './finance.js';
import { createTestDb, startTestServer } from './test-support/helpers.mjs';

async function mountFinance(t, { today = '2026-08-12' } = {}) {
  const db = createTestDb({ withFinance: true });
  seedFinanceIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.use('/api/finance', createFinanceRouter({ db, storage: sqliteTestStorage(db), getLocalDateString: () => today }));
  const server = await startTestServer(app);
  t.after(() => {
    db.close();
    return server.close();
  });
  return { db, server };
}

async function send(base, path, { body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  return { status: response.status, body: await response.json() };
}

function snapshot(db, debtId = 'debt-carro') {
  return {
    balance: db.prepare('SELECT balance FROM finance_debts WHERE id = ?').get(debtId).balance,
    payments: db.prepare('SELECT COUNT(*) n FROM finance_payments WHERE debt_id = ?').get(debtId).n,
    transactions: db.prepare('SELECT COUNT(*) n FROM finance_transactions WHERE debt_id = ?').get(debtId).n,
    goal: db.prepare("SELECT current_amount FROM finance_goals WHERE id = 'goal-carro'").get().current_amount,
  };
}

const PAY = '/api/finance/debts/debt-carro/pay';

test('reenvio da mesma intenção devolve a primeira baixa e não grava de novo', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = snapshot(db);
  const body = { amount: 25, paid_on: '2026-08-12', intent_key: 'baixa-carro-0001' };

  const first = await send(server.base, PAY, { body });
  assert.equal(first.status, 200);
  assert.equal(first.body.replayed, false);
  assert.equal(first.body.payment.amount, 25);
  assert.equal(first.body.transaction.payment_id, first.body.payment.id);
  const afterFirst = snapshot(db);
  assert.equal(afterFirst.balance, before.balance - 25);
  assert.equal(afterFirst.payments, before.payments + 1);
  assert.equal(afterFirst.transactions, before.transactions + 1);
  assert.equal(afterFirst.goal, before.goal + 25);

  const again = await send(server.base, PAY, { body });
  assert.equal(again.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.payment.id, first.body.payment.id);
  assert.equal(again.body.transaction.id, first.body.transaction.id);
  assert.equal(again.body.debt.balance, afterFirst.balance);
  assert.deepEqual(snapshot(db), afterFirst);
});

test('a chave também vale no cabeçalho Idempotency-Key', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = snapshot(db);
  const headers = { 'Idempotency-Key': 'baixa-carro-header-1' };
  const first = await send(server.base, PAY, { body: { amount: 25 }, headers });
  const again = await send(server.base, PAY, { body: { amount: 25 }, headers });
  assert.equal(first.body.replayed, false);
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.payment.id, first.body.payment.id);
  assert.equal(snapshot(db).payments, before.payments + 1);
});

test('duas intenções diferentes de R$ 25 são duas baixas', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = snapshot(db);
  const a = await send(server.base, PAY, { body: { amount: 25, intent_key: 'baixa-carro-000A' } });
  const b = await send(server.base, PAY, { body: { amount: 25, intent_key: 'baixa-carro-000B' } });
  assert.notEqual(a.body.payment.id, b.body.payment.id);
  assert.notEqual(a.body.transaction.id, b.body.transaction.id);
  const after = snapshot(db);
  assert.equal(after.balance, before.balance - 50);
  assert.equal(after.payments, before.payments + 2);
  assert.equal(after.transactions, before.transactions + 2);
});

test('sem chave o contrato antigo continua: cada chamada é uma baixa', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = snapshot(db);
  const a = await send(server.base, PAY, { body: { amount: 25 } });
  const b = await send(server.base, PAY, { body: { amount: 25 } });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.payment.intent_key, null);
  assert.equal(snapshot(db).payments, before.payments + 2);
});

test('a mesma chave com outro valor ou outra dívida é recusada sem gravar', async (t) => {
  const { db, server } = await mountFinance(t);
  await send(server.base, PAY, { body: { amount: 25, intent_key: 'baixa-carro-0002' } });
  const after = snapshot(db);
  const totals = () => ({
    payments: db.prepare('SELECT COUNT(*) n FROM finance_payments').get().n,
    transactions: db.prepare('SELECT COUNT(*) n FROM finance_transactions').get().n,
  });
  const totalsBefore = totals();

  const otherAmount = await send(server.base, PAY, { body: { amount: 30, intent_key: 'baixa-carro-0002' } });
  assert.equal(otherAmount.status, 409);
  assert.equal(otherAmount.body.code, 'intent_conflict');

  const otherDebt = db.prepare("SELECT id FROM finance_debts WHERE id != 'debt-carro' AND balance > 25 LIMIT 1").get();
  assert.ok(otherDebt, 'o seed precisa de outra dívida aberta');
  const wrongDebt = await send(server.base, `/api/finance/debts/${otherDebt.id}/pay`, {
    body: { amount: 25, intent_key: 'baixa-carro-0002' },
  });
  assert.equal(wrongDebt.status, 409);

  assert.deepEqual(snapshot(db), after);
  assert.deepEqual(totals(), totalsBefore);
});

test('chave malformada é recusada antes de qualquer gravação', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = snapshot(db);
  for (const bad of ['curta', 'com espaço dentro', 'x'.repeat(81), 12345678]) {
    const res = await send(server.base, PAY, { body: { amount: 25, intent_key: bad } });
    assert.equal(res.status, 400, `aceitou ${String(bad).slice(0, 20)}`);
  }
  assert.deepEqual(snapshot(db), before);
});

test('se o lançamento falha, a baixa inteira não entra; o reenvio grava uma vez só', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = snapshot(db);
  db.exec(`
    CREATE TRIGGER falha_no_lancamento BEFORE INSERT ON finance_transactions
    BEGIN SELECT RAISE(ABORT, 'falha induzida: lançamento'); END;
  `);
  const body = { amount: 25, intent_key: 'baixa-carro-0003' };
  const failed = await send(server.base, PAY, { body });
  assert.equal(failed.status, 500);
  assert.deepEqual(snapshot(db), before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM finance_payments WHERE intent_key = 'baixa-carro-0003'").get().n, 0);

  db.exec('DROP TRIGGER falha_no_lancamento');
  const retry = await send(server.base, PAY, { body });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.replayed, false);
  const again = await send(server.base, PAY, { body });
  assert.equal(again.body.replayed, true);
  const after = snapshot(db);
  assert.equal(after.balance, before.balance - 25);
  assert.equal(after.payments, before.payments + 1);
  assert.equal(after.transactions, before.transactions + 1);
});

test('se a meta falha depois da baixa, saldo, baixa e lançamento voltam atrás', async (t) => {
  const { db, server } = await mountFinance(t);
  const before = snapshot(db);
  db.exec(`
    CREATE TRIGGER falha_na_meta BEFORE UPDATE ON finance_goals
    BEGIN SELECT RAISE(ABORT, 'falha induzida: meta'); END;
  `);
  const failed = await send(server.base, PAY, { body: { amount: 25, intent_key: 'baixa-carro-0004' } });
  assert.equal(failed.status, 500);
  assert.deepEqual(snapshot(db), before);
});

test('gasto manual com a mesma intenção vira um lançamento só', async (t) => {
  const { db, server } = await mountFinance(t);
  const count = () => db.prepare('SELECT COUNT(*) n FROM finance_transactions').get().n;
  const before = count();
  const body = { amount: -42.5, merchant: 'Padaria', category: 'Alimentação', intent_key: 'gasto-padaria-01' };

  const first = await send(server.base, '/api/finance/transactions', { body });
  assert.equal(first.status, 201);
  assert.equal(first.body.amount, -42.5);
  const again = await send(server.base, '/api/finance/transactions', { body });
  assert.equal(again.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.id, first.body.id);
  assert.equal(count(), before + 1);

  const other = await send(server.base, '/api/finance/transactions', { body: { ...body, intent_key: 'gasto-padaria-02' } });
  assert.equal(other.status, 201);
  assert.equal(count(), before + 2);

  const conflict = await send(server.base, '/api/finance/transactions', { body: { ...body, amount: -99 } });
  assert.equal(conflict.status, 409);
  assert.equal(count(), before + 2);

  const semChave = await send(server.base, '/api/finance/transactions', { body: { amount: -5, merchant: 'Café' } });
  assert.equal(semChave.status, 201);
  assert.equal(semChave.body.intent_key, null);
});

test('baixas antigas são ligadas ao próprio lançamento, uma a uma, sem mudar valor', (t) => {
  const db = createTestDb({ withFinance: true });
  t.after(() => db.close());
  seedFinanceIfEmpty(db);
  const insPay = db.prepare(`
    INSERT INTO finance_payments (id, debt_id, account_id, amount, paid_on, method, confirmed, note, created_at)
    VALUES (?, 'debt-carro', NULL, ?, ?, 'pix', 1, '', ?)
  `);
  const insTx = db.prepare(`
    INSERT INTO finance_transactions (id, posted_on, amount, direction, raw_description, merchant, category, debt_id, source, created_at)
    VALUES (?, ?, ?, 'outflow', '', 'Carro', 'Dívidas', 'debt-carro', 'joao', ?)
  `);
  // duas baixas iguais no mesmo dia (como em produção em 12/08) e uma em outro dia
  insPay.run('pay-1', 1270, '2026-08-12', '2026-08-12T19:26:08.000Z');
  insPay.run('pay-2', 1270, '2026-08-12', '2026-08-12T19:26:53.000Z');
  insPay.run('pay-3', 1270, '2026-09-21', '2026-09-21T16:55:53.000Z');
  insPay.run('pay-sem-par', 77, '2026-09-22', '2026-09-22T10:00:00.000Z');
  insTx.run('tx-1', '2026-08-12', -1270, '2026-08-12T19:26:08.100Z');
  insTx.run('tx-2', '2026-08-12', -1270, '2026-08-12T19:26:53.100Z');
  insTx.run('tx-3', '2026-09-21', -1270, '2026-09-21T16:55:53.100Z');
  const sumBefore = db.prepare('SELECT SUM(amount) s FROM finance_transactions').get().s;

  assert.equal(linkPaymentsToTransactions(db), 3);
  const links = db.prepare('SELECT id, payment_id FROM finance_transactions WHERE debt_id = ? ORDER BY id').all('debt-carro');
  assert.deepEqual(links, [
    { id: 'tx-1', payment_id: 'pay-1' },
    { id: 'tx-2', payment_id: 'pay-2' },
    { id: 'tx-3', payment_id: 'pay-3' },
  ]);
  assert.equal(linkPaymentsToTransactions(db), 0, 'segunda passada não mexe');
  initFinanceSchema(db);
  initFinanceSchema(db);
  assert.deepEqual(
    db.prepare('SELECT id, payment_id FROM finance_transactions WHERE debt_id = ? ORDER BY id').all('debt-carro'),
    links,
  );
  assert.equal(db.prepare('SELECT SUM(amount) s FROM finance_transactions').get().s, sumBefore);
});
