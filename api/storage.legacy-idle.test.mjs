import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorageRuntime } from './storage/runtime.js';

test('SQLite em disco: callback legado da agenda espera o commit da conexão dedicada', async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'praxis-idle-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'test.db'),seed=createTestDb(); await seed.backup(file);seed.close();
 const legacy=new Database(file,{timeout:100});t.after(()=>legacy.close());
 const runtime=createStorageRuntime({engine:'sqlite',currentOwner:()=> 'alice',sqlite:{pathFor:()=>file}});t.after(()=>runtime.close());
 let release,entered;
 const gate=new Promise(r=>{release=r;}), started=new Promise(r=>{entered=r;});
 const first=runtime.storage.transaction(async(tx)=>{await tx.tasks.get('none');entered();await gate;});
 await started;
 let called=false;
 const external=runtime.runLegacy(()=>{called=true;legacy.prepare("INSERT INTO tasks(id,title) VALUES ('from-calendar','event saved')").run();return {action:'created'};});
 await new Promise(r=>setImmediate(r));assert.equal(called,false,'callback não roda com outra transação aberta');
 release();await first;assert.deepEqual(await external,{action:'created'});
 assert.equal((await runtime.storage.tasks.get('from-calendar')).title,'event saved');
});
