// Full production assembly, real model HTTP and Chromium: no mocked route bus.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';

const pending=[],calls=[];
const model=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  calls.push(body);const source=JSON.parse(body.messages.at(-1).content.split('\n').at(-1));
  pending.push({res,source});
});
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-memory100-')),token='memory100-console';
const appRoot=path.join(dataDir,'application'),sourceRoot=path.resolve(import.meta.dirname,'..');fs.mkdirSync(appRoot);
fs.writeFileSync(path.join(appRoot,'package.json'),'{"type":"module"}');
for(const folder of ['ui','src'])fs.cpSync(path.join(sourceRoot,folder),path.join(appRoot,folder),{recursive:true});
for(const folder of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,folder));
// The memory service imports llm.js and its shipped dialect provider. Keep the
// actual three-extension dependency closure; no installed extensions are read.
for(const id of ['llm-dialects','memory-service','memory-tools'])fs.cpSync(path.join(sourceRoot,'bundled',id),path.join(appRoot,'bundled',id),{recursive:true});
const modelOrigin=`http://127.0.0.1:${model.address().port}`;let outbound=0;const blocked=[];
const kernel=createKernel({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(dataDir,'absent')},headless:true,
  fetchImpl:async(input,options)=>{if(new URL(String(input)).origin===modelOrigin)return fetch(input,options);outbound++;throw Error('QA100 external traffic disabled');},
  transport:{id:'fixture',start(){},stop(){},status:()=>({connected:true}),actions:{}},priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})}});
kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
kernel.config.update({server:{port:0,token},telemetry:{enabled:false},proactive:{enabled:false},allow:{groups:['10001']},api:{baseUrl:modelOrigin+'/v1',model:'qa-memory'},memory:{useChatModel:true}});
kernel.memory.replaceMember('group:10001',{userId:'20001',name:'QA 小林',impressions:['旧印象甲','旧印象乙']});
kernel.memory.replaceMember('group:10001',{userId:'20002',name:'QA 小李',impressions:['保留印象甲','保留印象乙']});
const events=[];kernel.bus.on('memory.update',payload=>events.push(payload),{internal:true});
let port,browser;
async function request(method,url,body){const response=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{'x-console-token':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json()};}
async function waitUntil(check){for(let i=0;i<500;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Timed out waiting for real memory workflow');}
function finish({invalid=false}={}){const next=pending.shift();assert.ok(next,'the real model request is pending');next.res.setHeader('content-type','application/json');next.res.end(JSON.stringify({choices:[{message:{role:'assistant',content:invalid?'not-json':JSON.stringify({impressions:next.source.impressions.slice(0,1)})}}],usage:{prompt_tokens:12,completion_tokens:4,total_tokens:16}}));}
try{
  port=await kernel.start();
  assert.notEqual(port,15967);const entries=kernel.loader.listEntries();assert.deepEqual(entries.map(entry=>entry.id).sort(),['llm-dialects','memory-service','memory-tools']);assert.ok(entries.every(entry=>entry.status==='active'),JSON.stringify(entries));
  const playwright=createRequire(import.meta.url)('playwright-core'),cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
  const versions=fs.existsSync(cache)?fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))):[];
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??versions.map(version=>path.join(cache,version,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));
  browser=await playwright.chromium.launch({executablePath,headless:true});
  const errors=[];
  async function openMemory({suppressEvents=false}={}){
    const page=await browser.newPage({viewport:{width:1360,height:900}});page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{if(new URL(route.request().url()).origin===`http://127.0.0.1:${port}`)return route.continue();blocked.push(route.request().url());return route.abort();});
    if(suppressEvents)await page.route('**/api/events',route=>route.fulfill({status:200,contentType:'text/event-stream',body:'event: hello\ndata: {}\n\n'}));
    await page.goto(`http://127.0.0.1:${port}/?token=${token}`);await page.locator('#nav button[data-panel=memory]').click();
    const frame=page.frameLocator('#panel-host iframe');await frame.locator('#list strong').filter({hasText:'group:10001'}).click();await frame.locator('.member-cards article').first().waitFor();
    return{page,frame,member:uid=>frame.locator('.member-cards article').filter({hasText:`QQ ${uid}`})};
  }
  const first=await openMemory();
  console.log('· Actual route bus emits start/done and refreshes cards, counts and disabled controls');
  await first.member('20001').getByRole('button',{name:'重新整理'}).click();
  await waitUntil(()=>pending.length===1&&events.some(event=>event.phase==='consolidate-start'));
  assert.equal(await first.frame.getByRole('button',{name:'整理全部'}).isDisabled(),true);
  assert.equal(await first.member('20002').getByRole('button',{name:'重新整理'}).isDisabled(),true);
  let result=await request('POST','/api/memory-files/consolidate',{chatKey:'group:10001',userIds:['20002']});assert.equal(result.status,409);assert.equal(calls.length,1);
  await first.member('20001').getByRole('button',{name:'编辑备注'}).click();
  await first.frame.locator('dialog input[name=note]').fill('整理期间编辑草稿');
  finish();
  await first.frame.locator('.task-status').filter({hasText:'整理完成'}).waitFor();
  await waitUntil(async()=>await first.member('20001').locator('li').count()===1);
  assert.equal(await first.frame.locator('dialog input[name=note]').inputValue(),'整理期间编辑草稿');
  assert.equal(await first.frame.getByRole('button',{name:'整理全部'}).isDisabled(),false);
  assert.match(await first.frame.locator('#list').textContent(),/3 条印象/);
  result=await request('GET','/api/memory-files');assert.deepEqual(result.data.consolidating,[]);assert.equal(result.data.files[0].impressionCount,3);
  assert.ok(events.some(event=>event.phase==='consolidate-done'));
  await first.frame.locator('dialog').getByRole('button',{name:'取消',exact:true}).click();

  console.log('· Errors end the task, unlock controls and retain existing impressions');
  await first.member('20001').getByRole('button',{name:'重新整理'}).click();await waitUntil(()=>pending.length===1);finish({invalid:true});
  await first.frame.locator('.task-status').filter({hasText:'整理失败'}).waitFor();
  assert.equal(await first.member('20001').getByRole('button',{name:'重新整理'}).isDisabled(),false);
  assert.equal(kernel.memory.query('group:10001',{userId:'20001'})[0].impressions.length,1);
  assert.ok(events.some(event=>event.phase==='consolidate-error'));

  console.log('· Lost SSE terminal events recover through authoritative status polling without erasing a draft');
  const second=await openMemory({suppressEvents:true});
  await second.member('20002').getByRole('button',{name:'重新整理'}).click();await waitUntil(()=>pending.length===1);
  assert.equal(await second.frame.getByRole('button',{name:'整理全部'}).isDisabled(),true);
  await second.member('20002').getByRole('button',{name:'编辑印象'}).click();await second.frame.locator('dialog textarea').fill('掉线期间的编辑草稿');
  finish();
  await second.frame.locator('.task-status').filter({hasText:'整理任务已结束'}).waitFor();
  await waitUntil(async()=>await second.member('20002').locator('li').count()===1);
  assert.equal(await second.frame.locator('dialog textarea').inputValue(),'掉线期间的编辑草稿');
  assert.equal(await second.frame.getByRole('button',{name:'整理全部'}).isDisabled(),false);
  const terminalText=await second.frame.locator('.task-status').textContent();await second.page.waitForTimeout(1200);assert.equal(await second.frame.locator('.task-status').textContent(),terminalText,'elapsed ticker stops after completion');

  console.log('· SDK memory tool writes also notify the live memory panel');
  const eventCount=events.length,args={category:'memberImpression',userId:'20001',target:'QA 小林',content:'SDK 写入的最新印象'},execCtx={chatKey:'group:10001',cfg:kernel.config.get()};
  result=await kernel.registry.invoke('memory_append',args,{execCtx});assert.equal(result.ok,true);assert.ok(events.length>eventCount);
  await first.member('20001').filter({hasText:'SDK 写入的最新印象'}).waitFor();
  const afterWrite=events.length;await kernel.registry.invoke('memory_append',args,{execCtx});assert.equal(events.length,afterWrite,'deduplicated writes do not announce a change');
  assert.deepEqual(errors,[]);assert.equal(outbound,0);assert.deepEqual(blocked,[]);console.log('✓ 100 production memory live-state workflow passed');
}finally{
  for(const next of pending)next.res.destroy();
  await browser?.close();await kernel.stop();model.closeAllConnections();await new Promise(resolve=>model.close(resolve));const target=path.resolve(dataDir);assert.equal(path.dirname(target).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(target).startsWith('qqa-memory100-'));fs.rmSync(target,{recursive:true,force:true});
}
