import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {collect} from '/root/.hermes/workspaces/labs/hermes-gpt/extensions/apps_access/finance_read.mjs';
import * as finance from '../finance.js';
const DB=createRequire(new URL('../package.json',import.meta.url))('better-sqlite3');
function fixture(){
 const db=new DB(':memory:');finance.initFinanceSchema(db);finance.getSettings(db);
 finance.createAccount(db,{id:'pf-synthetic',name:'PF sintética',entity:'pf',institution:'inter'});
 finance.createAccount(db,{id:'pj-synthetic',name:'PJ sintética',entity:'pj',institution:'empresa'});
 finance.createTransaction(db,{id:'pf-tx',account_id:'pf-synthetic',amount:-12.34,posted_on:'2026-11-10'});
 finance.createTransaction(db,{id:'pj-tx',account_id:'pj-synthetic',amount:-99,posted_on:'2026-11-10'});
 return db;
}
const clock=new Date('2026-11-15T15:00:00Z');
for(const suffix of ['status','overview','bills','debts.list','installments.list','subscriptions.list','month','transactions.list']) {
 test(`Alfred financial reader ${suffix}: PF envelope, real calculation, zero writes`,()=>{
  const db=fixture();try {
   db.pragma('query_only=ON');const before=db.prepare('SELECT total_changes() n').get().n;
   const payload=suffix==='month'?{month:'2026-11'}:suffix==='transactions.list'?{from:'2026-11-01',to:'2026-11-30'}:{};
   const r=collect(db,'finance.'+suffix,payload,clock);
   assert.equal(r.ok,true);assert.equal(r.version,'finance-read-v1.1.0');assert.equal(r.read_at,clock.toISOString());assert.ok(r.coverage);assert.ok(r.as_of);
   if(suffix==='month')assert.equal(r.data.total_out,12.34);
   if(suffix==='transactions.list'){assert.equal(r.data.total,1);assert.equal(r.data.items[0].id,'pf-tx');assert.equal(r.data.next_offset,null);}
   assert.equal(db.prepare('SELECT total_changes() n').get().n,before);
  }finally{db.close();}
 });
}
test('new valid PF identity is allowed by current helper, not an obsolete account allowlist',()=>{
 const db=fixture();try{assert.equal(collect(db,'finance.status',{},clock).ok,true);}finally{db.close();}
});
test('orphan account reference still fails closed',()=>{
 const db=fixture();try{db.prepare("UPDATE finance_transactions SET account_id='missing' WHERE id='pf-tx'").run();assert.equal(collect(db,'finance.status',{},clock).error,'finance_scope_changed');}finally{db.close();}
});
test('requested company scope is rejected',()=>{
 const db=fixture();try{assert.equal(collect(db,'finance.overview',{entity:'pj'},clock).error,'finance_pf_only');}finally{db.close();}
});
