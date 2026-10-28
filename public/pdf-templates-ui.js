const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numbers=[['fontSize','본문 크기 (pt)',9,12,.5],['lineHeight','줄 간격',1.3,2,.05],['margin','페이지 여백 (mm)',12,28,1],['nameSize','이름 크기 (pt)',18,32,1],['headingSize','섹션 제목 크기 (pt)',11,20,1],['sectionSpacing','섹션 위 간격 (pt)',8,28,1]];
const colors=[['ink','본문 색상'],['accent','제목 색상'],['muted','보조 글자 색상'],['rule','구분선 색상']];
const flags=[['showRules','섹션 구분선'],['showPageNumbers','페이지 번호'],['careerPageBreaks','경력기술서의 섹션마다 새 페이지']];
export function initPdfTemplates({state,api,save,load,toast,documentHTML,normalizeStyle}){
 const $=s=>document.querySelector(s),area=$('#extra-workspace');
 let visible=false,catalog=null,selected=null,draft=null,baseline='',source=null,target='common',doc='resume',busy=false,previewTimer,generation=0;
 const dirty=()=>draft&&JSON.stringify(draft)!==baseline;
 const current=()=>catalog.templates.find(t=>t.id===selected);
 function working(value){busy=value;if(visible)area.querySelectorAll('input,select,button').forEach(el=>el.disabled=value);if(!value)updateStatus();}
 function choose(id){selected=id;const t=current();draft={name:t.name,style:{...t.style}};baseline=JSON.stringify(draft);}
 function hide(){visible=false;generation++;$('#pdf-templates-nav').classList.remove('selected');}
 for(const event of ['outline:document','outline:agent-view','outline:intro-page','outline:panel'])window.addEventListener(event,hide);
 async function fetchSource(){return api(`/api/document?target=${encodeURIComponent(target)}&doc=${doc}`);}
 async function open(){
  await save();const token=++generation;
  if(!dirty()){
   target=state.target;doc=state.doc;
   const [fresh,document]=await Promise.all([api('/api/pdf-templates'),fetchSource()]);
   if(token!==generation)return;catalog=fresh;source=document;choose(source.pdfTemplate.id);
  }
  if(token!==generation)return;
  window.dispatchEvent(new Event('outline:document-leaving'));window.dispatchEvent(new Event('outline:pdf-templates'));
  visible=true;$('#document-workspace').classList.add('hidden');area.classList.remove('hidden');$('#sidebar').classList.remove('open');
  document.querySelectorAll('.nav-item.selected,.company-nav.selected').forEach(n=>n.classList.remove('selected'));
  $('#pdf-templates-nav').classList.add('selected');$('#breadcrumb-current').textContent='PDF 템플릿';render();
 }
 function render(){
  if(!visible)return;
  area.innerHTML=`<div class="extra-heading"><div><div class="eyebrow">THE FORM OF YOUR EXPERIENCE</div><h1>PDF 템플릿</h1><p>내용은 그대로, 나다운 문서로. 서식을 고르고 직접 다듬으세요.</p></div><button class="secondary-button" data-template-back>문서로 돌아가기 ↗</button></div>
  <div class="pdf-template-library" role="group" aria-label="PDF 템플릿 목록">${catalog.templates.map(t=>`<button class="pdf-template-card${t.id===selected?' selected':''}" data-template-id="${esc(t.id)}" aria-pressed="${t.id===selected}"><span class="template-card-paper" style="--template-accent:${t.style.accent};--template-rule:${t.style.rule}"><b></b><i></i><strong></strong><i></i><i></i><strong></strong><i></i></span><span><strong>${esc(t.name)}</strong><small>${t.builtIn?'기본 템플릿':'내 템플릿'}${t.id===source.pdfTemplate.id?' · 현재 문서에 적용 중':''}</small></span></button>`).join('')}</div>
  <div class="pdf-template-editor"><section class="pdf-template-controls"><div class="template-control-heading"><h2>템플릿 편집</h2><span id="template-edit-status" aria-live="polite"></span></div>
  <form id="pdf-template-form"><label for="template-name">템플릿 이름</label><input id="template-name" name="name" maxlength="60" required value="${esc(draft.name)}">
  <div class="template-field-grid">${numbers.map(([key,label,min,max,step])=>`<div><label for="template-${key}">${label}</label><input id="template-${key}" name="${key}" type="number" min="${min}" max="${max}" step="${step}" required value="${draft.style[key]}"></div>`).join('')}</div>
  <div class="template-color-grid">${colors.map(([key,label])=>`<label for="template-${key}"><span>${label}</span><input id="template-${key}" name="${key}" type="color" value="${esc(draft.style[key])}"></label>`).join('')}</div>
  <label for="template-headerLayout">머리말 배치</label><select id="template-headerLayout" name="headerLayout"><option value="split" ${draft.style.headerLayout==='split'?'selected':''}>이름과 문서명 나란히</option><option value="stacked" ${draft.style.headerLayout==='stacked'?'selected':''}>이름 아래에 문서명</option></select>
  <div class="template-flags">${flags.map(([key,label])=>`<label><input name="${key}" type="checkbox" ${draft.style[key]?'checked':''}>${label}</label>`).join('')}</div>
  <p class="form-note">${current().builtIn?'기본 템플릿을 편집하면 내 템플릿으로 저장됩니다.':'이 템플릿을 사용하는 문서는 저장한 서식을 함께 적용합니다.'}</p>
  <div class="template-save-actions"><button class="primary-button" type="submit">${current().builtIn?'내 템플릿으로 저장':'템플릿 저장'}</button>${!current().builtIn?'<button class="secondary-button" type="button" data-template-copy>사본 저장</button>':''}<button class="text-button" type="button" data-template-reset>변경 취소</button></div></form>
  <div class="template-apply"><h3>문서에 적용</h3><label for="template-scope">적용 범위</label><select id="template-scope"><option value="document">미리보기의 문서에만</option><option value="all">모든 문서의 기본값으로 (개별 선택 초기화)</option></select><button class="primary-button" data-template-apply>이 템플릿 사용</button><p class="form-note">편집한 내용은 먼저 저장하세요. 문서 본문은 바뀌지 않습니다.</p></div>
  </section><section class="pdf-template-preview"><div class="template-preview-toolbar"><div class="template-source-selects"><label>미리볼 작업실<select id="template-target"><option value="common">공통 경력</option>${state.data.companies.map(c=>`<option value="${esc(c.id)}" ${c.id===target?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>문서<select id="template-doc"><option value="resume" ${doc==='resume'?'selected':''}>이력서</option><option value="career" ${doc==='career'?'selected':''}>경력기술서</option></select></label></div><div class="template-preview-actions"><button class="secondary-button" data-template-pdf>PDF 확인</button><a class="text-button hidden" id="template-download" download>PDF 다운로드 ↗</a></div></div>
  <div class="template-preview-canvas"><div id="template-sheet-holder"><iframe id="template-preview" title="PDF 템플릿 실시간 미리보기" sandbox="allow-same-origin"></iframe></div><iframe class="hidden" id="template-pdf-preview" title="PDF 템플릿 실제 PDF 미리보기"></iframe></div><div class="template-preview-footer"><span>실시간 미리보기 · 한글 글꼴 포함</span><span>PDF 확인으로 실제 페이지 나눔을 확인하세요</span></div></section></div>`;
  const library=$('.pdf-template-library'),card=library.querySelector('.selected');if(card)library.scrollLeft=Math.max(0,card.offsetLeft-12);
  updatePreview();if(busy)working(true);
 }
 function scalePreview(){if(!visible)return;const frame=$('#template-preview'),holder=$('#template-sheet-holder');if(!frame||!holder)return;const scale=Math.min(.9,Math.max(.2,($('.template-preview-canvas').clientWidth-36)/794));const height=Math.max(1123,frame.contentDocument?.documentElement?.scrollHeight||1123);frame.style.height=height+'px';frame.style.transform=`scale(${scale})`;holder.style.width=(794*scale)+'px';holder.style.height=(height*scale)+'px';}
 function updateStatus(){if(!visible)return;$('#template-edit-status').textContent=dirty()?'저장 전 변경사항':'저장된 서식';$('[data-template-apply]').disabled=!!dirty()||busy;}
 function updatePreview(){if(!visible)return;const frame=$('#template-preview');frame.srcdoc=documentHTML(source.markdown,source.profile,source.label,normalizeStyle(draft.style));frame.onload=()=>{scalePreview();frame.contentDocument?.fonts?.ready.then(scalePreview);};$('#template-sheet-holder').classList.remove('hidden');$('#template-pdf-preview').classList.add('hidden');$('#template-download').classList.add('hidden');scalePreview();updateStatus();}
 function readForm(){const f=$('#pdf-template-form');draft.name=f.elements.name.value;for(const [key]of numbers)draft.style[key]=Number(f.elements[key].value);for(const [key]of colors)draft.style[key]=f.elements[key].value;draft.style.headerLayout=f.elements.headerLayout.value;for(const [key]of flags)draft.style[key]=f.elements[key].checked;}
 async function saveTemplate(copy=false){if(!$('#pdf-template-form').reportValidity())return;readForm();const existing=current(),create=copy||existing.builtIn;const result=await api('/api/pdf-templates'+(create?'':'/'+selected),{method:create?'POST':'PUT',body:JSON.stringify({...draft,name:create&&draft.name===existing.name?draft.name+' 사본':draft.name,version:catalog.version})});catalog=result.catalog;source=await fetchSource();choose(result.template.id);render();toast('PDF 템플릿을 저장했습니다.');}
 async function refresh(){if(dirty()){toast('편집한 내용을 저장하거나 변경 취소한 뒤 다른 템플릿을 선택하세요.',true);return false;}catalog=await api('/api/pdf-templates');return true;}
 area.addEventListener('input',e=>{if(!visible||!e.target.closest('#pdf-template-form'))return;readForm();updateStatus();clearTimeout(previewTimer);previewTimer=setTimeout(updatePreview,160);});
 area.addEventListener('change',async e=>{if(!visible)return;try{if(e.target.closest('#pdf-template-form')){readForm();updatePreview();}if(['template-target','template-doc'].includes(e.target.id)){target=$('#template-target').value;doc=$('#template-doc').value;const token=++generation;const fresh=await fetchSource();if(!visible||token!==generation)return;source=fresh;updatePreview();}}catch(error){toast(error.message,true);}});
 area.addEventListener('submit',async e=>{if(!visible||e.target.id!=='pdf-template-form')return;e.preventDefault();if(busy)return;working(true);try{await saveTemplate();}catch(error){toast(error.message,true);}finally{working(false);}});
 area.addEventListener('click',async e=>{if(!visible||busy)return;const b=e.target.closest('button');if(!b||(b.closest('#pdf-template-form')&&b.type==='submit'))return;working(true);try{
  if(b.dataset.templateId){if(await refresh()){choose(b.dataset.templateId);render();}}
  if(b.hasAttribute('data-template-reset')){catalog=await api('/api/pdf-templates');choose(selected);render();}
  if(b.hasAttribute('data-template-copy'))await saveTemplate(true);
  if(b.hasAttribute('data-template-back'))await load(state.target,state.doc);
  if(b.hasAttribute('data-template-apply')){if(dirty())throw new Error('편집한 템플릿을 먼저 저장해 주세요.');await api('/api/pdf-templates/selection',{method:'PUT',body:JSON.stringify({id:selected,scope:$('#template-scope').value,target,doc,version:catalog.version})});state.data=await api('/api/state');await load(target,doc,{skipSave:true});toast('PDF 템플릿을 적용했습니다.');}
  if(b.hasAttribute('data-template-pdf')){if(!$('#pdf-template-form').reportValidity())return;const token=generation;b.textContent='PDF 만드는 중…';b.disabled=true;const result=await api('/api/pdf-templates/preview',{method:'POST',body:JSON.stringify({target,doc,version:source.version,style:draft.style})});if(!visible||token!==generation)return;$('#template-pdf-preview').src=result.url;$('#template-pdf-preview').classList.remove('hidden');$('#template-sheet-holder').classList.add('hidden');$('#template-download').href=result.url;$('#template-download').download=result.filename;$('#template-download').classList.remove('hidden');b.textContent='PDF 다시 확인';b.disabled=false;}
 }catch(error){toast(error.message,true);if(b.hasAttribute('data-template-pdf')){b.disabled=false;b.textContent='PDF 확인';}}finally{working(false);}});
 window.addEventListener('keydown',e=>{if(visible&&(e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();e.stopImmediatePropagation();if(!busy)$('#pdf-template-form').requestSubmit();}},{capture:true});
 window.addEventListener('resize',scalePreview);
 window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
 $('#pdf-templates-nav').onclick=()=>open().catch(e=>toast(e.message,true));$('#pdf-template-button').onclick=()=>open().catch(e=>toast(e.message,true));
 window.addEventListener('outline:pdf-template-open',()=>open().catch(e=>toast(e.message,true)));
 return {open};
}
