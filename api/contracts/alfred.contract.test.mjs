import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const contractPath = path.join(ROOT, 'api/contracts/alfred.json');
const collector = path.join(ROOT, 'scripts/migration/freeze-alfred.py');
const contract = () => JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const check = (file) => spawnSync('python3', [collector, '--check', file], { encoding:'utf8', timeout:30000 });

test('baseline contains 71 operations, each with an explicit transport owner', () => {
  const c=contract();
  assert.equal(Object.keys(c.catalog.operations).length,71);
  assert.deepEqual(Object.keys(c.catalog.operations).sort(),Object.keys(c.mappings).sort());
  for(const d of Object.values(c.catalog.operations)) {
    assert.equal(d.payload_schema.additionalProperties,false);
    assert.ok(['GET','POST','PATCH','PUT','DELETE'].includes(d.method));
  }
});
test('8 direct financial readers and direct payment writer cannot disappear silently',()=>{
  const entries=Object.entries(contract().mappings);
  assert.equal(entries.filter(([,d])=>d.kind==='direct_sqlite_read').length,8);
  assert.deepEqual(entries.filter(([,d])=>d.kind==='direct_sqlite_write').map(([op])=>op),['finance.bill.confirm_payment']);
  assert.equal(contract().mappings['finance.bill.confirm_payment'].implementation,'finance_confirm_candidate.mjs');
});
test('payment preview and fixed confirmation keep distinct, restrictive schemas',()=>{
  const c=contract().catalog;
  assert.equal(c.dry_run_default,true);
  assert.equal(c.request_id_required_for_writes,true);
  const payment=c.operations['finance.bill.confirm_payment'].payload_schema;
  for(const k of ['preview_hash','confirmed_by_user','paid_at']) assert.ok(payment.properties[k]);
  for(const k of ['debt_id','amount','paid_on']) assert.ok(payment.required.includes(k));
  const fixed=c.operations['finance.fixed.confirm_period'].payload_schema;
  assert.equal(Object.hasOwn(fixed.properties,'amount'),false);
  assert.equal(Object.hasOwn(fixed.properties,'paid_on'),false);
});
test('CAS fields protecting projects and daily guidance remain in the contract',()=>{
  const ops=contract().catalog.operations;
  assert.ok(ops['projects.update'].payload_schema.properties.expected_revision);
  assert.ok(ops['guidance.set'].payload_schema.properties.expected_generated_at);
});
test('live local adapter and primary route map still match the captured contract',()=>{
  const r=check(contractPath);
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/contract_match: operations=71/);
});
test('counterproof: contract checker rejects removing a payment safety field',()=>{
  const c=contract(); delete c.catalog.operations['finance.bill.confirm_payment'].payload_schema.properties.preview_hash;
  const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||'/root/.hermes/cache/scratch','alfred-contract-'));
  try {
    const p=path.join(dir,'mutant.json');fs.writeFileSync(p,JSON.stringify(c));
    const r=check(p);assert.equal(r.status,1);assert.match(r.stderr,/contract_drift/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
