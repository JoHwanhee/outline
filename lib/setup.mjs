import path from 'node:path';
import {z} from 'zod';
import {AppError} from './store.mjs';
import {splitSections,serializeSections} from './document.mjs';
const field=z.string().max(300).default('');
const input=z.object({profile:z.object({name:z.string().trim().min(1,'이름을 입력해 주세요.').max(80),email:field,phone:field,github:field,blog:field}),targetRole:z.string().max(150).default(''),resume:z.string().max(250000).default(''),career:z.string().max(250000).default(''),sourceId:z.string().uuid().optional(),ai:z.object({provider:z.enum(['codex','claude']),authMode:z.enum(['login','apiKey']),apiKey:z.string().max(2000).default(''),model:z.string().max(150).default('')}).optional()});
export class Setup {
 constructor(store,knowledge,providers){this.store=store;this.knowledge=knowledge;this.providers=providers;this.file=path.join(store.root,'setup.json');}
 async status(){const saved=await this.store.json(this.file,null),profile=await this.store.profile();const completed=saved?saved.completed&&!!profile.name?.trim():!!profile.name?.trim();return {required:!completed,completed:!!completed,version:1,targetRole:saved?.targetRole||'',container:process.env.OUTLINE_CONTAINER==='1',profile};}
 async complete(value){if(!(await this.status()).required)throw new AppError('이미 초기 설정을 완료한 작업실입니다. 프로필과 AI 연결 설정에서 수정해 주세요.',409);let data;try{data=input.parse(value);}catch(e){throw new AppError(e.issues?.[0]?.message||'설정 내용을 확인해 주세요.');}
 for(const k of ['github','blog'])if(data.profile[k]){let url;try{url=new URL(data.profile[k]);}catch{}if(!url||!['https:','http:'].includes(url.protocol))throw new AppError('GitHub와 블로그에는 HTTP/HTTPS 주소를 입력해 주세요.');}
 let source=null;if(data.sourceId){source=await this.knowledge.get(data.sourceId);data.resume=source.text;}
 const normalize=(text,kind)=>{if(!text.trim())return serializeSections([{id:kind==='resume'?'소개':'프로젝트',title:kind==='resume'?'소개':'경력과 프로젝트',body:''},...(kind==='resume'?[{id:'경력',title:'경력',body:''},{id:'기술',title:'기술',body:''}]:[])],data.profile.name);let sections;try{sections=splitSections(text);}catch(e){throw new AppError(e.message);}if(!sections.length)sections=[{id:'소개',title:kind==='resume'?'소개':'경력과 프로젝트',body:text.trim()}];return serializeSections(sections,data.profile.name);};
 const resume=normalize(data.resume,'resume'),career=normalize(data.career,'career');
 if(data.ai){if(data.ai.authMode==='apiKey'&&!data.ai.apiKey&&!(await this.providers.key(data.ai.provider)))throw new AppError('API 키를 입력하거나 AI 연결을 나중으로 선택해 주세요.');await this.providers.save({defaultProvider:data.ai.provider,providers:{[data.ai.provider]:{authMode:data.ai.authMode,apiKey:data.ai.apiKey,model:data.ai.model}}});}
 await this.store.write(path.join(this.store.root,'common/profile.json'),data.profile);await this.store.write(this.store.commonPath('resume'),resume);await this.store.write(this.store.commonPath('career'),career);await this.store.materializeAll();
 if(data.resume.trim()&&!source)await this.knowledge.save({title:'가져온 이력서',text:data.resume,tags:'이력서,원문',kind:'import'});if(data.career.trim())await this.knowledge.save({title:'가져온 경력기술서',text:data.career,tags:'경력,원문',kind:'import'});
 await this.store.write(path.join(this.knowledge.root,'.initialized'),'1');
 await this.store.write(this.file,{version:1,completed:true,completedAt:new Date().toISOString(),targetRole:data.targetRole});return this.status();
 }
}
