import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {seed} from './fixtures.mjs';
import {PdfTemplates,validateTemplateStyle} from '../lib/pdf-templates.mjs';
import {documentHTML,documentTex,DEFAULT_STYLE} from '../lib/document.mjs';
import {exportDocument} from '../lib/export.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'outline-template-api-'));
process.env.OUTLINE_DATA_DIR=root;process.env.OUTLINE_NO_LISTEN='1';
const store=await seed(root);
const {requestHandler}=await import('../server.mjs');
async function request(url,method='GET',body){
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url,method,headers:{host:'localhost:4317'}});
 const chunks=[];const res={headers:{},status:200,setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(b){if(b)chunks.push(Buffer.from(b));}};
 await requestHandler(req,res);const bytes=Buffer.concat(chunks);return {...res,bytes,data:res.headers['Content-Type']?.includes('json')?JSON.parse(bytes):null};
}
test('template styles reject unsafe CSS, invalid numeric values and malformed switches',()=>{
 for(const style of [null,[],{margin:500},{fontSize:NaN},{ink:'red;display:none'},{accent:'#fff'},{headerLayout:'<script>'},{showRules:'false'}])assert.throws(()=>validateTemplateStyle(style));
 assert.deepEqual(validateTemplateStyle({}),DEFAULT_STYLE);
 const html=documentHTML('## 경력\n\n경험',{name:'예시'},'이력서',{ink:'red;display:none'});assert.equal(html.includes('red;display:none'),false);
});
test('PDF template API preserves existing styles, supports scoped selection, edits and real preview without changing source',async t=>{
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await store.saveSettings({style:{fontSize:11,margin:23}});
 const original=await store.document('common','resume');assert.equal(original.style.fontSize,11);assert.equal(original.pdfTemplate.id,'current');
 let response=await request('/api/pdf-templates');let catalog=response.data;assert.equal(response.status,200);assert.equal(catalog.templates.length,4);
 const style={...DEFAULT_STYLE,accent:'#226644',nameSize:28,headerLayout:'stacked',showRules:false,showPageNumbers:false,careerPageBreaks:false};
 response=await request('/api/pdf-templates','POST',{name:'내 서식',style,version:catalog.version});assert.equal(response.status,201);const id=response.data.template.id;catalog=response.data.catalog;
 assert.equal((await store.document('common','resume')).version,original.version);
 assert.equal((await request('/api/pdf-templates','POST',{name:'오래된 창',style,version:'stale'})).status,409);
 assert.equal((await request('/api/pdf-templates/selection','PUT',{id:'not-found',version:catalog.version})).status,404);
 response=await request('/api/pdf-templates/selection','PUT',{id,target:'common',doc:'resume',version:catalog.version});assert.equal(response.status,200);catalog=response.data;
 const selected=await store.document('common','resume');assert.equal(selected.style.accent,style.accent);assert.equal(selected.pdfTemplate.id,id);assert.notEqual(selected.version,original.version);assert.equal(selected.markdown,original.markdown);
 assert.equal((await store.document('common','career')).pdfTemplate.id,'current');
 const persisted=new PdfTemplates(store);assert.equal((await persisted.resolve('common','resume')).id,id);
 response=await request('/api/pdf-templates/'+id,'PUT',{name:'수정된 서식',style:{...style,margin:18},version:catalog.version});assert.equal(response.status,200);catalog=response.data.catalog;assert.equal((await store.document('common','resume')).style.margin,18);
 const before=await store.document('common','resume'),markdown=await fs.readFile(store.commonPath('resume'),'utf8');
 const preview=await request('/api/pdf-templates/preview','POST',{target:'common',doc:'resume',version:before.version,style:{...style,fontSize:9}});assert.equal(preview.status,200);
 const downloaded=await request(preview.data.url);assert.equal(downloaded.bytes.subarray(0,5).toString(),'%PDF-');
 assert.equal((await store.document('common','resume')).style.fontSize,before.style.fontSize);assert.equal(await fs.readFile(store.commonPath('resume'),'utf8'),markdown);
 await assert.rejects(fs.access(path.join(root,'common','이력서.pdf'))); // Draft previews never replace a final export.
 const savedStylePreview=await request('/api/pdf-templates/preview','POST',{target:'common',doc:'resume',version:before.version,style:before.style});assert.equal(savedStylePreview.status,200);await assert.rejects(fs.access(path.join(root,'common','이력서.pdf')));
 const actual=await exportDocument(store,'common','resume','pdf',before.version);assert.equal(actual.hash,savedStylePreview.data.hash);assert.notEqual(actual.hash,preview.data.hash);assert.equal((await fs.readFile(path.join(root,'common','이력서.pdf'))).subarray(0,5).toString(),'%PDF-');
 assert.equal((await request('/api/pdf-templates/preview','POST',{style:{ink:'<script>'}})).status,400);
 response=await request('/api/pdf-templates/selection','PUT',{id:'compact',scope:'all',version:catalog.version});assert.equal(response.status,200);assert.deepEqual(response.data.assignments,{});
 const company=await store.createCompany({name:'템플릿 검증 회사'});assert.equal((await store.document(company.id,'resume')).pdfTemplate.id,'compact');assert.equal((await store.document('common','career')).pdfTemplate.id,'compact');
 const career=await store.document('common','career');await store.save('common','career','## 첫 프로젝트\n\n테스트 경험입니다.\n\n## 두 번째 프로젝트\n\n추가 경험입니다.\n',career.version);
 const pages=async careerPageBreaks=>{const out=await exportDocument(store,'common','career','pdf',undefined,'native',{style:{...DEFAULT_STYLE,careerPageBreaks},preview:true});const pdf=await fs.readFile(path.join(root,'builds',out.hash,'document.pdf'));return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;};
 assert.equal(await pages(true),2);assert.equal(await pages(false),1);
 const html=documentHTML(before.markdown,before.profile,before.label,style),tex=documentTex(before.markdown,before.profile,before.label,style);
 assert.ok(html.includes('color:#226644'));assert.ok(html.includes('flex-direction:column'));assert.ok(tex.includes('\\definecolor{accent}{HTML}{226644}'));assert.ok(!tex.includes('\\fancyfoot[R]'));assert.ok(!tex.includes('\\titlerule'));
});
