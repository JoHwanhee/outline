import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { DEFAULT_STYLE } from '../lib/document.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function seed(dataRoot=path.join(root,'data')) {
 const store=new Store(dataRoot);
 for(const d of ['common','companies','history','builds'])await fs.mkdir(path.join(dataRoot,d),{recursive:true});
 if(await fs.access(path.join(dataRoot,'common','profile.json')).then(()=>true,()=>false))return store;
 await fs.cp(path.join(root,'templates/seed/common'),path.join(dataRoot,'common'),{recursive:true});
 await store.write(path.join(dataRoot,'settings.json'),{style:DEFAULT_STYLE,pdfEngine:'native'});
 await store.write(path.join(dataRoot,'setup.json'),{version:1,completed:false});
 await store.materializeAll();return store;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await seed(process.env.OUTLINE_DATA_DIR||process.env.RESUME_DATA_DIR||path.join(root,'data'));console.log('Outline 작업실이 준비되었습니다. 첫 실행 설정을 완료해 주세요.');}
