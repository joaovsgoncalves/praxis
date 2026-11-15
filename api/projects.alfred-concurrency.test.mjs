import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createProjectsRouter } from './routes/projects.js';
import { seedProjectsIfEmpty } from './projects.js';
import { createTestDb, requestJson, startTestServer } from './test-support/helpers.mjs';
async function mount(t) {
 const db=createTestDb({withProjects:true});seedProjectsIfEmpty(db);
 const app=express();app.use(express.json());app.use('/api/projects',createProjectsRouter({db,getLocalDateString:()=> '2026-11-15'}));
 const server=await startTestServer(app);
 t.after(()=>{db.close();return server.close()});
 return {db,server,slug:db.prepare('SELECT slug FROM projects ORDER BY sort_order LIMIT 1').get().slug};
}
async function send(base,path,method,body) {
 const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {status:res.status,body:await res.json()};
}
test('concurrent guidance CAS requests preserve exactly one winner',async t=>{
 const {server}=await mount(t);
 const base={source:'alfred',expected_generated_at:null,priorities:[{rank:1,action:'a',reason_code:'manual',reason:'b'}]};
 const results=await Promise.all(['A','B'].map((summary,i)=>send(server.base,'/api/projects/guidance/2026-11-15','PUT',{...base,summary,generated_at:'2026-11-15T08:00:0'+i+'-03:00'})));
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 const saved=await requestJson(server.base,'/api/projects/guidance/today');
 assert.equal(saved.summary,results.find(x=>x.status===200).body.summary);
});
test('concurrent project revision requests preserve exactly one winner',async t=>{
 const {server,slug}=await mount(t);
 const old=await requestJson(server.base,'/api/projects/'+slug);
 const results=await Promise.all(['A','B'].map(next_step=>send(server.base,'/api/projects/'+slug,'PATCH',{next_step,expected_revision:old.revision})));
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 const saved=await requestJson(server.base,'/api/projects/'+slug);
 assert.equal(saved.next_step,results.find(x=>x.status===200).body.next_step);
 assert.equal(saved.revision,old.revision+1);
});
