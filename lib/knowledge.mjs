import {promises as fs} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {AppError} from './store.mjs';

export class Knowledge {
 constructor(store){this.store=store;this.root=path.join(store.root,'knowledge');}
 file(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw new AppError('자료 ID를 확인해 주세요.');return path.join(this.root,id+'.json');}
 async list(query=''){await fs.mkdir(this.root,{recursive:true});const files=await fs.readdir(this.root);const all=await Promise.all(files.filter(x=>/^[a-f0-9-]{36}\.json$/.test(x)).map(x=>this.store.json(path.join(this.root,x))));return all.filter(x=>(x.title+' '+x.text+' '+x.tags.join(' ')).toLowerCase().includes(String(query).toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 async get(id){const d=await this.store.json(this.file(id),null);if(!d)throw new AppError('자료를 찾을 수 없습니다.',404);return d;}
 async save(input,id){const old=id?await this.get(id):null;const title=String(input.title||'').trim(),text=String(input.text||'').trim();if(!title||title.length>200||!text||text.length>250000)throw new AppError('자료 제목(200자 이내)과 본문(25만 자 이내)을 입력해 주세요.');if(old&&old.version!==input.version)throw new AppError('자료가 변경됐습니다. 다시 열어 주세요.',409);const d={id:old?.id||crypto.randomUUID(),title,text,tags:String(input.tags||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,20),url:String(input.url||'').slice(0,2000),filename:old?.filename||String(input.filename||'').slice(0,200),kind:old?.kind||input.kind||'note',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),version:crypto.randomUUID()};await this.store.write(this.file(d.id),d);return d;}
 async remove(id){await this.get(id);await fs.unlink(this.file(id));await fs.rm(path.join(this.root,id+'.bin'),{force:true});}
 async bootstrap(){if(!(await this.store.profile()).name?.trim())return;const marker=path.join(this.root,'.initialized');if(await fs.access(marker).then(()=>true,()=>false))return;if((await this.list()).length){await fs.writeFile(marker,'1');return;}for(const doc of ['resume','career']){const d=await this.store.document('common',doc);await this.save({title:'기존 공통 '+(doc==='resume'?'이력서':'경력기술서'),text:d.markdown,tags:'기존 문서,경력',kind:'seed'});}await fs.writeFile(marker,'1');}
}
export async function extractFile(filename,bytes){
 if(bytes.length>8*1024*1024)throw new AppError('파일은 8MB 이내로 올려 주세요.',413);
 const ext=path.extname(filename).toLowerCase();let text;
 if(['.txt','.md','.csv','.json','.tex'].includes(ext))text=bytes.toString('utf8');
 else if(ext==='.pdf'){const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:new Uint8Array(bytes)});try{text=(await parser.getText()).text;}finally{await parser.destroy();}}
 else if(ext==='.docx'){const mammoth=await import('mammoth');text=(await mammoth.extractRawText({buffer:bytes})).value;}
 else throw new AppError('TXT, Markdown, PDF, DOCX, CSV, JSON, TEX 파일을 지원합니다.');
 if(!text?.trim())throw new AppError('본문을 추출하지 못했습니다. 스캔 PDF는 내용을 직접 붙여 넣어 주세요.');
 if(text.length>250000)throw new AppError('추출한 본문이 25만 자를 넘습니다. 파일을 나눠 주세요.');return text;
}
