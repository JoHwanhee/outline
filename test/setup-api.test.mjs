import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'outline-first-run-api-'));
process.env.OUTLINE_DATA_DIR=root;process.env.OUTLINE_NO_LISTEN='1';process.env.OUTLINE_ORIGINS='http://127.0.0.1:54321,http://localhost:54321';process.env.OUTLINE_CONTAINER='1';
const {requestHandler}=await import('../server.mjs');
async function request(url,method='GET',body,headers={}){const req=Readable.from(body==null?[]:[Buffer.from(JSON.stringify(body))]);Object.assign(req,{url,method,headers:{host:'localhost:54321',origin:'http://localhost:54321',...headers}});const parts=[];const res={status:200,headers:{},headersSent:false,setHeader(k,v){this.headers[k]=v;},writeHead(s,h){this.status=s;Object.assign(this.headers,h);this.headersSent=true;},write(b){parts.push(Buffer.from(b));},end(b){if(b)parts.push(Buffer.from(b));}};await requestHandler(req,res);return {status:res.status,data:JSON.parse(Buffer.concat(parts))};}
test('first-run HTTP setup works at mapped Docker ports, validates input and persists completed state',async t=>{
 t.after(()=>fs.rm(root,{recursive:true,force:true}));const health=await request('/healthz');assert.deepEqual(health.data,{app:'outline',status:'ok'});const initial=await request('/api/state');assert.equal(initial.data.app,'outline');assert.equal(initial.data.setup.required,true);assert.equal(initial.data.runtime.container,true);assert.equal(initial.data.profile.name,'');assert.deepEqual(initial.data.companies,[]);assert.deepEqual((await request('/api/sources')).data,[]);
 assert.equal((await request('/api/setup','POST',{profile:{name:''}})).status,400);assert.equal((await request('/api/setup','POST',{profile:{name:'テスト'}},{origin:'https://foreign.example'})).status,403);assert.equal((await request('/api/setup','GET',undefined,{host:'foreign.example'})).status,403);
 const completed=await request('/api/setup','POST',{profile:{name:'HTTP 사용자'},targetRole:'개발자',resume:'## 경험\n실제 가져온 원문'});assert.equal(completed.status,201);const state=await request('/api/state');assert.equal(state.data.setup.required,false);assert.equal(state.data.profile.name,'HTTP 사용자');assert.equal(state.data.setup.targetRole,'개발자');assert.match((await request('/api/document?target=common&doc=resume')).data.markdown,/실제 가져온 원문/);assert.equal((await request('/api/sources')).data.length,1);assert.equal((await request('/api/setup','POST',{profile:{name:'재설정'}})).status,409);assert.equal((await request('/api/ai/settings')).data.runtime.container,true);
});
