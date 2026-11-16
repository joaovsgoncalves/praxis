/**
 * Finanças, domínio 5: `POST /api/finance/ingest/pluggy` sobre a camada assíncrona, com a mesma resposta e
 * os mesmos efeitos de `ingestPluggy` (pluggyIngest.js; oráculo em test-support/oracles/pluggyIngest.bcbadad.js).
 *
 * Como a antiga, valida o corpo inteiro antes de gravar (`parsePluggyPayload`), é idempotente por
 * `external_id` e não consulta banco nenhum: o Midas já mandou o JSON.
 *
 * Diferença de forma, mesma regra: a antiga alternava leitura e escrita dentro de um `db.transaction`; o
 * Firestore exige leituras antes das escritas. Aqui toda a leitura vem primeiro (contas, estado do cartão,
 * saldos das contas da instituição, dívidas, baixas, janelas de cobertura, pendentes, lançamentos das
 * datas do corpo), a decisão é tomada sobre um modelo em memória que enxerga o que as etapas anteriores do
 * mesmo corpo já decidiram (um manual casado não casa de novo; um lançamento novo conta para a pendente
 * gêmea) e só então saem as escritas, como lista de operações.
 *
 * Tamanho do commit: até `CHUNK_WEIGHT` escritas tudo vai numa transação só, como a antiga. Acima disso
 * (carga inicial de centenas de lançamentos) o resto dos lançamentos sai em transações seguintes e o log de
 * sincronização por último; reenviar o mesmo corpo completa o que faltar (idempotente). O limite de escritas
 * por commit do Firestore real não é aplicado pelo emulador: confirmar antes do corte.
 */
import { randomUUID } from 'node:crypto';
import {
  MANUAL_SOURCES, cleanMerchant, mapBankCategory, money, todayFortaleza,
} from '../../finance.js';
import { parsePluggyPayload, businessDaysBetween, MANUAL_PAYMENT_GRACE_BUSINESS_DAYS } from '../../pluggyIngest.js';
import { compareSqlite } from '../../storage/sqliteOrder.js';
import { createSettingsPlanner } from './core.js';
import { createFinanceReadsService } from './reads.js';
import { addDays } from './shared.js';
import { DOMAINS as FINANCE_DOMAINS } from '../../storage/domains/phase5.js';

const CHUNK_WEIGHT = 350;
const dayNumber = (ymd) => Date.parse(`${String(ymd).slice(0, 10)}T00:00:00Z`) / 86400000;
const toCard = (v) => (v == null ? null : money(v));
const byColumns = (...keys) => (a, b) => { for (const [key, dir] of keys) { const result = compareSqlite(a[key] ?? null, b[key] ?? null) * dir; if (result) return result; } return 0; };

export function createFinanceIngestService({ storage, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.financePendingTransactions || typeof storage.transaction !== 'function') throw new TypeError('finance ingest service requires storage');
  const reads = createFinanceReadsService({ storage, now });
  const { planSettings } = createSettingsPlanner({ now });

  /**
   * Lê tudo e decide. Devolve o que responder e as operações de escrita. `tx` = fachada da transação
   * (só leituras aqui). Não grava nada.
   */
  async function plan(tx, payload, stamp, day) {
    const ops = [];            // escritas pequenas e fixas (saldo, cartão, dívida, cobertura, pendentes, configuração)
    // um documento recebe uma escrita só por commit: as mudanças do mesmo corpo se juntam aqui
    const balanceChanges = new Map(), balanceCreates = [], debtChanges = new Map();
    const deferred = [];       // lançamentos novos e religações: podem sair em mais de uma transação
    const applied = [], skipped = [];

    // ── leitura ──
    const accounts = await tx.financeAccounts.list({ status: null, entity: null });
    const cardRows = new Map((await tx.financeCardStatus.list()).map((row) => [row.account_id, row]));
    const debts = await tx.financeDebts.list({ status: null });
    const payments = await tx.financePayments.list({});
    const receipts = await tx.financeReceipts.list();
    const windows = (await tx.financeStatementCoverage.list({ account_id: null })).map((w) => ({ ...w }));
    const pendingRows = new Map((await tx.financePendingTransactions.list()).map((row) => [row.external_id, row]));
    const settings = await tx.financeSettings.get();
    const balancesOf = new Map();
    const loadBalances = async (accountId) => {
      if (!balancesOf.has(accountId)) balancesOf.set(accountId, (await tx.financeBalances.list({ accountId, limit: null })).map((row) => ({ ...row })));
      return balancesOf.get(accountId);
    };
    // contas dos bancos que vão ser lidos: o saldo mais novo de cada uma já vem agora
    for (const item of payload.institutions) for (const account of accounts) if (account.institution === item.institution) await loadBalances(account.id);

    const dates = [...payload.transactions, ...payload.pending_transactions].map((t) => t.date).sort();
    const known = new Map();   // external_id -> linha existente
    const wanted = [...new Set([...payload.transactions, ...payload.pending_transactions].map((t) => t.external_id))];
    for (const row of await tx.financeTransactions.byExternalIds(wanted)) known.set(row.external_id, row);
    // vizinhança de datas para casar manuais (±3 dias) e achar gêmeas de pendentes (-3 a +10 dias)
    const neighbours = dates.length
      ? await tx.financeTransactions.between({ from: addDays(dates[0], -10), to: addDays(dates.at(-1), 10) })
      : [];

    // ── consultas em memória (mesmo SQL da antiga, termo a termo) ──
    const operational = (institution) => accounts
      .filter((a) => a.institution === institution && a.kind !== null && a.kind !== 'credit' && a.status === 'active' && a.entity === 'pf')
      .sort(byColumns(['is_operational', -1], ['sort_order', 1], ['id', 1]))[0] || null;
    const cardAccount = (institution, last4, fallback) => {
      if (last4) {
        const credit = accounts
          .filter((a) => a.kind === 'credit' && a.status === 'active' && a.entity === 'pf' && (a.mask === last4 || a.card_last4 === last4))
          .map((a) => ({ ...a, mine: a.institution === null ? null : a.institution === institution ? 1 : 0 }))
          .sort(byColumns(['mine', -1], ['sort_order', 1], ['id', 1]))[0];
        if (credit) return accounts.find((a) => a.id === credit.id);
      }
      return fallback;
    };
    const transactionAccount = (item) => {
      const op = operational(item.institution);
      if (item.account_type !== 'CREDIT') return op;
      const byCard = [...cardRows.values()]
        .filter((cs) => cs.institution === item.institution)
        .map((cs) => accounts.find((a) => a.id === cs.account_id))
        .filter((a) => a && a.status === 'active' && a.entity === 'pf')
        .sort(byColumns(['sort_order', 1], ['id', 1]))[0];
      if (byCard) return byCard;
      return accounts
        .filter((a) => a.kind === 'credit' && a.status === 'active' && a.institution === item.institution && a.entity === 'pf')
        .sort(byColumns(['sort_order', 1], ['id', 1]))[0] || op;
    };
    const storedBankTime = async (institution) => {
      const card = [...cardRows.values()].filter((cs) => cs.institution === institution).map((cs) => cs.bank_updated_at).filter(Boolean).sort().at(-1);
      let balance = null;
      for (const account of accounts.filter((a) => a.institution === institution)) {
        for (const row of await loadBalances(account.id)) if (row.source === 'pluggy' && row.created_at && (!balance || row.created_at > balance)) balance = row.created_at;
      }
      return [card, balance].filter(Boolean).sort().at(-1) || null;
    };

    const settingsPlan = () => planSettings(settings, { snapshot_label: '' });
    const cardTouched = new Set();
    const initialWindows = new Set(windows.map((w) => w.id));

    // ── instituições ──
    const upsertBalance = async (accountId, bank, bankUpdatedAt) => {
      const asOf = todayFortaleza(new Date(bankUpdatedAt));
      const amount = money(bank.balance + bank.reserved.reduce((s, r) => s + r.amount, 0));
      const reservedNames = bank.reserved.filter((r) => r.amount).map((r) => r.name).filter(Boolean);
      const note = reservedNames.length ? `inclui reservas: ${reservedNames.join(', ')}` : '';
      const rows = await loadBalances(accountId);
      const existing = rows.find((row) => row.as_of === asOf && row.amount_kind === 'available' && row.source === 'pluggy');
      // created_at = hora real do banco: no desempate do último saldo, o manual mais novo que ela vence
      if (existing) {
        Object.assign(existing, { amount, note, created_at: bankUpdatedAt });
        if (balanceCreates.includes(existing)) { /* ainda não gravado: a linha nova já carrega o valor */ } else balanceChanges.set(existing.id, { amount, note, created_at: bankUpdatedAt });
      } else {
        const row = { id: newId(), account_id: accountId, as_of: asOf, amount, amount_kind: 'available', source: 'pluggy', locked: 0, note, created_at: bankUpdatedAt };
        rows.push(row);
        balanceCreates.push(row);
      }
      return amount;
    };

    const pendingManualCardPayment = (accountIds, bill, today) => {
      if (!bill || !accountIds.length || !today) return 0;
      const cardDebts = debts.filter((d) => d.kind === 'card' && accountIds.includes(d.account_id));
      if (!cardDebts.length) return 0;
      const since = bill.closing_date || (bill.due_date ? new Date(dayNumber(bill.due_date) * 86400000 - 40 * 86400000).toISOString().slice(0, 10) : null);
      if (!since) return 0;
      const debtIds = cardDebts.map((d) => d.id);
      const rows = payments.filter((p) => debtIds.includes(p.debt_id) && p.confirmed === 1 && p.paid_on >= since && p.paid_on <= today);
      const manual = money(rows
        .filter((r) => businessDaysBetween(r.paid_on, today) <= MANUAL_PAYMENT_GRACE_BUSINESS_DAYS)
        .reduce((s, r) => s + Number(r.amount || 0), 0));
      if (manual <= 0.009) return 0;
      let missing = Math.max(0, manual - Number(bill.paid || 0));
      const paymentById = new Map(payments.map((p) => [p.id, p]));
      const tracked = receipts
        .map((r) => ({ r, p: paymentById.get(r.payment_id) }))
        .filter(({ r, p }) => p && debtIds.includes(p.debt_id) && r.cycle_closing === since && r.cycle_due === bill.due_date && p.confirmed === 1 && p.paid_on <= today)
        .filter(({ p }) => businessDaysBetween(p.paid_on, today) <= MANUAL_PAYMENT_GRACE_BUSINESS_DAYS);
      if (tracked.length) missing = Math.max(missing, Math.max(...tracked.map(({ r }) => r.expected_paid_floor)) - Number(bill.paid || 0));
      return money(Math.min(manual, Math.max(0, missing), Math.max(0, Number(bill.total || 0) - Number(bill.paid || 0))));
    };

    const upsertCardStatus = (accountId, institution, card, bankUpdatedAt, manualPaid = 0) => {
      const bill = card.bill;
      const remaining = bill ? money(Math.max(0, bill.total - bill.paid)) : null;
      const row = {
        account_id: accountId, institution, last4: card.last4, brand: card.brand, used: toCard(card.used), limit_total: toCard(card.limit),
        limit_available: toCard(card.available), bill_total: bill ? money(bill.total) : null, bill_minimum: bill ? money(bill.minimum) : null,
        bill_paid: bill ? money(bill.paid) : null, bill_remaining: remaining, bill_due: bill?.due_date || null, bill_closing: bill?.closing_date || null,
        bank_updated_at: bankUpdatedAt, updated_at: stamp, source: 'pluggy', bill_paid_manual: money(manualPaid || 0),
      };
      cardRows.set(accountId, row);
      cardTouched.add(accountId);
      return remaining;
    };

    const updateCardDebt = (accountIds, bill) => {
      let debt = null;
      for (const id of accountIds) {
        debt = debts.filter((d) => d.kind === 'card' && d.account_id === id).sort(byColumns(['queue', 1], ['created_at', 1]))[0];
        if (debt) break;
      }
      if (!debt) return null;
      const remaining = money(Math.max(0, bill.total - bill.paid));
      const fields = { balance: remaining, min_payment: money(Math.max(0, bill.minimum - bill.paid)), due_date: bill.due_date, status: remaining <= 0.01 ? 'clean' : 'open', source: 'pluggy', updated_at: stamp };
      Object.assign(debt, fields);
      debtChanges.set(debt.id, { ...(debtChanges.get(debt.id) ?? {}), ...fields });
      return debt.id;
    };

    const recordCoverage = (accountId, from, to) => {
      // encosta ou sobrepõe: começa até o dia seguinte ao fim e termina a partir da véspera do início
      const touching = windows.filter((w) => w.account_id === accountId && w.source === 'pluggy' && w.covered_from <= addDays(to, 1) && w.covered_to >= addDays(from, -1));
      let start = from, end = to, latest = stamp;
      for (const row of touching) {
        if (row.covered_from < start) start = row.covered_from;
        if (row.covered_to > end) end = row.covered_to;
        if (row.recorded_at > latest) latest = row.recorded_at;
      }
      for (const row of touching) windows.splice(windows.indexOf(row), 1);
      windows.push({ id: newId(), account_id: accountId, source: 'pluggy', covered_from: start, covered_to: end, recorded_at: latest });
    };

    const applyStatementCoverage = (item) => {
      if (!item.statement) return [];
      const op = operational(item.institution);
      const credit = accounts.filter((a) => a.kind === 'credit' && a.status === 'active' && a.institution === item.institution);
      // o cartão pode ter vindo de outra origem com outro nome de instituição: vale o final do cartão
      const byLast4 = item.card ? cardAccount(item.institution, item.card.last4, null) : null;
      const ids = [...new Set([op?.id, byLast4?.id, ...credit.map((c) => c.id)].filter(Boolean))];
      for (const accountId of ids) recordCoverage(accountId, item.statement.from, item.statement.to);
      return ids;
    };

    for (const item of payload.institutions) {
      if (item.status !== 'UPDATED') { skipped.push({ institution: item.institution, status: item.status, reason: 'status do banco' }); continue; }
      const op = operational(item.institution);
      const cardAcc = item.card ? cardAccount(item.institution, item.card.last4, op) : null;
      if (!op && !cardAcc) { skipped.push({ institution: item.institution, status: item.status, reason: 'sem conta na Praxis' }); continue; }
      const stored = await storedBankTime(item.institution);
      if (stored && item.updated_at < stored) { skipped.push({ institution: item.institution, status: item.status, reason: 'dados mais antigos que os gravados' }); continue; }
      const result = { institution: item.institution, account_id: op?.id || null, card_account_id: cardAcc?.id || null, balance: null, bill_remaining: null, debt_id: null, manual_paid_pending: 0 };
      if (item.bank && op) result.balance = await upsertBalance(op.id, item.bank, item.updated_at);
      if (item.card && cardAcc) {
        const ids = [...new Set([cardAcc.id, op?.id].filter(Boolean))];
        const manual = item.card.bill ? pendingManualCardPayment(ids, item.card.bill, day) : 0;
        const card = manual > 0 ? { ...item.card, bill: { ...item.card.bill, paid: money(item.card.bill.paid + manual) } } : item.card;
        result.manual_paid_pending = manual;
        result.bill_remaining = upsertCardStatus(cardAcc.id, item.institution, card, item.updated_at, manual);
        if (card.bill) result.debt_id = updateCardDebt(ids, card.bill);
      }
      result.statement_accounts = applyStatementCoverage(item);
      applied.push(result);
    }
    for (const [id, fields] of balanceChanges) ops.push({ t: 'balancePatch', id, fields });
    for (const row of balanceCreates) ops.push({ t: 'balanceCreate', row });
    for (const accountId of cardTouched) ops.push({ t: 'cardUpsert', row: cardRows.get(accountId) });
    for (const [id, fields] of debtChanges) ops.push({ t: 'debtPatch', id, fields });
    // cobertura: as janelas que existiam e sumiram saem; as criadas neste corpo e ainda vivas entram
    const finalWindows = new Set(windows.map((w) => w.id));
    for (const id of initialWindows) if (!finalWindows.has(id)) ops.push({ t: 'coverageRemove', id });
    for (const w of windows) if (!initialWindows.has(w.id)) ops.push({ t: 'coverageCreate', row: { id: w.id, account_id: w.account_id, source: w.source, covered_from: w.covered_from, covered_to: w.covered_to, recorded_at: w.recorded_at } });
    if (applied.some((a) => a.balance !== null)) ops.push({ t: 'settings', plan: settingsPlan() });

    // ── lançamentos ──
    const candidates = neighbours.map((row) => ({ ...row }));     // linhas do banco de dados + as que este corpo cria
    const exists = new Map(known);
    const summary = { received: payload.transactions.length, inserted: 0, duplicates: 0, matched: 0, relinked: 0, skipped: [] };
    const matchManual = (bankTx, altAccountId) => {
      if (bankTx.amount >= 0) return null;
      return candidates
        .filter((c) => MANUAL_SOURCES.includes(c.source) && c.direction === 'outflow' && c.matched_tx_id === null
          && (c.external_id === null || c.external_id === '')
          // Debt payments without an identified funding account cannot be safely reconciled.
          // Never let a debt payment relabel an unrelated ordinary purchase.
          && (c.debt_id === null || (c.account_id !== null && c.account_id === bankTx.account_id && c.category === bankTx.category))
          && Math.abs(Math.abs(c.amount) - Math.abs(bankTx.amount)) < 0.005
          && c.posted_on >= addDays(bankTx.posted_on, -3) && c.posted_on <= addDays(bankTx.posted_on, 3)
          && (c.account_id === null || c.account_id === bankTx.account_id || c.account_id === (altAccountId ?? bankTx.account_id)))
        .map((c) => ({ c, d: Math.abs(dayNumber(c.posted_on) - dayNumber(bankTx.posted_on)) }))
        // empate de distância: `created_at`, depois a ordem em que o SQLite varre (data, inserção)
        .sort((a, b) => a.d - b.d || compareSqlite(a.c.created_at, b.c.created_at))[0]?.c || null;
    };
    for (const item of payload.transactions) {
      const found = exists.get(item.external_id);
      if (found) {
        summary.duplicates += 1;
        // lançamento do banco gravado na conta errada (ex.: compra de cartão na corrente): só troca a conta
        const right = transactionAccount(item);
        if (found.source === 'pluggy' && right && found.account_id !== right.id) {
          deferred.push({ t: 'txPatch', id: found.id, fields: { account_id: right.id }, weight: 1 });
          found.account_id = right.id;
          const mirror = candidates.find((c) => c.id === found.id);
          if (mirror) mirror.account_id = right.id;
          summary.relinked += 1;
        }
        continue;
      }
      const account = transactionAccount(item);
      if (!account) { summary.skipped.push({ external_id: item.external_id, reason: 'sem conta na Praxis' }); continue; }
      const row = { id: newId(), account_id: account.id, posted_on: item.date, amount: money(item.amount), category: mapBankCategory(item.category, item.description, item.amount, item.account_type), merchant: cleanMerchant(item.description), note: '' };
      // compra de cartão: o João pode ter lançado o gasto na corrente do mesmo banco
      const alt = item.account_type === 'CREDIT' ? operational(item.institution)?.id ?? null : null;
      const manual = matchManual(row, alt);
      if (manual) {
        if (manual.category && manual.category !== 'Outros') row.category = manual.category;
        if (manual.merchant) row.merchant = manual.merchant;
        row.note = manual.note || '';
      }
      const created = {
        id: row.id, pierre_tx_id: null, account_id: row.account_id, posted_on: row.posted_on, amount: row.amount, direction: row.amount < 0 ? 'outflow' : 'inflow',
        raw_description: item.description, merchant: row.merchant, category: row.category, subscription_id: null, debt_id: null, source: 'pluggy',
        created_at: now().toISOString(), external_id: item.external_id, matched_tx_id: null, note: row.note, payment_id: null, intent_key: null,
      };
      candidates.push(created);
      exists.set(item.external_id, created);
      summary.inserted += 1;
      deferred.push({ t: 'txCreate', row: created, matchedManualId: manual ? manual.id : null, weight: 3 });
      if (manual) { manual.matched_tx_id = row.id; summary.matched += 1; }
    }

    // ── pendentes ──
    const pendingSummary = { stored: 0, already_posted: 0, institutions: [] };
    const refreshed = new Set(payload.institutions.filter((i) => i.status === 'UPDATED').map((i) => i.institution));
    const targets = payload.pending_institutions.filter((inst) => refreshed.has(inst));
    const initialPending = new Map(pendingRows);
    if (targets.length) {
      const used = new Set();
      for (const inst of targets) {
        for (const [key, row] of [...pendingRows]) if (row.institution === inst) pendingRows.delete(key);
        pendingSummary.institutions.push(inst);
        for (const item of payload.pending_transactions.filter((t) => t.institution === inst)) {
          if (exists.has(item.external_id)) { pendingSummary.already_posted += 1; continue; }
          const account = transactionAccount(item);
          const amount = money(item.amount);
          const twin = account
            ? candidates
              .filter((c) => c.source === 'pluggy' && c.account_id === account.id && Math.abs(c.amount - amount) < 0.005
                && c.posted_on >= addDays(item.date, -3) && c.posted_on <= addDays(item.date, 10))
              .map((c) => ({ c, d: Math.abs(dayNumber(c.posted_on) - dayNumber(item.date)) }))
              .sort((a, b) => a.d - b.d)
              .find(({ c }) => !used.has(c.id))?.c
            : null;
          if (twin) { used.add(twin.id); pendingSummary.already_posted += 1; continue; }
          pendingRows.set(item.external_id, {
            external_id: item.external_id, institution: inst, account_id: account?.id ?? null, posted_on: item.date, amount,
            raw_description: item.description, merchant: cleanMerchant(item.description),
            category: mapBankCategory(item.category, item.description, item.amount, item.account_type), seen_at: stamp,
          });
          pendingSummary.stored += 1;
        }
      }
      for (const key of initialPending.keys()) if (!pendingRows.has(key)) ops.push({ t: 'pendingRemove', key });
      for (const [key, row] of pendingRows) if (JSON.stringify(initialPending.get(key)) !== JSON.stringify(row)) ops.push({ t: 'pendingUpsert', row });
    }

    const syncLog = {
      id: newId(), started_at: stamp, finished_at: stamp, ok: 1, accounts_n: applied.length, tx_n: summary.inserted,
      error: skipped.map((s) => `${s.institution}: ${s.status === 'UPDATED' ? s.reason : s.status}`).join('; '), actor: 'midas',
    };
    return { applied, skipped, transactions: summary, pending: pendingSummary, ops, deferred, syncLog };
  }

  /** Reservas (leituras) e depois as escritas de uma lista de operações, numa transação já aberta. */
  async function execute(tx, list) {
    const count = (type) => list.filter((op) => op.t === type).length;
    // coberturas criadas e removidas no mesmo corpo se anulam: só as finais chegam aqui
    if (count('balanceCreate')) await tx.financeBalances.reserve(count('balanceCreate'));
    if (count('coverageCreate')) await tx.financeStatementCoverage.reserve(count('coverageCreate'));
    if (count('txCreate')) await tx.financeTransactions.reserve(count('txCreate'));
    if (count('syncLog')) await tx.financeSyncLog.reserve(1);
    for (const op of list) {
      switch (op.t) {
        case 'balancePatch': await tx.financeBalances.patch(op.id, op.fields); break;
        case 'balanceCreate': await tx.financeBalances.create(op.row); break;
        case 'coverageRemove': await tx.financeStatementCoverage.remove(op.id); break;
        case 'coverageCreate': await tx.financeStatementCoverage.create(op.row); break;
        case 'cardUpsert': await tx.financeCardStatus.upsert(op.row); break;
        case 'debtPatch': await tx.financeDebts.patch(op.id, op.fields); break;
        case 'pendingRemove': await tx.financePendingTransactions.remove(op.key); break;
        case 'pendingUpsert': await tx.financePendingTransactions.upsert(op.row); break;
        case 'txPatch': await tx.financeTransactions.patch(op.id, op.fields); break;
        case 'txCreate':
          await tx.financeTransactions.create(op.row);
          if (op.matchedManualId) await tx.financeTransactions.patch(op.matchedManualId, { matched_tx_id: op.row.id });
          break;
        case 'syncLog': await tx.financeSyncLog.create(op.row); break;
        case 'settings': {
          if (op.plan.create) await tx.financeSettings.create(op.plan.create);
          if (op.plan.patch) await tx.financeSettings.patch(op.plan.patch);
          break;
        }
        default: throw new Error(`operação desconhecida: ${op.t}`);
      }
    }
  }

  const weightOf = (op) => op.weight ?? (op.t === 'balanceCreate' || op.t === 'coverageCreate' ? 2 : 1);

  /** POST /api/finance/ingest/pluggy — idempotente; status != UPDATED só entra no log. */
  async function ingestPluggy(body, { today } = {}) {
    const payload = parsePluggyPayload(body);
    const stamp = now().toISOString();
    const day = today || todayFortaleza(now());
    let outcome = null;
    const specs = Object.fromEntries(FINANCE_DOMAINS.map((d) => [d.name, d.spec()]));
    // Normaliza TODO o plano antes da primeira escrita: valor inválido no último lote não pode
    // deixar saldos, cobertura nem prefixo do extrato confirmados.
    const validate = (ops) => {
      const check = (domain, method, ...args) => specs[domain][method][1](...args);
      for (const op of ops) {
        const map = { balancePatch: ['financeBalances','patch',op.id,op.fields], balanceCreate: ['financeBalances','create',op.row],
          coverageRemove: ['financeStatementCoverage','remove',op.id], coverageCreate: ['financeStatementCoverage','create',op.row],
          cardUpsert: ['financeCardStatus','upsert',op.row], debtPatch: ['financeDebts','patch',op.id,op.fields],
          pendingRemove: ['financePendingTransactions','remove',op.key], pendingUpsert: ['financePendingTransactions','upsert',op.row],
          txPatch: ['financeTransactions','patch',op.id,op.fields], txCreate: ['financeTransactions','create',op.row], syncLog: ['financeSyncLog','create',op.row] };
        if (op.t === 'settings') {
          if (op.plan.create) check('financeSettings','create',op.plan.create);
          if (op.plan.patch) check('financeSettings','patch',op.plan.patch);
        } else {
          const args = map[op.t]; if (!args) throw new Error(`operação desconhecida: ${op.t}`); check(...args);
        }
      }
    };
    while (true) {
      // Replanejar DENTRO de cada transação: outro ingest pode ter gravado o próximo lote.
      // Isso também refaz o casamento dos manuais, nunca reaplica um plano obsoleto.
      const step = await storage.transaction(async (tx) => {
        const current = await plan(tx, payload, stamp, day);
        validate([...current.ops, ...current.deferred, { t: 'syncLog', row: current.syncLog }]);
        const fixedWeight = current.ops.reduce((sum, op) => sum + weightOf(op), 0) + 3;
        const totalWeight = fixedWeight + current.deferred.reduce((sum, op) => sum + weightOf(op), 0);
        if (storage.kind === 'sqlite' || totalWeight <= CHUNK_WEIGHT) {
          const log = { ...current.syncLog, tx_n: outcome?.syncLog.tx_n ?? current.syncLog.tx_n };
          await execute(tx, [...current.ops, ...current.deferred, { t: 'syncLog', row: log }]);
          return { current, done: true };
        }
        if (fixedWeight > CHUNK_WEIGHT) throw new Error('ingest_metadata_batch_too_large');
        const chunk = []; let weight = 3;
        for (const op of current.deferred) {
          if (weight + weightOf(op) > CHUNK_WEIGHT) break;
          chunk.push(op); weight += weightOf(op);
        }
        if (!chunk.length) throw new Error('ingest_batch_cannot_progress');
        // Cobertura, saldo/cartão, dívida, pendentes e log SOMENTE no último commit.
        await execute(tx, chunk);
        return { current, done: false };
      });
      outcome ??= step.current;
      if (step.done) break;
    }
    const overview = await reads.getOverview({ today });
    return {
      ok: true,
      applied: outcome.applied,
      skipped: outcome.skipped,
      transactions: outcome.transactions,
      pending: outcome.pending,
      overview_snapshot: {
        caixa: overview.caixa,
        livre: overview.livre,
        safe_to_spend: overview.safe_to_spend,
        committed_until_salary: overview.committed_until_salary,
        next_salary_date: overview.next_salary_date,
        bills_due_7d: overview.bills_due_7d,
      },
    };
  }

  return Object.freeze({ ingestPluggy });
}
