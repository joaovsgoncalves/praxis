/**
 * Cobertura do extrato sobre a camada assíncrona: o que `getStatementCoverage` (lib/financeCoverage.js,
 * oráculo em test-support/oracles/financeCoverage.bcbadad.js) devolve, com os mesmos números e a mesma
 * ordem de chaves. As consultas do SQLite viram leituras dos repositórios; a regra é a mesma, sem cópia
 * do banco: contas ativas, janelas por conta, último saldo de banco por conta e os lançamentos do período.
 */
import { todayFortaleza } from '../../finance.js';
import { coveredDays, daysBetween, addDays, isYmd } from '../../lib/financeCoverage.js';
import { compareSqlite, maxSqlite } from '../../storage/sqliteOrder.js';

const BANK_SOURCES = ['pierre', 'pluggy'];
const MANUAL_SOURCES = ['joao', 'agent'];

export function createCoverageReader({ storage, now = () => new Date() }) {
  async function statementCoverage({ from, to, today, only } = {}) {
    const day = isYmd(today) ? today : todayFortaleza(now());
    const start = isYmd(from) ? from : addDays(day, -30);
    const end = isYmd(to) && to >= start ? to : (isYmd(to) ? start : day);
    const measuredTo = end > day ? day : end;
    const daysTotal = daysBetween(start, measuredTo);
    const yesterday = addDays(day, -1);
    const settledTo = measuredTo > yesterday ? yesterday : measuredTo;
    const daysSettled = daysBetween(start, settledTo);
    const requiredTo = daysSettled > 0 ? settledTo : measuredTo;
    const daysRequired = daysSettled > 0 ? daysSettled : daysTotal;

    // ORDER BY sort_order ASC, id ASC (o repositório de contas desempata por nome)
    const accounts = (await storage.financeAccounts.list({ status: 'active', entity: null }))
      .filter((a) => (typeof only === 'function' ? only(a.id) : true))
      .sort((a, b) => compareSqlite(a.sort_order, b.sort_order) || compareSqlite(a.id, b.id));
    const windowsByAccount = new Map();
    for (const window of await storage.financeStatementCoverage.list({ account_id: null })) {
      if (!windowsByAccount.has(window.account_id)) windowsByAccount.set(window.account_id, []);
      windowsByAccount.get(window.account_id).push(window);
    }
    const balanceAt = new Map();
    for (const row of await storage.financeBalances.bank()) {
      balanceAt.set(row.account_id, maxSqlite([balanceAt.get(row.account_id) ?? null, row.created_at]));
    }
    const rows = daysTotal === 0 ? [] : await storage.financeTransactions.between({ from: start, to: measuredTo });
    const countFor = (accountId) => {
      let bank = 0, manual = 0;
      for (const tx of rows) {
        if (accountId !== null && tx.account_id !== accountId) continue;
        if (BANK_SOURCES.includes(tx.source)) bank += 1;
        if (MANUAL_SOURCES.includes(tx.source) && tx.matched_tx_id === null) manual += 1;
      }
      return { bank, manual };
    };

    const perAccount = accounts.map((account) => {
      const windows = windowsByAccount.get(account.id) ?? [];
      const bankBalanceAt = balanceAt.get(account.id) ?? null;
      const linked = Boolean(account.pierre_account_id) || Boolean(bankBalanceAt) || windows.length > 0;
      const counts = countFor(account.id);
      const covered = daysRequired > 0 ? coveredDays(windows, start, requiredTo) : { days: 0, first: null, last: null };
      const everCovered = windows.length ? windows.map((w) => w.covered_to).sort().at(-1) : null;
      let status = 'manual';
      if (linked) {
        if (daysRequired > 0 && covered.days >= daysRequired) status = 'complete';
        else if (covered.days > 0 || counts.bank > 0) status = 'partial';
        else status = 'none';
      }
      return {
        account_id: account.id,
        name: account.name,
        institution: account.institution,
        kind: account.kind,
        status,
        days_covered: covered.days,
        days_required: linked ? daysRequired : 0,
        covered_from: covered.first,
        covered_to: covered.last,
        statement_through: everCovered,
        statement_at: windows.length ? windows.map((w) => w.recorded_at).sort().at(-1) : null,
        sources: [...new Set(windows.map((w) => w.source))].sort(),
        balance_at: bankBalanceAt,
        bank_tx_count: counts.bank,
        manual_tx_count: counts.manual,
      };
    });

    const linked = perAccount.filter((a) => a.status !== 'manual');
    const complete = linked.filter((a) => a.status === 'complete');
    const some = linked.filter((a) => a.status === 'complete' || a.status === 'partial');
    // com filtro de contas (PF/PJ), os totais contam só os lançamentos dessas contas
    let totals = countFor(null);
    if (typeof only === 'function') {
      const inside = rows.filter((tx) => only(tx.account_id));
      totals = daysTotal === 0 ? { bank: 0, manual: 0 } : {
        bank: inside.filter((tx) => BANK_SOURCES.includes(tx.source)).length,
        manual: inside.filter((tx) => MANUAL_SOURCES.includes(tx.source) && tx.matched_tx_id == null).length,
      };
    }

    let status = 'unavailable';
    if (daysRequired > 0 && linked.length > 0 && complete.length === linked.length) status = 'complete';
    else if (some.length > 0 || totals.bank > 0) status = 'partial';
    else if (totals.manual > 0) status = 'manual_only';

    const latest = (list) => list.filter(Boolean).sort().at(-1) || null;
    return {
      from: start,
      to: end,
      today: day,
      measured_to: daysTotal > 0 ? measuredTo : null,
      days_total: daysTotal,
      days_required: daysRequired,
      status,
      // só com extrato do período inteiro um total zerado quer dizer "não houve movimento"
      zero_is_real: status === 'complete',
      linked_accounts_n: linked.length,
      complete_accounts_n: complete.length,
      covered_accounts_n: some.length,
      bank_tx_count: totals.bank,
      manual_tx_count: totals.manual,
      statement_at: latest(perAccount.map((a) => a.statement_at)),
      statement_through: latest(perAccount.map((a) => a.statement_through)),
      balance_at: latest(perAccount.map((a) => a.balance_at)),
      accounts: perAccount,
    };
  }
  return Object.freeze({ statementCoverage });
}
