import {z} from 'zod';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AppError} from './store.mjs';
import {splitSections} from './document.mjs';
import {readPreviews} from './agent-preview.mjs';
import {Providers} from './providers.mjs';
import {createSdkClient} from './sdk-client.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const companyContext=c=>c?JSON.stringify({name:c.name,role:c.role,jobDescription:c.jobDescription,jobUrl:c.jobUrl}):null;
const output=z.object({message:z.string().max(30000),missingFacts:z.array(z.string().max(2000)).max(30),drafts:z.array(z.object({doc:z.enum(['resume','career']),markdown:z.string().max(250000),sourceIds:z.array(z.string()).min(1),reason:z.string().max(5000)})).max(2)});
const outputSchema={type:'object',additionalProperties:false,required:['message','missingFacts','drafts'],properties:{message:{type:'string'},missingFacts:{type:'array',items:{type:'string'}},drafts:{type:'array',items:{type:'object',additionalProperties:false,required:['doc','markdown','sourceIds','reason'],properties:{doc:{type:'string',enum:['resume','career']},markdown:{type:'string'},sourceIds:{type:'array',items:{type:'string'}},reason:{type:'string'}}}}}};
export class Agent {
 constructor(store,knowledge,{createClient,providers,runMutation=fn=>fn(),onChange=()=>{}}={}){this.store=store;this.knowledge=knowledge;this.providers=providers||new Providers(store);this.runMutation=runMutation;this.onChange=onChange;this.folder=path.join(store.root,'agent');this.active=null;this.createClient=createClient||(job=>createSdkClient(this.providers,job));}
 usageCursor(threadId){return path.join(this.folder,'usage',crypto.createHash('sha256').update(threadId).digest('hex')+'.json');}
 file(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw new AppError('작업 ID를 확인해 주세요.');return path.join(this.folder,id+'.json');}
 async init(){await fs.mkdir(this.folder,{recursive:true});for(const job of await this.list()){if(job.status==='running'){job.status='interrupted';job.error='서버가 재시작되어 작업이 중단됐습니다. 새 메시지로 다시 실행해 주세요.';await this.persist(job);}}}
 async status(){const config=await this.providers.public(),p=config.providers[config.defaultProvider];return {provider:p.name,authenticated:p.authMode==='apiKey'?p.hasKey:config.defaultProvider==='claude'?null:!!p.loginDetected,activeJob:this.active?.id||null};}
 async persist(job){job.updatedAt=new Date().toISOString();await this.store.write(this.file(job.id),job);}
 async get(id){const j=await this.store.json(this.file(id),null);if(!j)throw new AppError('작업을 찾을 수 없습니다.',404);return j;}
 async list(){await fs.mkdir(this.folder,{recursive:true});const names=await fs.readdir(this.folder);return (await Promise.all(names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>this.store.json(path.join(this.folder,n))))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 async start({target='common',message,parentId,docs=['resume','career'],autoApply=false,panelId,provider,model}){
 if(this.active)throw new AppError('진행 중인 작업을 완료하거나 중지한 뒤 실행해 주세요.',409);
 if(typeof message!=='string'||!message.trim()||message.length>10000)throw new AppError('요청은 1~10,000자로 입력해 주세요.');
 if(!Array.isArray(docs)||!docs.length||docs.some(d=>!['resume','career'].includes(d)))throw new AppError('작성할 문서를 선택해 주세요.');
 const documents=await Promise.all([...new Set(docs)].map(d=>this.store.document(target,d)));const sources=await this.knowledge.list();
 const parent=parentId?await this.get(parentId):null;if(parent&&parent.target!==target)throw new AppError('다른 회사의 대화를 이어갈 수 없습니다.');
 let panelContext=null;if(panelId){if(!/^[a-f0-9-]{36}$/.test(panelId))throw new AppError('평가 ID를 확인해 주세요.');const evaluation=await this.store.json(path.join(this.store.root,'panels',panelId+'.json'),null);if(!evaluation||evaluation.status!=='completed'||evaluation.target!==target||!docs.includes(evaluation.doc))throw new AppError('현재 문서의 완료된 평가만 대화에 연결할 수 있습니다.');panelContext={id:evaluation.id,doc:evaluation.doc,role:evaluation.role,summary:evaluation.result.summary,issues:evaluation.result.issues,questions:evaluation.result.questions};}
 const choice=await this.providers.choose({provider,model},parent);
 if(typeof autoApply!=='boolean')throw new AppError('자동 적용 설정을 확인해 주세요.');
 const providerTotals=choice.sdkProvider==='claude'&&parent?.threadId?(await this.store.json(this.usageCursor(parent.threadId),null))||parent.providerTotals:parent?.providerTotals;
 const job={id:crypto.randomUUID(),target,message,autoApply,...choice,sessionId:parent?.sessionId||parent?.id||null,providerTotals:providerTotals||null,panelId:panelContext?.id||null,docs:[...new Set(docs)],parentId:parent?.id||null,threadId:parent?.threadId||null,companyContext:companyContext(documents[0].company),status:'running',createdAt:new Date().toISOString(),events:[],drafts:[],baseMarkdown:Object.fromEntries(documents.map(d=>[d.doc,d.markdown])),baseVersions:Object.fromEntries(documents.map(d=>[d.doc,d.version])),sourceVersions:Object.fromEntries(sources.map(s=>[s.id,s.version]))};
 this.active={id:job.id,abort:new AbortController()};const signal=this.active.abort.signal;
 try{await this.persist(job);}catch(e){this.active=null;throw e;}
 job.sessionId??=job.id;
 const prompt=[await fs.readFile(path.join(root,'agent/AGENTS.md'),'utf8'),`작업 대상: ${target}. 허용 문서: ${job.docs.join(', ')}. 다음 사용자 요청에 답하고 필요한 전체 문서 초안을 지정 JSON 형식으로 반환하라. MCP는 읽기 전용이다. 사실 근거를 MCP로 확인하라.`,JSON.stringify({documents:documents.map(d=>({doc:d.doc,markdown:d.markdown,company:d.company,profile:d.profile})),sources:sources.map(({id,title,tags})=>({id,title,tags}))}),...(panelContext?['참고할 채용 패널 평가(모델의 제안이며 지원자 사실의 근거가 아니다). 현재 문서와 근거 자료를 우선하고 평가에 없는 새 사실을 만들지 마라.\n'+JSON.stringify(panelContext)]:[]),`사용자 요청:\n${message}`].join('\n\n');
 this.execution=this.execute(job,prompt,signal).catch(e=>console.error('Agent persistence:',e.message));return job;
 }
 async execute(job,prompt,signal){const timer=setTimeout(()=>this.active?.id===job.id&&this.active.abort.abort(new Error('작업 제한 시간(10분)을 초과했습니다.')),600000);timer.unref?.();try{
 const client=await this.createClient(job);const options={...(job.model?{model:job.model}:{}),workingDirectory:path.join(root,'agent'),skipGitRepoCheck:true,sandboxMode:'read-only',approvalPolicy:'never',webSearchMode:'disabled',networkAccessEnabled:false};
 const thread=job.threadId?client.resumeThread(job.threadId,options):client.startThread(options);let final='',completed=false;
 const {events}=await thread.runStreamed(prompt,{outputSchema,signal});for await(const event of events){
 if(signal.aborted)throw signal.reason||new Error('작업 중지');
 if(event.type==='thread.started')job.threadId=event.thread_id;
 if(event.type==='turn.failed'||event.type==='error')throw new Error(event.error?.message||event.message||'Codex 작업 실패');
 if(event.type==='turn.completed'||event.type==='usage.updated'){job.usage=event.usage;if(event.provider_totals){job.providerTotals=event.provider_totals;if(job.sdkProvider==='claude'&&job.threadId)await this.store.write(this.usageCursor(job.threadId),event.provider_totals);}if(event.type==='turn.completed')completed=true;}
 if(event.type==='item.completed'&&event.item.type==='agent_message')final=event.item.text;
 if(event.item){const i=event.item;const note=i.type==='mcp_tool_call'?`${i.tool} · ${i.status}`:i.type==='agent_message'?'응답 정리 중':i.type==='todo_list'?i.items.map(x=>(x.completed?'✓ ':'· ')+x.text).join('\n'):i.type==='error'?i.message:null;if(note)job.events.push({at:new Date().toISOString(),text:note.slice(0,2000)});job.events=job.events.slice(-100);}
 await this.persist(job);
 }
 if(signal.aborted)throw signal.reason;if(!completed)throw new Error('Codex 응답이 완료되기 전에 연결이 종료됐습니다.');
 const result=output.parse(JSON.parse(final));const seen=new Set();
 for(const d of result.drafts){if(!job.docs.includes(d.doc)||seen.has(d.doc))throw new Error('허용되지 않거나 중복된 문서 초안입니다.');seen.add(d.doc);if(!splitSections(d.markdown).length)throw new Error('초안에 ## 섹션이 없습니다.');if(d.sourceIds.some(id=>!job.sourceVersions[id]))throw new Error('초안의 근거 자료를 확인할 수 없습니다.');}
 job.answer=result.message;job.missingFacts=result.missingFacts;job.drafts=result.drafts.map(d=>({...d,id:crypto.randomUUID(),status:'pending',baseVersion:job.baseVersions[d.doc]}));job.status='completed';
 if(job.autoApply){await this.persist(job);for(const draft of [...job.drafts]){if(signal.aborted)throw signal.reason;try{await this.runMutation(()=>this.apply(job.id,draft.id));Object.assign(job,await this.get(job.id));this.onChange();}catch(e){const current=job.drafts.find(d=>d.id===draft.id);current.applyError=e.message;job.applyError=e.message;await this.persist(job);}}}
 }catch(e){job.status=signal.aborted?'cancelled':'failed';job.error=signal.aborted?(signal.reason?.message||'사용자가 작업을 중지했습니다.'):await this.providers.scrub(e);}
 finally{clearTimeout(timer);try{await this.persist(job);}finally{if(this.active?.id===job.id)this.active=null;}}
 }
 async cancel(id){if(this.active?.id!==id)throw new AppError('진행 중인 작업이 아닙니다.',409);this.active.abort.abort(new Error('사용자가 작업을 중지했습니다.'));await this.execution;return this.get(id);}
 async apply(id,draftId){const job=await this.get(id);const draft=job.drafts.find(d=>d.id===draftId);if(job.status!=='completed'||!draft||draft.status!=='pending')throw new AppError('적용할 수 없는 초안입니다.',409);
 if(job.target!=='common'&&companyContext(await this.store.company(job.target))!==job.companyContext)throw new AppError('지원 정보나 채용공고가 바뀌었습니다. 새 초안을 작성해 주세요.',409);
 for(const id of draft.sourceIds){const source=await this.knowledge.get(id);if(source.version!==job.sourceVersions[id])throw new AppError('근거 자료가 바뀌었습니다. 새 초안을 작성해 주세요.',409);}
 const document=await this.store.save(job.target,draft.doc,draft.markdown,draft.baseVersion);draft.status='applied';draft.appliedVersion=document.version;draft.appliedAt=new Date().toISOString();await this.persist(job);return document;
 }
 async detail(id){const job=await this.get(id);return {...job,previews:await readPreviews(this.store,job)};}
 async revert(id,draftId){const job=await this.get(id);const draft=job.drafts.find(d=>d.id===draftId);if(!draft||draft.status!=='applied'||!draft.appliedVersion)throw new AppError('되돌릴 수 없는 수정입니다.',409);const document=await this.store.save(job.target,draft.doc,job.baseMarkdown[draft.doc],draft.appliedVersion);draft.status='reverted';await this.persist(job);return document;}
 async discard(id,draftId){const job=await this.get(id);const draft=job.drafts.find(d=>d.id===draftId);if(!draft||draft.status!=='pending')throw new AppError('대기 중인 초안이 아닙니다.',409);draft.status='discarded';await this.persist(job);return job;}
}
