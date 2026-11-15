import {createHash} from 'node:crypto';
import {markFixedPaid} from './finance.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const monthNow=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit'}).formatToParts(new Date());return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value;};
function fail(code,status=400){throw Object.assign(new Error(code),{status});}
function exists(db){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='finance_fixed_confirmation_requests'").get();}
function check(input,apply,currentMonth){
 const fields=apply?['fixed_id','period','preview_hash','request_id','confirmed_by_user']:['fixed_id','period'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))fail('invalid_payload');
 if(typeof input.fixed_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.fixed_id))fail('invalid_fixed_id');
 if(input.period!==currentMonth)fail('current_month_required');
 if(apply){
  if(input.confirmed_by_user!==true)fail('user_confirmation_required');
  if(typeof input.preview_hash!=='string'||!/^[a-f0-9]{64}$/.test(input.preview_hash))fail('preview_required');
  if(typeof input.request_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.request_id))fail('request_id_required');
 }
}
function fixed(db,id){
 const row=db.prepare('SELECT * FROM finance_fixed_expenses WHERE id=?').get(id);
 if(!row)fail('fixed_not_found',404);
 if(row.lane!=='personal'||row.active!==1)fail('active_personal_fixed_required',409);
 return row;
}
function view(row,period,reportedAt){
 return {fixed_id:row.id,period,status:'paid_reported_by_user',reported_at:reportedAt,
 effective_paid_on:null,amount:null,source:'joao',affects_cash:false,affects_balance:false,
 fixed:{id:row.id,name:row.name,last_paid_month:row.last_paid_month,updated_at:row.updated_at}};
}
export function previewFixedConfirmation(db,input,{currentMonth=monthNow()}={}){
 check(input,false,currentMonth);const row=fixed(db,input.fixed_id);
 return {ok:true,dry_run:true,fixed_id:row.id,name:row.name,period:input.period,already_marked:row.last_paid_month===input.period,
 preview_hash:hash([row,input.period]),effect:'Mark this current month paid in native Praxis fixed expenses. No cash transaction, effective payment date or paid amount. Does not mark another month; preserves the previous native month flag in the audit receipt.'};
}
export function confirmFixedPeriod(db,input,{currentMonth=monthNow()}={}){
 check(input,true,currentMonth);
 return db.transaction(()=>{
  const row=fixed(db,input.fixed_id),digest=hash([input.fixed_id,input.period]);
  if(exists(db)){
   const saved=db.prepare('SELECT * FROM finance_fixed_confirmation_requests WHERE request_id=?').get(input.request_id);
   if(saved){
    if(saved.payload_hash!==digest)fail('request_id_conflict',409);
    if(row.last_paid_month!==input.period)fail('confirmation_changed_reread',409);
    return {ok:true,dry_run:false,verified:true,replayed:true,data:view(row,input.period,saved.reported_at)};
   }
  }
  if(hash([row,input.period])!==input.preview_hash)fail('FIXED_CHANGED',409);
  if(row.last_paid_month && row.last_paid_month>input.period)fail('newer_paid_period_exists',409);
  const financialBefore=JSON.stringify(row);
  const wasPaid=row.last_paid_month===input.period;
  if(!wasPaid)markFixedPaid(db,row.id,{month:input.period,today:input.period+'-01'});
  const after=fixed(db,row.id);
  const preserved={...after,last_paid_month:row.last_paid_month,updated_at:row.updated_at};
  if(JSON.stringify(preserved)!==financialBefore||after.last_paid_month!==input.period)fail('verification_failed',500);
  db.exec('CREATE TABLE IF NOT EXISTS finance_fixed_confirmation_requests (request_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,fixed_id TEXT NOT NULL,period TEXT NOT NULL,reported_at TEXT NOT NULL,previous_last_paid_month TEXT)');
  const reportedAt=new Date().toISOString();
  db.prepare('INSERT INTO finance_fixed_confirmation_requests VALUES(?,?,?,?,?,?)').run(input.request_id,digest,row.id,input.period,reportedAt,row.last_paid_month);
  return {ok:true,dry_run:false,verified:true,replayed:wasPaid,data:view(after,input.period,reportedAt)};
 }).immediate();
}
export function readFixedConfirmation(db,{fixed_id,period},{currentMonth=monthNow()}={}){
 check({fixed_id,period},false,currentMonth);const row=fixed(db,fixed_id);
 const receipt=exists(db)?db.prepare('SELECT reported_at FROM finance_fixed_confirmation_requests WHERE fixed_id=? AND period=? ORDER BY reported_at LIMIT 1').get(fixed_id,period):null;
 if(row.last_paid_month!==period)return {ok:true,data:null};
 if(!receipt)return {ok:true,data:{...view(row,period,null),status:'paid_marked_native',source:'praxis_native_flag',confirmation_evidence:'unknown'}};
 return {ok:true,data:view(row,period,receipt.reported_at)};
}
export function installFixedConfirmationRoutes(router,db){
 const run=fn=>(req,res)=>{try{res.json(fn(req));}catch(e){res.status(e.status||500).json({error:e.status?e.message:'fixed_confirmation_failed'});}};
 router.post('/fixed-confirmations/preview',run(req=>previewFixedConfirmation(db,req.body)));
 router.post('/fixed-confirmations',run(req=>confirmFixedPeriod(db,req.body)));
 router.get('/fixed-confirmations',run(req=>readFixedConfirmation(db,req.query)));
}
