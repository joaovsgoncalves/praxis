export const DEBT_STATUS_LABELS = {
  open: 'Aberto',
  min_paid: 'Mínimo pago',
  clean: 'Limpo',
  waiting: 'Pode esperar',
  blocked: 'Bloqueado',
};

export const APR_LABELS = {
  high: 'Juro alto',
  medium: 'Juro médio',
  low: 'Juro baixo',
  none: 'Sem juro',
};

export const SUB_STATUS_LABELS = {
  active: 'Ativa',
  keep: 'Manter',
  cancel: 'Cancelar',
  cancelled: 'Cancelada',
  installment: 'Parcela',
};

export const LANE_LABELS = {
  work: 'Trabalho',
  personal: 'Pessoal',
};

export const FINANCE_TABS = [
  { id: 'agora', label: 'Agora' },
  { id: 'movimentacoes', label: 'Movimentações' },
  { id: 'organizacao', label: 'Organização' },
  { id: 'dividas', label: 'Dívidas' },
  { id: 'parcelas', label: 'Parcelas' },
  { id: 'assinaturas', label: 'Assinaturas' },
];

/** Selo do cartão a partir de cards_status[].card_situation. */
export const CARD_SITUATION_LABELS = {
  paid: 'Paga',
  min_paid_rolled: 'Mínimo pago · rolou',
  min_open: 'Mínimo em aberto',
};

export const COMMITMENT_KIND_LABELS = {
  fixed: 'Fixa',
  subscription: 'Assinatura',
  card_minimum: 'Mínimo do cartão',
};

/** "12/10" a partir de YYYY-MM-DD. */
export function formatShortDay(ymd) {
  if (!ymd || typeof ymd !== 'string') return '';
  const [, m, d] = ymd.split('-');
  return d && m ? `${d}/${m}` : ymd;
}

/** Soma dias numa data YYYY-MM-DD (meio-dia UTC: sem susto de fuso). */
export function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/** Valor digitado em pt-BR ("1.234,56", "12,5", "12.50") → número; inválido vira NaN. */
export function parseMoneyInput(raw) {
  const s = String(raw ?? '').replace(/[R$\s]/g, '');
  if (!s) return NaN;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Number(normalized);
}

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthLabel(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return '';
  const name = MONTH_NAMES[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

export function shiftMonthYm(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Barra do orçamento: ouro até 80%, âmbar de 80 a 100%, vermelho só acima. */
export function budgetTone(pct) {
  if (pct == null) return 'neutral';
  if (pct > 100) return 'over';
  if (pct >= 80) return 'near';
  return 'ok';
}

export function formatBrl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const MONEY_MASK = 'R$ •••••';

/** Formatador único dos valores de Finanças: respeita o "ocultar valores". */
export function formatMoney(value, hidden = false) {
  return hidden ? MONEY_MASK : formatBrl(value);
}

const MONEY_IN_TEXT = /-?R\$\s?-?[\d.]+(?:,\d{1,2})?(?:\s?(?:mil|mi)\b)?/g;

/** Frases prontas da API (próximo passo, resumo) também escondem o R$. */
export function maskMoneyText(text, hidden = false) {
  if (!hidden || typeof text !== 'string') return text;
  return text.replace(MONEY_IN_TEXT, MONEY_MASK);
}

export function formatDay(ymd) {
  if (!ymd || typeof ymd !== 'string') return '—';
  const [y, m, d] = ymd.split('-');
  if (!d) return ymd;
  return `${d}/${m}${y ? `/${y.slice(2)}` : ''}`;
}

export function debtTone(status, apr) {
  if (status === 'clean') return 'text-muted-foreground';
  if (status === 'blocked' || apr === 'high') return 'text-amber-200';
  if (status === 'waiting') return 'text-muted-foreground';
  return 'text-foreground';
}

export function financeSummaryPhrase(caixa, invested) {
  const c = Number(caixa || 0);
  const inv = Number(invested || 0);
  if (c > 0 && inv > 0) {
    return `Livre ${formatBrl(c)} no Inter. Outros ${formatBrl(inv)} em auto-invest.`;
  }
  if (c === 0 && inv > 0) {
    return `Caixa livre zerado. Tem ${formatBrl(inv)} em auto-invest. Não misture com o que vence.`;
  }
  if (c === 0 && inv === 0) {
    return "Caixa e investimento zerados neste recorte.";
  }
  return `Caixa livre ${formatBrl(c)}.`;
}
