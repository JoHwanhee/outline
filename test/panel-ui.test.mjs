import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {Window} from 'happy-dom';
import {initInlineAgent} from '../public/inline-agent.js';
import {createDocumentAI} from '../public/document-ai.js';
import {REVIEWERS} from '../lib/panel.mjs';
test('panel runs inside the same chat, uses chosen SDK/model, previews, applies, undoes and keeps document scope',async t=>{
 const win=new Window({url:'http://127.0.0.1:4317/'});win.document.write(await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8'));const old={};for(const k of ['window','document','Event','CustomEvent','FormData']){old[k]=globalThis[k];globalThis[k]=win[k];}t.after(async()=>{for(const[k,v]of Object.entries(old))globalThis[k]=v;await win.happyDOM.close();});
 const $=s=>win.document.querySelector(s),notices=[];let saved={target:'common',doc:'resume',version:'v1',company:null,markdown:'## 경험\n원문'},job=null,applies=0;const state={target:'common',doc:'resume',current:saved,dirty:false,view:'markdown'};const editor=$('#markdown-editor');editor.value=saved.markdown;const bridge=createDocumentAI({state,editor,setEditor:text=>editor.value=text,renderPreview:()=>{},renderSections:()=>{},updateConnection:()=>{},updateHeading:()=>{},savedStatus:()=>{},zoom:()=>{}});
 const api=async(url,options={})=>{const b=options.body?JSON.parse(options.body):{};
 if(url==='/api/agent/jobs')return [];
 if(url==='/api/ai/settings')return {defaultProvider:'codex',providers:{codex:{model:''},claude:{model:'claude-sonnet-5-5'}}};
 if(url.startsWith('/api/ai/models?'))return {models:[{id:'claude-sonnet-5-5',name:'Claude Sonnet'}]};
 if(url.startsWith('/api/document?'))return saved;
 if(url.startsWith('/api/panels?'))return state.doc==='resume'&&job?[{...job,reviewerCount:job.reviewers.length}]:[];
 if(url==='/api/panels'&&options.method==='POST'){assert.equal(b.role,'백엔드 개발자');assert.equal(b.version,'v1');assert.equal(b.provider,'claude');assert.equal(b.model,'claude-sonnet-5-5');job={id:'evaluation',target:'common',doc:'resume',role:b.role,baseVersion:'v1',companyContext:null,provider:'Claude Agent SDK',sdkProvider:b.provider,model:b.model,status:'running',stage:'screen',createdAt:new Date().toISOString(),reviewers:[],events:[]};return job;}
 if(url==='/api/panels/evaluation')return job;
 if(url==='/api/panels/evaluation/apply'){applies++;job={...job,applied:true,appliedVersion:'v2',updatedAt:'applied'};saved={...saved,version:'v2',markdown:job.result.improvedMarkdown};return saved;}
 if(url==='/api/panels/evaluation/revert'){job={...job,applied:false,reverted:true,updatedAt:'reverted'};saved={...saved,version:'v1',markdown:'## 경험\n원문'};return saved;}
 throw new Error('Unexpected '+url);
 };
 const controller=initInlineAgent({state,api,save:async()=>{},load:async()=>{},toast:(text,error)=>notices.push({text,error}),documentAI:bridge});const click=async s=>{$(s).click();await win.happyDOM.waitUntilComplete();};await click('#panel-document');assert.ok($('#inline-panel-form'));assert.equal($('#extra-workspace').classList.contains('hidden'),true);assert.equal($('#document-stage').classList.contains('chat-open'),true);
 $('#inline-sdk').value='claude';$('#inline-sdk').dispatchEvent(new win.Event('change',{bubbles:true}));await win.happyDOM.waitUntilComplete();$('#inline-panel-role').value='백엔드 개발자';$('#inline-panel-form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await win.happyDOM.waitUntilComplete();assert.match($('#document-agent').textContent,/자동 서류 심사 · 0\/7명 완료/);assert.equal(editor.value,'## 경험\n원문');
 job={...job,status:'completed',stage:'completed',updatedAt:'complete',usage:{input_tokens:900,output_tokens:200,cached_input_tokens:100,cost_usd:0.02},reviewers:REVIEWERS.map(r=>({id:r.id,name:r.name,verdict:r.id==='screen'?'REJECT':r.id==='manager'?'INTERVIEW':'PASS',summary:'역할이 모호해요',firstImpression:'',interviewQuestions:[],reasons:[{quote:'원문',problem:'구체성이 부족합니다.'}]})),afterScreen:{id:'screen',verdict:'PASS',summary:'개선안 통과'},originalMarkdown:'## 경험\n원문',result:{summary:'직무와 역할을 연결하세요.',issues:[{quote:'원문',problem:'역할 모호',fix:'경험을 명확하게',reviewerIds:['manager']}],improvedMarkdown:'## 경험\n평가를 반영한 개선안',questions:['역할은?']}};await controller.refresh();assert.equal($('#document-agent').querySelectorAll('.inline-reviewers details').length,7);assert.match($('.inline-panel-screen').textContent,/PASS · 통과/);assert.match($('.inline-reviewers').textContent,/PASS · 후보 제외/);assert.match($('#document-agent').textContent,/입력 900/);assert.equal($('a[download]').getAttribute('href'),'/api/panels/evaluation/files/PANEL.md');
 await click('[data-inline-panel-preview]');assert.equal(editor.value,'## 경험\n평가를 반영한 개선안');assert.equal(editor.readOnly,true);assert.equal(saved.markdown,'## 경험\n원문');await click('[data-inline-panel-apply]');assert.equal(applies,1);assert.equal(editor.value,saved.markdown);assert.equal(editor.readOnly,false);assert.match($('#document-agent').textContent,/평가 결과를 문서에 반영했어요/);
 await click('[data-inline-panel-undo]');assert.equal(editor.value,'## 경험\n원문');assert.match($('#document-agent').textContent,/반영 전으로 되돌렸어요/);
 saved={...saved,version:'manual-v3'};state.current=saved;await controller.refresh();assert.equal($('[data-inline-panel-apply]').disabled,true);assert.match($('#document-agent').textContent,/평가 당시와 달라졌습니다/);
 win.dispatchEvent(new win.Event('outline:document-leaving'));state.doc='career';state.current={target:'common',doc:'career',version:'career-v1',markdown:'## 프로젝트\n다른 문서'};win.dispatchEvent(new win.Event('outline:document-loaded'));await win.happyDOM.waitUntilComplete();assert.equal($('#document-agent').querySelectorAll('.inline-panel-turn').length,0);assert.equal(notices.some(x=>x.error),false,JSON.stringify(notices));
});
