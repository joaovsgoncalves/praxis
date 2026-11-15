/**
 * Registro de domínios das fases 3, 4 e 5. Cada fase só acrescenta itens no próprio arquivo
 * (phase3.js, phase4.js, phase5.js), sem editar a fachada nem os drivers.
 *
 * Formato de um domínio:
 *   {
 *     name: 'habits',                                   // nome no storage (storage.habits / tx.habits)
 *     spec: (now) => ({ metodo: [tipo, normaliza] }),   // tipo: 'read' | 'write' | 'readwrite'
 *                                                       // normaliza(...args) => args validados
 *     sqlite: (db) => ({ metodo: async (...args) => ... }),
 *     firestore: (userDoc, transaction, client) => ({ metodo: async (...args) => ... }),
 *   }
 * `readwrite` = o motor precisa ler antes de escrever; vale a regra das duas coisas nos dois motores.
 * Mapeamento fixo: tabela T -> users/{uid}/<camelCase(T)>/{documentId(id)}, documento = linha SQLite
 * com os mesmos nomes de coluna (+ `_row` opcional com a ordem de inserção).
 */
import { DOMAINS as PHASE3 } from './phase3.js';
import { DOMAINS as PHASE4 } from './phase4.js';
import { DOMAINS as PHASE5 } from './phase5.js';

export const BUILT_IN = Object.freeze(['tasks', 'weeklyReviews', 'purchases']);

export function checkDomains(domains) {
  const seen = new Set(BUILT_IN);
  for (const domain of domains) {
    if (!domain || typeof domain.name !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(domain.name)) throw new TypeError('domínio sem nome válido');
    for (const key of ['spec', 'sqlite', 'firestore']) if (typeof domain[key] !== 'function') throw new TypeError(`domínio ${domain.name} sem ${key}`);
    if (seen.has(domain.name)) throw new TypeError(`domínio repetido: ${domain.name}`);
    seen.add(domain.name);
  }
  return Object.freeze([...domains]);
}

export const EXTRA_DOMAINS = checkDomains([...PHASE3, ...PHASE4, ...PHASE5]);
