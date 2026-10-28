import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {Window} from 'happy-dom';
import {initAgentUI} from '../public/agent-ui.js';
test('UI wires source create/edit/search, SDK requests, proposal review/apply and document navigation',async t=>{
 const window=new Window({url:'http://127.0.0.1:4317/'});window.document.write(await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8'));
 const previous={};for(const key of ['window','document','Event','CustomEvent','FormData']){previous[key]=globalThis[key];globalThis[key]=window[key];}
 const realInterval=globalThis.setInterval;globalThis.setInterval=(fn,delay)=>{const handle=realInterval(fn,delay);handle.unref();return handle;};
 t.after(async()=>{for(const [key,value] of Object.entries(previous))globalThis[key]=value;globalThis.setInterval=realInterval;await window.happyDOM.close();});
 const sources=[{id:'a-source',title:'기존 경력',text:'경력 원문',tags:['경력'],characters:5,version:'v1'}];let jobs=[];let applied=false;let loaded=null;const notices=[];
 const api=async(url,opts={})=>{const b=opts.body?JSON.parse(opts.body):{};
 if(url==='/api/sources'&&opts.method==='POST'){const s={...b,id:'new-source',characters:b.text.length,version:'v1',tags:b.tags.split(',')};sources.push(s);return s;}
 if(url==='/api/sources')return sources;
 if(url.startsWith('/api/sources/'))return sources.find(s=>s.id===url.split('/').pop());
 if(url==='/api/agent/status')return {authenticated:true};
 if(url==='/api/agent/jobs'&&opts.method==='POST'){assert.equal(b.target,'common');assert.ok(b.message.includes('공통'));const j={id:'job1',target:b.target,message:b.message,status:'completed',createdAt:new Date().toISOString(),events:[],answer:'근거를 확인했습니다.',missingFacts:['기간은?'],baseMarkdown:{resume:'## 경험\n기존'},drafts:[{id:'draft1',doc:'resume',markdown:'## 경험\n수정',sourceIds:['a-source'],reason:'근거에 따른 변경',status:'pending'}]};jobs.push(j);return j;}
 if(url==='/api/agent/jobs')return jobs;
 if(url==='/api/agent/jobs/job1/apply'){applied=true;jobs[0].drafts[0].status='applied';return {};}
 throw new Error('Unexpected API '+url);
 };
 const state={target:'common',doc:'resume',data:{companies:[]}};
 initAgentUI({state,api,save:async()=>{},load:async(target,doc)=>{loaded={target,doc};window.dispatchEvent(new window.Event('outline:document'));},toast:(text,error)=>notices.push({text,error})});
 const $=s=>window.document.querySelector(s);const click=async s=>{$(s).click();await window.happyDOM.waitUntilComplete();};
 await click('#knowledge-nav');assert.match($('#extra-workspace').textContent,/既|기존 경력/);await click('[data-new-source]');$('#source-form [name="title"]').value='신규 자료';$('#source-form [name="tags"]').value='프로젝트';$('#source-form [name="text"]').value='캐시를 도입했다.';$('#source-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await window.happyDOM.waitUntilComplete();assert.equal(sources.length,2);assert.equal(sources[1].title,'신규 자료');
 await click('#agent-nav');assert.match($('#extra-workspace').textContent,/공통 문서 작성/);await click('[data-starter]');assert.ok($('#agent-message').value.includes('공통'));$('#agent-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await window.happyDOM.waitUntilComplete();assert.match($('#chat-content').textContent,/근거를 확인했습니다/);assert.match($('#chat-content').textContent,/기간은/);assert.equal($('#chat-content').querySelectorAll('.draft-columns').length,1);await click('[data-apply]');assert.equal(applied,true);assert.match($('#chat-content').textContent,/적용됨/);await click('[data-open-doc]');assert.equal(loaded.target,'common');assert.equal($('#extra-workspace').classList.contains('hidden'),true);assert.equal(notices.some(n=>n.error),false,JSON.stringify(notices));
});
