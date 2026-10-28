import {promises as fs} from 'node:fs';
import path from 'node:path';
export const sourceRoots=['lib','public','scripts','templates','agent','test','docs','.github'];
export const sourceFiles=['README.md','LICENSE','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','package.json','package-lock.json','requirements.txt','server.mjs','mcp.mjs','Start.command','Dockerfile','compose.yaml','compose.bind.yaml','.dockerignore','.gitignore','.env.example'];
export async function releaseFiles(root){
 const files=[];
 async function visit(relative){const stat=await fs.lstat(path.join(root,relative));if(stat.isSymbolicLink())throw new Error('Release cannot contain symbolic links: '+relative);if(stat.isDirectory()){for(const name of (await fs.readdir(path.join(root,relative))).sort()){if(['__pycache__','.DS_Store'].includes(name)||name.endsWith('.pyc'))continue;await visit(path.join(relative,name));}}else{if(/(^|\/)(data|node_modules|\.git|\.codex|\.claude|\.env)(\/|$)/.test(relative)||/\.(log|tmp)$/.test(relative))throw new Error('Unexpected runtime file: '+relative);files.push(relative);}}
 for(const name of [...sourceFiles,...sourceRoots])await visit(name);return files.sort();
}
export async function checkRelease(root){
 const files=await releaseFiles(root);
 const profile=JSON.parse(await fs.readFile(path.join(root,'templates/seed/common/profile.json'),'utf8'));
 if(Object.values(profile).some(Boolean))throw new Error('Starter profile must be blank');
 if((await fs.readdir(path.join(root,'templates/seed'))).some(name=>name!=='common'))throw new Error('Starter data must not contain companies or private records');
 for(const name of files){if(name.endsWith('.ttf'))continue;const text=await fs.readFile(path.join(root,name),'utf8');if(/\/Users\/[^/\s]+\//.test(text)||/\b(?:sk-proj-|sk-ant-api03-)[A-Za-z0-9_-]{30,}/.test(text)||/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(text))throw new Error('Machine-specific path or credential found: '+name);}
 for(const name of ['.gitignore','.dockerignore']){const text=await fs.readFile(path.join(root,name),'utf8');for(const entry of ['data','node_modules','.env'])if(!text.split('\n').some(line=>line===entry||line===entry+'/'))throw new Error(name+' must exclude '+entry);}
 return files;
}
