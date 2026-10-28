import {PdfTemplates} from './pdf-templates.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const fontSource=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/fonts');
import { splitSections, serializeSections, deriveVariant, resolveVariant, documentTex, DEFAULT_STYLE, DOC_NAMES, slug } from './document.mjs';
export const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
export class AppError extends Error {constructor(message,status=400,details={}){super(message);this.status=status;this.details=details;}}
const docs=['resume','career'];
export class Store {
  constructor(root){this.root=root;}
  id(s){if(!/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,63}$/u.test(s||''))throw new AppError('잘못된 문서 경로입니다.');return s;}
  doc(d){if(!docs.includes(d))throw new AppError('문서 종류를 확인해 주세요.');return d;}
  async json(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT' && fallback!==undefined)return fallback;throw e;}}
  async write(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(tmp,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');await fs.rename(tmp,file);}
  commonPath(doc){return path.join(this.root,'common',DOC_NAMES[this.doc(doc)]+'.md');}
  companyPath(id){return path.join(this.root,'companies',this.id(id),'company.json');}
  async profile(){return this.json(path.join(this.root,'common','profile.json'));}
  async settings(){return this.json(path.join(this.root,'settings.json'),{style:DEFAULT_STYLE,pdfEngine:'native'});}
  async companies(){const dirs=await fs.readdir(path.join(this.root,'companies'),{withFileTypes:true});const all=await Promise.all(dirs.filter(d=>d.isDirectory()).map(d=>this.json(this.companyPath(d.name),null)));return all.filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'ko'));}
  async company(id){const c=await this.json(this.companyPath(id),null);if(!c)throw new AppError('회사를 찾을 수 없습니다.',404);return c;}
  async base(doc){return fs.readFile(this.commonPath(doc),'utf8');}
  async document(target,doc){
    this.id(target);this.doc(doc);
    const [base,profile]=await Promise.all([this.base(doc),this.profile()]);
    const company=target==='common'?null:await this.company(target);
    const sections=company?resolveVariant(base,company.documents?.[doc]):splitSections(base).map(s=>({...s,custom:false,baseChanged:false}));
    const markdown=serializeSections(sections,profile.name);
    const label=(company?.showCompany?company.name+' · ':'')+DOC_NAMES[doc];
    const template=await new PdfTemplates(this).resolve(target,doc);
    const version=hash(JSON.stringify({markdown,profile,style:template.style,label}));
    return {target,doc,markdown,version,label,profile,style:template.style,pdfTemplate:{id:template.id,name:template.name},sections:sections.map(({base,body,...s})=>({...s,body,base})), inherited:sections.filter(s=>!s.custom).length,customized:sections.filter(s=>s.custom).length,baseChanged:sections.filter(s=>s.baseChanged).length,company};
  }
  async snapshot(target,doc,current){const folder=path.join(this.root,'history',target,doc);await fs.mkdir(folder,{recursive:true});const name=`${Date.now()}-${current.version.slice(0,8)}.json`;await this.write(path.join(folder,name),{id:name,createdAt:new Date().toISOString(),markdown:current.markdown,version:current.version});const files=(await fs.readdir(folder)).filter(s=>s.endsWith('.json')).sort().reverse();for(const f of files.slice(60))await fs.unlink(path.join(folder,f));}
  async save(target,doc,markdown,version){
    if(typeof markdown!=='string'||markdown.length>250000)throw new AppError('문서는 25만 자 이내로 작성해 주세요.');
    let sections;try{sections=splitSections(markdown);}catch(e){throw new AppError(e.message);}
    if(!sections.length)throw new AppError('## 제목으로 시작하는 섹션을 하나 이상 작성해 주세요.');
    const current=await this.document(target,doc);
    if(version!==current.version)throw new AppError('다른 창이나 파일에서 문서가 변경됐습니다. 새 내용을 불러온 뒤 다시 저장해 주세요.',409,{current});
    if(current.markdown===serializeSections(sections,current.profile.name))return current;
    await this.snapshot(target,doc,current);
    if(target==='common')await this.write(this.commonPath(doc),serializeSections(sections,current.profile.name));
    else {const c=await this.company(target);c.documents??={};c.documents[doc]=deriveVariant(await this.base(doc),markdown,c.documents[doc]);c.updatedAt=new Date().toISOString();await this.write(this.companyPath(target),c);}
    await this.materializeAll();return this.document(target,doc);
  }
  async materialize(target,doc){const d=await this.document(target,doc);const folder=target==='common'?path.join(this.root,'common'):path.join(this.root,'companies',target);await fs.mkdir(folder,{recursive:true});const fontLink=path.join(folder,'fonts'),expected=path.relative(await fs.realpath(folder),await fs.realpath(fontSource));try{const stat=await fs.lstat(fontLink);if(stat.isSymbolicLink()&&await fs.readlink(fontLink)!==expected)await fs.unlink(fontLink);}catch(e){if(e.code!=='ENOENT')throw e;}try{await fs.symlink(expected,fontLink,'dir');}catch(e){if(e.code!=='EEXIST')throw e;}if(target!=='common')await this.write(path.join(folder,DOC_NAMES[doc]+'.md'),d.markdown);await this.write(path.join(folder,DOC_NAMES[doc]+'.tex'),documentTex(d.markdown,d.profile,d.label,d.style));}
  async materializeAll(){const targets=['common',...(await this.companies()).map(c=>c.id)];for(const target of targets)for(const doc of docs)await this.materialize(target,doc);}
  async createCompany({name,role='',jobDescription='',jobUrl='',source='common'}){
    if(typeof name!=='string'||!name.trim()||name.length>80)throw new AppError('회사 이름을 1~80자로 입력해 주세요.');
    const stem=slug(name).slice(0,50);let id=stem;let n=2;const all=await this.companies();while(id==='common'||all.some(c=>c.id===id))id=stem+'-'+n++;
    let documents={resume:{},career:{}};
    if(source!=='common'){const from=await this.company(source);documents=structuredClone(from.documents);}
    const c={id,name:name.trim(),role:String(role).slice(0,150),jobDescription:String(jobDescription).slice(0,30000),jobUrl:String(jobUrl).slice(0,2000),status:'준비 중',showCompany:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),documents};
    await this.write(this.companyPath(id),c);for(const doc of docs)await this.materialize(id,doc);return c;
  }
  async updateCompany(id,patch){const c=await this.company(id);for(const key of ['name','role','jobDescription','jobUrl','status'])if(key in patch)c[key]=String(patch[key]).slice(0,key==='jobDescription'?30000:key==='jobUrl'?2000:150);if(!c.name.trim())throw new AppError('회사 이름을 입력해 주세요.');if('showCompany'in patch)c.showCompany=!!patch.showCompany;c.updatedAt=new Date().toISOString();await this.write(this.companyPath(id),c);await this.materializeAll();return c;}
  async reset(target,doc,id,version){if(target==='common')throw new AppError('공통 문서는 초기화 대상이 아닙니다.');const current=await this.document(target,doc);if(current.version!==version)throw new AppError('문서가 변경됐습니다. 다시 불러와 주세요.',409);await this.snapshot(target,doc,current);const c=await this.company(target);c.documents??={};if(!id)c.documents[doc]={};else {const v=c.documents[doc]||{};delete v.overrides?.[id];v.excluded=(v.excluded||[]).filter(s=>s!==id);c.documents[doc]=v;}await this.write(this.companyPath(target),c);await this.materializeAll();return this.document(target,doc);}
  async history(target,doc){this.id(target);this.doc(doc);const folder=path.join(this.root,'history',target,doc);let names;try{names=await fs.readdir(folder);}catch(e){if(e.code==='ENOENT')return [];throw e;}return Promise.all(names.filter(s=>s.endsWith('.json')).sort().reverse().map(async name=>{const d=await this.json(path.join(folder,name));return {id:d.id,createdAt:d.createdAt,characters:d.markdown.length};}));}
  async historyEntry(target,doc,id){this.id(target);this.doc(doc);if(!/^\d+-[a-f0-9]{8}\.json$/.test(id))throw new AppError('잘못된 버전입니다.');return this.json(path.join(this.root,'history',target,doc,id));}
  async saveSettings({profile,style,pdfEngine}){const p=await this.profile(),settings=await this.settings();if(profile){for(const k of ['name','email','phone','github','blog'])if(k in profile)p[k]=String(profile[k]).slice(0,300);if(!p.name.trim())throw new AppError('이름을 입력해 주세요.');await this.write(path.join(this.root,'common','profile.json'),p);}if(style){if(style.fontSize!=null){const n=Number(style.fontSize);if(!Number.isFinite(n)||n<9||n>12)throw new AppError('글자 크기는 9~12pt로 설정해 주세요.');settings.style.fontSize=n;}if(style.lineHeight!=null){const n=Number(style.lineHeight);if(!Number.isFinite(n)||n<1.3||n>2)throw new AppError('줄 간격은 1.3~2로 설정해 주세요.');settings.style.lineHeight=n;}if(style.margin!=null){const n=Number(style.margin);if(!Number.isFinite(n)||n<12||n>28)throw new AppError('여백은 12~28mm로 설정해 주세요.');settings.style.margin=n;}}if(pdfEngine){if(!['native','tectonic','xelatex'].includes(pdfEngine))throw new AppError('지원하지 않는 PDF 엔진입니다.');settings.pdfEngine=pdfEngine;}await this.write(path.join(this.root,'settings.json'),settings);await this.materializeAll();return {profile:p,settings};}
}
