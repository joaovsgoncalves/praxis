import {
  ArrowDownLeft,
  ArrowLeftRight,
  Briefcase,
  Car,
  CircleDot,
  CreditCard,
  Dumbbell,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  PiggyBank,
  ReceiptText,
  Repeat,
  ShoppingBag,
  ShoppingBasket,
  Ticket,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { addDaysYmd, formatShortDay } from '@/lib/finance';

/** Espelha FINANCE_CATEGORIES da API (api/finance.js). */
export const CATEGORY_ICONS = {
  Moradia: House,
  Alimentação: UtensilsCrossed,
  Mercado: ShoppingBasket,
  Transporte: Car,
  Saúde: HeartPulse,
  Educação: GraduationCap,
  Fitness: Dumbbell,
  Assinaturas: Repeat,
  Impostos: ReceiptText,
  Dívidas: HandCoins,
  Lazer: Ticket,
  Trabalho: Briefcase,
  Família: Users,
  Reserva: PiggyBank,
  Compras: ShoppingBag,
  Transferência: ArrowLeftRight,
  'Pagamento de fatura': CreditCard,
  Receita: ArrowDownLeft,
  Outros: CircleDot,
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_ICONS);

/** Chips do "Lançar gasto", na ordem do dia a dia. */
export const SPEND_CATEGORIES = [
  'Alimentação',
  'Mercado',
  'Transporte',
  'Lazer',
  'Compras',
  'Saúde',
  'Moradia',
  'Educação',
  'Assinaturas',
  'Trabalho',
  'Família',
  'Outros',
];

/** Dinheiro que só muda de lugar: fora de gráfico e orçamento (igual à API). */
export const OFF_BUDGET_CATEGORIES = ['Pagamento de fatura', 'Transferência'];

/** Categorias que aceitam limite no orçamento. */
export const BUDGET_CATEGORIES = ALL_CATEGORIES.filter(
  (c) => !OFF_BUDGET_CATEGORIES.includes(c) && c !== 'Receita',
);

export function categoryIcon(category) {
  return CATEGORY_ICONS[category] || CircleDot;
}

export function isManualTx(tx) {
  return tx?.source === 'joao' || tx?.source === 'agent';
}

export function isOutflow(tx) {
  return tx?.direction === 'outflow' || (tx?.direction !== 'inflow' && Number(tx?.amount) < 0);
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "Hoje", "Ontem" ou "seg, 12/10". */
export function dayHeading(ymd, today) {
  if (ymd === today) return 'Hoje';
  if (today && ymd === addDaysYmd(today, -1)) return 'Ontem';
  const [y, m, d] = ymd.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${weekday}, ${formatShortDay(ymd)}`;
}

/**
 * Extrato por dia, mais novo primeiro. `spent` soma só as saídas que contam
 * (fatura e transferência entre contas ficam fora, como no gráfico).
 */
export function groupTransactionsByDay(transactions) {
  const groups = new Map();
  for (const tx of transactions) {
    if (!groups.has(tx.posted_on)) groups.set(tx.posted_on, { date: tx.posted_on, items: [], spent: 0, received: 0 });
    const group = groups.get(tx.posted_on);
    group.items.push(tx);
    if (OFF_BUDGET_CATEGORIES.includes(tx.category) || tx.direction === 'internal') continue;
    const amount = Math.abs(Number(tx.amount) || 0);
    if (isOutflow(tx)) group.spent += amount;
    else group.received += amount;
  }
  return [...groups.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((g) => ({ ...g, spent: Math.round(g.spent * 100) / 100, received: Math.round(g.received * 100) / 100 }));
}
