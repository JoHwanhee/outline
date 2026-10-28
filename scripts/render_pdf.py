"""Render the shared document AST into a deterministic, searchable Korean PDF."""
import sys, json, re, html
from pathlib import Path
from reportlab import rl_config
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak, HRFlowable, CondPageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

job=json.load(sys.stdin)
out=Path(sys.argv[1]); fonts=Path(sys.argv[2])
pdfmetrics.registerFont(TTFont('Resume',str(fonts/'NotoSansKR-Regular.ttf')))
pdfmetrics.registerFont(TTFont('ResumeBold',str(fonts/'NotoSansKR-Bold.ttf')))
pdfmetrics.registerFontFamily('Resume',normal='Resume',bold='ResumeBold',italic='Resume',boldItalic='ResumeBold')
s=job['style']; size=float(s['fontSize']); leading=size*float(s['lineHeight']); margin=float(s['margin'])*mm
ink=HexColor(s.get('ink','#252a30'));muted=HexColor('#666e77');rule=HexColor('#ccd1d7')
base=ParagraphStyle('base',fontName='Resume',fontSize=size,leading=leading,textColor=ink,spaceAfter=5,wordWrap='CJK',allowWidows=0,allowOrphans=0,splitLongWords=1)
styles={
 'h2':ParagraphStyle('h2',parent=base,fontName='ResumeBold',fontSize=15,leading=21,spaceBefore=16,spaceAfter=6,keepWithNext=True),
 'h3':ParagraphStyle('h3',parent=base,fontName='ResumeBold',fontSize=11.3,leading=17,spaceBefore=12,spaceAfter=5,keepWithNext=True),
 'h4':ParagraphStyle('h4',parent=base,fontName='ResumeBold',fontSize=size,leading=leading,spaceBefore=10,spaceAfter=4,keepWithNext=True),
 'small':ParagraphStyle('small',parent=base,fontSize=8.5,leading=13,textColor=muted,spaceAfter=4),
 'bullet':ParagraphStyle('bullet',parent=base,leftIndent=12,firstLineIndent=0,bulletIndent=0,bulletFontName='Resume',bulletFontSize=7,spaceAfter=3),
 'name':ParagraphStyle('name',parent=base,fontName='ResumeBold',fontSize=24,leading=32,spaceAfter=0),
 'label':ParagraphStyle('label',parent=base,fontSize=9,leading=14,textColor=muted,alignment=2),
 'company':ParagraphStyle('company',parent=base,fontName='ResumeBold',fontSize=13,leading=19,spaceAfter=0),
}
def inline(text):
 pattern=re.compile(r'(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?://[^\s<>]+)')
 pieces=[];pos=0
 for m in pattern.finditer(text):
  pieces.append(html.escape(text[pos:m.start()]));tok=m.group()
  if tok.startswith('**'): pieces.append('<b>'+html.escape(tok[2:-2])+'</b>')
  elif tok.startswith('`'): pieces.append(html.escape(tok[1:-1]))
  else:
   match=re.match(r'^\[([^\]]+)\]\(([^)]+)\)$',tok)
   label,url=(match.group(1),match.group(2)) if match else (tok,tok)
   if re.match(r'^(https?://|mailto:)',url,re.I):pieces.append('<link href="'+html.escape(url,quote=True)+'">'+html.escape(label)+'</link>')
   else:pieces.append(html.escape(label))
  pos=m.end()
 pieces.append(html.escape(text[pos:]));return ''.join(pieces)
def p(text,style=base):return Paragraph(inline(text),style)
width=A4[0]-2*margin
profile=job['profile'];story=[]
header=Table([[p(profile['name'],styles['name']),p(job['label'],styles['label'])]],colWidths=[width*.6,width*.4],hAlign='LEFT')
header.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'BOTTOM'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
story += [header,Spacer(1,9),p(f"[{profile['email']}](mailto:{profile['email']})  ·  {profile['phone']}  ·  [GitHub]({profile['github']})  ·  [Blog]({profile['blog']})",styles['small']),Spacer(1,10)]
for section_index,section in enumerate(job['sections']):
 if section_index and job.get('kind')=='career':story.append(PageBreak())
 if job.get('kind')=='resume' and section['blocks'] and section['blocks'][0]['type']=='employment':story.append(CondPageBreak(160))
 divider=HRFlowable(width='100%',thickness=.4,color=rule,spaceAfter=8)
 divider.keepWithNext=True
 story += [p(section['title'],styles['h2']),divider]
 for b in section['blocks']:
  typ=b['type']
  if typ=='paragraph':story.append(p(b['text']))
  elif typ=='heading':story.append(p(b['text'],styles['h3' if b['level']<=3 else 'h4']))
  elif typ in ('ul','ol'):
   for i,item in enumerate(b['items']):story.append(Paragraph(inline(item),styles['bullet'],bulletText='•' if typ=='ul' else f'{i+1}.'))
   story.append(Spacer(1,4))
  elif typ=='employment':
   t=Table([[p(b['name'],styles['company']),p(b['date'],styles['label'])]],colWidths=[width*.65,width*.35],hAlign='LEFT')
   t.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),2),('VALIGN',(0,0),(-1,-1),'BOTTOM')]))
   story += [CondPageBreak(105),Spacer(1,9),KeepTogether([t,p(b['detail'],styles['small'])])]
  elif typ=='code':story.append(p(b['text'].replace('\n',' ')))
  elif typ=='pagebreak':story.append(PageBreak())

def footer(canvas,doc):
 canvas.saveState();canvas.setFont('Resume',8);canvas.setFillColor(muted);canvas.drawRightString(A4[0]-margin,margin*.55,str(doc.page));canvas.restoreState()
class StableCanvas(Canvas):
 def __init__(self,*args,**kwargs):kwargs['invariant']=1;super().__init__(*args,**kwargs)
doc=SimpleDocTemplate(str(out),pagesize=A4,rightMargin=margin,leftMargin=margin,topMargin=margin,bottomMargin=margin,title=profile['name']+' · '+job['label'],author=profile['name'],allowSplitting=1,pageCompression=1)
doc.build(story,onFirstPage=footer,onLaterPages=footer,canvasmaker=StableCanvas)
print(json.dumps({'ok':True,'bytes':out.stat().st_size}))
