/**
 * Onde mora o banco de cada pessoa (fase 4 do PRD).
 *
 * - O dono legado (o João) continua no banco de sempre, que também guarda usuários e sessões.
 * - Qualquer outra conta ganha um arquivo próprio em `<dataDir>/users/<id>.db`, criado com o mesmo
 *   esquema e sem as sementes pessoais.
 * - Só abre arquivo de conta que existe no banco de controle.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { LEGACY_OWNER } from '../praxisAuth.js';
import { TenantScopeError, assertUserId } from './tenantDb.js';

const CONTROL_ONLY_TABLES = new Set(['praxis_users', 'praxis_sessions']);
const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

function schemaObjects(db) {
  return db.prepare(`
    SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, rowid
  `).all().filter((item) => !CONTROL_ONLY_TABLES.has(item.tbl_name));
}

/**
 * Deixa `target` com as mesmas tabelas, colunas, índices e gatilhos do banco de referência.
 * Só acrescenta: nunca apaga nem altera o que já existe. Não copia nenhuma linha.
 */
export function alignSchema(reference, target, { log = console } = {}) {
  const existing = new Set(target.prepare("SELECT type || ':' || name AS k FROM sqlite_master").pluck().all());
  const added = [];
  for (const item of schemaObjects(reference)) {
    if (existing.has(`${item.type}:${item.name}`)) {
      if (item.type !== 'table') continue;
      const have = new Set(target.prepare(`PRAGMA table_info(${quote(item.name)})`).all().map((c) => c.name));
      for (const column of reference.prepare(`PRAGMA table_info(${quote(item.name)})`).all()) {
        if (have.has(column.name)) continue;
        if (column.pk || (column.notnull && column.dflt_value === null)) {
          log.warn(`[contas] coluna ${item.name}.${column.name} não pôde ser acrescentada (obrigatória sem padrão)`);
          continue;
        }
        const parts = [quote(column.name), column.type || ''];
        if (column.notnull) parts.push('NOT NULL');
        if (column.dflt_value !== null) parts.push(`DEFAULT ${column.dflt_value}`);
        target.exec(`ALTER TABLE ${quote(item.name)} ADD COLUMN ${parts.filter(Boolean).join(' ')}`);
        added.push(`${item.name}.${column.name}`);
      }
      continue;
    }
    target.exec(item.sql);
    added.push(`${item.type}:${item.name}`);
  }
  return added;
}

/**
 * @param {object} options
 * @param {import('better-sqlite3').Database} options.controlDb banco legado, com usuários e sessões
 * @param {string} options.dataDir pasta dos bancos das outras contas
 * @param {(db: import('better-sqlite3').Database) => void} options.prepare cria esquema e linhas padrão, sem sementes pessoais
 */
export function createUserDbs({ controlDb, dataDir, prepare, log = console }) {
  const usersDir = path.join(dataDir, 'users');
  const findUser = controlDb.prepare('SELECT id FROM praxis_users WHERE id = ? AND legacy_owner = 0');
  const listUsers = controlDb.prepare('SELECT id FROM praxis_users WHERE legacy_owner = 0 ORDER BY created_date, id').pluck();

  function fileFor(owner) {
    return path.join(usersDir, `${assertUserId(owner)}.db`);
  }

  function open(owner) {
    if (owner === LEGACY_OWNER) return controlDb;
    assertUserId(owner);
    if (!findUser.get(owner)) throw new TenantScopeError('conta desconhecida');
    fs.mkdirSync(usersDir, { recursive: true, mode: 0o700 });
    const file = fileFor(owner);
    const created = !fs.existsSync(file);
    const db = new Database(file);
    try {
      if (created) fs.chmodSync(file, 0o600);
      db.pragma('journal_mode = WAL');
      prepare(db);
      const added = alignSchema(controlDb, db, { log });
      if (created) log.log(`[contas] banco criado para a conta ${owner.slice(0, 8)}…`);
      else if (added.length) log.log(`[contas] conta ${owner.slice(0, 8)}…: esquema atualizado (${added.length} item(ns))`);
    } catch (error) {
      db.close();
      if (created) for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
      throw error;
    }
    return db;
  }

  return {
    open,
    fileFor,
    usersDir,
    /** Todos os donos com dados: o legado e cada conta do beta. */
    ownerKeys: () => [LEGACY_OWNER, ...listUsers.all()],
  };
}
