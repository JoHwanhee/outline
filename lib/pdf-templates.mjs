import path from 'node:path';
import crypto from 'node:crypto';
import {DEFAULT_STYLE,STYLE_RANGES,normalizeStyle} from './document.mjs';
import {AppError,hash} from './store.mjs';

export function validateTemplateStyle(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('템플릿 서식을 확인해 주세요.');
 for(const [key,[min,max]] of Object.entries(STYLE_RANGES))if(key in input&&(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<min||input[key]>max))throw new AppError(`${key}: ${min}~${max} 범위의 숫자를 입력해 주세요.`);
 for(const key of ['ink','accent','muted','rule'])if(key in input&&(typeof input[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(input[key])))throw new AppError('색상은 #RRGGBB 형식으로 입력해 주세요.');
 if('headerLayout'in input&&!['split','stacked'].includes(input.headerLayout))throw new AppError('머리말 배치를 확인해 주세요.');
 for(const key of ['showRules','showPageNumbers','careerPageBreaks'])if(key in input&&typeof input[key]!=='boolean')throw new AppError('템플릿 표시 설정을 확인해 주세요.');
 return normalizeStyle(input);
}
export class PdfTemplates {
 constructor(store){this.store=store;this.file=path.join(store.root,'pdf-templates.json');}
 async catalog(){
  const data=await this.store.json(this.file,{templates:[],defaultTemplateId:'current',assignments:{}}),settings=await this.store.settings();
  const builtins=[
   {id:'current',name:'기존 서식',description:'현재 작업실의 출력 설정을 그대로 사용합니다.',style:normalizeStyle(settings.style)},
   {id:'classic',name:'클래식',description:'차분한 제목과 구분선이 있는 기본 레이아웃.',style:normalizeStyle(DEFAULT_STYLE)},
   {id:'modern',name:'모던',description:'넓은 머리말과 초록색 제목으로 경력을 강조합니다.',style:normalizeStyle({accent:'#2d6857',rule:'#c9ddd5',headerLayout:'stacked',nameSize:28,headingSize:16,sectionSpacing:20})},
   {id:'compact',name:'컴팩트',description:'간결한 간격과 작은 제목으로 내용을 촘촘하게.',style:normalizeStyle({fontSize:9,lineHeight:1.4,margin:16,nameSize:21,headingSize:12,sectionSpacing:10,showRules:false,careerPageBreaks:false})},
  ].map(t=>({...t,builtIn:true}));
  return {...data,templates:[...builtins,...data.templates],version:hash(JSON.stringify({data,current:builtins[0].style}))};
 }
 async resolve(target,doc){const c=await this.catalog(),id=c.assignments[target+':'+doc]||c.defaultTemplateId;return c.templates.find(t=>t.id===id)||c.templates[0];}
 checkVersion(catalog,version){if(version!==catalog.version)throw new AppError('다른 창에서 템플릿이 변경됐습니다. 목록을 새로고침한 뒤 다시 저장해 주세요.',409);}
 async persist(c){await this.store.write(this.file,{templates:c.templates.filter(t=>!t.builtIn),defaultTemplateId:c.defaultTemplateId,assignments:c.assignments});return this.catalog();}
 async save({name,style,version},id=null){
  const c=await this.catalog();this.checkVersion(c,version);
  if(typeof name!=='string'||!name.trim()||name.trim().length>60)throw new AppError('템플릿 이름은 1~60자로 입력해 주세요.');
  const template={id:id||crypto.randomUUID(),name:name.trim(),style:validateTemplateStyle(style),builtIn:false};
  if(id){const index=c.templates.findIndex(t=>t.id===id);if(index<0)throw new AppError('템플릿을 찾을 수 없습니다.',404);if(c.templates[index].builtIn)throw new AppError('기본 템플릿은 사본으로 저장해 주세요.');c.templates[index]=template;}else c.templates.push(template);
  return {template,catalog:await this.persist(c)};
 }
 async select({id,scope='document',target='common',doc='resume',version}){
  const c=await this.catalog();this.checkVersion(c,version);
  if(!c.templates.some(t=>t.id===id))throw new AppError('템플릿을 찾을 수 없습니다.',404);
  if(scope==='all'){c.defaultTemplateId=id;c.assignments={};}
  else if(scope==='document'){this.store.id(target);this.store.doc(doc);if(target!=='common')await this.store.company(target);c.assignments[target+':'+doc]=id;}
  else throw new AppError('템플릿 적용 범위를 확인해 주세요.');
  return this.persist(c);
 }
}
