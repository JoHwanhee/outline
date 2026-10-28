import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {checkRelease} from './release-files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=await checkRelease(root);
const output=path.join(root,'dist/outline-source.zip');
const stage=await fs.mkdtemp(path.join(os.tmpdir(),'outline-release-'));
try{
 for(const file of files){const destination=path.join(stage,'outline',file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(root,file),destination);const stat=await fs.stat(path.join(root,file));await fs.chmod(destination,stat.mode&0o777);}
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.rm(output,{force:true});execFileSync('zip',['-qr',output,'outline'],{cwd:stage});console.log(`Created ${output} (${files.length} source files)`);
}finally{await fs.rm(stage,{recursive:true,force:true});}
