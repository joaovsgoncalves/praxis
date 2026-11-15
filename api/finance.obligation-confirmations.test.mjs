import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTestDb} from './test-support/helpers.mjs';
import {seedFinanceIfEmpty} from './finance.js';
import {previewObligationConfirmation as preview,confirmObligationPeriod as confirm,listObligationConfirmations as list} from './finance.obligation-confirmations.candidate.mjs';
function fixture(){const db=createTestDb({withFinance:true});seedFinanceIfEmpty(db);return db;}
const base={debt_id:'debt-carro',period:'2026-11'};
function input(db,extra={}){return {...base,preview_hash:preview(db,base).preview_hash,confirmed_by_user:true,request_id:'test-car-202611',...extra};}
test('preview is read only, including schema',()=>{const db=fixture();try{
const before=db.serialize();assert.equal(preview(db,base).dry_run,true);assert.deepEqual(db.serialize(),before);
assert.deepEqual(list(db,{debt_id:base.debt_id}).data,[]);
}finally{db.close()}});
test('confirmation preserves every financial table and original note; date and amount unknown',()=>{const db=fixture();try{
const tables=['finance_debts','finance_transactions','finance_payments','finance_goals','finance_settings','finance_installments','finance_balances','finance_accounts'];
const before=tables.map(t=>db.prepare('SELECT * FROM '+t).all());
const r=confirm(db,input(db));assert.equal(r.verified,true);assert.equal(r.data.amount,null);assert.equal(r.data.effective_paid_on,null);
assert.ok(Number.isFinite(Date.parse(r.data.reported_at)));assert.deepEqual(tables.map(t=>db.prepare('SELECT * FROM '+t).all()),before);
assert.equal(list(db,{debt_id:base.debt_id}).data.length,1);
}finally{db.close()}});
test('same request and new request for same period cannot duplicate; next period distinct',()=>{const db=fixture();try{
const p=input(db);confirm(db,p);assert.equal(confirm(db,p).replayed,true);assert.equal(confirm(db,{...p,request_id:'another'}).replayed,true);
assert.throws(()=>confirm(db,{...p,period:'2026-12'}),/request_id_conflict/);
assert.throws(()=>confirm(db,{...p,period:'2026-12',request_id:'another'}),/request_id_conflict/);
const dec={...base,period:'2026-12'};confirm(db,{...dec,preview_hash:preview(db,dec).preview_hash,confirmed_by_user:true,request_id:'dec'});
assert.equal(list(db,{debt_id:base.debt_id}).data.length,2);
}finally{db.close()}});
test('concurrent note update fails CAS without receipt or overwriting',()=>{const db=fixture();try{
const p=input(db);db.prepare("UPDATE finance_debts SET note='new concurrent note' WHERE id=?").run(base.debt_id);
assert.throws(()=>confirm(db,p),/DEBT_CHANGED/);assert.equal(db.prepare('SELECT note FROM finance_debts WHERE id=?').get(base.debt_id).note,'new concurrent note');
assert.equal(list(db,{debt_id:base.debt_id}).data.length,0);
}finally{db.close()}});
test('concurrent change outside note fails CAS',()=>{const db=fixture();try{
const p=input(db);db.prepare('UPDATE finance_debts SET balance=balance+1 WHERE id=?').run(base.debt_id);
assert.throws(()=>confirm(db,p),/DEBT_CHANGED/);
}finally{db.close()}});
test('card, orphan, PJ and invalid payload fail closed',()=>{const db=fixture();try{
assert.throws(()=>preview(db,{...base,debt_id:'debt-inter'}),/installment_debt_required/);
assert.throws(()=>preview(db,{...base,amount:1270}),/unknown_field/);
assert.throws(()=>preview(db,{...base,period:'2026-13'}),/invalid_period/);
assert.throws(()=>confirm(db,{...input(db),confirmed_by_user:false}),/user_confirmation_required/);
db.prepare("UPDATE finance_debts SET account_id='missing' WHERE id=?").run(base.debt_id);
assert.throws(()=>preview(db,base),/pf_scope_required/);
db.prepare("UPDATE finance_debts SET account_id='acc-inter' WHERE id=?").run(base.debt_id);
db.prepare("UPDATE finance_accounts SET entity='pj' WHERE id='acc-inter'").run();
assert.throws(()=>preview(db,base),/pf_scope_required/);
}finally{db.close()}});
