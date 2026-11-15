import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {createTestDb,startTestServer,requestJson} from './test-support/helpers.mjs';
import {seedFinanceIfEmpty,createFixedExpense,listFixedExpenses,getOverview,markFixedPaid} from './finance.js';
import {previewFixedConfirmation as preview,confirmFixedPeriod as confirm,readFixedConfirmation as read,installFixedConfirmationRoutes} from './finance.fixed-confirmation.candidate.mjs';
const clock={currentMonth:'2026-11'};

test('preview is bound to period across month rollover',()=>{const {db,fx}=setup();try{
 const p=payload(db,fx.id);
 assert.throws(()=>confirm(db,{...p,period:'2026-12'},{currentMonth:'2026-12'}),/FIXED_CHANGED/);
 assert.equal(db.prepare('SELECT last_paid_month FROM finance_fixed_expenses WHERE id=?').get(fx.id).last_paid_month,null);
}finally{db.close()}});


test('native flag without receipt is not attributed to João; old flag retained in audit and future flag cannot regress',()=>{const {db,fx}=setup();try{
 markFixedPaid(db,fx.id,{month:'2026-11',today:'2026-11-14'});
 const native=read(db,{fixed_id:fx.id,period:'2026-11'},clock).data;
 assert.equal(native.source,'praxis_native_flag');assert.equal(native.status,'paid_marked_native');assert.equal(native.reported_at,null);
 markFixedPaid(db,fx.id,{month:'2026-10',today:'2026-11-14'});
 confirm(db,payload(db,fx.id),clock);
 assert.equal(db.prepare('SELECT previous_last_paid_month FROM finance_fixed_confirmation_requests WHERE request_id=?').get('fixed-nov').previous_last_paid_month,'2026-10');
 markFixedPaid(db,fx.id,{month:'2026-12',today:'2026-11-14'});
 assert.throws(()=>confirm(db,payload(db,fx.id,'future-guard'),clock),/newer_paid_period_exists/);
}finally{db.close()}});

function setup(){const db=createTestDb({withFinance:true});seedFinanceIfEmpty(db);const fx=createFixedExpense(db,{name:'Parcela do carro',amount:1270,due_day:23,lane:'personal',note:'preserve me'},{today:'2026-11-14'});return {db,fx};}
function payload(db,id,request_id='fixed-nov'){const p={fixed_id:id,period:'2026-11'};return {...p,preview_hash:preview(db,p,clock).preview_hash,confirmed_by_user:true,request_id};}
test('native display and commitments reflect only November without financial postings',()=>{const {db,fx}=setup();try{
 const tables=['finance_debts','finance_transactions','finance_payments','finance_goals','finance_balances','finance_accounts','finance_settings','finance_installments'];
 const before=tables.map(t=>db.prepare('SELECT * FROM '+t).all());
 assert.ok(getOverview(db,{today:'2026-11-14'}).commitments_until_salary.some(x=>x.id===fx.id));
 const r=confirm(db,payload(db,fx.id),clock);assert.equal(r.data.effective_paid_on,null);assert.equal(r.data.amount,null);
 const visible=listFixedExpenses(db,{today:'2026-11-14'}).find(x=>x.id===fx.id);
 assert.equal(visible.paid_this_month,true);assert.equal(visible.last_paid_month,'2026-11');assert.equal(visible.note,'preserve me');assert.equal(visible.due_day,23);
 assert.ok(!getOverview(db,{today:'2026-11-14'}).commitments_until_salary.some(x=>x.id===fx.id));
 assert.equal(listFixedExpenses(db,{today:'2026-12-14'}).find(x=>x.id===fx.id).paid_this_month,false);
 assert.deepEqual(tables.map(t=>db.prepare('SELECT * FROM '+t).all()),before);
}finally{db.close()}});
test('preview changes no schema/data; CAS refuses intervening edits',()=>{const {db,fx}=setup();try{
 const before=db.serialize(),p=payload(db,fx.id);assert.deepEqual(db.serialize(),before);
 db.prepare("UPDATE finance_fixed_expenses SET note='new' WHERE id=?").run(fx.id);
 assert.throws(()=>confirm(db,p,clock),/FIXED_CHANGED/);
 assert.equal(listFixedExpenses(db,{today:'2026-11-14'}).find(x=>x.id===fx.id).paid_this_month,false);
}finally{db.close()}});
test('idempotency, second key, conflict, undo and wrong month',()=>{const {db,fx}=setup();try{
 const p=payload(db,fx.id);confirm(db,p,clock);assert.equal(confirm(db,p,clock).replayed,true);
 const p2=payload(db,fx.id,'second');assert.equal(confirm(db,p2,clock).replayed,true);
 const fx2=createFixedExpense(db,{name:'Other',amount:1,lane:'personal'});
 assert.throws(()=>confirm(db,payload(db,fx2.id,'second'),clock),/request_id_conflict/);
 assert.throws(()=>confirm(db,{...p,period:'2026-12'},clock),/current_month_required/);
 markFixedPaid(db,fx.id,{month:null,today:'2026-11-14'});
 assert.throws(()=>confirm(db,p,clock),/confirmation_changed_reread/);
 assert.equal(read(db,{fixed_id:fx.id,period:'2026-11'},clock).data,null);
}finally{db.close()}});
test('inactive/work/unknown fields refused',()=>{const {db,fx}=setup();try{
 assert.throws(()=>preview(db,{fixed_id:fx.id,period:'2026-11',amount:1270},clock),/invalid_payload/);
 db.prepare('UPDATE finance_fixed_expenses SET active=0 WHERE id=?').run(fx.id);
 assert.throws(()=>preview(db,{fixed_id:fx.id,period:'2026-11'},clock),/active_personal_fixed_required/);
 db.prepare("UPDATE finance_fixed_expenses SET active=1,lane='work' WHERE id=?").run(fx.id);
 assert.throws(()=>preview(db,{fixed_id:fx.id,period:'2026-11'},clock),/active_personal_fixed_required/);
}finally{db.close()}});
test('HTTP installer preview apply readback rejects unexpected input',async()=>{const {db,fx}=setup(),app=express();app.use(express.json());const router=express.Router();installFixedConfirmationRoutes(router,db);app.use('/api/finance',router);const server=await startTestServer(app);try{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit'}).formatToParts(new Date());const period=parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value;
 const path='/api/finance/fixed-confirmations',p={fixed_id:fx.id,period};
 const v=await requestJson(server.base,path+'/preview',{method:'POST',body:p});
 const r=await requestJson(server.base,path,{method:'POST',body:{...p,preview_hash:v.preview_hash,confirmed_by_user:true,request_id:'http-fixed'}});
 const got=await requestJson(server.base,path+'?'+new URLSearchParams(p));assert.deepEqual(got.data,r.data);
 await assert.rejects(requestJson(server.base,path+'/preview',{method:'POST',body:{...p,paid_on:'2026-11-14'}}),/400/);
}finally{await server.close();db.close()}});
