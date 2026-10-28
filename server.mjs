import {PdfTemplates,validateTemplateStyle} from './lib/pdf-templates.mjs';
import http from 'node:http';
import { promises as fs, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './scripts/seed.mjs';
import { AppError } from './lib/store.mjs';
import {Knowledge,extractFile} from './lib/knowledge.mjs';
import {importURL} from './lib/import-url.mjs';
import {Agent} from './lib/agent.mjs';
import {Panel} from './lib/panel.mjs';
import {Providers,sumUsage} from './lib/providers.mjs';
import {IntroPage} from './lib/intro-page.mjs';
import {Setup} from './lib/setup.mjs';
import { engines, exportDocument } from './lib/export.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const dataRoot=path.resolve(process.env.OUTLINE_DATA_DIR||process.env.RESUME_DATA_DIR||path.join(root,'data'));
const store=await seed(dataRoot);await store.materializeAll();
const introPage=new IntroPage(store);
const pdfTemplates=new PdfTemplates(store);
const knowledge=new Knowledge(store);await knowledge.bootstrap();
export const providers=new Providers(store);
const setup=new Setup(store,knowledge,providers);
export const agent=new Agent(store,knowledge,{providers,runMutation:fn=>exclusive(fn),onChange:()=>changed()});await agent.init();
export const panel=new Panel(store,{providers});await panel.init();
const clients=new Set();let mutation=Promise.resolve();
const exclusive=fn=>{const task=mutation.then(fn);mutation=task.catch(()=>{});return task;};
const changed=()=>{for(const c of clients)c.write('event: change\ndata: {}\n\n');};
const port=Number(process.env.PORT||4317);
const host=process.env.HOST||'127.0.0.1';
const allowedOrigins=new Set((process.env.OUTLINE_ORIGINS||`http://127.0.0.1:${port},http://localhost:${port}`).split(',').map(s=>s.trim()).filter(Boolean));
const allowedHosts=new Set(['127.0.0.1','localhost','[::1]',...Array.from(allowedOrigins,s=>new URL(s).hostname)]);
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req,limit=500000){let text='';for await(const b of req){text+=b;if(text.length>limit)throw new AppError('요청이 너무 큽니다.',413);}try{return JSON.parse(text||'{}');}catch{throw new AppError('입력 형식을 확인해 주세요.');}}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.ttf':'font/ttf','.svg':'image/svg+xml','.pdf':'application/pdf','.md':'text/markdown; charset=utf-8','.tex':'application/x-tex; charset=utf-8','.zip':'application/zip'};
async function serveFile(res,file,extra={}){const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':path.extname(file)==='.ttf'?'public, max-age=86400':'no-cache',...extra});res.end(bytes);}
export async function requestHandler(req,res){
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port),p=url.pathname;
  let requestHost;try{requestHost=new URL('http://'+req.headers.host).hostname;}catch{}
  if(!allowedHosts.has(requestHost))throw new AppError('로컬 주소로 접속해 주세요.',403);
  if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))throw new AppError('다른 사이트의 요청은 허용하지 않습니다.',403);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(p==='/healthz'&&req.method==='GET')return json(res,{status:'ok',app:'outline'});
  if(p==='/api/setup'&&req.method==='GET')return json(res,await setup.status());
  if(p==='/api/setup'&&req.method==='POST'){const b=await body(req,1100000);const result=await exclusive(()=>setup.complete(b));changed();return json(res,result,201);}
  if(p==='/api/events'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);const heartbeat=setInterval(()=>res.write(': ping\n\n'),20000);req.on('close',()=>{clients.delete(res);clearInterval(heartbeat);});return;
  }
  if(p==='/api/sources'&&req.method==='GET')return json(res,(await knowledge.list(url.searchParams.get('q')||'')).map(({text,...s})=>({...s,characters:text.length})));
  if(p==='/api/sources'&&req.method==='POST'){const b=await body(req);const d=await exclusive(()=>knowledge.save(b));return json(res,d,201);}
  if(p==='/api/sources/upload'&&req.method==='POST'){const parts=[];let size=0;for await(const b of req){size+=b.length;if(size>8*1024*1024)throw new AppError('파일은 8MB 이내로 올려 주세요.',413);parts.push(b);}const filename=url.searchParams.get('filename')||'';const text=await extractFile(filename,Buffer.concat(parts));const saved=await exclusive(async()=>{const s=await knowledge.save({title:filename,text,filename,kind:'file',tags:''});await fs.writeFile(path.join(knowledge.root,s.id+'.bin'),Buffer.concat(parts));return s;});return json(res,saved,201);}
  if(p==='/api/import-url'&&req.method==='POST'){const b=await body(req);return json(res,await importURL(b.url));}
  const sourceFile=p.match(/^\/api\/sources\/([a-f0-9-]{36})\/file$/);if(sourceFile&&req.method==='GET'){const s=await knowledge.get(sourceFile[1]);const bytes=await fs.readFile(path.join(knowledge.root,s.id+'.bin'));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(s.filename)}`});return res.end(bytes);}
  const sourceMatch=p.match(/^\/api\/sources\/([a-f0-9-]{36})$/);
  if(sourceMatch){const id=sourceMatch[1];if(req.method==='GET')return json(res,await knowledge.get(id));if(req.method==='PUT'){const b=await body(req);return json(res,await exclusive(()=>knowledge.save(b,id)));}if(req.method==='DELETE'){await exclusive(()=>knowledge.remove(id));return json(res,{ok:true});}}
  if(p==='/api/ai/settings'&&req.method==='GET')return json(res,await providers.public());
  if(p==='/api/ai/settings'&&req.method==='PUT'){const b=await body(req);return json(res,await exclusive(()=>providers.save(b)));}
  if(p==='/api/ai/models'&&req.method==='GET')return json(res,await providers.models(url.searchParams.get('provider')||'codex',{refresh:url.searchParams.get('refresh')==='1'}));
  if(p==='/api/ai/usage'&&req.method==='GET'){const all=[...(await agent.list()),...(await panel.list())];const groups={};for(const job of all){const key=(job.sdkProvider||'codex')+':'+(job.model||'default');(groups[key]??=[]).push(job.usage);}return json(res,{total:sumUsage(all.map(j=>j.usage)),groups:Object.entries(groups).map(([key,values])=>({key,...sumUsage(values)}))});}
  if(p==='/api/agent/status'&&req.method==='GET')return json(res,await agent.status());
  if(p==='/api/agent/jobs'&&req.method==='GET')return json(res,(await agent.list()).map(({baseVersions,sourceVersions,...j})=>j));
  if(p==='/api/agent/jobs'&&req.method==='POST'){const b=await body(req);return json(res,await exclusive(()=>agent.start(b)),202);}
  const jobMatch=p.match(/^\/api\/agent\/jobs\/([a-f0-9-]{36})(?:\/(cancel|apply|discard|revert))?$/);
  if(jobMatch){const [,id,action]=jobMatch;if(!action&&req.method==='GET')return json(res,await agent.detail(id));if(req.method==='POST'){const b=await body(req);if(action==='cancel')return json(res,await agent.cancel(id));if(action==='apply'){const d=await exclusive(()=>agent.apply(id,b.draftId));changed();return json(res,d);}if(action==='revert'){const d=await exclusive(()=>agent.revert(id,b.draftId));changed();return json(res,d);}if(action==='discard')return json(res,await exclusive(()=>agent.discard(id,b.draftId)));}}
  if(p==='/api/panels'&&req.method==='GET')return json(res,(await panel.list(url.searchParams.get('target'),url.searchParams.get('doc'))).map(({originalMarkdown,profileHeader,result,reviewers,afterScreen,...j})=>({...j,reviewerCount:reviewers.length,beforeVerdict:reviewers[0]?.verdict,afterVerdict:afterScreen?.verdict})));
  if(p==='/api/panels'&&req.method==='POST'){const b=await body(req);return json(res,await exclusive(()=>panel.start(b)),202);}
  const panelFile=p.match(/^\/api\/panels\/([a-f0-9-]{36})\/files\/(PANEL\.md|RESUME-IMPROVED\.md)$/);
  if(panelFile&&req.method==='GET'){const bytes=await panel.artifact(panelFile[1],panelFile[2]);res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="${panelFile[2]}"`,'Cache-Control':'no-store'});return res.end(bytes);}
  const panelMatch=p.match(/^\/api\/panels\/([a-f0-9-]{36})(?:\/(cancel|apply|revert))?$/);
  if(panelMatch){const [,id,action]=panelMatch;if(!action&&req.method==='GET')return json(res,await panel.get(id));if(req.method==='POST'){if(action==='cancel')return json(res,await panel.cancel(id));if(action==='revert'){const d=await exclusive(()=>panel.revert(id));changed();return json(res,d);}if(action==='apply'){const d=await exclusive(()=>panel.apply(id));changed();return json(res,d);}}}
  if(p==='/api/intro-page'&&req.method==='GET')return json(res,await introPage.info());
  if(p==='/api/intro-page/generate'&&req.method==='POST'){const b=await body(req);return json(res,await exclusive(()=>introPage.generate(b)),201);}
  if(['/api/intro-page/preview','/api/intro-page/download'].includes(p)&&req.method==='GET'){const artifact=await introPage.artifact();res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",...(p.endsWith('/download')?{'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`}:{})});return res.end(artifact.html);}
  if(p==='/api/pdf-templates'&&req.method==='GET')return json(res,await pdfTemplates.catalog());
  if(p==='/api/pdf-templates'&&req.method==='POST'){const b=await body(req);const result=await exclusive(()=>pdfTemplates.save(b));changed();return json(res,result,201);}
  if(p==='/api/pdf-templates/selection'&&req.method==='PUT'){const b=await body(req);const result=await exclusive(()=>pdfTemplates.select(b));changed();return json(res,result);}
  if(p==='/api/pdf-templates/preview'&&req.method==='POST'){const b=await body(req),style=validateTemplateStyle(b.style);return json(res,await exportDocument(store,b.target||'common',b.doc||'resume','pdf',b.version,'native',{style,preview:true}));}
  const templateMatch=p.match(/^\/api\/pdf-templates\/([a-f0-9-]{36})$/);
  if(templateMatch&&req.method==='PUT'){const b=await body(req);const result=await exclusive(()=>pdfTemplates.save(b,templateMatch[1]));changed();return json(res,result);}
  if(p==='/api/state'&&req.method==='GET')return json(res,{app:'outline',setup:await setup.status(),runtime:{container:process.env.OUTLINE_CONTAINER==='1'},profile:await store.profile(),settings:await store.settings(),companies:await store.companies(),engines:Object.fromEntries(Object.entries(await engines()).map(([k,v])=>[k,!!v])),dataRoot});
  if(p==='/api/document'&&req.method==='GET')return json(res,await store.document(url.searchParams.get('target')||'common',url.searchParams.get('doc')||'resume'));
  if(p==='/api/document'&&req.method==='PUT'){const b=await body(req);const result=await exclusive(()=>store.save(b.target,b.doc,b.markdown,b.version));changed();return json(res,result);}
  if(p==='/api/company'&&req.method==='POST'){const b=await body(req);const c=await exclusive(()=>store.createCompany(b));changed();return json(res,c,201);}
  if(p.startsWith('/api/company/')&&req.method==='PATCH'){const b=await body(req);const c=await exclusive(()=>store.updateCompany(decodeURIComponent(p.slice('/api/company/'.length)),b));changed();return json(res,c);}
  if(p==='/api/reset'&&req.method==='POST'){const b=await body(req);const result=await exclusive(()=>store.reset(b.target,b.doc,b.sectionId,b.version));changed();return json(res,result);}
  if(p==='/api/history'&&req.method==='GET'){const target=url.searchParams.get('target'),doc=url.searchParams.get('doc'),id=url.searchParams.get('id');return json(res,id?await store.historyEntry(target,doc,id):await store.history(target,doc));}
  if(p==='/api/restore'&&req.method==='POST'){const b=await body(req);const result=await exclusive(async()=>{const h=await store.historyEntry(b.target,b.doc,b.id);return store.save(b.target,b.doc,h.markdown,b.version);});changed();return json(res,result);}
  if(p==='/api/settings'&&req.method==='PUT'){const b=await body(req);const result=await exclusive(()=>store.saveSettings(b));changed();return json(res,result);}
  if(p==='/api/export'&&req.method==='POST'){const b=await body(req);return json(res,await exportDocument(store,b.target,b.doc,b.format,b.version,b.engine));}
  const download=p.match(/^\/api\/download\/([a-f0-9]{64})\/document\.(pdf|md|tex|zip)$/);
  if(download&&req.method==='GET')return await serveFile(res,path.join(dataRoot,'builds',download[1],`document.${download[2]}`),{'Content-Disposition':`inline; filename="document.${download[2]}"`});
  if(p==='/renderer.mjs')return await serveFile(res,path.join(root,'lib/document.mjs'));
  if(p.startsWith('/api/'))throw new AppError('요청한 기능을 찾을 수 없습니다.',404);
  if(req.method!=='GET'&&req.method!=='HEAD')throw new AppError('허용되지 않는 요청입니다.',405);
  const asset=path.resolve(root,'public',p==='/'?'index.html':'.'+decodeURIComponent(p));
  if(!asset.startsWith(path.join(root,'public')+path.sep))throw new AppError('잘못된 경로입니다.',403);
  return await serveFile(res,asset);
 }catch(e){if(res.headersSent){res.end();return;}json(res,{error:e.code==='ENOENT'?'파일을 찾을 수 없습니다.':e.message,...(e.details||{})},e.status||(e.code==='ENOENT'?404:500));}
}
export const server=http.createServer(requestHandler);
let debounce;
if(process.env.OUTLINE_NO_LISTEN !== '1' && process.env.RESUME_NO_LISTEN !== '1'){

const watcher=watch(path.join(dataRoot,'common'),(_event,name)=>{if(!name||!(/\.md$|profile\.json$/.test(String(name))))return;clearTimeout(debounce);debounce=setTimeout(()=>exclusive(()=>store.materializeAll()).then(changed).catch(e=>console.error('문서 갱신:',e.message)),450);});
server.on('error',e=>{console.error(e.code==='EPERM'?'로컬 서버 실행 권한이 없습니다. 터미널에서 Start.command를 실행해 주세요.':e.message);watcher.close();process.exitCode=1;});
server.listen(port,host,()=>console.log(`Outline: http://127.0.0.1:${port}\nData: ${dataRoot}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{watcher.close();agent.active?.abort.abort(new Error('서버가 종료됐습니다.'));panel.active?.abort.abort(new Error('서버가 종료됐습니다.'));for(const c of clients)c.end();server.close(()=>process.exit(0));});

}
