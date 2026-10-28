import {createRequire} from 'node:module';
import path from 'node:path';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);
const provider=process.argv[2],args=process.argv.slice(3);let bin,argv;
if(provider==='claude'){const platform=process.platform,arch=process.arch;if(!['linux','darwin','win32'].includes(platform))throw new Error('Unsupported platform');let metadata;try{metadata=require.resolve(`@anthropic-ai/claude-agent-sdk-${platform}-${arch}/package.json`);}catch{throw new Error('SDK native binary is missing. Run npm ci without --omit=optional.');}bin=path.join(path.dirname(metadata),platform==='win32'?'claude.exe':'claude');argv=args;}
else if(provider==='codex'){bin=process.execPath;argv=[require.resolve('@openai/codex/bin/codex.js'),...args];}
else throw new Error('Choose codex or claude');
const child=spawn(bin,argv,{stdio:'inherit',env:process.env});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
