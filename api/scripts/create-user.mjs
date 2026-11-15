#!/usr/bin/env node
/**
 * Cria uma conta do beta (fase 4). Não existe cadastro público: quem convida é o dono da casa.
 *
 *   PRAXIS_NEW_USER_PASSWORD='…' node scripts/create-user.mjs <usuario> ["Nome que aparece"]
 *   printf '%s' '…' | node scripts/create-user.mjs <usuario> ["Nome que aparece"]
 *
 * A senha vem do ambiente ou da entrada padrão, nunca de argumento (argumento fica no histórico
 * e na lista de processos). Os dados da conta nascem vazios, em banco próprio, no primeiro acesso.
 * Pode rodar com a API no ar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { resolveDbPath } from '../lib/dbInit.js';
import { createUser, initAuthSchema } from '../praxisAuth.js';

const apiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [username, displayName = ''] = process.argv.slice(2);
if (!username) {
  console.error('uso: node scripts/create-user.mjs <usuario> ["Nome que aparece"] (senha por PRAXIS_NEW_USER_PASSWORD ou entrada padrão)');
  process.exit(2);
}
let password = process.env.PRAXIS_NEW_USER_PASSWORD || '';
if (!password && !process.stdin.isTTY) password = fs.readFileSync(0, 'utf8');
password = password.replace(/\r?\n$/, '');

const db = new Database(resolveDbPath(process.env.PRAXIS_DB_DIR || apiDir));
db.pragma('busy_timeout = 5000');
try {
  initAuthSchema(db);
  const user = createUser(db, { username, password, displayName });
  console.log(`conta criada: ${user.username} (${user.id.slice(0, 8)}…)`);
} catch (error) {
  console.error(`não criou: ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
