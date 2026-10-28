import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {Store} from './lib/store.mjs';
import {Knowledge} from './lib/knowledge.mjs';
import {writePreview} from './lib/agent-preview.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function createMcp(store,{jobId}={}){
 const knowledge=new Knowledge(store);const server=new McpServer({name:'outline',version:'1.0.0'});
 const register=(name,description,schema,fn)=>server.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async args=>{try{return {content:[{type:'text',text:JSON.stringify(await fn(args))}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
 register('list_sources','지원자 근거 자료 목록. 본문은 read_source로 읽는다.',{},async()=> (await knowledge.list()).map(({text,...s})=>({...s,characters:text.length})));
 register('search_sources','제목·태그·본문에서 자료 검색.',{query:z.string().min(1)},async({query})=>(await knowledge.list(query)).map(({text,...s})=>({...s,excerpt:text.slice(Math.max(0,text.toLowerCase().indexOf(query.toLowerCase())-100),Math.max(0,text.toLowerCase().indexOf(query.toLowerCase())-100)+800)})));
 register('read_source','자료 원문을 페이지로 읽는다. 끝까지 필요하면 offset을 증가시킨다.',{id:z.string(),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(30000).default(15000)},async({id,offset,limit})=>{const s=await knowledge.get(id);return {...s,text:s.text.slice(offset,offset+limit),total:s.text.length,nextOffset:offset+limit<s.text.length?offset+limit:null};});
 register('list_companies','지원 회사 목록 및 채용공고.',{},()=>store.companies());
 register('get_company','회사 지원 정보와 공고.',{id:z.string()},({id})=>store.company(id));
 register('read_document','현재 공통 또는 회사별 문서 및 섹션 ID.',{target:z.string().default('common'),doc:z.enum(['resume','career'])},({target,doc})=>store.document(target,doc));
 if(jobId)server.registerTool('preview_document',{description:'현재 작업 문서의 수정 중인 전체 Markdown을 문서 옆 화면에 즉시 표시한다. 한 섹션을 수정할 때마다 호출한다. 아직 수정하지 않은 섹션은 원문 그대로 포함한다. 저장본은 바꾸지 않는다.',inputSchema:{doc:z.enum(['resume','career']),markdown:z.string().max(250000)},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async input=>{try{return {content:[{type:'text',text:JSON.stringify(await writePreview(store,jobId,input))}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.dirname(fileURLToPath(import.meta.url));await createMcp(new Store(path.resolve(process.env.OUTLINE_DATA_DIR||process.env.RESUME_DATA_DIR||path.join(root,'data'))),{jobId:process.env.OUTLINE_JOB_ID||process.env.FOLIO_JOB_ID}).connect(new StdioServerTransport());}
