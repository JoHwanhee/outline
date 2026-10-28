import {seed} from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'outline-api-'));
process.env.OUTLINE_DATA_DIR=dataRoot;process.env.OUTLINE_NO_LISTEN='1';
await seed(dataRoot);
const {requestHandler,agent,panel}=await import('../server.mjs');
async function request(url,method='GET',body,headers={}){
 const req=Readable.from(body==null?[]:[Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body))]);Object.assign(req,{url,method,headers:{host:'127.0.0.1:4317',...headers}});
 const parts=[];const res={status:200,headers:{},headersSent:false,setHeader(k,v){this.headers[k]=v;},writeHead(s,h){this.status=s;Object.assign(this.headers,h);this.headersSent=true;},write(b){parts.push(Buffer.from(b));},end(b){if(b)parts.push(Buffer.from(b));}};
 await requestHandler(req,res);const bytes=Buffer.concat(parts);return {...res,bytes,data:res.headers['Content-Type']?.includes('json')?JSON.parse(bytes):null};
}
test('HTTP API save -> inherited company -> PDF and history workflow without network sockets',async t=>{
 t.after(()=>fs.rm(dataRoot,{recursive:true,force:true}));
 let r=await request('/api/state');assert.equal(r.status,200);assert.ok(r.data.engines.native);
 r=await request('/api/document?target=common&doc=resume');const original=r.data;assert.equal(r.status,200);
 const created=await request('/api/company','POST',{name:'API 검증 회사',role:'백엔드'});assert.equal(created.status,201);const id=created.data.id;
 r=await request(`/api/document?target=${encodeURIComponent(id)}&doc=resume`);assert.equal(r.data.customized,0);
 const updated=await request('/api/document','PUT',{target:'common',doc:'resume',markdown:original.markdown.replace('백엔드 개발과','검증한 백엔드 개발과'),version:original.version});assert.equal(updated.status,200);
 const inherited=await request(`/api/document?target=${encodeURIComponent(id)}&doc=resume`);assert.ok(inherited.data.markdown.includes('검증한 백엔드 개발과'));
 const stale=await request('/api/document','PUT',{target:'common',doc:'resume',markdown:original.markdown,version:original.version});assert.equal(stale.status,409);
 const history=await request('/api/history?target=common&doc=resume');assert.ok(history.data.length);
 const restored=await request('/api/restore','POST',{target:'common',doc:'resume',id:history.data[0].id,version:updated.data.version});assert.equal(restored.status,200);assert.equal(restored.data.markdown,original.markdown);
 const output=await request('/api/export','POST',{target:'common',doc:'resume',format:'pdf',version:restored.data.version});assert.equal(output.status,200,JSON.stringify(output.data));
 const pdf=await request(output.data.url);assert.equal(pdf.headers['Content-Type'],'application/pdf');assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');
 const zip=await request('/api/export','POST',{target:'common',doc:'resume',format:'zip',version:restored.data.version});assert.equal(zip.status,200);const download=await request(zip.data.url);assert.equal(download.bytes.subarray(0,2).toString(),'PK');
 const missing=await request('/api/download/'+'a'.repeat(64)+'/document.pdf');assert.equal(missing.status,404);
 const badOrigin=await request('/api/company','POST',{name:'No'},{origin:'https://external.example'});assert.equal(badOrigin.status,403);
 const badPath=await request('/api/document?target=..%2Fsecret&doc=resume');assert.equal(badPath.status,400);
 const invalid=await request('/api/settings','PUT',{style:{fontSize:'bad'}});assert.equal(invalid.status,400);
 const seededSources=await request('/api/sources');assert.equal(seededSources.data.length,2);
 const source=await request('/api/sources','POST',{title:'API 근거',text:'실제 경험 자료',tags:'운영,성과'});assert.equal(source.status,201);
 const sourceRead=await request('/api/sources/'+source.data.id);assert.equal(sourceRead.data.text,'실제 경험 자료');
 const changedSource=await request('/api/sources/'+source.data.id,'PUT',{...source.data,text:'수정한 경험 자료',tags:'운영'});assert.equal(changedSource.status,200);
 const sourceConflict=await request('/api/sources/'+source.data.id,'PUT',{...source.data,tags:''});assert.equal(sourceConflict.status,409);
 const upload=await request('/api/sources/upload?filename=notes.md','POST',Buffer.from('## 경험\n실제 프로젝트 원문'));assert.equal(upload.status,201,JSON.stringify(upload.data));
 const originalFile=await request('/api/sources/'+upload.data.id+'/file');assert.equal(originalFile.bytes.toString(),'## 경험\n실제 프로젝트 원문');
 const search=await request('/api/sources?q='+encodeURIComponent('실제 프로젝트'));assert.equal(search.data.length,1);
 const localImport=await request('/api/import-url','POST',{url:'http://127.0.0.1/'});assert.equal(localImport.status,400);
 const companyLink=await request('/api/company/'+encodeURIComponent(id),'PATCH',{jobUrl:'https://example.com/jobs/1',jobDescription:'운영 경험'});assert.equal(companyLink.data.jobUrl,'https://example.com/jobs/1');
 const currentDocument=(await request('/api/document?target=common&doc=resume')).data;
 agent.createClient=()=>({startThread(){return {async runStreamed(){return {events:(async function*(){yield {type:'thread.started',thread_id:'api-thread'};yield {type:'item.completed',item:{type:'agent_message',text:JSON.stringify({message:'작성 완료',missingFacts:[],drafts:[{doc:'resume',markdown:currentDocument.markdown+'\n## 추가 경험\n자료 기반 프로젝트\n',sourceIds:[source.data.id],reason:'기록 반영'}]})}};yield {type:'turn.completed',usage:{input_tokens:1,output_tokens:1}};})()};}};}});
 const job=await request('/api/agent/jobs','POST',{target:'common',message:'자료 기반 초안'});assert.equal(job.status,202);await agent.execution;
 const completed=await request('/api/agent/jobs/'+job.data.id);assert.equal(completed.data.status,'completed');
 const applied=await request('/api/agent/jobs/'+job.data.id+'/apply','POST',{draftId:completed.data.drafts[0].id});assert.equal(applied.status,200);assert.ok(applied.data.markdown.includes('자료 기반 프로젝트'));
 const replay=await request('/api/agent/jobs/'+job.data.id+'/apply','POST',{draftId:completed.data.drafts[0].id});assert.equal(replay.status,409);
 const reverted=await request('/api/agent/jobs/'+job.data.id+'/revert','POST',{draftId:completed.data.drafts[0].id});assert.equal(reverted.status,200);assert.equal(reverted.data.markdown,currentDocument.markdown);const revertedJob=await request('/api/agent/jobs/'+job.data.id);assert.equal(revertedJob.data.drafts[0].status,'reverted');assert.deepEqual(revertedJob.data.previews,{});
 const agentStatus=await request('/api/agent/status');assert.equal(agentStatus.data.provider,'Codex SDK');
 const deleted=await request('/api/sources/'+upload.data.id,'DELETE');assert.equal(deleted.status,200);const deletedOriginal=await request('/api/sources/'+upload.data.id+'/file');assert.equal(deletedOriginal.status,404);

 const panelDoc=(await request('/api/document?target=common&doc=resume')).data;
 const missingRole=await request('/api/panels','POST',{target:'common',doc:'resume',version:panelDoc.version});assert.equal(missingRole.status,400);
 const stalePanel=await request('/api/panels','POST',{target:'common',doc:'resume',role:'백엔드',version:'old'});assert.equal(stalePanel.status,409);
 panel.createClient=()=>({startThread(){return {async runStreamed(prompt){return {events:(async function*(){const synthesis=prompt.includes('hiring-panel 통합 및 재작성 단계다');const input=JSON.parse(prompt.split(synthesis?'입력:\n':'평가 대상:\n')[1]);const quote=input.resume.split('\n')[0];const result=synthesis?{summary:'평가 통합',issues:[{quote,problem:'역할 설명이 부족합니다.',fix:'근거로 역할을 정리하세요.',evidence:input.reviews.map(r=>({reviewerId:r.id,quote}))}],improvedMarkdown:input.originalMarkdown+'\n## 평가 반영\n[ADD: 실제 맡은 역할]\n',questions:['맡은 역할은 무엇인가요?']}:{verdict:prompt.includes('자동 서류 심사자다')?'PASS':prompt.includes('면접 여부를 결정')?'INTERVIEW':'MAYBE',summary:'검토 의견',firstImpression:'',interviewQuestions:[],reasons:[{quote,problem:'역할 설명이 부족합니다.'}]};yield {type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}};yield {type:'turn.completed',usage:{input_tokens:1,output_tokens:1}};})()};}};}});
 const review=await request('/api/panels','POST',{target:'common',doc:'resume',role:'백엔드',version:panelDoc.version});assert.equal(review.status,202);await panel.execution;
 const panelResult=await request('/api/panels/'+review.data.id);assert.equal(panelResult.data.status,'completed',panelResult.data.error);assert.equal(panelResult.data.reviewers.length,7);
 const panelList=await request('/api/panels?target=common&doc=resume');assert.equal(panelList.data.length,1);assert.equal(panelList.data[0].reviewerCount,7);assert.equal(panelList.data[0].originalMarkdown,undefined);
 for(const filename of ['PANEL.md','RESUME-IMPROVED.md']){const artifact=await request('/api/panels/'+review.data.id+'/files/'+filename);assert.equal(artifact.status,200);assert.ok(artifact.bytes.toString().endsWith('Made with /hiring-panel by Alex Chen (@nocodealex) · chen.media\n'));}
 const appliedPanel=await request('/api/panels/'+review.data.id+'/apply','POST',{});assert.equal(appliedPanel.status,200);assert.ok(appliedPanel.data.markdown.includes('평가 반영'));
 const replayPanel=await request('/api/panels/'+review.data.id+'/apply','POST',{});assert.equal(replayPanel.status,409);
 const undoPanel=await request('/api/panels/'+review.data.id+'/revert','POST',{});assert.equal(undoPanel.status,200);assert.equal(undoPanel.data.markdown,panelDoc.markdown);
 const usage=await request('/api/ai/usage');assert.equal(usage.status,200);assert.ok(usage.data.total.input_tokens>=10);
 const aiConfig=await request('/api/ai/settings','PUT',{defaultProvider:'claude',providers:{claude:{authMode:'apiKey',apiKey:'sk-ant-api-test',model:'claude-sonnet-5-5'}}});assert.equal(aiConfig.status,200);assert.equal(aiConfig.data.providers.claude.hasKey,true);assert.equal(JSON.stringify(aiConfig.data).includes('sk-ant-api-test'),false);const configRead=await request('/api/ai/settings');assert.equal(configRead.data.defaultProvider,'claude');assert.equal(JSON.stringify(configRead.data).includes('sk-ant-api-test'),false);const catalogs=await request('/api/ai/models?provider=claude');assert.ok(catalogs.data.models.length>0);
 const foreignPanel=await request('/api/panels','POST',{target:'common',role:'백엔드',version:appliedPanel.data.version},{origin:'https://external.example'});assert.equal(foreignPanel.status,403);

 const intro=await request('/api/intro-page');assert.equal(intro.status,200);assert.ok(intro.data.source.profile.name);const noIntro=await request('/api/intro-page/download');assert.equal(noIntro.status,404);
 const generatedIntro=await request('/api/intro-page/generate','POST',{version:intro.data.sourceVersion,options:intro.data.defaults});assert.equal(generatedIntro.status,201);const introPreview=await request(generatedIntro.data.previewUrl);assert.equal(introPreview.status,200);assert.ok(introPreview.bytes.toString().includes('<!DOCTYPE html>'));assert.ok(introPreview.headers['Content-Security-Policy'].includes("default-src 'none'"));const introDownload=await request(generatedIntro.data.downloadUrl);assert.equal(introDownload.status,200);assert.ok(introDownload.headers['Content-Disposition'].startsWith('attachment;'));assert.equal(introDownload.bytes.toString(),introPreview.bytes.toString());const staleIntro=await request('/api/intro-page/generate','POST',{version:'old',options:intro.data.defaults});assert.equal(staleIntro.status,409);

});
