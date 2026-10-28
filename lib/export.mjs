import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash, AppError } from './store.mjs';
import { documentTex, documentHTML, splitSections, parseBlocks, RENDERER_VERSION, DOC_NAMES } from './document.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=(bin,args,{cwd,input,timeout=90000}={})=>new Promise((resolve,reject)=>{
  const child=spawn(bin,args,{cwd,stdio:['pipe','pipe','pipe']});let output='',errors='',done=false;
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('PDF 생성 시간이 초과됐습니다.'));},timeout);
  function finish(err){if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(output);}
  child.on('error',finish);child.stdout.on('data',b=>{output=(output+b).slice(-30000);});child.stderr.on('data',b=>{errors=(errors+b).slice(-16000);});
  child.on('close',code=>finish(code===0?null:new Error(errors||output||`${path.basename(bin)} 실행 실패 (${code})`)));
  child.stdin.on('error',()=>{});child.stdin.end(input||'');
});
let engineCache;
export async function engines(){
 if(engineCache)return engineCache;
 const result={native:null,tectonic:null,xelatex:null};
 for(const bin of [process.env.OUTLINE_PYTHON,process.env.RESUME_PYTHON,path.join(root,'.venv/bin/python'),path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'),'python3'].filter(Boolean)){
  try{await run(bin,['-c','import reportlab;print(reportlab.Version)'],{timeout:6000});result.native=bin;break;}catch{}
 }
 for(const kind of ['tectonic','xelatex'])for(const bin of [process.env[kind==='tectonic'?'TECTONIC_PATH':'XELATEX_PATH'],kind,`/opt/homebrew/bin/${kind}`,`/Library/TeX/texbin/${kind}`].filter(Boolean)){
  try{await run(bin,['--version'],{timeout:5000});result[kind]=bin;break;}catch{}
 }
 engineCache=result;return result;
}
const pending=new Map();
export async function exportDocument(store,target,doc,format,version,chosenEngine){
 if(!['md','tex','pdf','zip'].includes(format))throw new AppError('지원하지 않는 출력 형식입니다.');
 const d=await store.document(target,doc);if(version&&version!==d.version)throw new AppError('출력 전에 최신 문서를 저장해 주세요.',409);
 const settings=await store.settings(),engine=chosenEngine||settings.pdfEngine||'native';
 const key=hash(JSON.stringify({version:RENDERER_VERSION,markdown:d.markdown,profile:d.profile,label:d.label,style:d.style,engine}));
 if(!['native','tectonic','xelatex'].includes(engine))throw new AppError('지원하지 않는 PDF 출력 방식입니다.');
 const folder=path.join(store.root,'builds',key);await fs.mkdir(folder,{recursive:true});
 const destination=path.join(folder,'document.'+format);
 const job=async()=>{
  await store.write(path.join(folder,'document.md'),d.markdown);
  await store.write(path.join(folder,'document.tex'),documentTex(d.markdown,d.profile,d.label,d.style));
  await fs.mkdir(path.join(folder,'fonts'),{recursive:true});
  for(const f of ['NotoSansKR-Regular.ttf','NotoSansKR-Bold.ttf','OFL.txt'])await fs.copyFile(path.join(root,'public/fonts',f),path.join(folder,'fonts',f));
  await store.write(path.join(folder,'document.html'),documentHTML(d.markdown,d.profile,d.label,d.style,'./fonts/'));
  if(format==='pdf' && !(await fs.access(destination).then(()=>true,()=>false))){
   const bins=await engines();if(!bins[engine])throw new AppError(engine==='native'?'PDF 출력 모듈이 없습니다. README의 설치 명령을 실행해 주세요.':'선택한 LaTeX 컴파일러가 없습니다. 출력 설정에서 기본 PDF를 선택해 주세요.',503);
   if(engine==='native'){
    const job={kind:doc,profile:d.profile,label:d.label,style:d.style,sections:splitSections(d.markdown).map(s=>({...s,blocks:parseBlocks(s.body)}))};
    await run(bins.native,[path.join(root,'scripts/render_pdf.py'),path.join(folder,'document.pdf'),path.join(root,'public/fonts')],{input:JSON.stringify(job)});
   } else if(engine==='tectonic')await run(bins.tectonic,['--keep-logs','--outdir',folder,path.join(folder,'document.tex')],{cwd:folder});
   else {await run(bins.xelatex,['-no-shell-escape','-interaction=nonstopmode','-halt-on-error','document.tex'],{cwd:folder});await run(bins.xelatex,['-no-shell-escape','-interaction=nonstopmode','-halt-on-error','document.tex'],{cwd:folder});}
   const bytes=await fs.readFile(destination);if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new AppError('PDF 생성 결과를 확인하지 못했습니다.',500);
   const latest=target==='common'?path.join(store.root,'common'):path.join(store.root,'companies',target);
   await fs.copyFile(destination,path.join(latest,DOC_NAMES[doc]+'.pdf'));
  }
  if(format==='zip')await run('zip',['-q','-r','document.zip','document.md','document.tex','document.html','fonts'],{cwd:folder});
 };
 const lock=key+':'+format;
 if(!pending.has(lock))pending.set(lock,job().finally(()=>pending.delete(lock)));
 await pending.get(lock);
 return {url:`/api/download/${key}/document.${format}`,filename:`${d.profile.name}_${target==='common'?'공통':d.company.name}_${DOC_NAMES[doc]}.${format}`,hash:key,engine,version:d.version};
}
