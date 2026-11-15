import test from 'node:test';
import assert from 'node:assert/strict';
import { documentId, originalId, moneyToCents, centsToMoney } from './schema.mjs';
import { createSqliteTasksDriver } from './sqlite/tasks.js';
import { createTestDb } from '../test-support/helpers.mjs';

test('record locator is injective across ordinary, reserved, encoded-looking and oversized keys',()=>{
 const ids=['a','a/b','~bYS9i','.','..','__internal__','ã/😀','/'.repeat(1500),'\u0000'];
 const paths=ids.map(documentId);assert.equal(new Set(paths).size,ids.length);
 for(let i=0;i<ids.length;i++){assert.equal(originalId(paths[i],ids[i]),ids[i]);assert.ok(Buffer.byteLength(paths[i])<=1500);assert.ok(!paths[i].includes('/'));}
 assert.throws(()=>originalId('a','different'),{code:'record_identity_mismatch'});
});
test('money conversion preserves cents and tolerates only representation noise',()=>{
 for(const [value,expected] of [['12.34',1234],['-12.34',-1234],['0.01',1],[0.1+0.2,30],[-0,0],['90071992547409.91',Number.MAX_SAFE_INTEGER]])assert.equal(moneyToCents(value),expected);
 for(const amount of [0,1,-1,1234,-1234,123456789])assert.equal(moneyToCents(centsToMoney(amount)),amount);
 for(const invalid of [1.005,NaN,Infinity,'1.001','1,20',' 1.20',null,'90071992547409.92'])assert.throws(()=>moneyToCents(invalid));
 assert.throws(()=>centsToMoney(0.1));
 assert.throws(()=>centsToMoney(Number.MAX_SAFE_INTEGER),{code:'unrepresentable_json_money'});
});
test('SQLite provider cannot reuse one connection for two owners',async()=>{
 const db=createTestDb();try{
  const driver=createSqliteTasksDriver({open:()=>db});await driver.tasks('alice').get('none');
  assert.throws(()=>driver.tasks('bob'),{code:'sqlite_owner_connection_reused'});
 }finally{db.close();}
});
