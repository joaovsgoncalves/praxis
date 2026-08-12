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
  { id: 'dividas', label: 'Dívidas' },
  { id: 'assinaturas', label: 'Assinaturas' },
  { id: 'extrato', label: 'Extrato' },
  { id: 'graficos', label: 'Gráficos' },
  { id: 'metas', label: 'Metas' },
];

export function formatBrl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
