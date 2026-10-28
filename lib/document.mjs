export const RENDERER_VERSION = '1.1.0';
export const DEFAULT_STYLE = { fontSize: 10, lineHeight: 1.65, margin: 20, ink: '#252a30', accent: '#252a30', muted: '#666e77', rule: '#ccd1d7', nameSize: 24, headingSize: 15, sectionSpacing: 16, headerLayout: 'split', showRules: true, showPageNumbers: true, careerPageBreaks: true };
export const STYLE_RANGES = {fontSize:[9,12],lineHeight:[1.3,2],margin:[12,28],nameSize:[18,32],headingSize:[11,20],sectionSpacing:[8,28]};
export function normalizeStyle(style={}) {
 const result={...DEFAULT_STYLE};
 for(const [key,[min,max]] of Object.entries(STYLE_RANGES)){const value=Number(style[key]);if(style[key]!=null&&Number.isFinite(value)&&value>=min&&value<=max)result[key]=value;}
 for(const key of ['ink','accent','muted','rule'])if(/^#[0-9a-f]{6}$/i.test(style[key]||''))result[key]=style[key];
 if(['split','stacked'].includes(style.headerLayout))result.headerLayout=style.headerLayout;
 for(const key of ['showRules','showPageNumbers','careerPageBreaks'])if(typeof style[key]==='boolean')result[key]=style[key];
 return result;
}
export const DOC_NAMES = { resume: '이력서', career: '경력기술서' };
export const normalize = s => String(s ?? '').replace(/\r\n?/g, '\n').trim();
export const slug = s => normalize(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
export const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const escapeTex = s => String(s).replace(/[\\&%$#_{}~^]/g, c => ({'\\':'\\textbackslash{}','&':'\\&','%':'\\%','$':'\\$','#':'\\#','_':'\\_','{':'\\{','}':'\\}','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]));

export function splitSections(markdown) {
  const lines = normalize(markdown).split('\n');
  const sections = []; let current = null, marker = null, intro = [];
  for (const line of lines) {
    const m = line.match(/^<!--\s*section:\s*([\p{L}\p{N}_-]+)\s*-->$/u);
    if (m) { marker = m[1]; continue; }
    const h = line.match(/^## (.+)$/);
    if (h) {
      if (current) sections.push({...current, body: normalize(current.lines.join('\n'))});
      current = {id: marker || slug(h[1]), title: h[1].trim(), lines: []}; marker = null;
    } else if (current) current.lines.push(line);
    else if (!/^# /.test(line)) intro.push(line);
  }
  if (current) sections.push({...current, body: normalize(current.lines.join('\n'))});
  if (normalize(intro.join('\n'))) sections.unshift({id:'intro',title:'소개',body:normalize(intro.join('\n'))});
  const seen = new Set();
  return sections.map(({lines, ...s}) => {
    if (seen.has(s.id)) throw new Error(`섹션 ID가 중복되었습니다: ${s.id}`);
    seen.add(s.id); return s;
  });
}
export function serializeSections(sections, name = '') {
  return `# ${name}\n\n` + sections.map(s => `<!-- section: ${s.id} -->\n## ${s.title}\n\n${s.body}`).join('\n\n') + '\n';
}
export function resolveVariant(baseMD, variant = {}) {
  const base = splitSections(baseMD), byId = new Map(base.map(s => [s.id,s]));
  const overrides = variant.overrides || {}, excluded = new Set(variant.excluded || []);
  const order = variant.order || base.map(s=>s.id);
  const ids = [...new Set([...order, ...base.map(s=>s.id), ...Object.keys(overrides)])];
  return ids.filter(id=>!excluded.has(id)).flatMap(id => {
    const b = byId.get(id), o = overrides[id];
    if (!b && !o) return [];
    const section = o ? {id,title:o.title,body:o.body} : b;
    return [{...section, custom:!!o, baseChanged:!!o && !!b && o.base !== JSON.stringify({title:b.title,body:b.body}), base:b || null}];
  });
}
export function deriveVariant(baseMD, editedMD, previous = {}) {
  const base = splitSections(baseMD), edited = splitSections(editedMD), byId = new Map(base.map(s=>[s.id,s]));
  const overrides = {};
  for (const s of edited) {
    const b = byId.get(s.id);
    if (!b || b.title !== s.title || b.body !== s.body) {
      const old = previous.overrides?.[s.id];
      const unchanged = old && old.title === s.title && old.body === s.body;
      overrides[s.id] = {title:s.title, body:s.body, base:unchanged ? old.base : b ? JSON.stringify({title:b.title,body:b.body}) : null};
    }
  }
  const editedIds = edited.map(s=>s.id), baseIds=base.map(s=>s.id);
  return {overrides, order:JSON.stringify(editedIds) === JSON.stringify(baseIds) ? null : editedIds, excluded:baseIds.filter(id=>!editedIds.includes(id))};
}

function safeURL(s) { return /^(https?:\/\/|mailto:)/i.test(s) ? s : ''; }
export function inline(text, format = 'html') {
  const esc = format === 'tex' ? escapeTex : escapeHTML;
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>]+)/g;
  let result='', end=0;
  for (const m of text.matchAll(pattern)) {
    result += esc(text.slice(end,m.index)); const token=m[0];
    if (token.startsWith('**')) result += format==='tex' ? `\\textbf{${esc(token.slice(2,-2))}}` : `<strong>${esc(token.slice(2,-2))}</strong>`;
    else if (token.startsWith('`')) result += format==='tex' ? `\\texttt{${esc(token.slice(1,-1))}}` : `<code>${esc(token.slice(1,-1))}</code>`;
    else {
      const linked=token.match(/^\[([^\]]+)\]\(([^)]+)\)$/), label=linked?.[1] || token, url=safeURL(linked?.[2] || token);
      if (!url) result += esc(label);
      else if (format==='tex') result += `\\href{${url.replace(/[{}\\]/g,'').replace(/%/g,'\\%').replace(/#/g,'\\#')}}{${esc(label)}}`;
      else result += `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    }
    end=m.index+token.length;
  }
  return result + esc(text.slice(end));
}
export function parseBlocks(body) {
  const lines=body.split('\n'); const blocks=[]; let para=[], list=null, code=null;
  const flush=()=>{if(para.length){blocks.push({type:'paragraph',text:para.join(' ')});para=[];} if(list){blocks.push(list);list=null;}};
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].trim();
    if(line.startsWith('```')) {flush();if(code){blocks.push({type:'code',text:code.join('\n')});code=null;}else code=[];continue;}
    if(code){code.push(lines[i]);continue;}
    if(line==='<!-- pagebreak -->'){flush();blocks.push({type:'pagebreak'});continue;}
    if(!line || /^---+$/.test(line)){flush();continue;}
    if(/^<!--.*-->$/.test(line))continue;
    const h=line.match(/^(#{1,6}) (.+)$/);
    if(h){flush();const next=lines.slice(i+1).find(s=>s.trim()); const date=next?.trim().replace(/^\*\*|\*\*$/g,'');
      if(h[2].includes('|') && /^\d{4}\.\d{2}\s*[–-]/.test(date||'')){
        const [name,...detail]=h[2].split('|'); blocks.push({type:'employment',name:name.trim(),detail:detail.join('|').trim(),date});
        while(i+1<lines.length && !lines[i+1].trim())i++; i++;
      }else blocks.push({type:'heading',level:h[1].length,text:h[2]});continue;}
    const ul=line.match(/^[-*] (.+)$/), ol=line.match(/^\d+[.)] (.+)$/);
    if(ul||ol){if(para.length){blocks.push({type:'paragraph',text:para.join(' ')});para=[];}const type=ul?'ul':'ol';if(list?.type!==type){if(list)blocks.push(list);list={type,items:[]};}list.items.push((ul||ol)[1]);continue;}
    if(list){blocks.push(list);list=null;} para.push(line);
  }
  flush();if(code)blocks.push({type:'code',text:code.join('\n')});return blocks;
}
function blocksHTML(body) {
  return parseBlocks(body).map(b=>{
    if(b.type==='paragraph')return `<p>${inline(b.text)}</p>`;
    if(b.type==='heading')return `<h${Math.min(4,b.level)}>${inline(b.text)}</h${Math.min(4,b.level)}>`;
    if(b.type==='employment')return `<div class="employment"><div><h3>${escapeHTML(b.name)}</h3><span>${escapeHTML(b.date)}</span></div><p>${escapeHTML(b.detail)}</p></div>`;
    if(b.type==='ul'||b.type==='ol')return `<${b.type}>${b.items.map(t=>`<li>${inline(t)}</li>`).join('')}</${b.type}>`;
    if(b.type==='code')return `<pre>${escapeHTML(b.text)}</pre>`;
    return '<div class="page-break"></div>';
  }).join('\n');
}
export function documentHTML(markdown, profile, label, style = DEFAULT_STYLE, fontBase = '/fonts/') {
  const css = documentCSS(style,fontBase);
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${escapeHTML(profile.name)} ${escapeHTML(label)}</title><style>${css}</style></head><body><article class="document${label.includes('경력기술서')?' document-career':''}"><header class="document-header"><div><h1>${escapeHTML(profile.name)}</h1><span class="document-label">${escapeHTML(label)}</span></div><p>${inline(`[${profile.email}](mailto:${profile.email})`)}<b>·</b>${escapeHTML(profile.phone)}<b>·</b>${inline(`[GitHub](${profile.github})`)}<b>·</b>${inline(`[Blog](${profile.blog})`)}</p></header>${splitSections(markdown).map(s=>`<section data-section="${escapeHTML(s.id)}"><h2>${inline(s.title)}</h2>${blocksHTML(s.body)}</section>`).join('\n')}</article></body></html>`;
}
export function documentCSS(style, fontBase) {
  const s=normalizeStyle(style);
  return `@font-face{font-family:Resume;src:url('${fontBase}NotoSansKR-Regular.ttf')}@font-face{font-family:Resume;src:url('${fontBase}NotoSansKR-Bold.ttf');font-weight:700}*{box-sizing:border-box}html{background:#fff}body{margin:0;color:${s.ink};font-family:Resume,sans-serif;font-size:${s.fontSize}pt;line-height:${s.lineHeight};word-break:keep-all;overflow-wrap:anywhere;-webkit-print-color-adjust:exact;print-color-adjust:exact}.document{width:210mm;min-height:297mm;padding:${s.margin}mm;margin:auto}.document-header{margin-bottom:22px}.document-header>div{display:flex;align-items:baseline;justify-content:space-between;gap:18px}.document-header h1{font-size:${s.nameSize}pt;letter-spacing:-1.1px;margin:0;font-weight:700}.document-label{font-size:9pt;color:${s.muted}}.document-header p{margin:10px 0 0;font-size:8.5pt;display:flex;align-items:center;flex-wrap:wrap;gap:12px}.document-header b{font-weight:400;color:#888}h2{font-size:${s.headingSize}pt;color:${s.accent};line-height:1.45;margin:${s.sectionSpacing}pt 0 12px;padding-bottom:6px;border-bottom:${s.showRules?'.5px solid '+s.rule:'0'};break-after:avoid;page-break-after:avoid}h3{font-size:11.3pt;line-height:1.5;margin:16px 0 7px;break-after:avoid}h4{font-size:10pt;margin:14px 0 6px;break-after:avoid}p{margin:0 0 7px;orphans:3;widows:3}ul,ol{padding-left:17px;margin:6px 0 12px}li{padding-left:1px;margin:0 0 4px;break-inside:avoid}li::marker{color:${s.muted};font-size:.8em}a{color:inherit;text-decoration:none}code,pre{font-family:monospace;font-size:.9em}pre{white-space:pre-wrap;padding:10px;background:#f4f4f4}.employment{margin:16px 0 9px;break-inside:avoid;break-after:avoid}.employment>div{display:flex;justify-content:space-between;align-items:baseline;gap:12px}.employment h3{font-size:13pt;margin:0}.employment span,.employment p{font-size:9pt;color:${s.muted}}.employment p{margin:3px 0}.page-break{break-before:page}strong{font-weight:700}@page{size:A4;margin:${s.margin}mm;@bottom-right{content:${s.showPageNumbers?'counter(page)':"''"};font-family:Arial,sans-serif;font-size:8pt;color:${s.muted}}}.document-header>div{${s.headerLayout==='stacked'?'flex-direction:column;align-items:flex-start;gap:6px':''}}@media print{.document-career section+section{break-before:${s.careerPageBreaks?'page':'auto'}}.document{width:auto;min-height:0;padding:0;margin:0}}`;
}
export function documentTex(markdown, profile, label, style = DEFAULT_STYLE) {
  const s=normalizeStyle(style), esc=escapeTex;
  const blocks = splitSections(markdown).map((section,index)=>(index&&s.careerPageBreaks&&label.includes('경력기술서')?'\\clearpage\n':'')+`\\section*{${inline(section.title,'tex')}}\n`+parseBlocks(section.body).map(b=>{
    if(b.type==='paragraph')return inline(b.text,'tex')+'\n';
    if(b.type==='heading')return `\\subsection*{${inline(b.text,'tex')}}`;
    if(b.type==='employment')return `\\resumeEmployment{${esc(b.name)}}{${esc(b.date)}}{${esc(b.detail)}}`;
    if(b.type==='ul'||b.type==='ol'){const env=b.type==='ul'?'itemize':'enumerate';return `\\begin{${env}}\n${b.items.map(t=>'\\item '+inline(t,'tex')).join('\n')}\n\\end{${env}}`;}
    if(b.type==='code')return '\\begin{verbatim}\n'+b.text+'\n\\end{verbatim}';
    return '\\clearpage';
  }).join('\n\n')).join('\n\n');
  return `% !TeX program = xelatex\n% Generated by Outline ${RENDERER_VERSION}. Edit the Markdown source.\n\\documentclass[a4paper,${s.fontSize>=11?11:10}pt]{article}
\\usepackage{kotex}
\\usepackage[left=${s.margin}mm,right=${s.margin}mm,top=${s.margin}mm,bottom=${s.margin}mm]{geometry}
\\usepackage{titlesec,enumitem,fancyhdr,tabularx,needspace,xcolor}
\\usepackage[hidelinks,unicode]{hyperref}
\\setsanshangulfont[Path=./fonts/,BoldFont=NotoSansKR-Bold.ttf]{NotoSansKR-Regular.ttf}
\\renewcommand{\\familydefault}{\\sfdefault}
\\definecolor{ink}{HTML}{${s.ink.replace('#','')}}
\\definecolor{muted}{HTML}{${s.muted.slice(1)}}
\\definecolor{accent}{HTML}{${s.accent.slice(1)}}
\\definecolor{rulegray}{HTML}{${s.rule.slice(1)}}
\\color{ink}\\raggedright\\raggedbottom
\\setlength{\\parindent}{0pt}\\setlength{\\parskip}{5pt}\\setlength{\\emergencystretch}{2em}
\\linespread{${(s.lineHeight/1.2).toFixed(3)}}
\\AtBeginDocument{\\fontsize{${s.fontSize}}{${(s.fontSize*1.2).toFixed(2)}}\\selectfont}
\\pagestyle{fancy}\\fancyhf{}${s.showPageNumbers?'\\fancyfoot[R]{\\small\\color{muted}\\thepage}':''}
\\renewcommand{\\headrulewidth}{0pt}\\setlength{\\headheight}{14pt}
\\titleformat{\\section}{\\fontsize{${s.headingSize}}{${s.headingSize*1.4}}\\selectfont\\bfseries\\color{accent}}{}{0em}{}${s.showRules?'[{\\color{rulegray}\\titlerule[.4pt]}]':''}
\\titlespacing*{\\section}{0pt}{${s.sectionSpacing}pt}{8pt}
\\titleformat{\\subsection}{\\fontsize{11}{15}\\selectfont\\bfseries}{}{0em}{}
\\setlist[itemize]{leftmargin=12pt,itemsep=3pt,topsep=3pt,parsep=0pt,label=\\textcolor{muted}{\\textbullet}}
\\newcommand{\\resumeEmployment}[3]{\\Needspace{6\\baselineskip}\\begin{tabularx}{\\textwidth}{@{}Xr@{}}{\\fontsize{13}{17}\\selectfont\\bfseries #1}&{\\small\\color{muted}#2}\\\\[3pt]\\multicolumn{2}{@{}l@{}}{{\\small\\color{muted}#3}}\\end{tabularx}\\par\\vspace{6pt}}
\\begin{document}
${s.headerLayout==='stacked'?`{\\fontsize{${s.nameSize}}{${s.nameSize*1.2}}\\selectfont\\bfseries ${esc(profile.name)}}\\par\\vspace{4pt}{\\small\\color{muted}${esc(label)}}`:`\\begin{tabularx}{\\textwidth}{@{}Xr@{}}{\\fontsize{${s.nameSize}}{${s.nameSize*1.2}}\\selectfont\\bfseries ${esc(profile.name)}}&{\\small\\color{muted}${esc(label)}}\\end{tabularx}`}
\\par\\vspace{9pt}{\\small ${inline(`[${profile.email}](mailto:${profile.email})`,'tex')}\\quad·\\quad${esc(profile.phone)}\\quad·\\quad${inline(`[GitHub](${profile.github})`,'tex')}\\quad·\\quad${inline(`[Blog](${profile.blog})`,'tex')}}\\par\\vspace{9pt}
${blocks}
\\end{document}\n`;
}
