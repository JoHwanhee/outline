import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {Window} from 'happy-dom';
import {createDocumentAI} from '../public/document-ai.js';
import {initInlineAgent} from '../public/inline-agent.js';
async function fixture(t){const win=new Window({url:'http://127.0.0.1:4317/'});win.document.write(await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8'));const old={};for(const k of ['window','document','Event','CustomEvent','FormData']){old[k]=globalThis[k];globalThis[k]=win[k];}t.after(async()=>{for(const[k,v]of Object.entries(old))globalThis[k]=v;await win.happyDOM.close();});const $=s=>win.document.querySelector(s);const editor=$('#markdown-editor');const state={target:'common',doc:'resume',current:{target:'common',doc:'resume',version:'v1',markdown:'## 경험\n원문'},dirty:false,view:'markdown'};editor.value=state.current.markdown;const previews=[];const bridge=createDocumentAI({state,editor,setEditor:text=>{editor.value=text;},renderPreview:()=>previews.push(editor.value),renderSections:()=>{},updateConnection:()=>{},updateHeading:()=>{},savedStatus:()=>{},zoom:()=>{}});return {win,$,editor,state,bridge,previews};}
test('inline conversation stays beside the current file, shows intermediate edits, auto-applies and undoes',async t=>{
 const {win,$,editor,state,bridge,previews}=await fixture(t);let jobs=[],job=null,saved={...state.current};const notices=[];const requests=[];
 const api=async(url,options={})=>{const b=options.body?JSON.parse(options.body):{};
 if(url==='/api/agent/jobs'&&options.method==='POST'){requests.push(b);assert.deepEqual(b.docs,['resume']);assert.equal(b.autoApply,true);assert.equal(b.target,'common');job={id:'inline-job',target:'common',docs:['resume'],autoApply:true,message:b.message,status:'running',baseVersions:{resume:'v1'},baseMarkdown:{resume:saved.markdown},createdAt:new Date().toISOString(),drafts:[],events:[],previews:{resume:{markdown:'## 경험\nAI가 다듬는 중'}}};jobs=[job];return job;}
 if(url.startsWith('/api/panels?'))return [];
 if(url==='/api/ai/settings')return {defaultProvider:'codex',providers:{codex:{model:''},claude:{model:''}}};
 if(url.startsWith('/api/ai/models?'))return {models:[]};
 if(url==='/api/agent/jobs')return jobs;
 if(url==='/api/agent/jobs/inline-job')return job;
 if(url.startsWith('/api/document?'))return saved;
 if(url==='/api/agent/jobs/inline-job/revert'){assert.equal(b.draftId,'draft1');job.drafts[0].status='reverted';saved={...saved,markdown:'## 경험\n원문',version:'v3'};return saved;}
 throw new Error('Unexpected '+url);
 };
 const controller=initInlineAgent({state,api,save:async()=>{},load:async()=>{},toast:(text,error)=>notices.push({text,error}),documentAI:bridge});
 await controller.open();assert.equal($('#extra-workspace').classList.contains('hidden'),true);assert.equal($('#document-workspace').classList.contains('hidden'),false);assert.equal($('#document-stage').classList.contains('chat-open'),true);assert.equal($('#agent-document').getAttribute('aria-expanded'),'true');assert.match($('#document-agent').textContent,/공통 경력 · 이력서/);
 $('#inline-message').value='성과 중심으로 다듬어줘';$('#inline-agent-form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await win.happyDOM.waitUntilComplete();assert.equal(requests.length,1);assert.equal(editor.value,'## 경험\nAI가 다듬는 중');assert.equal(editor.readOnly,true);assert.equal(state.current.markdown,'## 경험\n원문');assert.equal(state.dirty,false);assert.equal($('#save-button').disabled,true);assert.ok(previews.includes('## 경험\nAI가 다듬는 중'));
 job={...job,status:'completed',answer:'성과와 역할을 정리했어요.',missingFacts:[],drafts:[{id:'draft1',doc:'resume',markdown:'## 경험\n최종 수정',reason:'경험을 분명하게',sourceIds:['source'],status:'applied'}]};jobs=[job];saved={...saved,markdown:'## 경험\n최종 수정',version:'v2'};await controller.refresh();assert.equal(editor.value,saved.markdown);assert.equal(editor.readOnly,false);assert.equal(state.current.version,'v2');assert.equal($('#save-button').disabled,false);assert.match($('#document-agent').textContent,/문서에 반영했어요/);
 $('[data-inline-undo]').click();await win.happyDOM.waitUntilComplete();assert.equal(editor.value,'## 경험\n원문');assert.equal(state.current.version,'v3');assert.match($('#document-agent').textContent,/되돌렸어요/);
 win.dispatchEvent(new win.Event('outline:document-leaving'));state.doc='career';state.current={target:'common',doc:'career',version:'career-v1',markdown:'## 프로젝트\n다른 문서'};editor.value=state.current.markdown;saved={...state.current};win.dispatchEvent(new win.Event('outline:document-loaded'));await win.happyDOM.waitUntilComplete();assert.match($('#document-agent').textContent,/공통 경력 · 경력기술서/);assert.equal($('#document-agent').textContent.includes('성과 중심으로 다듬어줘'),false);assert.equal(editor.value,'## 프로젝트\n다른 문서');assert.equal(notices.some(n=>n.error),false,JSON.stringify(notices));
});
test('live preview rollback preserves originals and refuses another document or unsaved manual work',async t=>{
 const {state,editor,bridge}=await fixture(t);const job={id:'test',target:'common',docs:['resume'],baseVersions:{resume:'v1'},previews:{resume:{markdown:'## 경험\n미완성'}}};assert.equal(bridge.begin({...job,target:'other'}),false);state.dirty=true;assert.equal(bridge.begin(job),false);assert.equal(editor.value,'## 경험\n원문');state.dirty=false;assert.equal(bridge.begin(job),true);bridge.preview(job);assert.equal(editor.value,'## 경험\n미완성');bridge.restore();assert.equal(editor.value,'## 경험\n원문');assert.equal(editor.readOnly,false);assert.equal(state.aiPreview,null);assert.equal(bridge.accept({target:'other',doc:'resume',version:'wrong',markdown:'다른 문서'}),false);assert.equal(editor.value,'## 경험\n원문');
});
test('chat refresh and polling preserve reading position and composer focus without scrolling the page',async t=>{
 const {win,$,state,bridge}=await fixture(t);let poll,jobs=[];const originalInterval=globalThis.setInterval;
 globalThis.setInterval=(fn,delay,...args)=>delay===900?(poll=fn,{unref(){}}):originalInterval(fn,delay,...args);t.after(()=>globalThis.setInterval=originalInterval);
 const focusCalls=[],nativeFocus=win.HTMLElement.prototype.focus;win.HTMLElement.prototype.focus=function(options){focusCalls.push(options);return nativeFocus.call(this,options);};
 const api=async url=>{if(url==='/api/agent/jobs')return jobs;if(url.startsWith('/api/agent/jobs/'))return jobs[0];if(url.startsWith('/api/panels?'))return [];if(url==='/api/ai/settings')return {defaultProvider:'codex',providers:{codex:{},claude:{}}};if(url.startsWith('/api/ai/models?'))return {models:[]};throw new Error(url);};
 const controller=initInlineAgent({state,api,save:async()=>{},load:async()=>{},toast:()=>{},documentAI:bridge});await controller.open();assert.deepEqual(focusCalls.at(-1),{preventScroll:true});
 const input=$('#inline-message');input.value='작성 중인 요청';input.dispatchEvent(new win.Event('input',{bubbles:true}));input.setSelectionRange(2,5);input.scrollTop=17;$('#inline-chat-messages').scrollTop=320;await controller.refresh();assert.equal($('#inline-chat-messages').scrollTop,320);assert.equal(win.document.activeElement,$('#inline-message'));assert.equal($('#inline-message').value,'작성 중인 요청');assert.equal($('#inline-message').selectionStart,2);assert.equal($('#inline-message').selectionEnd,5);assert.equal($('#inline-message').scrollTop,17);assert.deepEqual(focusCalls.at(-1),{preventScroll:true});
 jobs=[{id:'scroll-job',target:'common',docs:['resume'],status:'running',message:'문서 다듬기',createdAt:'2026-01-01',baseVersions:{resume:'v1'},previews:{},drafts:[],events:[]}];await controller.refresh();
 const metrics=()=>Object.defineProperties(win.HTMLElement.prototype,{scrollHeight:{get(){return this.id==='inline-chat-messages'?2000:0;},configurable:true},clientHeight:{get(){return this.id==='inline-chat-messages'?400:0;},configurable:true}});
 metrics();$('#inline-chat-messages').scrollTop=320;await poll();assert.equal($('#inline-chat-messages').scrollTop,320,'reading older messages must survive each poll');
 metrics();$('#inline-chat-messages').scrollTop=1550;await poll();assert.equal($('#inline-chat-messages').scrollTop,2000,'only readers already near the bottom follow new output');
});
