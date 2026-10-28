// Runs against fictional data on a temporary local server; never opens the user's workspace.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {seed} from '../test/fixtures.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'outline-template-ui-'));
const store=await seed(temp);await store.createCompany({name:'예시 회사'});
const portServer=createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
const base=`http://127.0.0.1:${port}`,artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',OUTLINE_DATA_DIR:temp,OUTLINE_NO_LISTEN:'0',RESUME_NO_LISTEN:'0',OUTLINE_CONTAINER:'0'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1550,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('#markdown-editor').value.includes('테스트용 개발자'));
 const original=await page.getByLabel('Markdown 문서 편집').inputValue();
 await page.getByRole('button',{name:'PDF 템플릿 선택',exact:true}).click();await page.getByRole('heading',{name:'PDF 템플릿',exact:true}).waitFor();
 await page.locator('[data-template-id="modern"]').click();
 await page.getByLabel('템플릿 이름',{exact:true}).fill('나의 포트폴리오');await page.getByLabel('이름 크기 (pt)',{exact:true}).fill('29');
 assert.equal(await page.getByRole('button',{name:'이 템플릿 사용',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'내 템플릿으로 저장',exact:true}).click();await page.getByRole('button',{name:'템플릿 저장',exact:true}).waitFor();
 await page.getByRole('button',{name:'PDF 확인',exact:true}).click();await page.locator('#template-download').waitFor({state:'visible'});
 const pdf=await page.request.get(base+await page.locator('#template-download').getAttribute('href'));assert.equal((await pdf.body()).subarray(0,5).toString(),'%PDF-');
 await page.getByLabel('페이지 여백 (mm)',{exact:true}).fill('19');await page.keyboard.press(process.platform==='darwin'?'Meta+s':'Control+s');await page.waitForFunction(()=>document.querySelector('#template-edit-status')?.textContent==='저장된 서식');
 assert.ok(await page.locator('input[name=showRules]').evaluate(el=>el.getBoundingClientRect().width<25));
 await page.waitForFunction(()=>!document.querySelector('.toast'));
 await page.screenshot({path:path.join(artifacts,'pdf-templates-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'이 템플릿 사용',exact:true}).click();await page.getByRole('heading',{name:'공통 경력',exact:true}).waitFor({state:'visible'});
 assert.equal(await page.getByLabel('Markdown 문서 편집').inputValue(),original);
 assert.equal(await page.locator('#pdf-template-label').innerText(),'나의 포트폴리오');
 const selected=await (await page.request.get(base+'/api/document?target=common&doc=resume')).json();assert.equal(selected.style.nameSize,29);assert.equal(selected.style.margin,19);
 await page.getByRole('button',{name:'PDF 템플릿 선택',exact:true}).click();await page.locator('[data-template-id="compact"]').click();
 await page.locator('#template-scope').selectOption('all');await page.getByRole('button',{name:'이 템플릿 사용',exact:true}).click();await page.getByRole('heading',{name:'공통 경력',exact:true}).waitFor({state:'visible'});
 const state=await (await page.request.get(base+'/api/state')).json();const company=await (await page.request.get(base+`/api/document?target=${encodeURIComponent(state.companies[0].id)}&doc=career`)).json();assert.equal(company.pdfTemplate.id,'compact');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'PDF 템플릿 선택',exact:true}).click();await page.getByRole('heading',{name:'PDF 템플릿',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const card=await page.locator('.pdf-template-card.selected').boundingBox();assert.ok(card.x>=0&&card.x+card.width<=390);
 await page.waitForFunction(()=>!document.querySelector('.toast'));
 await page.screenshot({path:path.join(artifacts,'pdf-templates-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'문서로 돌아가기 ↗',exact:true}).click();await page.getByRole('heading',{name:'공통 경력',exact:true}).waitFor({state:'visible'});
 assert.deepEqual(errors,[]);console.log('PDF template UI passed: selection, custom editing, PDF preview, scoped/global application, source preservation and mobile layout.');
}catch(error){console.error(logs);throw error;}
finally{await browser?.close();child.kill('SIGTERM');await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));await fs.rm(temp,{recursive:true,force:true});}
