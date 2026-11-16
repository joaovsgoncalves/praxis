import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestJson } from './test-support/helpers.mjs';
import { parityEngines } from './test-support/httpParity.mjs';
import { mountProjectsEngine } from './test-support/projectsFixture.fase4.mjs';
// Arnês: rota nova sobre a camada assíncrona em cada motor.
async function mount(t, kind) {
 const {server}=await mountProjectsEngine(t,kind,{getLocalDateString:()=> '2026-11-15'});
 const rows=await requestJson(server.base,'/api/projects');
 return {server,slug:[...rows].sort((a,b)=>a.sort_order-b.sort_order)[0].slug};
}
async function send(base,path,method,body) {
 const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {status:res.status,body:await res.json()};
}
for (const kind of parityEngines()) {
  test(`${kind}: concurrent project revision requests preserve exactly one winner`,async t=>{
   const {server,slug}=await mount(t, kind);
   const old=await requestJson(server.base,'/api/projects/'+slug);
   const results=await Promise.all(['A','B'].map(next_step=>send(server.base,'/api/projects/'+slug,'PATCH',{next_step,expected_revision:old.revision})));
   assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
   const saved=await requestJson(server.base,'/api/projects/'+slug);
   assert.equal(saved.next_step,results.find(x=>x.status===200).body.next_step);
   assert.equal(saved.revision,old.revision+1);
  });
}

for (const kind of parityEngines()) {
  test(`${kind}: concurrent guidance CAS requests preserve exactly one winner`,async t=>{
   const {server}=await mount(t, kind);
   const base={source:'alfred',expected_generated_at:null,priorities:[{rank:1,action:'a',reason_code:'manual',reason:'b'}]};
   const results=await Promise.all(['A','B'].map((summary,i)=>send(server.base,'/api/projects/guidance/2026-11-15','PUT',{...base,summary,generated_at:'2026-11-15T08:00:0'+i+'-03:00'})));
   assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
   const saved=await requestJson(server.base,'/api/projects/guidance/today');
   assert.equal(saved.summary,results.find(x=>x.status===200).body.summary);
  });
}
