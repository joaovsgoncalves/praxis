import { ACCOUNT_KIND_LABELS, accountBrand, accountLast4, institutionBrandId } from '@/lib/financeBrand';

/** Rótulo do banco a partir da instituição normalizada pelo Pierre. */
export const INSTITUTION_LABELS = {
  inter: 'Inter',
  c6: 'C6',
  mp: 'Mercado Pago',
  nubank: 'Nubank',
  santander: 'Santander',
  picpay: 'PicPay',
};

function shortDay(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const [, m, d] = ymd.split('-');
  return d && m ? `${d}/${m}` : null;
}

/** Datados primeiro (por data), depois por dia do mês, depois sem vencimento. */
function dueSortKey(debt) {
  if (debt?.due_date) return `0-${debt.due_date}`;
  if (debt?.due_day) return `1-${String(debt.due_day).padStart(2, '0')}`;
  return '2';
}

function dueLabel(debt) {
  if (!debt) return null;
  if (debt.due_date) return `Vence ${shortDay(debt.due_date)}`;
  if (debt.due_day) return `Vence dia ${debt.due_day}`;
  return null;
}

/** Fatura do cartão de crédito: oficial do Pierre, senão a projeção. */
export function accountBill(account) {
  if (account?.official_bill != null) return { amount: account.official_bill, source: 'oficial', label: 'Fatura' };
  if (account?.projected_bill != null) return { amount: account.projected_bill, source: 'projecao', label: 'Fatura prevista' };
  return null;
}

/** Campos do cartão vindos do banco (Pluggy via Midas); sobrescrevem a dívida quando existem. */
function bankCardFields(status, fallbackDue) {
  if (!status) return null;
  const hasBill = status.bill_total != null;
  // situação vem da API (paid / min_paid_rolled / min_open); API antiga cai no "paga" pelo restante
  const situation = hasBill ? status.card_situation || null : null;
  const paidOff = situation
    ? situation === 'paid'
    : hasBill && Number(status.bill_total) > 0 && Number(status.bill_remaining) <= 0.01;
  const due = status.bill_due ? { due_date: status.bill_due } : fallbackDue;
  return {
    situation: situation || (paidOff ? 'paid' : null),
    amountLabel: hasBill ? 'A pagar' : 'Usado',
    amount: hasBill ? status.bill_remaining : status.used,
    asOf: status.bank_updated_at ? status.bank_updated_at.slice(0, 10) : null,
    asOfLabel: 'Banco em',
    source: 'pluggy',
    dueLabel: dueLabel(due),
    dueSort: dueSortKey(due),
    bill: hasBill ? { total: status.bill_total, paid: status.bill_paid, paidOff } : null,
    limitAvailable: status.limit_available,
    last4: status.last4 || null,
  };
}

function bankLabelFor(account, name) {
  const label = INSTITUTION_LABELS[String(account?.institution || '').toLowerCase()];
  if (!label) return null;
  return label.toLowerCase() === String(name || '').toLowerCase() ? null : label;
}

/**
 * Cartões da carteira, todos a partir do overview:
 * 1. contas operacionais (saldo disponível);
 * 2. contas de crédito com fatura aberta;
 * 3. dívidas de cartão abertas que não têm conta de crédito própria (fatura do banco);
 * 4. cartões que o banco mandou (cards_status) sem dívida nem conta de crédito.
 * Com cards_status, fatura, pago, limite livre e vencimento vêm do banco — e fatura paga continua na pilha.
 */
export function buildWalletCards(overview) {
  const accounts = (overview?.accounts || []).filter((a) => a.status !== 'archived');
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const statusByAccount = new Map((overview?.cards_status || []).map((s) => [s.account_id, s]));
  const usedStatus = new Set();
  const cardDebts = (overview?.debts || []).filter(
    (d) =>
      d.kind === 'card' &&
      ((d.status !== 'clean' && Number(d.balance) > 0) || statusByAccount.has(d.account_id)),
  );
  const usedDebts = new Set();
  const cards = [];

  for (const acc of accounts) {
    if (!acc.is_operational || acc.kind === 'credit') continue;
    cards.push({
      key: acc.id,
      accountId: acc.id,
      account: acc,
      name: acc.name,
      bankLabel: null,
      typeLabel: ACCOUNT_KIND_LABELS[acc.kind] || 'Conta',
      amountLabel: 'Disponível',
      amount: acc.available,
      asOf: acc.available_as_of,
      asOfLabel: 'Saldo de',
      source: acc.available_source,
      dueLabel: null,
      last4: accountLast4(acc),
      brand: accountBrand(acc),
    });
  }

  const credit = [];
  for (const acc of accounts) {
    if (acc.kind !== 'credit') continue;
    const brandId = institutionBrandId(acc);
    const debt =
      cardDebts.find((d) => !usedDebts.has(d.id) && d.account_id === acc.id) ||
      cardDebts.find((d) => {
        if (usedDebts.has(d.id)) return false;
        const linked = byId.get(d.account_id);
        if (linked?.kind === 'credit') return false;
        return institutionBrandId(linked || { name: d.title }) === brandId;
      });
    const statusKey = statusByAccount.has(acc.id) ? acc.id : debt?.account_id;
    const status = usedStatus.has(statusKey) ? null : statusByAccount.get(statusKey) || null;
    const bill = accountBill(acc);
    if (!(Number(bill?.amount) > 0) && !debt && !status) continue;
    if (debt) usedDebts.add(debt.id);
    if (status) usedStatus.add(statusKey);
    const useBill = Number(bill?.amount) > 0;
    const base = {
      key: acc.id,
      accountId: acc.id,
      account: acc,
      name: acc.name,
      bankLabel: bankLabelFor(acc, acc.name),
      typeLabel: 'Crédito',
      last4: accountLast4(acc),
      brand: accountBrand(acc),
    };
    const fromBank = bankCardFields(status, debt);
    if (fromBank) {
      credit.push({ ...base, ...fromBank, last4: fromBank.last4 || base.last4 });
      continue;
    }
    credit.push({
      ...base,
      amountLabel: useBill ? bill.label : 'Fatura',
      amount: useBill ? bill.amount : debt.balance,
      asOf: useBill ? acc.available_as_of : debt.updated_at?.slice(0, 10) || null,
      asOfLabel: 'Atualizado em',
      source: useBill ? bill.source : debt.source,
      dueLabel: dueLabel(debt),
      dueSort: dueSortKey(debt),
    });
  }

  for (const debt of cardDebts) {
    if (usedDebts.has(debt.id)) continue;
    const linked = byId.get(debt.account_id) || null;
    const status = usedStatus.has(debt.account_id) ? null : statusByAccount.get(debt.account_id) || null;
    if (status) usedStatus.add(debt.account_id);
    const fromBank = bankCardFields(status, debt);
    if (!fromBank && (debt.status === 'clean' || !(Number(debt.balance) > 0))) continue;
    if (fromBank) {
      credit.push({
        key: `debt-${debt.id}`,
        accountId: linked?.id || null,
        account: linked,
        name: debt.title,
        bankLabel: null,
        typeLabel: 'Crédito',
        brand: accountBrand(linked || { name: debt.title }),
        ...fromBank,
        last4: fromBank.last4 || linked?.card_last4 || null,
      });
      continue;
    }
    credit.push({
      key: `debt-${debt.id}`,
      accountId: linked?.id || null,
      account: linked,
      name: debt.title,
      bankLabel: null,
      typeLabel: 'Crédito',
      amountLabel: 'Fatura',
      amount: debt.balance,
      asOf: debt.updated_at?.slice(0, 10) || null,
      asOfLabel: 'Atualizado em',
      source: debt.source,
      dueLabel: dueLabel(debt),
      dueSort: dueSortKey(debt),
      // a máscara da conta corrente não é o final do cartão: só o card_last4 informado vale aqui
      last4: linked?.card_last4 || null,
      brand: accountBrand(linked || { name: debt.title }),
    });
  }

  for (const status of overview?.cards_status || []) {
    if (usedStatus.has(status.account_id)) continue;
    const linked = byId.get(status.account_id);
    if (!linked) continue;
    credit.push({
      key: `card-${status.account_id}`,
      accountId: linked.id,
      account: linked,
      name: linked.name,
      bankLabel: null,
      typeLabel: 'Crédito',
      brand: accountBrand(linked),
      ...bankCardFields(status, null),
    });
  }

  credit.sort((a, b) => a.dueSort.localeCompare(b.dueSort));
  return [...cards, ...credit];
}
