/**
 * Cor do cartão na carteira de Finanças.
 * Ids espelham BRAND_COLOR_IDS em api/finance.js. Texto (fg) e texto secundário (muted)
 * são cores sólidas com contraste AA (≥ 4.5:1) contra as duas pontas do gradiente.
 */

export const BRAND_PALETTE = [
  { id: 'inter', label: 'Laranja', from: '#ff8a1f', to: '#ec6400', fg: '#1f1205', muted: '#3a2010' },
  { id: 'c6', label: 'Grafite', from: '#3a3a40', to: '#1b1b1f', fg: '#f5f5f4', muted: '#c9c9ce' },
  { id: 'nubank', label: 'Roxo Nubank', from: '#8a19d6', to: '#5a0a96', fg: '#ffffff', muted: '#ead9f8' },
  { id: 'mp', label: 'Azul', from: '#0866b0', to: '#07508c', fg: '#ffffff', muted: '#e8f3fd' },
  { id: 'santander', label: 'Vermelho', from: '#d40000', to: '#9e0000', fg: '#ffffff', muted: '#ffe1e1' },
  { id: 'picpay', label: 'Verde', from: '#2bd06a', to: '#14a04b', fg: '#04170b', muted: '#082412' },
  { id: 'carteira', label: 'Dourado', from: '#e7b955', to: '#bf8c2c', fg: '#1a1205', muted: '#33240b' },
  { id: 'petroleo', label: 'Petróleo', from: '#0f6f69', to: '#0a4945', fg: '#ffffff', muted: '#d3efec' },
  { id: 'vinho', label: 'Vinho', from: '#82203d', to: '#541227', fg: '#ffffff', muted: '#f5d9e1' },
  { id: 'neutro', label: 'Neutro', from: '#222227', to: '#141417', fg: '#f5f5f4', muted: '#b4b4bc', neutral: true },
];

const PALETTE_BY_ID = Object.fromEntries(BRAND_PALETTE.map((item) => [item.id, item]));

/** Instituição (como o Pierre normaliza) → id da paleta. */
export function institutionBrandId(account) {
  const inst = String(account?.institution || '').toLowerCase();
  const name = String(account?.name || '').toLowerCase();
  const probe = inst + ' ' + name;
  if (inst === 'mp' || probe.includes('mercado')) return 'mp';
  if (probe.includes('nubank') || inst === 'nu') return 'nubank';
  if (probe.includes('inter')) return 'inter';
  if (probe.includes('c6')) return 'c6';
  if (probe.includes('santander')) return 'santander';
  if (probe.includes('picpay')) return 'picpay';
  if (account?.kind === 'cash' || probe.includes('carteira')) return 'carteira';
  return 'neutro';
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toHex(rgb) {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

/** Mistura com preto (amount > 0) ou branco (amount < 0). */
function mix(hex, amount) {
  const target = amount > 0 ? 0 : 255;
  const t = Math.abs(amount);
  return toHex(hexToRgb(hex).map((c) => c + (target - c) * t));
}

/**
 * Hex livre vindo da API: texto preto ou branco pelo maior contraste (sempre ≥ 4.5:1)
 * e o gradiente anda na direção que só aumenta esse contraste.
 */
function brandFromHex(hex) {
  const darkFg = '#000000';
  const lightFg = '#ffffff';
  const light = contrastRatio(hex, lightFg) >= contrastRatio(hex, darkFg);
  const fg = light ? lightFg : darkFg;
  return {
    id: hex,
    label: 'Personalizada',
    from: hex,
    to: mix(hex, light ? 0.22 : -0.18),
    fg,
    muted: fg,
  };
}

/** Cor efetiva do cartão: escolha do usuário (id ou hex) ou padrão da instituição. */
export function accountBrand(account) {
  const chosen = account?.brand_color;
  if (chosen && PALETTE_BY_ID[chosen]) return PALETTE_BY_ID[chosen];
  if (chosen && /^#[0-9a-f]{6}$/i.test(chosen)) return brandFromHex(chosen.toLowerCase());
  return PALETTE_BY_ID[institutionBrandId(account)];
}

/** Opções do seletor. O roxo é do Nubank e só aparece no cartão dele. */
export function brandOptionsFor(account) {
  const isNubank = institutionBrandId(account) === 'nubank';
  return BRAND_PALETTE.filter((item) => item.id !== 'nubank' || isNubank);
}

export function brandSurfaceStyle(brand) {
  return {
    backgroundImage: `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 100%)`,
    color: brand.fg,
  };
}

export const ACCOUNT_KIND_LABELS = {
  checking: 'Conta',
  prepaid: 'Pré-pago',
  credit: 'Crédito',
  cash: 'Dinheiro',
  other: 'Conta',
};

/** Final do cartão/conta: card_last4 manual vence a máscara do banco. */
export function accountLast4(account) {
  const raw = String(account?.card_last4 || account?.mask || '').replace(/\D/g, '');
  return raw ? raw.slice(-4) : null;
}

export function accountInitials(name) {
  const clean = String(name || '').trim();
  if (!clean) return '•';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return clean.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
