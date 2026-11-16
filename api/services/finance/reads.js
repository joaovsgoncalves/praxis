/**
 * Finanças, domínio 4: leituras compostas (visão geral, mês, insights, cobertura, pendentes, última
 * sincronização) sobre a camada assíncrona, com a conta das funções antigas (oráculo em
 * test-support/oracles/finance.bcbadad.js: getOverview, getMonthSummary, getInsights, getCoverageFor,
 * listBankShown, listCardStatus, listPendingTransactions, lastSync).
 *
 * - Só leitura, uma consulta por repositório (nada de SQL de agregação): somas e agrupamentos são feitos
 *   aqui, na MESMA ordem de linhas que o SQLite varre (`between` = data crescente, depois inserção), para
 *   que a soma em ponto flutuante e o empate de categorias saiam iguais.
 * - Uma exceção que já existia: `GET /overview` cria a configuração padrão se faltar (`getSettings`).
 * - Funções puras (`buildNextStep`, `occurrencesInWindow`, `nextSalaryDate`, `belongs`) vêm de finance.js.
 * - Leituras separadas, sem transação: cada uma é uma consulta própria (uma transação de leitura no SQLite
 *   tomaria o bloqueio de escrita do arquivo, que o Alfred e o resto da API também disputam).
 */
import {
  MANUAL_SOURCES, OFF_BUDGET_CATEGORIES, money, isValidDateString, todayFortaleza, parseEntity, belongs,
  buildNextStep, occurrencesInWindow, nextSalaryDate, cardSituation, billCycleStale,
} from '../../finance.js';
import { compareSqlite, maxSqlite } from '../../storage/sqliteOrder.js';
import { createFinanceCoreService } from './core.js';
import { createFinanceRecordsService } from './records.js';
import { createFinanceLedgerService } from './ledger.js';
import { createCoverageReader } from './coverage.js';
import { addDays, parseMonth } from './shared.js';

const BANK_BALANCE_SOURCES = ['pierre', 'pluggy'];
const BANK_STALE_DAYS = 3;
const monthOf = (ymd) => String(ymd).slice(0, 7);
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const ymdOf = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const cardLabel = (card) => card.account_name || card.institution || 'cartão';

export function createFinanceReadsService({ storage, now = () => new Date() }) {
  if (!storage?.financeSyncLog || typeof storage.transaction !== 'function') throw new TypeError('finance reads service requires storage');
  const core = createFinanceCoreService({ storage, now });
  const records = createFinanceRecordsService({ storage, now });
  const ledger = createFinanceLedgerService({ storage, now });
  const { statementCoverage } = createCoverageReader({ storage, now });

  /** ids das contas da empresa */
  async function pjAccountIds() {
    return new Set((await storage.financeAccounts.list({ status: null, entity: 'pj' })).map((account) => account.id));
  }
  const allAccounts = () => storage.financeAccounts.list({ status: null, entity: null });

  // ── Insights ──
  async function getInsights({ from, to, entity, today: todayArg } = {}) {
    const ent = parseEntity(entity, 'pf');
    const pj = await pjAccountIds();
    const today = isValidDateString(todayArg) ? todayArg : todayFortaleza(now());
    const start = isValidDateString(from) ? from : addDays(today, -30);
    const end = isValidDateString(to) ? to : today;
    const rows = (await storage.financeTransactions.between({ from: start, to: end }))
      .filter((tx) => tx.matched_tx_id === null)
      .filter((tx) => !OFF_BUDGET_CATEGORIES.includes(tx.category) && belongs(pj, tx.account_id, ent));

    let outflow = 0, inflow = 0, cardOut = 0, cashOut = 0, manualOut = 0, manualIn = 0, manualCount = 0;
    const byCategory = new Map();
    const byDay = new Map();
    const accountKind = new Map((await allAccounts()).map((a) => [a.id, a.kind]));

    for (const tx of rows) {
      const amt = money(tx.amount);
      if (tx.direction === 'internal') continue;
      const manual = MANUAL_SOURCES.includes(tx.source);
      if (manual) manualCount += 1;
      if (tx.direction === 'inflow' || amt > 0) {
        inflow += Math.abs(amt);
        if (manual) manualIn += Math.abs(amt);
      } else {
        const spent = Math.abs(amt);
        outflow += spent;
        if (manual) manualOut += spent;
        const cat = tx.category || 'Outros';
        byCategory.set(cat, money((byCategory.get(cat) || 0) + spent));
        byDay.set(tx.posted_on, money((byDay.get(tx.posted_on) || 0) + spent));
        const kind = accountKind.get(tx.account_id);
        if (kind === 'credit') cardOut += spent;
        else cashOut += spent;
      }
    }

    const categories = [...byCategory.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
    const days = [...byDay.entries()].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));
    return {
      from: start,
      to: end,
      outflow: money(outflow),
      inflow: money(inflow),
      card_outflow: money(cardOut),
      cash_outflow: money(cashOut),
      manual_outflow: money(manualOut),
      manual_inflow: money(manualIn),
      manual_tx_count: manualCount,
      categories,
      days,
      tx_count: rows.length,
      // saldo em dia não prova extrato: a tela só chama zero de zero com coverage.zero_is_real
      coverage: await statementCoverage({ from: start, to: end, today, only: (id) => belongs(pj, id, ent) }),
    };
  }

  // ── Mês ──
  /** Compras de cartão ainda pendentes no banco, à parte: não entram em total_out nem no orçamento. */
  async function pendingCardSummary(from, to, pj, entity) {
    const rows = (await storage.financePendingTransactions.list())
      .filter((r) => r.amount < 0 && r.posted_on >= from && r.posted_on <= to && belongs(pj, r.account_id, entity));
    const seen = rows.map((r) => r.seen_at).filter(Boolean).sort().at(-1) || null;
    return { count: rows.length, total: money(rows.reduce((s, r) => s - r.amount, 0)), seen_at: seen };
  }

  async function getMonthSummary({ month, today, entity } = {}) {
    const ent = parseEntity(entity, 'pf');
    const pj = await pjAccountIds();
    const day = isValidDateString(today) ? today : todayFortaleza(now());
    const ym = month === undefined || month === null || month === '' ? monthOf(day) : parseMonth(month);
    const [y, m] = ym.split('-').map(Number);
    const from = `${ym}-01`;
    const to = ymdOf(y, m, daysInMonth(y, m));
    const rows = (await storage.financeTransactions.between({ from, to }))
      .filter((tx) => tx.matched_tx_id === null && tx.direction !== null && tx.direction !== 'internal')
      .filter((tx) => belongs(pj, tx.account_id, ent));

    const spent = new Map();
    const count = new Map();
    let totalOut = 0, totalIn = 0, offBudget = 0, manualOut = 0, manualIn = 0, manualCount = 0;
    for (const tx of rows) {
      const amt = Math.abs(Number(tx.amount) || 0);
      const out = tx.direction === 'outflow' || Number(tx.amount) < 0;
      if (OFF_BUDGET_CATEGORIES.includes(tx.category)) {
        if (out) offBudget += amt;
        continue;
      }
      const manual = MANUAL_SOURCES.includes(tx.source);
      if (manual) manualCount += 1;
      if (!out) {
        totalIn += amt;
        if (manual) manualIn += amt;
        continue;
      }
      const cat = tx.category || 'Outros';
      totalOut += amt;
      if (manual) manualOut += amt;
      spent.set(cat, (spent.get(cat) || 0) + amt);
      count.set(cat, (count.get(cat) || 0) + 1);
    }

    const budgets = new Map((await records.listBudgets()).map((b) => [b.category, b.monthly_limit]));
    const names = new Set([...spent.keys(), ...budgets.keys()]);
    const categories = [...names].map((category) => {
      const value = money(spent.get(category) || 0);
      const limit = budgets.has(category) ? budgets.get(category) : null;
      return {
        category,
        spent: value,
        limit,
        pct: limit ? Math.round((value / limit) * 100) : limit === 0 ? (value > 0 ? 100 : 0) : null,
        tx_count: count.get(category) || 0,
      };
    }).sort((a, b) => b.spent - a.spent || (b.limit || 0) - (a.limit || 0) || a.category.localeCompare(b.category));

    return {
      month: ym,
      from,
      to,
      total_out: money(totalOut),
      total_in: money(totalIn),
      off_budget_out: money(offBudget),
      manual_out: money(manualOut),
      manual_in: money(manualIn),
      manual_tx_count: manualCount,
      coverage: await statementCoverage({ from, to, today: day, only: (id) => belongs(pj, id, ent) }),
      budget_total: money([...budgets.values()].reduce((s, v) => s + v, 0)),
      categories,
      pending_card: await pendingCardSummary(from, to, pj, ent),
      entity: ent,
    };
  }

  async function getCoverageFor({ from, to, today, entity } = {}) {
    const ent = parseEntity(entity, 'pf');
    const pj = await pjAccountIds();
    return statementCoverage({ from, to, today, only: (id) => belongs(pj, id, ent) });
  }

  // ── Pendentes, cartões, sincronização ──
  async function listPending() {
    const names = new Map((await allAccounts()).map((a) => [a.id, a.name]));
    return (await storage.financePendingTransactions.list()).map((p) => ({
      external_id: p.external_id,
      institution: p.institution,
      account_id: p.account_id,
      account_name: names.has(p.account_id) ? names.get(p.account_id) : null,
      posted_on: p.posted_on,
      amount: p.amount,
      merchant: p.merchant,
      category: p.category,
      seen_at: p.seen_at,
    }));
  }

  /** Estado dos cartões que o banco mandou, com o nome da conta e a situação da fatura. */
  async function listCardStatus({ today } = {}) {
    const day = isValidDateString(today) ? today : todayFortaleza(now());
    const accounts = new Map((await allAccounts()).map((a) => [a.id, a]));
    return (await storage.financeCardStatus.list()).map((card) => {
      const account = accounts.get(card.account_id);
      const row = { ...card, account_name: account ? account.name : null, account_status: account ? account.status : null };
      return { ...row, card_situation: cardSituation(row), bill_cycle_stale: billCycleStale(row, day) };
    });
  }

  const lastSync = async () => storage.financeSyncLog.latest({ actor: null, ok: null });
  const lastMidasSync = async () => storage.financeSyncLog.latest({ actor: 'midas', ok: 1 });

  /** Última atualização de cada banco ativo (cartão ou saldo do Pluggy); devolve a mais antiga. */
  async function bankDataAsOf(cardsStatus, accountsById, bankBalances) {
    const latest = new Map();
    const note = (institution, ts) => {
      if (!institution || !ts) return;
      if (!latest.has(institution) || ts > latest.get(institution)) latest.set(institution, ts);
    };
    for (const card of cardsStatus) {
      if (card.account_status === 'active') note(card.institution, card.bank_updated_at);
    }
    const byInstitution = new Map();
    for (const row of bankBalances) {
      const account = accountsById.get(row.account_id);
      if (row.source !== 'pluggy' || !account || account.status !== 'active') continue;
      byInstitution.set(account.institution, maxSqlite([byInstitution.get(account.institution) ?? null, row.created_at]));
    }
    for (const [institution, ts] of byInstitution) note(institution, ts);
    return [...latest.values()].sort()[0] || null;
  }

  /**
   * "O banco mostrou": o saldo mais recente que veio de banco, uma linha por conta e tipo. A conta é a
   * identidade; Pierre e Pluggy disputam pela data, então a mesma conta nunca aparece (nem soma) duas
   * vezes e conta só com Pluggy não fica de fora. Saldo digitado não entra aqui.
   */
  async function listBankShown({ today, entity } = {}, preloaded = {}) {
    const day = isValidDateString(today) ? today : todayFortaleza(now());
    const ent = parseEntity(entity, 'all');
    const pj = preloaded.pj ?? await pjAccountIds();
    const accountsById = preloaded.accountsById ?? new Map((await allAccounts()).map((a) => [a.id, a]));
    const bank = preloaded.bankBalances ?? await storage.financeBalances.bank();
    const rows = bank
      .filter((b) => b.amount_kind === 'available' || b.amount_kind === 'invested')
      .filter((b) => BANK_BALANCE_SOURCES.includes(b.source))
      .map((b) => ({ ...b, account: accountsById.get(b.account_id) }))
      .filter((b) => b.account && b.account.status === 'active')
      .sort((a, b) => compareSqlite(a.account.sort_order, b.account.sort_order) || compareSqlite(a.account.name, b.account.name)
        || compareSqlite(a.amount_kind, b.amount_kind) || compareSqlite(b.as_of, a.as_of) || compareSqlite(b.created_at, a.created_at));
    const seen = new Set();
    const entries = [];
    for (const row of rows) {
      if (!belongs(pj, row.account_id, ent)) continue;
      const key = `${row.account_id}|${row.amount_kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // investido zerado não vira linha; disponível zerado é informação
      if (row.amount_kind === 'invested' && !(Number(row.amount) > 0)) continue;
      const ageDays = Math.max(0, Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${row.as_of}T12:00:00Z`)) / 86400000));
      entries.push({
        id: key,
        account_id: row.account_id,
        name: row.account.name,
        institution: row.account.institution,
        account_kind: row.account.kind,
        amount_kind: row.amount_kind,
        amount: money(row.amount),
        source: row.source,
        as_of: row.as_of,
        received_at: row.created_at,
        age_days: Number.isFinite(ageDays) ? ageDays : null,
        stale: Number.isFinite(ageDays) ? ageDays >= BANK_STALE_DAYS : true,
      });
    }
    return entries;
  }

  // ── Visão geral ──
  /**
   * Gasto lançado à mão (app/Midas) ainda não visto pelo banco: posted_on depois do último saldo da conta,
   * ou no mesmo dia e lançado depois dele. Sem conta, compara com o saldo mais novo do caixa. Conta que não
   * é do dia e cartão de crédito não mexem no caixa.
   */
  async function manualPendingOut(accounts, today) {
    const operational = accounts.filter((a) => a.is_operational && a.status === 'active' && a.kind !== 'credit');
    const latest = new Map();
    for (const acc of operational) {
      const bal = (await storage.financeBalances.list({ accountId: acc.id, limit: null })).find((row) => row.amount_kind === 'available');
      if (bal) latest.set(acc.id, bal);
    }
    const newest = [...latest.values()].sort((a, b) => `${a.as_of}${a.created_at}`.localeCompare(`${b.as_of}${b.created_at}`)).at(-1) || null;
    const rows = (await storage.financeTransactions.between({ from: addDays(today, -40), to: today }))
      .filter((tx) => MANUAL_SOURCES.includes(tx.source) && tx.direction === 'outflow' && tx.matched_tx_id === null);

    let total = 0;
    for (const tx of rows) {
      let bal;
      if (!tx.account_id) bal = newest;
      else if (operational.some((a) => a.id === tx.account_id)) bal = latest.get(tx.account_id) || null;
      else continue;
      const pending = !bal
        || tx.posted_on > bal.as_of
        || (tx.posted_on === bal.as_of && String(tx.created_at) > String(bal.created_at));
      if (pending) total += Math.abs(Number(tx.amount) || 0);
    }
    return money(total);
  }

  /**
   * Tudo que sai do caixa de hoje até a véspera do salário: fixas ativas não pagas no mês do vencimento,
   * assinaturas active/keep e mínimo em aberto dos cartões. Dívida com status waiting (pai) não entra.
   */
  async function commitmentsUntilSalary({ today, salaryDate, cardsStatus, pj }) {
    const until = addDays(salaryDate, -1);
    const items = [];
    const unknown = [];

    for (const fx of await records.listFixedExpenses({ today })) {
      if (!fx.active || !(fx.amount > 0)) continue;
      if (fx.due_day == null) {
        unknown.push({ kind: 'fixed', id: fx.id, name: fx.name, amount: fx.amount });
        continue;
      }
      for (const date of occurrencesInWindow(fx.due_day, today, until)) {
        if (fx.last_paid_month === monthOf(date)) continue;
        items.push({ kind: 'fixed', id: fx.id, name: fx.name, amount: fx.amount, due_date: date });
      }
    }

    for (const sub of await records.listSubscriptions()) {
      if (!['active', 'keep'].includes(sub.status) || !(sub.amount > 0)) continue;
      if (!belongs(pj, sub.account_id, 'pf')) continue;
      if (sub.cadence === 'yearly') {
        if (sub.next_charge && sub.next_charge >= today && sub.next_charge <= until) {
          items.push({ kind: 'subscription', id: sub.id, name: sub.name, amount: sub.amount, due_date: sub.next_charge });
        }
        continue;
      }
      const day = Number(sub.charge_day);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        unknown.push({ kind: 'subscription', id: sub.id, name: sub.name, amount: sub.amount });
        continue;
      }
      for (const date of occurrencesInWindow(day, today, until)) {
        items.push({ kind: 'subscription', id: sub.id, name: sub.name, amount: sub.amount, due_date: date });
      }
    }

    // mínimo em aberto conta até o salário; vencido há até 7 dias ainda pesa
    const overdueFrom = addDays(today, -7);
    for (const card of cardsStatus) {
      if (card.account_status !== 'active' || card.card_situation !== 'min_open' || !card.bill_due) continue;
      if (card.bill_due < overdueFrom || card.bill_due > until) continue;
      const amount = money(Math.max(0, Number(card.bill_minimum || 0) - Number(card.bill_paid || 0)));
      if (!(amount > 0)) continue;
      items.push({ kind: 'card_minimum', id: card.account_id, name: cardLabel(card), amount, due_date: card.bill_due });
    }

    items.sort((a, b) => a.due_date.localeCompare(b.due_date) || b.amount - a.amount);
    return { items, unknown, until };
  }

  async function getOverview({ today } = {}) {
    const day = isValidDateString(today) ? today : todayFortaleza(now());
    const settings = await core.getSettings();
    // visão geral é sempre PF; a empresa tem a própria visão (month/insights/accounts com entity=pj)
    const pj = await pjAccountIds();
    const accounts = (await core.listAccounts()).filter((a) => a.entity !== 'pj');
    const debts = (await ledger.listDebts()).filter((d) => belongs(pj, d.account_id, 'pf'));
    const subscriptions = (await records.listSubscriptions()).filter((s) => belongs(pj, s.account_id, 'pf'));
    const lastSyncRow = await lastSync();

    const caixaBanco = money(accounts.filter((a) => a.is_operational && a.status === 'active').reduce((sum, a) => sum + Number(a.available || 0), 0));
    // gasto lançado hoje desconta na hora; some quando o banco mandar o saldo novo
    const manualPending = await manualPendingOut(accounts, day);
    const caixa = money(caixaBanco - manualPending);
    const invested = money(accounts.filter((a) => a.status === 'active').reduce((sum, a) => sum + Number(a.invested || 0), 0));
    const reservedCar = money(settings.reserved_car);
    const reservedLive = money(settings.reserved_live);
    const reserved = money(reservedCar + reservedLive);
    const livre = money(caixa - reserved);

    const openDebts = debts.filter((d) => d.status !== 'clean');
    const cardOpen = openDebts.filter((d) => d.kind === 'card');
    const debtsTotal = money(openDebts.reduce((s, d) => s + d.balance, 0));
    // dívida de cartão alimentada pelo Pluggy guarda o restante da fatura (total - pago) em balance
    const cardsTotal = money(cardOpen.reduce((s, d) => s + d.balance, 0));
    const billsFrom = addDays(day, -3);
    const billsTo = addDays(day, 7);
    const billsDue7d = money(cardOpen.filter((d) => d.due_date && d.due_date >= billsFrom && d.due_date <= billsTo).reduce((s, d) => s + d.balance, 0));

    const cardsStatus = (await listCardStatus({ today: day })).filter((c) => belongs(pj, c.account_id, 'pf'));
    const salaryDate = nextSalaryDate(day, settings.salary_day);
    const commitments = await commitmentsUntilSalary({ today: day, salaryDate, cardsStatus, pj });
    const committedUntilSalary = money(commitments.items.reduce((s, c) => s + c.amount, 0));
    const safeToSpend = money(Math.max(0, livre - committedUntilSalary));
    const creditAvailableTotal = money(cardsStatus.filter((c) => c.account_status === 'active').reduce((s, c) => s + Number(c.limit_available || 0), 0));

    const liveSubs = subscriptions.filter((s) => ['active', 'keep'].includes(s.status));
    const workMonth = money(liveSubs.filter((s) => s.lane === 'work').reduce((s, x) => s + x.amount, 0));
    const personalMonth = money(liveSubs.filter((s) => s.lane === 'personal').reduce((s, x) => s + x.amount, 0));

    const openInst = (await records.listInstallments({ status: 'open' })).filter((x) => belongs(pj, x.account_id, 'pf'));
    const installmentsRemaining = money(openInst.reduce((s, x) => s + Number(x.remaining || 0), 0));
    const installmentsMonth = money(openInst.reduce((s, x) => s + Number(x.monthly || 0), 0));
    const lastInstDue = openInst.map((x) => x.last_due).filter(Boolean).sort().at(-1) || null;

    const nextDue = openDebts.filter((d) => d.due_date).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;
    const nextStep = buildNextStep({ livre, commitments: commitments.items, cardsStatus, today: day, salaryDate, safeToSpend });

    const accountsById = new Map((await allAccounts()).map((a) => [a.id, a]));
    const bankBalances = await storage.financeBalances.bank();
    return {
      today: day,
      snapshot_label: settings.snapshot_label || '',
      caixa,
      caixa_banco: caixaBanco,
      manual_pending_out: manualPending,
      invested,
      patrimonio_liquido_curto: money(caixa + invested),
      reserved_car: reservedCar,
      reserved_live: reservedLive,
      reserved,
      livre,
      salary_day: settings.salary_day,
      next_salary_date: salaryDate,
      committed_until_salary: committedUntilSalary,
      commitments_until_salary: commitments.items,
      commitments_unknown_day: commitments.unknown,
      safe_to_spend: safeToSpend,
      // compatibilidade: faturas de cartão de hoje-3 a hoje+7 (o front usa os compromissos até o salário)
      bills_due_7d: billsDue7d,
      month: await getMonthSummary({ today: day, entity: 'pf' }),
      entity: 'pf',
      pj_accounts_n: pj.size,
      debts_total: debtsTotal,
      cards_total: cardsTotal,
      cards_status: cardsStatus,
      credit_available_total: creditAvailableTotal,
      bank_data_as_of: await bankDataAsOf(cardsStatus, accountsById, bankBalances),
      subscriptions_month: money(workMonth + personalMonth),
      work_month: workMonth,
      personal_month: personalMonth,
      installments_remaining: installmentsRemaining,
      installments_month: installmentsMonth,
      installments_n: openInst.length,
      installments_last: lastInstDue,
      next_due: nextDue ? { id: nextDue.id, title: nextDue.title, amount: nextDue.balance, due_date: nextDue.due_date } : null,
      next_step: nextStep,
      accounts,
      debts,
      bank_shown: await listBankShown({ today: day, entity: 'pf' }, { pj, accountsById, bankBalances }),
      last_sync: lastSyncRow || null,
      last_midas_sync: await lastMidasSync(),
      settings,
    };
  }

  return Object.freeze({ getOverview, getMonthSummary, getInsights, getCoverageFor, listPending, lastSync, listBankShown, listCardStatus });
}
