// Uses the existing local Codex account; no user documents are modified.
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {seed} from './seed.mjs';
import {Knowledge} from '../lib/knowledge.mjs';
import {Agent} from '../lib/agent.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'outline-sdk-'));const store=await seed(root);await store.materializeAll();const knowledge=new Knowledge(store);await knowledge.bootstrap();const agent=new Agent(store,knowledge);await agent.init();
try{const job=await agent.start({provider:process.env.OUTLINE_PROVIDER||'codex',model:process.env.OUTLINE_MODEL||'',message:'연결 검증입니다. outline MCP의 list_sources 도구를 한 번 호출하여 자료 수만 확인하고 한국어로 짧게 답해 주세요. 문서 초안은 만들지 말고 drafts와 missingFacts를 빈 배열로 반환하세요.'});const timer=setTimeout(()=>agent.active?.abort.abort(new Error('Smoke check timeout')),90000);timer.unref();await agent.execution;clearTimeout(timer);const result=await agent.get(job.id);console.log(JSON.stringify({status:result.status,answer:result.answer,error:result.error,events:result.events},null,2));if(result.status!=='completed')process.exitCode=1;}finally{await fs.rm(root,{recursive:true,force:true});}
