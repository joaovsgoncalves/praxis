/**
 * Compras/desejos sobre a camada assíncrona, com o comportamento da rota antiga (oráculo em
 * test-support/oracles/purchases.bcbadad.js):
 *
 * - lista: `status=all` sem filtro; outro status = igualdade; sem status = tudo menos pausado (e
 *   sem NULL); `horizon` = igualdade; ordem `sort_order ASC, created_date DESC`;
 * - criar: id do corpo ou UUID, posição `MAX(sort_order) + 1`, horizonte/estado fora da lista viram
 *   padrão, textos por `String(...)`; id repetido = mesmo erro do SQLite;
 * - alterar: só o que veio no corpo, `String(...)` em cada texto, 404 se não existe;
 * - apagar: 204 ou 404.
 *
 * Diferenças intencionais: (1) filtro com lista/objeto na query que desloca os parâmetros vira
 * `sqlite_coercion_unsupported`; (2) id escolhido pelo cliente com mais de 1500 bytes é recusado
 * (limite do Firestore). Nem a tela nem o Alfred mandam id ou filtros assim.
 */
import { randomUUID } from 'node:crypto';
import { bindPositional, sqliteRow } from '../storage/sqliteSemantics.js';
import { StorageError } from '../storage/contract.js';
import { PURCHASE_HORIZONS, PURCHASE_STATUSES } from '../purchaseList.js';
const INSERT_COLUMNS = [['id', 'TEXT'], ['title', 'TEXT'], ['notes', 'TEXT'], ['horizon', 'TEXT'], ['status', 'TEXT'], ['price_estimate', 'TEXT'], ['url', 'TEXT'], ['sort_order', 'INTEGER']];
const sqlStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

function sqliteUniqueError() {
  const error = new Error('UNIQUE constraint failed: purchase_items.id');
  error.name = 'SqliteError';
  error.code = 'SQLITE_CONSTRAINT_PRIMARYKEY';
  return error;
}
function shifted(values) {
  return values.some((value) => (Array.isArray(value) && value.length !== 1) || (value && typeof value === 'object' && !Array.isArray(value)));
}
/** Id que nenhum registro pode ter (longo demais para guardar) = registro inexistente. */
async function orMissing(promise, missing) {
  try { return await promise; } catch (error) { if (error?.code === 'invalid_record_id') return missing; throw error; }
}

export function createPurchasesService({ storage, now = () => new Date(), newId = randomUUID }) {
  if (!storage?.purchases || typeof storage.transaction !== 'function') throw new TypeError('purchases service requires storage');

  async function list({ horizon, status } = {}) {
    // Mesma montagem de parâmetros da consulta antiga, para os mesmos erros de ligação.
    const params = [];
    let mode = 'excludePaused';
    if (status === 'all') mode = 'all';
    else if (status) { mode = 'equals'; params.push(status); }
    if (horizon) params.push(horizon);
    // Um marcador `?` por filtro empurrado; listas/objetos mudam a contagem como no driver.
    const bound = bindPositional(params, params.length);
    if (shifted(params)) throw new StorageError('sqlite_coercion_unsupported', 'sqlite_coercion_unsupported: filtro deslocado por lista ou objeto');
    return storage.purchases.list({
      status: mode === 'equals' ? bound[0] : null,
      excludePaused: mode === 'excludePaused',
      horizon: horizon ? bound[bound.length - 1] : null,
    });
  }

  async function create(body) {
    try {
      return await storage.transaction(async (tx) => {
        const id = body.id || newId();
        const top = await tx.purchases.maxSort();
        const horizon = PURCHASE_HORIZONS.includes(body.horizon) ? body.horizon : 'medium';
        const status = PURCHASE_STATUSES.includes(body.status) ? body.status : 'want';
        const row = sqliteRow(INSERT_COLUMNS, [
          id, String(body.title || '').trim(), String(body.notes || ''), horizon, status,
          String(body.price_estimate || ''), String(body.url || ''), (top || 0) + 1,
        ]);
        const stamp = sqlStamp(now());
        return tx.purchases.create({ ...row, created_date: stamp, updated_date: stamp });
      });
    } catch (error) {
      if (error?.code === 'already_exists') throw sqliteUniqueError();
      throw error;
    }
  }

  async function update(id, body) {
    return orMissing(storage.transaction(async (tx) => {
      const existing = await tx.purchases.get(id);
      if (!existing) return null;
      const fields = {
        horizon: body.horizon !== undefined && PURCHASE_HORIZONS.includes(body.horizon) ? body.horizon : existing.horizon,
        status: body.status !== undefined && PURCHASE_STATUSES.includes(body.status) ? body.status : existing.status,
        updated_date: sqlStamp(now()),
      };
      if (body.title !== undefined) fields.title = String(body.title).trim();
      if (body.notes !== undefined) fields.notes = String(body.notes);
      if (body.price_estimate !== undefined) fields.price_estimate = String(body.price_estimate);
      if (body.url !== undefined) fields.url = String(body.url);
      await tx.purchases.patch(id, fields);
      return { ...existing, ...fields };
    }), null);
  }

  async function remove(id) {
    return orMissing(storage.purchases.remove(id), false);
  }

  return Object.freeze({ list, create, update, remove });
}
