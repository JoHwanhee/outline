import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.mjs';
import { exportDocument } from '../lib/export.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const store=await seed(process.env.OUTLINE_DATA_DIR||process.env.RESUME_DATA_DIR||path.join(root,'data'));
await store.materializeAll();
console.log('공통 문서와 모든 회사의 LaTeX가 갱신되었습니다.');
if(process.argv.includes('--pdf'))for(const target of ['common',...(await store.companies()).map(c=>c.id)])for(const doc of ['resume','career']){
 const d=await store.document(target,doc);const output=await exportDocument(store,target,doc,'pdf',d.version);console.log(`${target}/${doc} PDF 생성: ${output.hash.slice(0,12)}`);
}
