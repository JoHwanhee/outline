import https from 'node:https';
import http from 'node:http';
import {lookup} from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import {parseHTML} from 'linkedom';
import {AppError} from './store.mjs';
export function publicAddress(address){try{return ipaddr.process(address).range()==='unicast';}catch{return false;}}
export async function importURL(value,redirects=0){
 let url;try{url=new URL(value);}catch{throw new AppError('올바른 링크를 입력해 주세요.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port))throw new AppError('공개 HTTP/HTTPS 링크만 가져올 수 있습니다.');
 const hostname=url.hostname.replace(/^\[|\]$/g,'');const addresses=await lookup(hostname,{all:true});if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw new AppError('로컬·사설 네트워크 링크는 가져올 수 없습니다.');
 const pinned=addresses[0];
 const result=await new Promise((resolve,reject)=>{const req=(url.protocol==='https:'?https:http).get(url,{lookup:(_host,opts,cb)=>opts?.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family),headers:{'User-Agent':'Outline/1.0','Accept':'text/html,text/plain','Accept-Encoding':'identity'},signal:AbortSignal.timeout(15000)},res=>{if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}if(res.statusCode!==200){res.resume();reject(new AppError('링크를 가져오지 못했습니다. 공고 본문을 붙여 넣어 주세요.'));return;}if(!/text\/html|text\/plain|application\/xhtml/.test(res.headers['content-type']||'')){res.resume();reject(new AppError('웹 페이지 링크를 넣거나 파일로 올려 주세요.'));return;}let size=0;const parts=[];res.on('data',b=>{size+=b.length;if(size>2*1024*1024){res.destroy(new AppError('페이지가 너무 큽니다. 본문을 붙여 넣어 주세요.'));return;}parts.push(b);});res.on('error',reject);res.on('end',()=>resolve({html:Buffer.concat(parts).toString('utf8'),type:res.headers['content-type']}));});req.on('error',reject);});
 if(result.redirect){if(redirects>=3)throw new AppError('리디렉션이 너무 많습니다. 본문을 붙여 넣어 주세요.');return importURL(new URL(result.redirect,url).href,redirects+1);}
 if(result.type.includes('text/plain'))return {title:hostname,text:result.html.slice(0,250000),url:url.href};
 const {document}=parseHTML(result.html);const title=document.querySelector('title')?.textContent?.trim()||hostname;document.querySelectorAll('script,style,nav,footer,header,noscript,svg').forEach(n=>n.remove());document.querySelectorAll('p,div,li,h1,h2,h3,h4,br,section,tr').forEach(n=>n.append('\n'));const text=(document.querySelector('main,article')||document.body)?.textContent?.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim().slice(0,250000);if(!text||text.length<50)throw new AppError('본문을 읽지 못했습니다. 로그인이나 동적 페이지일 수 있으니 내용을 붙여 넣어 주세요.');return {title:title.slice(0,200),text,url:url.href};
}
