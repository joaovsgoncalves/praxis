import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { makeFinanceParityApp, parityEngines } from './test-support/httpParity.fase5.mjs';
import { createFinanceRouter } from './routes/finance.js';
import { createFinanceIngestService } from './services/finance/ingest.js';
const now=()=>new Date('2026-11-16T12:00:00Z');
const payload=(bad=false)=>({ source:'pluggy', fetched_at:now().toISOString(), institutions:[{ institution:'inter',status:'UPDATED',updated_at:now().toISOString(),bank:{balance:500,reserved:[]},card:null,statement:{from:'2026-11-01',to:'2026-11-15'} }], transactions:Array.from({length:120},(_,i)=>({external_id:`bulk-${i}`,institution:'inter',account_type:'BANK',date:'2026-11-12',amount:bad&&i===119?-1e20:-1,description:`item ${i}`,category:'other'})) });
async function fixture(kind,t){
 const app=await makeFinanceParityApp(kind,{build:({storage,db})=>createFinanceRouter({storage,db,getLocalDateString:()=> '2026-11-16'}),oracle:()=>express.Router()});t.after(app.dispose);
 const r=await fetch(app.base+'/accounts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'bank',name:'Inter',kind:'checking',institution:'inter',is_operational:true})});assert.equal(r.status,201);
 return app;
}
for(const kind of parityEngines()){
 test(`${kind}: valor inválido no último lote recusa antes de gravar extrato, saldo, cobertura e log`,async(t)=>{
  const app=await fixture(kind,t), service=createFinanceIngestService({storage:app.storage,now});
  for(let retry=0;retry<2;retry++){
   await assert.rejects(()=>app.as(()=>service.ingestPluggy(payload(true))),/fractional_cent_or_overflow/);
   await app.as(async()=>{
    assert.equal((await app.storage.financeTransactions.byExternalIds(Array.from({length:120},(_,i)=>`bulk-${i}`))).length,0);
    assert.equal((await app.storage.financeBalances.list({accountId:'bank',limit:null})).length,0);
    assert.equal((await app.storage.financeStatementCoverage.list({account_id:null})).length,0);
    assert.equal(await app.storage.financeSyncLog.latest({}),null);
   });
  }
 });
 test(`${kind}: dois ingests idênticos com vários lotes concluem sem duplicar nem rejeitar`,async(t)=>{
  const app=await fixture(kind,t),service=createFinanceIngestService({storage:app.storage,now});
  const results=await app.as(()=>Promise.all([service.ingestPluggy(payload()),service.ingestPluggy(payload())]));
  assert.ok(results.every(r=>r.ok));
  await app.as(async()=>{
   const rows=await app.storage.financeTransactions.byExternalIds(Array.from({length:120},(_,i)=>`bulk-${i}`));
   assert.equal(rows.length,120);assert.equal(new Set(rows.map(r=>r.external_id)).size,120);
   assert.equal((await app.storage.financeBalances.list({accountId:'bank',limit:null})).length,1);
   assert.ok((await app.storage.financeStatementCoverage.list({account_id:null})).length>0);
  });
 });
}

test('sqlite: ingest mantém limite contratual de 2000 lançamentos em uma transação', async(t)=>{
 const app=await fixture('sqlite',t),service=createFinanceIngestService({storage:app.storage,now});
 const body=payload();body.transactions=Array.from({length:2000},(_,i)=>({...body.transactions[0],external_id:`large-${i}`}));
 assert.equal((await app.as(()=>service.ingestPluggy(body))).ok,true);
 const rows=await app.as(()=>app.storage.financeTransactions.byExternalIds(body.transactions.map(r=>r.external_id)));
 assert.equal(rows.length,2000);assert.equal(new Set(rows.map(r=>r.external_id)).size,2000);
});
