/**
 * Finanças, domínio 1: configuração, contas e saldos sobre a camada assíncrona, com o comportamento
 * das funções antigas (oráculo em test-support/oracles/finance.bcbadad.js: getSettings,
 * updateSettings, listAccounts, createAccount, updateAccount, listBalances, createBalance).
 *
 * - Valores passam pela mesma ligação e afinidade do SQLite (`sqliteRowWithReal`) antes de chegar ao
 *   repositório, inclusive listas achatadas e os erros do driver.
 * - O que a função antiga gravava em passos soltos e deixava gravado antes de um 400 continua assim:
 *   `GET /settings` cria a linha padrão; `PATCH /settings` inválido deixa a linha padrão criada;
 *   `POST /accounts` com saldo cuja conta não se acha (id numérico vira "5.0") deixa a conta criada.
 *   Aqui cada caso é UMA transação que grava exatamente o que a antiga deixava.
 * - Respostas montadas com uma leitura depois da gravação, como a antiga (`listAccounts(...).find`).
 *
 * finance.js continua intocado: o Alfred importa as funções síncronas direto.
 */
import { randomUUID } from 'node:crypto';
import {
  ACCOUNT_KINDS, AMOUNT_KINDS, SOURCES, DEFAULT_SALARY_DAY,
  money, isValidDateString, todayFortaleza, parseEntity, normalizeBrandColor, normalizeCardLast4,
} from '../../finance.js';
import { bindPositional, sqliteRowWithReal } from '../../storage/sqliteSemantics.js';
import { pick, badRequest, parseMonthDay, uniqueAs, orMissing, findIn } from './shared.js';

const SETTINGS_INSERT = [['id', 'TEXT'], ['reserved_car', 'REAL'], ['reserved_live', 'REAL'], ['snapshot_label', 'TEXT'], ['updated_at', 'TEXT']];
const SETTINGS_UPDATE = [['reserved_car', 'REAL'], ['reserved_live', 'REAL'], ['snapshot_label', 'TEXT'], ['hide_values', 'INTEGER'], ['salary_day', 'INTEGER'], ['updated_at', 'TEXT']];
const ACCOUNT_INSERT = [['id', 'TEXT'], ['name', 'TEXT'], ['kind', 'TEXT'], ['institution', 'TEXT'], ['mask', 'TEXT'], ['pierre_account_id', 'TEXT'], ['is_operational', 'INTEGER'], ['status', 'TEXT'], ['sort_order', 'INTEGER'], ['created_at', 'TEXT'], ['updated_at', 'TEXT'], ['entity', 'TEXT']];
const ACCOUNT_UPDATE = [['name', 'TEXT'], ['kind', 'TEXT'], ['institution', 'TEXT'], ['mask', 'TEXT'], ['is_operational', 'INTEGER'], ['status', 'TEXT'], ['brand_color', 'TEXT'], ['card_last4', 'TEXT'], ['updated_at', 'TEXT']];
const BALANCE_INSERT = [['id', 'TEXT'], ['account_id', 'TEXT'], ['as_of', 'TEXT'], ['amount', 'REAL'], ['amount_kind', 'TEXT'], ['source', 'TEXT'], ['locked', 'INTEGER'], ['note', 'TEXT'], ['created_at', 'TEXT']];
const BALANCE_KINDS = ['available', 'invested', 'official_bill', 'projected_bill'];

function settingsView(row) {
  const salaryDay = Number(row.salary_day);
  return {
    ...row,
    hide_values: Number(row.hide_values) === 1,
    salary_day: Number.isInteger(salaryDay) && salaryDay >= 1 && salaryDay <= 31 ? salaryDay : DEFAULT_SALARY_DAY,
  };
}
function accountView(acc, latest) {
  const { available, invested, official_bill: official, projected_bill: projected } = latest;
  return {
    ...acc,
    entity: acc.entity || 'pf',
    brand_color: acc.brand_color || null,
    card_last4: acc.card_last4 || null,
    is_operational: Number(acc.is_operational) === 1,
    available: available ? money(available.amount) : 0,
    available_as_of: available?.as_of || null,
    available_source: available?.source || null,
    invested: invested ? money(invested.amount) : 0,
    invested_as_of: invested?.as_of || null,
    invested_source: invested?.source || null,
    official_bill: official ? money(official.amount) : null,
    projected_bill: projected ? money(projected.amount) : null,
  };
}

export function createFinanceCoreService({ storage, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.financeAccounts || typeof storage.transaction !== 'function') throw new TypeError('finance core service requires storage');
  const iso = () => now().toISOString();

  /** Leitura de `getSettings`, sem gravar: null se a linha não existe. */
  const defaultSettings = () => ({
    ...sqliteRowWithReal(SETTINGS_INSERT, ['default', 0, 0, '', iso()]),
    hide_values: 0,
    salary_day: DEFAULT_SALARY_DAY,
  });

  /**
   * Gravação de `updateSettings` dentro de uma transação já aberta: `current` = linha lida antes
   * (null = criar a padrão). Devolve o 400 sem lançar para a transação gravar a linha padrão mesmo assim.
   */
  function planSettings(current, body) {
    const existing = current ?? defaultSettings();
    const view = settingsView(existing);
    let fields;
    try {
      const reservedCar = body.reserved_car !== undefined ? money(body.reserved_car) : view.reserved_car;
      const reservedLive = body.reserved_live !== undefined ? money(body.reserved_live) : view.reserved_live;
      const label = body.snapshot_label !== undefined ? String(body.snapshot_label) : view.snapshot_label;
      let hideValues = view.hide_values;
      if (body.hide_values !== undefined) {
        if (typeof body.hide_values !== 'boolean' && ![0, 1].includes(body.hide_values)) throw badRequest('hide_values precisa ser booleano');
        hideValues = Boolean(body.hide_values);
      }
      const salaryDay = body.salary_day !== undefined ? parseMonthDay(body.salary_day, 'salary_day') : view.salary_day;
      fields = sqliteRowWithReal(SETTINGS_UPDATE, [reservedCar, reservedLive, label, hideValues ? 1 : 0, salaryDay, iso()]);
    } catch (error) {
      if (error?.status !== 400) throw error;
      return { create: current ? null : existing, patch: null, error };
    }
    if (current) return { create: null, patch: fields, error: null };
    return { create: { ...existing, ...fields }, patch: null, error: null };
  }
  async function applySettings(tx, plan) {
    if (plan.create) await tx.financeSettings.create(plan.create);
    if (plan.patch) await tx.financeSettings.patch(plan.patch);
  }

  async function getSettings() {
    await storage.transaction(async (tx) => {
      if (!(await tx.financeSettings.get())) await tx.financeSettings.create(defaultSettings());
    });
    return settingsView(await storage.financeSettings.get());
  }

  async function updateSettings(body = {}) {
    const failure = await storage.transaction(async (tx) => {
      const plan = planSettings(await tx.financeSettings.get(), body);
      await applySettings(tx, plan);
      return plan.error;
    });
    if (failure) throw failure;
    return settingsView(await storage.financeSettings.get());
  }

  async function latestFor(accountId) {
    const rows = await storage.financeBalances.list({ accountId, limit: null });
    return Object.fromEntries(BALANCE_KINDS.map((kind) => [kind, rows.find((row) => row.amount_kind === kind)]));
  }

  async function listAccounts({ status = 'active', entity = 'all' } = {}) {
    const params = [];
    const byStatus = Boolean(status && status !== 'all');
    if (byStatus) params.push(status);
    const ent = parseEntity(entity, 'all');
    if (ent !== 'all') params.push(ent);
    // Mesma ligação da consulta antiga: um `?` por filtro, listas achatadas, mesmos erros.
    const bound = bindPositional(params, params.length);
    const rows = await storage.financeAccounts.list({ status: byStatus ? bound[0] : null, entity: ent !== 'all' ? bound[bound.length - 1] : null });
    return Promise.all(rows.map(async (acc) => accountView(acc, await latestFor(acc.id))));
  }

  /** Linha de saldo como `createBalance` a gravaria; `settingsTouched` = a antiga chamava updateSettings. */
  function balanceRow(body, accountId) {
    return sqliteRowWithReal(BALANCE_INSERT, [
      body.id || newId(), accountId, isValidDateString(body.as_of) ? body.as_of : todayFortaleza(now()), money(body.amount),
      pick(body.amount_kind, AMOUNT_KINDS, 'available'), pick(body.source, SOURCES, 'joao'), body.locked ? 1 : 0, String(body.note || ''), iso(),
    ]);
  }
  const touchesSettings = (body) => body.source === 'joao' || Boolean(body.locked);

  async function createAccount(body) {
    const name = String(body.name || '').trim();
    if (!name) throw badRequest('name required');
    const id = body.id || newId();
    const stamp = iso();
    const entity = parseEntity(body.entity, 'pf');
    if (entity === 'all') throw badRequest('entity da conta: pf ou pj');
    const withBalance = body.amount !== undefined;
    const balanceBody = withBalance ? {
      account_id: id, amount: body.amount, amount_kind: 'available', source: pick(body.source, SOURCES, 'joao'), as_of: body.as_of, locked: body.locked,
    } : null;
    const failure = await uniqueAs('finance_accounts', storage.transaction(async (tx) => {
      // Leituras antes de qualquer escrita (regra dos dois motores).
      await tx.financeAccounts.reserve(1);
      const top = (await tx.financeAccounts.maxSort()) ?? 0;
      const row = {
        ...sqliteRowWithReal(ACCOUNT_INSERT, [
          id, name, pick(body.kind, ACCOUNT_KINDS, 'checking'), String(body.institution || ''), String(body.mask || '').slice(-4),
          body.pierre_account_id || null, body.is_operational ? 1 : 0, body.status === 'archived' ? 'archived' : 'active',
          Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : (top || 0) + 1, stamp, stamp, entity,
        ]),
        brand_color: null,
        card_last4: null,
      };
      let balance = null, settingsPlan = null;
      if (withBalance) {
        const accountId = String(balanceBody.account_id || '');
        const found = accountId === row.id || Boolean(await findIn(tx.financeAccounts, accountId));
        if (!found) {
          // A antiga já tinha gravado a conta quando o saldo deu 400.
          await tx.financeAccounts.create(row);
          return badRequest('account not found');
        }
        await tx.financeBalances.reserve(1);
        balance = balanceRow(balanceBody, accountId);
        if (touchesSettings(balanceBody)) settingsPlan = planSettings(await tx.financeSettings.get(), { snapshot_label: '' });
      }
      await tx.financeAccounts.create(row);
      if (balance) await tx.financeBalances.create(balance);
      if (settingsPlan) await applySettings(tx, settingsPlan);
      return null;
    }));
    if (failure) throw failure;
    return (await listAccounts({ status: 'all' })).find((a) => a.id === id);
  }

  async function updateAccount(id, body = {}) {
    const failure = await orMissing(storage.transaction(async (tx) => {
      const existing = await findIn(tx.financeAccounts, id);
      if (!existing) return 'missing';
      const brandColor = body.brand_color !== undefined ? normalizeBrandColor(body.brand_color) : existing.brand_color;
      const cardLast4 = body.card_last4 !== undefined ? normalizeCardLast4(body.card_last4) : existing.card_last4;
      const entity = body.entity !== undefined ? parseEntity(body.entity) : (existing.entity || 'pf');
      if (entity === 'all') throw badRequest('entity da conta: pf ou pj');
      const bound = sqliteRowWithReal(ACCOUNT_UPDATE, [
        body.name !== undefined ? String(body.name).trim() : null,
        body.kind !== undefined ? pick(body.kind, ACCOUNT_KINDS, existing.kind) : existing.kind,
        body.institution !== undefined ? String(body.institution) : null,
        body.mask !== undefined ? String(body.mask).slice(-4) : null,
        body.is_operational !== undefined ? (body.is_operational ? 1 : 0) : existing.is_operational,
        body.status !== undefined ? (body.status === 'archived' ? 'archived' : 'active') : existing.status,
        brandColor ?? null, cardLast4 ?? null, iso(),
      ]);
      // COALESCE(?, coluna) da consulta antiga: nulo mantém o que estava.
      const fields = { ...bound };
      for (const key of ['name', 'institution', 'mask']) if (fields[key] === null) delete fields[key];
      if (body.entity !== undefined) fields.entity = entity;
      await tx.financeAccounts.patch(id, fields);
      return null;
    }), 'missing');
    if (failure === 'missing') return null;
    return (await listAccounts({ status: 'all' })).find((a) => a.id === id);
  }

  async function listBalances({ account_id } = {}) {
    if (account_id) {
      const [bound] = bindPositional([account_id], 1);
      return storage.financeBalances.list({ accountId: bound, limit: null });
    }
    return storage.financeBalances.list({ accountId: null, limit: 200 });
  }

  async function createBalance(body) {
    const accountId = String(body.account_id || '');
    const row = await uniqueAs('finance_balances', storage.transaction(async (tx) => {
      if (!(await findIn(tx.financeAccounts, accountId))) throw badRequest('account not found');
      await tx.financeBalances.reserve(1);
      const balance = balanceRow(body, accountId);
      const settingsPlan = touchesSettings(body) ? planSettings(await tx.financeSettings.get(), { snapshot_label: '' }) : null;
      await tx.financeBalances.create(balance);
      if (settingsPlan) await applySettings(tx, settingsPlan);
      return balance;
    }));
    return storage.financeBalances.get(row.id);
  }

  return Object.freeze({ getSettings, updateSettings, listAccounts, createAccount, updateAccount, listBalances, createBalance });
}
