import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {seed} from '../scripts/seed.mjs';
import {Setup} from '../lib/setup.mjs';
import {Providers} from '../lib/providers.mjs';
import {Knowledge} from '../lib/knowledge.mjs';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'outline-setup-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=await seed(root),knowledge=new Knowledge(store),providers=new Providers(store);await knowledge.bootstrap();return {root,store,knowledge,providers,setup:new Setup(store,knowledge,providers)};}
test('fresh users start with blank documents, no company or source, and optional AI',async t=>{
 const {root,store,knowledge,setup}=await fixture(t);assert.equal((await setup.status()).required,true);assert.equal((await store.profile()).name,'');assert.deepEqual(await store.companies(),[]);assert.deepEqual(await knowledge.list(),[]);
 const status=await setup.complete({profile:{name:'새 사용자'},targetRole:'개발자'});assert.equal(status.completed,true);assert.equal(status.targetRole,'개발자');const resume=await store.document('common','resume');assert.equal(resume.sections.length,3);assert.ok(resume.sections.every(s=>s.body===''));assert.deepEqual(await knowledge.list(),[]);
 await knowledge.bootstrap();assert.deepEqual(await knowledge.list(),[]);await seed(root);assert.equal((await new Setup(store,knowledge,new Providers(store)).status()).required,false);assert.equal((await store.document('common','resume')).version,resume.version);await assert.rejects(()=>setup.complete({profile:{name:'덮어쓰기'}}),{status:409});assert.equal((await store.profile()).name,'새 사용자');
});
test('setup imports resume/career facts, persists private AI key and does not leak it in status',async t=>{
 const {store,knowledge,providers,setup}=await fixture(t);const text='## 경험\n테스트용 프로젝트를 담당했습니다.';const result=await setup.complete({profile:{name:'지원자',github:'https://github.com/example'},targetRole:'엔지니어',resume:text,career:'기존 경력 원문',ai:{provider:'claude',authMode:'apiKey',apiKey:'synthetic-setup-key',model:'claude-sonnet-5-5'}});
 assert.ok((await store.document('common','resume')).markdown.includes('테스트용 프로젝트를 담당했습니다.'));assert.ok((await store.document('common','career')).markdown.includes('기존 경력 원문'));assert.equal((await knowledge.list()).length,2);assert.equal(await providers.key('claude'),'synthetic-setup-key');assert.equal((await providers.public()).defaultProvider,'claude');assert.equal(JSON.stringify(result).includes('synthetic-setup-key'),false);assert.equal((await fs.stat(providers.secretFile)).mode&0o777,0o600);
});
test('invalid first-run input cannot complete setup or overwrite blank documents',async t=>{
 const {store,setup}=await fixture(t);const before=await store.document('common','resume');for(const input of [{profile:{name:' '}},{profile:{name:'이름',blog:'javascript:alert(1)'}},{profile:{name:'이름'},resume:'## 경험\nA\n## 경험\nB'},{profile:{name:'이름'},sourceId:'../../secrets'},{profile:{name:'이름'},ai:{provider:'claude',authMode:'apiKey',model:'claude-test'}}])await assert.rejects(()=>setup.complete(input),{status:400});assert.equal((await setup.status()).required,true);assert.equal((await store.document('common','resume')).version,before.version);
});
test('file import uses the archived source and existing legacy users skip onboarding',async t=>{
 const {root,store,knowledge,setup}=await fixture(t);const source=await knowledge.save({title:'resume.txt',text:'원본 경험',kind:'file'});await setup.complete({profile:{name:'파일 사용자'},sourceId:source.id,resume:'클라이언트가 보낸 다른 내용'});assert.match((await store.document('common','resume')).markdown,/원본 경험/);assert.equal((await knowledge.list()).length,1);
 await fs.unlink(path.join(root,'setup.json'));const before=await store.document('common','resume');await seed(root);assert.equal((await setup.status()).required,false);assert.equal((await store.document('common','resume')).version,before.version);
});
test('relocated data repairs stale font symlinks without replacing real directories',async t=>{
 const {root,store}=await fixture(t);const link=path.join(root,'common/fonts');await fs.unlink(link);await fs.symlink('/missing/old-machine/fonts',link);await store.materializeAll();assert.equal((await fs.stat(link)).isDirectory(),true);await fs.unlink(link);await fs.mkdir(link);await fs.writeFile(path.join(link,'keep.txt'),'keep');await store.materializeAll();assert.equal(await fs.readFile(path.join(link,'keep.txt'),'utf8'),'keep');
});
