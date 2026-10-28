import path from 'node:path';
import {AppError} from './store.mjs';
export function previewPath(store,jobId,doc){if(!/^[a-f0-9-]{36}$/.test(jobId||''))throw new AppError('작업 ID를 확인해 주세요.');store.doc(doc);return path.join(store.root,'agent','previews',jobId+'-'+doc+'.json');}
export async function writePreview(store,jobId,{doc,markdown}){
 const file=previewPath(store,jobId,doc);const job=await store.json(path.join(store.root,'agent',jobId+'.json'),null);
 if(!job||job.status!=='running'||!job.docs.includes(doc))throw new AppError('현재 작업에서 수정 중인 문서만 미리 볼 수 있습니다.',409);
 if(typeof markdown!=='string'||markdown.length>250000)throw new AppError('미리보기 문서는 25만 자 이내로 작성해 주세요.');
 const preview={doc,markdown,updatedAt:new Date().toISOString()};await store.write(file,preview);return {doc,characters:markdown.length,preview:true};
}
export async function readPreviews(store,job){const previews={};for(const doc of job.docs||[]){const p=await store.json(previewPath(store,job.id,doc),null);if(p)previews[doc]=p;}return previews;}
