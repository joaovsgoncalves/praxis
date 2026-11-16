/**
 * Domínios da fase 5 da migração. SÓ a fase 5 edita este arquivo.
 * Formato de cada item: veja storage/domains/index.js.
 *
 * Finanças, domínio 1 (configuração, contas e saldos). Tabelas, colunas de dinheiro e mapeamento no
 * Firestore em storage/sqlite/financeTables.js. Linha única: `users/{uid}/financeSettings/default`.
 * Os repositórios guardam linhas já no formato do SQLite (afinidade aplicada pelo serviço); dinheiro
 * tem de ser número com centavos exatos nos dois motores (fração de centavo = `fractional_cent_or_overflow`).
 */
import { StorageError, recordId } from '../contract.js';
import { FINANCE_TABLES, FINANCE_GENERIC_TABLES, financeRow, financePatch, optionalText } from '../sqlite/financeTables.js';
import { sqliteFinanceTable } from '../sqlite/financeTable.js';
import { firestoreFinanceTable } from '../firestore/financeTable.js';
import { sqliteFinanceTransactions, transactionRangeQuery } from '../sqlite/financeTransactions.js';
import { firestoreFinanceTransactions } from '../firestore/financeTransactions.js';
import { sqliteFinanceSettings, sqliteFinanceAccounts, sqliteFinanceBalances } from '../sqlite/financeCore.js';
import { firestoreFinanceSettings, firestoreFinanceAccounts, firestoreFinanceBalances } from '../firestore/financeCore.js';

const T = FINANCE_TABLES;
const none = () => [];
function count(value = 1) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 500) throw new StorageError('invalid_reservation');
  return [value];
}
function plainQuery(input, keys, code) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StorageError(code);
  for (const key of Object.keys(input)) if (!keys.includes(key)) throw new StorageError(code);
}

/**
 * Domínio 2 em diante: tabela genérica (financeTables.js). `methods` escolhe o que o domínio expõe;
 * `list(filtros)` só aceita as colunas de `filters`, cada uma texto exato ou null (sem filtro).
 */
function tableDomain(name, methods, { extra = {}, sqliteMake, firestoreMake } = {}) {
  const def = FINANCE_GENERIC_TABLES[name];
  const uniqueNames = (def.unique ?? []).map((rule) => rule.column);
  const all = {
    ...extra,
    findUnique: ['read', (column, value) => {
      if (!uniqueNames.includes(column) || typeof value !== 'string' || value === '') throw new StorageError('invalid_unique_column');
      return [column, value];
    }],
    clash: ['read', (row) => [financeRow(def, row)]],
    reserve: ['read', count],
    get: ['read', (key) => [recordId(key)]],
    list: ['read', (query = {}) => {
      plainQuery(query, def.filters, 'invalid_finance_query');
      return [Object.fromEntries(def.filters.map((column) => [column, optionalText(query[column] ?? null, 'invalid_finance_query')]))];
    }],
    create: ['write', (row) => [financeRow(def, row)]],
    upsert: ['write', (row) => [financeRow(def, row)]],
    patch: ['write', (key, fields) => [recordId(key), financePatch(def, fields)]],
    remove: ['write', (key) => [recordId(key)]],
  };
  const pickMethods = (target) => Object.fromEntries(methods.map((method) => [method, target[method]]));
  const sqlite = sqliteMake ?? sqliteFinanceTable(def), firestore = firestoreMake ?? firestoreFinanceTable(name, def);
  return {
    name,
    spec: () => pickMethods(all),
    sqlite: (db) => pickMethods(sqlite(db)),
    firestore: (userDoc, transaction, client) => pickMethods(firestore(userDoc, transaction, client)),
  };
}
const CATALOG = ['reserve', 'get', 'list', 'create', 'patch', 'remove'];

export const DOMAINS = [
  {
    name: 'financeSettings',
    spec: () => ({
      get: ['read', none],
      create: ['write', (row) => [financeRow(T.financeSettings, row)]],
      patch: ['write', (fields) => [financePatch(T.financeSettings, fields)]],
    }),
    sqlite: sqliteFinanceSettings,
    firestore: firestoreFinanceSettings,
  },
  {
    name: 'financeAccounts',
    spec: () => ({
      reserve: ['read', count],
      get: ['read', (id) => [recordId(id)]],
      list: ['read', (query = {}) => {
        plainQuery(query, ['status', 'entity'], 'invalid_account_query');
        return [{ status: optionalText(query.status ?? null, 'invalid_account_query'), entity: optionalText(query.entity ?? null, 'invalid_account_query') }];
      }],
      maxSort: ['read', none],
      create: ['write', (row) => [financeRow(T.financeAccounts, row)]],
      patch: ['write', (id, fields) => [recordId(id), financePatch(T.financeAccounts, fields)]],
    }),
    sqlite: sqliteFinanceAccounts,
    firestore: firestoreFinanceAccounts,
  },
  {
    name: 'financeBalances',
    spec: () => ({
      reserve: ['read', count],
      get: ['read', (id) => [recordId(id)]],
      list: ['read', (query = {}) => {
        plainQuery(query, ['accountId', 'limit'], 'invalid_balance_query');
        const limit = query.limit ?? null;
        if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) throw new StorageError('invalid_balance_query');
        return [{ accountId: optionalText(query.accountId ?? null, 'invalid_balance_query'), limit }];
      }],
      create: ['write', (row) => [financeRow(T.financeBalances, row)]],
    }),
    sqlite: sqliteFinanceBalances,
    firestore: firestoreFinanceBalances,
  },
  // Domínio 2: cadastros.
  tableDomain('financeSubscriptions', CATALOG),
  tableDomain('financeInstallments', CATALOG),
  tableDomain('financeGoals', ['reserve', 'get', 'list', 'create', 'patch']),
  tableDomain('financeFixedExpenses', CATALOG),
  tableDomain('financeBudgets', ['list', 'upsert', 'remove']),
  // Domínio 3: dívidas, baixas e lançamentos (criação, extrato, busca pela baixa e por chave única).
  tableDomain('financeDebts', ['reserve', 'get', 'list', 'create', 'patch']),
  tableDomain('financePayments', ['reserve', 'get', 'findUnique', 'clash', 'create']),
  tableDomain('financeTransactions', ['reserve', 'get', 'list', 'range', 'byPayment', 'findUnique', 'clash', 'create', 'patch'], {
    extra: {
      range: ['read', (query) => [transactionRangeQuery(query)]],
      byPayment: ['read', (paymentId) => [recordId(paymentId)]],
    },
    sqliteMake: sqliteFinanceTransactions,
    firestoreMake: firestoreFinanceTransactions,
  }),
];
