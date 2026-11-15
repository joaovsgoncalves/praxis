/**
 * Um banco por pessoa (fase 4 do PRD).
 *
 * A API inteira recebe um único `db` e faz centenas de consultas sem dono. Em vez de reescrever
 * cada consulta, o `db` entregue às rotas passa a ser uma fachada: toda operação vai para o banco
 * de quem está na requisição. O dono vem da identidade que o servidor verificou (sessão ou chave
 * do agente), nunca de um campo enviado pelo cliente.
 *
 * - `runAs(userId, fn)` abre o escopo de uma pessoa; tudo que `fn` fizer, inclusive depois de
 *   `await`, usa o banco dela.
 * - Fora de escopo, a fachada só responde enquanto o servidor sobe (preparo do banco legado).
 *   Depois de `seal()`, usar o banco sem escopo é erro: falha fechada, sem cair no banco de alguém.
 * - `db.prepare()` devolve um statement preguiçoso: quem o guarda numa variável continua seguro,
 *   porque o banco é escolhido a cada execução.
 */
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';

export class TenantScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TenantScopeError';
    this.code = 'tenant_scope_missing';
  }
}

const STATEMENT_MODIFIERS = new Set(['pluck', 'raw', 'expand', 'safeIntegers', 'bind']);
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Middlewares que leem o corpo por eventos (upload de arquivo) chamam `next` fora do escopo de
 * quem fez a requisição. Este embrulho devolve o `next` ao escopo em que o middleware começou.
 */
export function keepScope(middleware) {
  return (req, res, next) => middleware(req, res, AsyncResource.bind(next));
}

export function assertUserId(userId) {
  if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) {
    throw new TenantScopeError('identidade inválida para escolher o banco');
  }
  return userId;
}

/**
 * @param {object} options
 * @param {(userId: string) => import('better-sqlite3').Database} options.open abre (ou cria) o banco da pessoa
 * @param {import('better-sqlite3').Database} [options.bootDb] banco usado fora de escopo enquanto o servidor sobe
 */
export function createTenantDb({ open, bootDb = null } = {}) {
  if (typeof open !== 'function') throw new TypeError('createTenantDb: informe open(userId)');
  const scope = new AsyncLocalStorage();
  const opened = new Map();
  let sealed = false;

  function dbFor(userId) {
    const id = assertUserId(userId);
    let found = opened.get(id);
    if (!found) {
      found = open(id);
      if (!found || typeof found.prepare !== 'function') throw new TypeError('open(userId) precisa devolver um banco');
      opened.set(id, found);
    }
    return found;
  }

  function current() {
    const store = scope.getStore();
    if (store) return store.db;
    if (!sealed && bootDb) return bootDb;
    throw new TenantScopeError('banco usado fora do escopo de uma pessoa');
  }

  function runAs(userId, fn) {
    const target = dbFor(userId);
    return scope.run({ userId, db: target }, fn);
  }

  const lazyStatement = (sql) => lazyWith(sql, []);

  function lazyWith(sql, inherited) {
    const realByDb = new WeakMap();
    const modifiers = [...inherited];
    const real = () => {
      const target = current();
      let statement = realByDb.get(target);
      if (!statement) {
        statement = target.prepare(sql);
        for (const [name, args] of modifiers) statement[name](...args);
        realByDb.set(target, statement);
      }
      return statement;
    };
    return new Proxy({}, {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        if (prop === 'source') return sql;
        if (STATEMENT_MODIFIERS.has(prop)) return (...args) => lazyWith(sql, [...modifiers, [prop, args]]);
        const statement = real();
        const value = statement[prop];
        return typeof value === 'function' ? value.bind(statement) : value;
      },
    });
  }

  function transaction(fn) {
    const call = (mode) => (...args) => {
      const wrapped = current().transaction(fn);
      return (mode ? wrapped[mode] : wrapped)(...args);
    };
    const run = call(null);
    run.deferred = call('deferred');
    run.immediate = call('immediate');
    run.exclusive = call('exclusive');
    return run;
  }

  const facade = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop === 'prepare') return (sql) => lazyStatement(sql);
      if (prop === 'transaction') return transaction;
      // fechar o banco de uma pessoa por dentro de uma rota derrubaria as outras requisições dela
      if (prop === 'close') return () => undefined;
      const target = current();
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set() {
      throw new TypeError('a fachada do banco é só de leitura');
    },
  });

  return {
    db: facade,
    runAs,
    dbFor,
    /** Quem está no escopo agora (ou null). */
    currentUserId: () => scope.getStore()?.userId ?? null,
    /** Depois de subir o servidor: sem escopo, o banco não responde mais. */
    seal() { sealed = true; },
    isSealed: () => sealed,
    openedUserIds: () => [...opened.keys()],
    closeAll() {
      for (const target of opened.values()) { try { target.close(); } catch { /* já fechado */ } }
      opened.clear();
    },
  };
}
