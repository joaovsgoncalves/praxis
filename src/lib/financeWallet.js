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

function bankLabelFor(account, name) {
  const label = INSTITUTION_LABELS[String(account?.institution || '').toLowerCase()];
  if (!label) return null;
  return label.toLowerCase() === String(name || '').toLowerCase() ? null : label;
}

/**
 * Cartões da carteira, todos a partir do overview:
 * 1. contas operacionais (saldo disponível);
 * 2. contas de crédito com fatura aberta;
 * 3. dívidas de cartão abertas que não têm conta de crédito própria (fatura do banco).
 */
export function buildWalletCards(overview) {
  const accounts = (overview?.accounts || []).filter((a) => a.status !== 'archived');
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const cardDebts = (overview?.debts || []).filter(
    (d) => d.kind === 'card' && d.status !== 'clean' && Number(d.balance) > 0,
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
    const bill = accountBill(acc);
    if (!(Number(bill?.amount) > 0) && !debt) continue;
    if (debt) usedDebts.add(debt.id);
    const useBill = Number(bill?.amount) > 0;
    credit.push({
      key: acc.id,
      accountId: acc.id,
      account: acc,
      name: acc.name,
      bankLabel: bankLabelFor(acc, acc.name),
      typeLabel: 'Crédito',
      amountLabel: useBill ? bill.label : 'Fatura',
      amount: useBill ? bill.amount : debt.balance,
      asOf: useBill ? acc.available_as_of : debt.updated_at?.slice(0, 10) || null,
      asOfLabel: 'Atualizado em',
      source: useBill ? bill.source : debt.source,
      dueLabel: dueLabel(debt),
      dueSort: dueSortKey(debt),
      last4: accountLast4(acc),
      brand: accountBrand(acc),
    });
  }

  for (const debt of cardDebts) {
    if (usedDebts.has(debt.id)) continue;
    const linked = byId.get(debt.account_id) || null;
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

  credit.sort((a, b) => a.dueSort.localeCompare(b.dueSort));
  return [...cards, ...credit];
}
