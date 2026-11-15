import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const guard=fileURLToPath(new URL('../../scripts/migration/node-test-guard.cjs',import.meta.url));
const root=fileURLToPath(new URL('../package.json',import.meta.url));
const run=source=>spawnSync(process.execPath,['--require',guard,'--input-type=module','-e',source],{encoding:'utf8',timeout:10000});
test('helper guard refuses production DB before opening it',()=>{
 const r=run(`import {createRequire} from 'node:module';const DB=createRequire(${JSON.stringify(root)})('better-sqlite3');new DB('/root/.hermes/workspaces/apps/praxis/api/praxis.db',{readonly:true});`);
 assert.notEqual(r.status,0);assert.match(r.stderr,/non_scratch_sqlite_forbidden/);
});
test('helper guard refuses secret reads and real HTTP',()=>{
 for(const [code,message] of [["require('fs').readFileSync('/root/.hermes/secrets/forja-api.env')",'secret_read_forbidden'],["require('https').get('https://example.com')",'network_forbidden']]) {
  const r=run(`import {createRequire} from 'node:module';const require=createRequire(import.meta.url);${code};`);
  assert.notEqual(r.status,0);assert.match(r.stderr,new RegExp(message));
 }
});
