import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createTestDb } from './test-support/helpers.mjs';
import { createStorage } from './storage/index.js';
import { createSqliteTasksDriver } from './storage/sqlite/tasks.js';
import { createFirestoreTasksDriver } from './storage/firestore/tasks.js';
import { Firestore } from '@google-cloud/firestore';

const now = () => new Date('2026-11-15T12:00:00Z');
async function fixture(kind) {
  const scope = new AsyncLocalStorage(), databases = new Map();
  let client;
  const driver = kind === 'sqlite' ? createSqliteTasksDriver({
    open(owner) { if (!databases.has(owner)) databases.set(owner, createTestDb()); return databases.get(owner); },
  }) : (() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
    client = new Firestore({projectId:'demo-praxis-storage', host, ssl:false});
    const root = client.collection('storageContractRuns').doc(randomUUID());
    return createFirestoreTasksDriver({root, client});
  })();
  return { driver, storage:createStorage({driver, currentOwner:()=>scope.getStore(), now}),
    as:(owner, fn)=>scope.run(owner, fn), close:async()=>{ for(const db of databases.values()) db.close(); if(client)await client.terminate(); } };
}
const input = (id='t1') => ({id,title:'Tarefa sintética',date:'2026-11-15'});

for (const kind of ['sqlite','firestore']) {
 test(`${kind}: storage contract`, {skip:kind==='firestore'&&!process.env.FIRESTORE_EMULATOR_HOST}, async t => {
  const f=await fixture(kind);t.after(f.close);const {storage:s,as}=f;
  const inAtomic=fn=>as('atomic_'+randomUUID(),async()=>{await s.tasks.create(input('a'));await s.tasks.create(input('b'));return fn();});
  await t.test('no scope, invalid scope and client owner field fail closed',async()=>{
   await assert.rejects(()=>s.tasks.get('x'),{code:'tenant_scope_missing'});
   await assert.rejects(()=>as('../other',()=>s.tasks.get('x')),{code:'tenant_scope_missing'});
   await assert.rejects(()=>as('alice',()=>s.tasks.create({...input(),owner:'bob'})),{code:'unknown_task_field'});
  });
  await t.test('same IDs belong independently to two owners, default row agrees',async()=>{
   const a=await as('alice',()=>s.tasks.create(input()));const b=await as('bob',()=>s.tasks.create({...input(),title:'Outra conta'}));
   assert.equal(a.created_date,'2026-11-15 12:00:00');assert.equal(a.duration_minutes,null);assert.equal(a.status,'pending');assert.equal(b.title,'Outra conta');
   assert.equal((await as('alice',()=>s.tasks.get('t1'))).title,'Tarefa sintética');
  });
  await t.test('captured facade resolves current verified scope after await',async()=>{
   const tasks=s.tasks;
   const rows=await Promise.all(['alice','bob'].map(owner=>as(owner,async()=>{await Promise.resolve();return tasks.get('t1');})));
   assert.deepEqual(rows.map(x=>x.title),['Tarefa sintética','Outra conta']);
  });
  await t.test('IDs are literal, no traversal or normalization; duplicate is explicit',async()=>{
   await as('alice',async()=>{
    for(const id of ['', '\ud800', 'x'.repeat(1501)])await assert.rejects(()=>s.tasks.get(id),{code:'invalid_record_id'});
    for(const id of ['.', '..', '../bob', 'a/b','__internal__','~bYS9i','/'.repeat(1500)]){await s.tasks.create(input(id));assert.equal((await s.tasks.get(id)).id,id);}
    await s.tasks.create(input('ID:with.dot'));assert.equal((await s.tasks.get('ID:with.dot')).id,'ID:with.dot');
    await assert.rejects(()=>s.tasks.create(input()),{code:'already_exists'});
   });
  });
  await t.test('patch preserves omitted fields and explicit null, refuses ID/unknown/undefined',async()=>as('alice',async()=>{
   await s.tasks.patch('t1',{date:null,title:'Mudou'});const row=await s.tasks.get('t1');assert.equal(row.date,null);assert.equal(row.title,'Mudou');assert.equal(row.status,'pending');
   for(const patch of [{id:'new'},{user_id:'bob'},{title:undefined},{duration_minutes:1.5}])await assert.rejects(()=>s.tasks.patch('t1',patch));
   await assert.rejects(()=>s.tasks.patch('missing',{title:'X'}),{code:'not_found'});
  }));
  await t.test('list is filtered and deterministic, including null and bounded pagination',async()=>as('listing',async()=>{
   await s.tasks.create({...input('c'),status:'done'});await s.tasks.create(input('a'));await s.tasks.create({...input('b'),date:null});
   assert.deepEqual((await s.tasks.list({limit:1,offset:1})).map(x=>x.id),['b']);
   assert.deepEqual((await s.tasks.list({date:null})).map(x=>x.id),['b']);
   assert.deepEqual((await s.tasks.list({date:'2026-11-15',status:'pending'})).map(x=>x.id),['a']);
   for(const query of [{limit:0},{limit:1001},{offset:-1},{where:'SQL'},{owner:'alice'}])await assert.rejects(()=>s.tasks.list(query));
  }));
  await t.test('multi-record transaction commits together and rolls back on callback error',async()=>as('atomic_commit',async()=>{
   await s.transaction(async tx=>{await tx.tasks.create(input('a'));await tx.tasks.create(input('b'));});
   await assert.rejects(()=>s.transaction(async tx=>{await tx.tasks.patch('a',{title:'wrong'});await tx.tasks.create(input('c'));throw Error('injected');}),/injected/);
   assert.equal((await s.tasks.get('a')).title,'Tarefa sintética');assert.equal(await s.tasks.get('c'),null);
  }));
  await t.test('commit-time duplicate aborts all writes',async()=>inAtomic(async()=>{
   await assert.rejects(()=>s.transaction(async tx=>{await tx.tasks.patch('a',{title:'wrong'});await tx.tasks.create(input('b'));}),{code:'already_exists'});
   assert.equal((await s.tasks.get('a')).title,'Tarefa sintética');
  }));
  await t.test('caught write failure still aborts the complete transaction',async()=>inAtomic(async()=>{
   await assert.rejects(()=>s.transaction(async tx=>{
    await tx.tasks.patch('a',{title:'wrong'});
    try{await tx.tasks.create(input('b'));}catch{/* Service mistakenly swallows write error. */}
   }),{code:'already_exists'});
   assert.equal((await s.tasks.get('a')).title,'Tarefa sintética');
  }));
  await t.test('read-after-write, nested transaction and root facade inside transaction are rejected',async()=>inAtomic(async()=>{
   await assert.rejects(()=>s.transaction(async tx=>{await tx.tasks.patch('a',{title:'wrong'});await tx.tasks.get('b');}),{code:'transaction_read_after_write'});
   await assert.rejects(()=>s.transaction(()=>s.transaction(async()=>{})),{code:'nested_transaction'});
   await assert.rejects(()=>s.transaction(()=>s.tasks.get('a')),{code:'transaction_facade_required'});
   assert.equal((await s.tasks.get('a')).title,'Tarefa sintética');
  }));
  await t.test('transaction capability cannot escape lifetime or switch account',async()=>{
   let escaped;
   await as('alice',()=>s.transaction(async tx=>{escaped=tx;}));
   await assert.rejects(()=>as('alice',()=>escaped.tasks.get('t1')),{code:'transaction_closed'});
   await assert.rejects(()=>as('alice',()=>s.transaction(tx=>as('bob',()=>tx.tasks.get('t1')))),{code:'transaction_owner_mismatch'});
  });
  await t.test('concurrent read-modify-write retries/serializes without lost update',async()=>as('race',async()=>{
   await s.tasks.create({...input('counter'),sort_order:0});
   await Promise.all(Array.from({length:5},()=>s.transaction(async tx=>{const row=await tx.tasks.get('counter');await new Promise(r=>setTimeout(r,5));await tx.tasks.patch('counter',{sort_order:row.sort_order+1});})));
   assert.equal((await s.tasks.get('counter')).sort_order,5);
  }));
  await t.test('outside reads cannot observe aborted intermediate writes',async()=>{
   let entered, release;
   const started=new Promise(r=>{entered=r;}), barrier=new Promise(r=>{release=r;});
   await as('isolation',()=>s.tasks.create(input()));
   const writing=as('isolation',()=>s.transaction(async tx=>{await tx.tasks.patch('t1',{title:'uncommitted'});entered();await barrier;throw Error('abort');}));
   const rejected=assert.rejects(()=>writing,/abort/);
   await started;
   const reading=as('isolation',()=>s.tasks.get('t1'));
   release();await rejected;
   assert.equal((await reading).title,'Tarefa sintética');
  });
  await t.test('failed update at commit rolls back other records',async()=>inAtomic(async()=>{
   await assert.rejects(()=>s.transaction(async tx=>{await tx.tasks.patch('a',{title:'wrong'});await tx.tasks.patch('missing',{title:'bad'});}),{code:'not_found'});
   assert.equal((await s.tasks.get('a')).title,'Tarefa sintética');
  }));
  await t.test('deletion is idempotent and scoped',async()=>{
   await as('alice',()=>s.tasks.remove('t1'));await as('alice',()=>s.tasks.remove('t1'));
   assert.equal(await as('alice',()=>s.tasks.get('t1')),null);assert.ok(await as('bob',()=>s.tasks.get('t1')));
  });
 });
}

test('complete task rows and filtered results are identical across engines', {skip:!process.env.FIRESTORE_EMULATOR_HOST},async t=>{
 const sql=await fixture('sqlite'),fire=await fixture('firestore');t.after(sql.close);t.after(fire.close);
 async function replay(f) {
  return f.as('parity',async()=>{
   const s=f.storage, snapshots=[];
   for(const row of [input('ordinary'),{...input('a/b'),description:'Descrição 😀',date:null,recurrence:'weekly',recurrence_days:'[1,3]',sort_order:2,duration_minutes:25}, {...input('~bYS9i'),status:'completed',completed_date:'2026-11-15',completed_at:'2026-11-15T10:11:12Z',day_outcome:null}])snapshots.push(await s.tasks.create(row));
   snapshots.push(await s.tasks.list());snapshots.push(await s.tasks.list({date:null}));
   await s.transaction(async tx=>{const row=await tx.tasks.get('ordinary');await tx.tasks.patch(row.id,{status:'completed',completed_date:'2026-11-15'});});
   snapshots.push(await s.tasks.get('ordinary'));snapshots.push(await s.tasks.list({status:'completed'}));
   await s.tasks.remove('a/b');snapshots.push(await s.tasks.list());
   return snapshots;
  });
 }
 assert.deepEqual(await replay(sql),await replay(fire));
});
