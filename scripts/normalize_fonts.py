"""One-time source-font name repair; requires fontTools only when regenerating fonts."""
from pathlib import Path
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parent.parent/'public/fonts'
for style in ['Regular','Bold']:
 path=root/f'NotoSansKR-{style}.ttf'
 font=TTFont(path)
 names={1:'Outline Noto KR',2:style,4:'Outline Noto KR '+style,6:'OutlineNotoKR-'+style,16:'Outline Noto KR',17:style}
 for record in list(font['name'].names):
  if record.nameID in names:
   font['name'].setName(names[record.nameID],record.nameID,record.platformID,record.platEncID,record.langID)
 font.save(path)
 print(style,'font names normalized')
