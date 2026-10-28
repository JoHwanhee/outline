// Browser verification against the real request handler, without binding a local port.
import {chromium} from 'playwright';
import {seed} from '../test/fixtures.mjs';
import {Readable} from 'node:stream';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'outline-ui-'));
process.env.OUTLINE_DATA_DIR=tmp;process.env.OUTLINE_NO_LISTEN='1';
await seed(tmp);
const {requestHandler,agent}=await import('../server.mjs');
const artifact=path.resolve('artifacts');await fs.mkdir(artifact,{recursive:true});
agent.createClient=()=>({startThread(){return {async runStreamed(){return {events:(async function*(){yield {type:'thread.started',thread_id:'ui-test'};yield {type:'item.completed',item:{type:'mcp_tool_call',tool:'read_source',status:'completed'}};const before=await agent.store.document('common','resume');const s=(await agent.knowledge.list())[0];yield {type:'item.completed',item:{type:'agent_message',text:JSON.stringify({message:'실제 자료에서 경력 근거를 확인했습니다.',missingFacts:['성과 측정 기간을 알려주세요.'],drafts:[{doc:'resume',markdown:before.markdown.replace('백엔드 개발과','백엔드 개발 및'),sourceIds:[s.id],reason:'경험을 명확하게 정리했습니다.'}]})}};yield {type:'turn.completed',usage:{input_tokens:10,output_tokens:10}};})()};}};}});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:4317/**',async route=>{
 const request=route.request(),u=new URL(request.url());if(u.pathname==='/api/events'){await route.fulfill({status:200,contentType:'text/event-stream',body:': connected\n\n'});return;}
 const req=Readable.from(request.postDataBuffer()?[request.postDataBuffer()]:[]);Object.assign(req,{url:u.pathname+u.search,method:request.method(),headers:{...request.headers(),host:'127.0.0.1:4317'}});const parts=[];const res={status:200,headers:{},headersSent:false,setHeader(k,v){this.headers[k]=v;},writeHead(s,h){this.status=s;Object.assign(this.headers,h);this.headersSent=true;},write(b){parts.push(Buffer.from(b));},end(b){if(b)parts.push(Buffer.from(b));}};await requestHandler(req,res);await route.fulfill({status:res.status,headers:res.headers,body:Buffer.concat(parts)});
 });
 await page.goto('http://127.0.0.1:4317');await page.getByRole('button',{name:'자료 저장소',exact:true}).click();await page.getByRole('button',{name:'＋ 자료 추가',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('UI 검증용 경험');await page.getByLabel('태그',{exact:true}).fill('성과,프로젝트');await page.getByLabel('본문',{exact:true}).fill('서비스 운영에서 캐시를 도입하고 처리량을 개선했다.');await page.getByRole('button',{name:'자료 저장',exact:true}).click();await page.getByRole('button',{name:'UI 검증용 경험',exact:false}).waitFor();await page.screenshot({path:path.join(artifact,'knowledge-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'AI 작업실',exact:false}).click();await page.getByRole('button',{name:'공통 문서 작성',exact:false}).click();await page.getByRole('button',{name:'요청 보내기',exact:false}).click();await page.getByText('실제 자료에서 경력 근거를 확인했습니다.',{exact:true}).waitFor();await page.getByText('변경 내용 비교',{exact:true}).click();await page.screenshot({path:path.join(artifact,'agent-draft-desktop.png'),fullPage:true});await page.getByRole('button',{name:'문서에 적용',exact:true}).click();await page.getByText('적용됨',{exact:true}).waitFor();
 await page.getByRole('button',{name:'새 회사 추가',exact:true}).click();await page.getByLabel('회사 이름',{exact:true}).fill('화면 검증 회사');await page.getByLabel('지원 포지션',{exact:true}).fill('백엔드');await page.getByLabel('채용공고 본문',{exact:true}).fill('대규모 서비스 운영과 캐시 경험을 요구합니다.');await page.getByRole('checkbox',{name:'자료와 공고로 AI 맞춤 초안 작성'}).uncheck();await page.getByRole('button',{name:'작업실 만들기',exact:false}).click();await page.getByRole('heading',{name:'화면 검증 회사',exact:true}).waitFor();
 await page.getByRole('button',{name:'✳ AI로 다듬기',exact:true}).click();await page.getByLabel('현재 문서에 요청',{exact:true}).waitFor();await page.screenshot({path:path.join(artifact,'inline-agent-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifact,'agent-mobile.png'),fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);if(overflow)throw new Error('Mobile viewport overflow');if(errors.length)throw new Error(errors.join('\n'));console.log('UI passed: source CRUD, agent drafts, comparison, apply, company creation, responsive layout.');
}finally{await browser.close();await fs.rm(tmp,{recursive:true,force:true});}
