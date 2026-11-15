import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {createTestDb,startTestServer,requestJson} from './test-support/helpers.mjs';
import {seedFinanceIfEmpty} from './finance.js';
import {installObligationRoutes} from './finance.obligation-confirmations.candidate.mjs';
test('HTTP preview, confirm, readback, replay, stale snapshot and invalid amount',async()=>{
 const db=createTestDb({withFinance:true});seedFinanceIfEmpty(db);
 const before=db.prepare('SELECT * FROM finance_debts WHERE id=?').get('debt-carro');
 const app=express();app.use(express.json());const router=express.Router();installObligationRoutes(router,db);app.use('/api/finance',router);
 const server=await startTestServer(app);const base='/api/finance/obligation-confirmations';
 try {
  const payload={debt_id:'debt-carro',period:'2026-11'};
  const preview=await requestJson(server.base,base+'/preview',{method:'POST',body:payload});assert.equal(preview.dry_run,true);
  const saved=await requestJson(server.base,base,{method:'POST',body:{...payload,preview_hash:preview.preview_hash,request_id:'http-car',confirmed_by_user:true}});
  assert.equal(saved.verified,true);
  const read=await requestJson(server.base,base+'?debt_id=debt-carro');assert.deepEqual(read.data,[saved.data]);
  const replay=await requestJson(server.base,base,{method:'POST',body:{...payload,preview_hash:preview.preview_hash,request_id:'http-car',confirmed_by_user:true}});
  assert.equal(replay.replayed,true);assert.deepEqual(db.prepare('SELECT * FROM finance_debts WHERE id=?').get('debt-carro'),before);
  await assert.rejects(requestJson(server.base,base+'/preview',{method:'POST',body:{...payload,amount:100}}),/400/);
  const dec={...payload,period:'2026-12'},p2=await requestJson(server.base,base+'/preview',{method:'POST',body:dec});
  db.prepare("UPDATE finance_debts SET note='concurrent' WHERE id='debt-carro'").run();
  await assert.rejects(requestJson(server.base,base,{method:'POST',body:{...dec,preview_hash:p2.preview_hash,request_id:'http-dec',confirmed_by_user:true}}),/409/);
 }finally {await server.close();db.close();}
});
