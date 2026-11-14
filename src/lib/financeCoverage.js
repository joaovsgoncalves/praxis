// Como mostrar um total de período sem dizer mais do que o extrato sustenta.
// A API manda `coverage` em /insights, /month e /coverage. Aqui só vira texto e decisão de tela:
// R$ 0 só aparece como zero de verdade com extrato do período inteiro; saldo em dia não prova extrato.

function ddmm(ymd) {
  const s = String(ymd || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
}

/** Dia (em Natal) de um carimbo ISO. */
function localDay(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(date);
}

function list(names) {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= 3) return unique.join(', ');
  return `${unique.slice(0, 3).join(', ')} e mais ${unique.length - 3}`;
}

function balanceNote(coverage) {
  const day = ddmm(localDay(coverage?.balance_at));
  return day ? ` O saldo foi atualizado em ${day}, mas saldo não é extrato.` : '';
}

/**
 * @param coverage objeto `coverage` da API (ou null enquanto lê)
 * @param state { loading, failed } do pedido que traz os totais
 * @returns {{status:string, tone:'ok'|'warn'|'muted', label:string, detail:string, zeroIsReal:boolean, missing:string[]}}
 */
export function coverageView(coverage, { loading = false, failed = false } = {}) {
  if (failed) {
    return {
      status: 'error',
      tone: 'warn',
      label: 'Não deu para ler',
      detail: 'A Praxis não conseguiu consultar este período agora. Os totais ficam em branco para não mostrar número errado.',
      zeroIsReal: false,
      missing: [],
    };
  }
  if (!coverage || loading) {
    return { status: 'loading', tone: 'muted', label: 'Lendo', detail: 'Lendo o que o banco mandou deste período.', zeroIsReal: false, missing: [] };
  }
  const accounts = Array.isArray(coverage.accounts) ? coverage.accounts : [];
  const linked = accounts.filter((a) => a.status !== 'manual');
  const missing = linked.filter((a) => a.status !== 'complete').map((a) => a.name);
  const through = ddmm(coverage.statement_through);
  const status = ['complete', 'partial', 'manual_only', 'unavailable'].includes(coverage.status)
    ? coverage.status
    : 'unavailable';

  if (status === 'complete') {
    const n = linked.length;
    return {
      status,
      tone: 'ok',
      label: 'Extrato completo',
      detail: `Extrato do banco de ${n === 1 ? '1 conta' : `${n} contas`}${through ? `, lido até ${through}` : ''}.`,
      zeroIsReal: true,
      missing: [],
    };
  }
  if (status === 'partial') {
    const got = linked.length - missing.length;
    // todas as contas têm um pedaço do período: dizer de quando a quando, em vez de "0 de N contas"
    const pieces = linked.filter((a) => a.covered_from && a.covered_to);
    if (got === 0 && pieces.length === linked.length && linked.length) {
      const start = pieces.map((a) => a.covered_from).sort().at(-1);
      const end = pieces.map((a) => a.covered_to).sort()[0];
      if (start <= end) {
        return {
          status,
          tone: 'warn',
          label: 'Extrato parcial',
          detail: `O banco mandou extrato de ${ddmm(start)} a ${ddmm(end)}. Fora desses dias só aparece o que foi lançado à mão, então os totais podem ser maiores.`,
          zeroIsReal: false,
          missing,
        };
      }
    }
    return {
      status,
      tone: 'warn',
      label: 'Extrato parcial',
      detail: `Extrato completo de ${got} de ${linked.length} contas${through ? `, lido até ${through}` : ''}. ${
        missing.length ? `Falta: ${list(missing)}. ` : ''
      }Os totais podem ser maiores.`,
      zeroIsReal: false,
      missing,
    };
  }
  if (status === 'manual_only') {
    return {
      status,
      tone: 'warn',
      label: 'Só lançado à mão',
      detail: `O banco não mandou extrato deste período. Os totais são só o que foi lançado à mão.${balanceNote(coverage)}`,
      zeroIsReal: false,
      missing,
    };
  }
  return {
    status: 'unavailable',
    tone: 'warn',
    label: 'Sem extrato',
    detail: `Não chegou extrato do banco nem lançamento à mão neste período. Não dá para dizer quanto entrou ou saiu.${balanceNote(coverage)}`,
    zeroIsReal: false,
    missing,
  };
}

/**
 * Um total pode ser mostrado como número? Zero só com extrato completo.
 * @returns {{known:boolean, qualifier:''|'parcial'|'à mão'}}
 */
export function totalDisplay(view, value) {
  const amount = Math.abs(Number(value) || 0);
  if (!view || view.status === 'loading' || view.status === 'error' || view.status === 'unavailable') {
    return { known: false, qualifier: '' };
  }
  if (view.status === 'complete') return { known: true, qualifier: '' };
  if (amount === 0) return { known: false, qualifier: '' };
  return { known: true, qualifier: view.status === 'partial' ? 'parcial' : 'à mão' };
}

/** Subtotal do que foi lançado à mão, quando ele está misturado com o extrato do banco. */
export function manualSubtotal(view, { out = 0, inn = 0, count = 0 } = {}) {
  const n = Number(count) || 0;
  if (!n || !view || view.status === 'manual_only' || view.status === 'loading' || view.status === 'error') return null;
  return { out: Math.abs(Number(out) || 0), in: Math.abs(Number(inn) || 0), count: n };
}

/** Texto da lista vazia de Movimentações: diz o que se sabe do período. */
export function emptyMovementsText(view, { from, to } = {}) {
  const range = from && to ? `de ${ddmm(from)} a ${ddmm(to)}` : 'neste período';
  if (!view || view.status === 'loading') return { title: 'Lendo o período', description: 'Conferindo o que o banco mandou.' };
  if (view.status === 'error') {
    return { title: 'Não deu para ler o período', description: 'A lista pode estar incompleta. Tente de novo em instantes.' };
  }
  if (view.status === 'complete') {
    return { title: 'Nenhuma movimentação', description: `O extrato do banco ${range} veio completo e sem lançamentos.` };
  }
  if (view.status === 'partial') {
    return {
      title: 'Nada no extrato que chegou',
      description: `${view.detail} Dá para lançar à mão o que faltar.`,
    };
  }
  return {
    title: 'Sem extrato neste período',
    description: `O banco ainda não mandou extrato ${range}. Vazio aqui não quer dizer que não houve gasto: dá para lançar à mão.`,
  };
}
