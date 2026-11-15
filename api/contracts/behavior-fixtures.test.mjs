import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url),'utf8'));
test('all 71 declared operations have an explicitly labelled observed fixture',()=>{
 const ops=read('./alfred.json').catalog.operations;
 const fixtures=read('./alfred-behavior-fixtures.json').operations;
 assert.equal(fixtures.length,71);
 assert.deepEqual(fixtures.map(x=>x.operation).sort(),Object.keys(ops).sort());
 for(const row of fixtures){assert.match(row.scope,/mocked transport/);assert.ok(row.samples.some(x=>x.result.ok===true));for(const sample of row.samples)assert.ok(sample.test);}
});
test('write success and errors are represented without claiming cloud parity',()=>{
 const fixtures=read('./alfred-behavior-fixtures.json').operations;
 const payment=fixtures.find(x=>x.operation==='finance.bill.confirm_payment');
 assert.ok(payment.samples.some(x=>x.result.ok));
 const task=fixtures.find(x=>x.operation==='tasks.create');
 assert.ok(task.samples.some(x=>x.dry_run===false&&x.result.ok));
 assert.ok(task.samples.some(x=>x.result.ok===false));
});
