// Estado de leitura de uma seção. Lista vazia como padrão esconde quatro coisas diferentes:
// "ainda não li", "não consegui ler", "li e está vazio" e "estou mostrando uma cópia salva".
// Só a terceira pode virar "Dia livre" ou "Nenhum hábito para hoje".

import { classifyFailure } from './apiFailure.js';
import { fortalezaDateKey, fortalezaNowTimeHHMM } from './dates.js';

const RANK = { ready: 0, stale: 1, loading: 2, error: 3 };
const READY = Object.freeze({ status: 'ready', cachedAt: null, error: null });

/**
 * @param q resultado de useQuery ({ data, isError, error, fetchStatus, dataUpdatedAt })
 * @returns {{ status: 'ready'|'stale'|'loading'|'error', cachedAt: number|null, error: any }}
 */
export function queryReadState(q) {
  if (!q) return READY;
  const { data } = q;
  if (data === undefined || data === null) {
    if (q.isError) return { status: 'error', cachedAt: null, error: q.error || null };
    // Sem rede o React Query pausa a leitura: não é carregando, é sem conexão.
    if (q.fetchStatus === 'paused') return { status: 'error', cachedAt: null, error: { kind: 'offline' } };
    return { status: 'loading', cachedAt: null, error: null };
  }
  // O cliente da API devolve a cópia do aparelho marcada quando o servidor não responde.
  if (data.__stale) return { status: 'stale', cachedAt: Number(data.__cachedAt) || null, error: null };
  // A releitura falhou e a tela segue com o que tinha em memória.
  if (q.isError) return { status: 'stale', cachedAt: Number(q.dataUpdatedAt) || null, error: q.error || null };
  return READY;
}

/** O pior estado vence; a cópia mais antiga dá a hora. */
export function combineReadStates(...states) {
  let out = READY;
  let oldest = null;
  for (const s of states) {
    if (!s) continue;
    if (s.status === 'stale' && s.cachedAt && (oldest === null || s.cachedAt < oldest)) oldest = s.cachedAt;
    if (RANK[s.status] > RANK[out.status]) out = s;
  }
  if (out.status === 'stale') return { ...out, cachedAt: oldest };
  return out;
}

/** Junta as leituras de uma seção e dá a ela um único "Tentar novamente". */
export function buildSectionRead(queries) {
  const list = (queries || []).filter(Boolean);
  const states = list.map(queryReadState);
  const combined = combineReadStates(...states);
  return {
    ...combined,
    retrying: list.some((q) => q.fetchStatus === 'fetching'),
    retry: () => {
      // Só relê o que não veio inteiro; o que está em dia fica quieto.
      list.forEach((q, i) => {
        if (states[i].status !== 'ready') q.refetch?.();
      });
    },
  };
}

/** `what` entra depois de "carregar": "as tarefas", "os hábitos". */
/**
 * Dá para contar com o conteúdo da seção? Só quando a leitura terminou (atual ou cópia salva).
 * Sem estado informado, vale o comportamento antigo: conteúdo confiável.
 */
export function isReadable(read) {
  return !read || read.status === 'ready' || read.status === 'stale';
}

export function readErrorMessage(what, error) {
  const kind = classifyFailure(error);
  if (kind === 'offline') return `Sem conexão. Não deu para carregar ${what}.`;
  if (kind === 'network') return `A conexão caiu antes de carregar ${what}.`;
  if (kind === 'session') return `Sua sessão terminou. Entre de novo para ver ${what}.`;
  if (kind === 'server') {
    const ref = error?.requestId ? ` (ref. ${String(error.requestId).slice(0, 8)})` : '';
    return `O servidor falhou ao carregar ${what}.${ref}`;
  }
  return `Não deu para carregar ${what}.`;
}

/** "Cópia salva às 14:32" no mesmo dia; com a data quando é de outro dia. */
export function staleCopyLabel(cachedAt, now = Date.now()) {
  const at = Number(cachedAt);
  if (!at) return 'Cópia salva no aparelho';
  const when = new Date(at);
  const time = fortalezaNowTimeHHMM(when);
  const day = fortalezaDateKey(when);
  if (day === fortalezaDateKey(new Date(now))) return `Cópia salva às ${time}`;
  const [, month, dayOfMonth] = day.split('-');
  return `Cópia salva em ${dayOfMonth}/${month} às ${time}`;
}
