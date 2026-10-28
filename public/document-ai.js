// Keeps in-progress AI text out of autosave while rendering it in the current document.
export function createDocumentAI({state,editor,setEditor,renderPreview,renderSections,updateConnection,updateHeading,savedStatus,zoom}){
 const controls=()=>['save-button','pdf-button','pdf-preview','export-more','history-button','panel-document','reset-all','sections-tab'].map(id=>document.getElementById(id)).filter(Boolean);
 const sync=()=>{editor.readOnly=!!state.aiPreview;controls().forEach(b=>b.disabled=!!state.aiPreview);document.getElementById('document-workspace')?.classList.toggle('ai-editing',!!state.aiPreview);};
 const matches=(target,doc)=>state.target===target&&state.doc===doc;
 function restore(){if(!state.aiPreview)return;state.aiPreview=null;sync();setEditor(state.current.markdown);renderPreview();if(state.view==='sections')renderSections();savedStatus();}
 function begin(job){if(!matches(job.target,job.docs.includes(state.doc)?state.doc:null)||state.dirty||job.baseVersions?.[state.doc]!==state.current?.version)return false;if(state.aiPreview?.jobId===job.id)return true;restore();state.aiPreview={jobId:job.id,target:job.target,doc:state.doc};sync();savedStatus('AI가 문서를 다듬는 중…',true);return true;}
 function preview(job){if(state.aiPreview?.jobId!==job.id&&!begin(job))return;const p=job.previews?.[state.doc];if(p&&typeof p.markdown==='string'&&editor.value!==p.markdown){setEditor(p.markdown);renderPreview();if(state.view==='sections')renderSections();savedStatus('AI 수정 내용 · 실시간 미리보기',true);}}
 function accept(result){if(!matches(result.target,result.doc))return false;if(state.dirty)return false;state.aiPreview=null;state.current=result;state.dirty=false;sync();setEditor(result.markdown);renderPreview();updateConnection();updateHeading();if(state.view==='sections')renderSections();savedStatus();return true;}
 return {begin,preview,restore,accept,resize:()=>zoom()};
}
