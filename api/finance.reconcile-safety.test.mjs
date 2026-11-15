import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTestDb} from './test-support/helpers.mjs';
import {seedFinanceIfEmpty,payDebt,createTransaction} from './finance.js';
import {pendingManualCardPayment,ingestPluggy} from './pluggyIngest.js';
function fixture(){const db=createTestDb({withFinance:true});seedFinanceIfEmpty(db);return db;}
const bill={closing_date:'2026-11-01',due_date:'2026-11-20',total:100,paid:0};
test('partial bank confirmation overlays only the missing difference',()=>{const db=fixture();try{
payDebt(db,'debt-inter',{amount:20,paid_on:'2026-11-14'});
for(const [paid,want] of [[0,20],[10,10],[20,0],[30,0]]) assert.equal(pendingManualCardPayment(db,['acc-inter'],{...bill,paid},'2026-11-16'),want);
}finally{db.close()}});
function ingest(db,description='Supermercado',category='Groceries'){return ingestPluggy(db,{source:'pluggy',fetched_at:'2026-11-14T20:00:00Z',institutions:[],transactions:[{external_id:'fixture-bank-1',institution:'inter',account_type:'BANK',date:'2026-11-14',amount:-20,description,category}]},{today:'2026-11-14'});}
test('payment without funding account never absorbs an unrelated purchase',()=>{const db=fixture();try{
payDebt(db,'debt-inter',{amount:20,paid_on:'2026-11-14'});
assert.equal(ingest(db).transactions.matched,0);
const row=db.prepare("SELECT * FROM finance_transactions WHERE external_id='fixture-bank-1'").get();
assert.notEqual(row.category,'Pagamento de fatura');
assert.equal(db.prepare("SELECT matched_tx_id FROM finance_transactions WHERE source='joao' AND debt_id='debt-inter'").get().matched_tx_id,null);
}finally{db.close()}});
test('payment with funding account still requires payment category',()=>{const db=fixture();try{
payDebt(db,'debt-inter',{amount:20,paid_on:'2026-11-14',account_id:'acc-inter'});
assert.equal(ingest(db).transactions.matched,0);
}finally{db.close()}});
test('ordinary manual purchases continue to reconcile',()=>{const db=fixture();try{
createTransaction(db,{amount:-20,posted_on:'2026-11-14',merchant:'Supermercado',source:'joao',category:'Alimentação',account_id:'acc-inter'});
assert.equal(ingest(db).transactions.matched,1);
}finally{db.close()}});
