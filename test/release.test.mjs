import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceFiles,sourceRoots,releaseFiles,checkRelease} from '../scripts/release-files.mjs';
test('source release passes its privacy checks and preserves upstream notices',async()=>{const root=fileURLToPath(new URL('../',import.meta.url));const files=await checkRelease(root);assert.ok(files.includes('agent/hiring-panel/SKILL.md'));assert.ok(files.includes('LICENSE'));assert.ok(files.includes('public/fonts/OFL.txt'));assert.ok(files.every(file=>!file.startsWith('data/')&&!file.startsWith('node_modules/')&&!file.startsWith('.env/')));});
test('source allowlist excludes private runtime, backups, env and arbitrary root files, rejects source symlinks',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'outline-release-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));for(const file of sourceFiles)await fs.writeFile(path.join(root,file),'source');for(const dir of sourceRoots)await fs.mkdir(path.join(root,dir));for(const name of ['data','node_modules','backups','.codex']){await fs.mkdir(path.join(root,name));await fs.writeFile(path.join(root,name,'private.json'),'SYNTHETIC_PRIVATE_SENTINEL');}for(const file of ['.env','secret.txt','.ai-credentials.json'])await fs.writeFile(path.join(root,file),'SYNTHETIC_PRIVATE_SENTINEL');const files=await releaseFiles(root);assert.deepEqual(files,sourceFiles.slice().sort());await fs.symlink(path.join(root,'secret.txt'),path.join(root,'public/secret.txt'));await assert.rejects(()=>releaseFiles(root),/symbolic links/);});
