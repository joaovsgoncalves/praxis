import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const manifest=()=>JSON.parse(fs.readFileSync(new URL('../../docs/migration/schema-manifest.json',import.meta.url),'utf8'));
test('all captured tables and three lazy tables have explicit destination',()=>{
 const rows=manifest().tables;
 assert.equal(rows.length,59);assert.equal(new Set(rows.map(r=>r.table)).size,59);
 assert.equal(rows.filter(r=>r.presentAtCapture).length,56);
 assert.deepEqual(rows.filter(r=>!r.presentAtCapture).map(r=>r.table).sort(),['alfred_payment_receipts','finance_obligation_confirmations','finance_obligation_requests']);
 for(const r of rows){assert.ok(r.target);assert.ok(r.columns.length);assert.ok(r.cutoverPolicy);}
});
test('financial decimal columns require exact cents conversion',()=>{
 for(const t of manifest().tables.filter(t=>t.group==='finance'))for(const c of t.columns.filter(c=>c.sqlType==='REAL'))assert.equal(c.targetEncoding,'integer_cents_exact_conversion',`${t.table}.${c.name}`);
});
test('authentication, legacy and receipts are not silently omitted',()=>{
 const rows=manifest().tables;
 assert.equal(rows.find(r=>r.table==='praxis_users').target,'authUsers/{stableUserId}');
 assert.equal(rows.find(r=>r.table==='praxis_sessions').target,'authSessions/{hashedSessionId}');
 assert.ok(rows.filter(r=>r.group==='legacy').every(r=>r.target.startsWith('privateArchive/')));
 assert.ok(rows.find(r=>r.table==='alfred_payment_receipts').columns.some(c=>c.name==='expected_paid_floor'));
 assert.equal(manifest().externalState.length,1);
});
test('manifest stores schema metadata, never table rows',()=>{
 for(const t of manifest().tables){assert.equal(Object.hasOwn(t,'rows'),false);assert.equal(Object.hasOwn(t,'data'),false);assert.equal(Object.hasOwn(t,'values'),false);}
});
