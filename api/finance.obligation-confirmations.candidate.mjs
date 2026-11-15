import { createHash } from 'node:crypto';

const TABLE = 'finance_obligation_confirmations';
function fail(code, status = 400) { throw Object.assign(new Error(code), {status}); }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function exists(db, table=TABLE) { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table); }
function ensureRequests(db) { db.exec(`CREATE TABLE IF NOT EXISTS finance_obligation_requests (request_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, debt_id TEXT NOT NULL, period TEXT NOT NULL)`); }
function saveRequest(db,input,digest) { ensureRequests(db); db.prepare('INSERT INTO finance_obligation_requests VALUES(?,?,?,?)').run(input.request_id,digest,input.debt_id,input.period); }
function check(input, apply) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_payload');
  const allowed = apply ? ['debt_id','period','preview_hash','request_id','confirmed_by_user'] : ['debt_id','period'];
  if (Object.keys(input).some(k => !allowed.includes(k))) fail('unknown_field');
  if (typeof input.debt_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.debt_id)) fail('invalid_debt_id');
  if (typeof input.period !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.period)) fail('invalid_period');
  if (apply) {
    if (input.confirmed_by_user !== true) fail('user_confirmation_required');
    if (typeof input.preview_hash !== 'string' || !/^[a-f0-9]{64}$/.test(input.preview_hash)) fail('preview_required');
    if (typeof input.request_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.request_id)) fail('request_id_required');
  }
}
function debtScope(db, id) {
  const debt = db.prepare('SELECT * FROM finance_debts WHERE id=?').get(id);
  if (!debt) fail('debt_not_found',404);
  if (debt.kind !== 'installment') fail('installment_debt_required');
  let account = null;
  if (debt.account_id !== null) {
    account = db.prepare('SELECT * FROM finance_accounts WHERE id=?').get(debt.account_id);
    if (!account || account.entity !== 'pf' || account.status !== 'active') fail('pf_scope_required',409);
  }
  return {debt, account};
}
function receipt(db, debtId, period) {
  return exists(db) ? db.prepare('SELECT * FROM finance_obligation_confirmations WHERE debt_id=? AND period=?').get(debtId,period) || null : null;
}
function publicReceipt(row) {
  if (!row) return null;
  return {debt_id:row.debt_id, period:row.period, status:'paid_reported_by_user',
    reported_at:row.reported_at, effective_paid_on:null, amount:null, source:'joao',
    affects_cash:false, affects_balance:false};
}
export function previewObligationConfirmation(db, input) {
  check(input,false);
  const scope=debtScope(db,input.debt_id);
  const previous=receipt(db,input.debt_id,input.period);
  return {ok:true,dry_run:true,debt_id:input.debt_id,period:input.period,
    preview_hash:hash([scope,input.period]),existing:publicReceipt(previous),
    effect:'Confirm only this installment period as paid by user report. Preserve debt note, balances, transactions, goals and recurrence. Payment date and amount remain unknown.'};
}
export function listObligationConfirmations(db, {debt_id}={}) {
  if (typeof debt_id !== 'string') fail('debt_id_required');
  debtScope(db,debt_id);
  return {ok:true,data: exists(db) ? db.prepare('SELECT * FROM finance_obligation_confirmations WHERE debt_id=? ORDER BY period DESC').all(debt_id).map(publicReceipt) : []};
}
export function confirmObligationPeriod(db,input) {
  check(input,true);
  return db.transaction(() => {
    const scope=debtScope(db,input.debt_id);
    const digest=hash([input.debt_id,input.period]);
    if(exists(db,'finance_obligation_requests')) {
      const priorKey=db.prepare('SELECT * FROM finance_obligation_requests WHERE request_id=?').get(input.request_id);
      if(priorKey) {
        if(priorKey.payload_hash!==digest) fail('request_id_conflict',409);
        const saved=receipt(db,priorKey.debt_id,priorKey.period);
        if(!saved) fail('receipt_missing',409);
        return {ok:true,dry_run:false,verified:true,replayed:true,data:publicReceipt(saved)};
      }
    }
    const previous=receipt(db,input.debt_id,input.period);
    if(previous) { saveRequest(db,input,digest); return {ok:true,dry_run:false,verified:true,replayed:true,data:publicReceipt(previous)}; }
    if(hash([scope,input.period])!==input.preview_hash) fail('DEBT_CHANGED',409);
    db.exec(`CREATE TABLE IF NOT EXISTS finance_obligation_confirmations (
      debt_id TEXT NOT NULL, period TEXT NOT NULL, reported_at TEXT NOT NULL,
      request_id TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
      PRIMARY KEY(debt_id,period)
    )`);
    const reportedAt=new Date().toISOString();
    db.prepare('INSERT INTO finance_obligation_confirmations VALUES(?,?,?,?,?)').run(input.debt_id,input.period,reportedAt,input.request_id,digest);
    saveRequest(db,input,digest);
    const saved=receipt(db,input.debt_id,input.period);
    if(!saved) fail('verification_failed',500);
    return {ok:true,dry_run:false,verified:true,replayed:false,data:publicReceipt(saved)};
  }).immediate();
}
// Candidate only: import and invoke this installer during reviewed publication.
export function installObligationRoutes(router,db) {
  function route(fn) { return (req,res) => { try {res.json(fn(req));} catch(err) {
    res.status(err.status||500).json({error:err.status ? err.message : 'obligation_confirmation_failed'});
  }}; }
  router.get('/obligation-confirmations',route(req => listObligationConfirmations(db,req.query)));
  router.post('/obligation-confirmations/preview',route(req => previewObligationConfirmation(db,req.body)));
  router.post('/obligation-confirmations',route(req => confirmObligationPeriod(db,req.body)));
}
