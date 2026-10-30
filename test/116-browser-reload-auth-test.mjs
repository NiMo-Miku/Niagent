// No Electron preload: authenticated ordinary-browser reload + real SSE/iframe.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createKernel } from '../src/kernel/kernel.js';

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-browser116-'));
const appRoot=path.join(dataDir,'application');fs.mkdirSync(appRoot);
fs.cpSync(path.join(path.resolve(import.meta.dirname,'..'),'ui'),path.join(appRoot,'ui'),{recursive:true});
for(const directory of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,directory));
const oldToken='ordinary-browser-old-116',newToken='ordinary-browser-rotated-116';
const key='qq-agent.console-session.v1';
const outboundRequests=[];let outbound=0;
const kernel=createKernel({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(dataDir,'absent-source')},headless:true,
  transport:{id:'fixture',start(){},stop(){},status:()=>({connected:true}),actions:{}},
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]})},
  fetchImpl:async()=>{outbound++;throw new Error('QA116 outbound networking disabled');}});
kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
kernel.config.update({server:{port:0,token:oldToken},telemetry:{enabled:false},api:{baseUrl:'http://127.0.0.1:9/v1',model:'synthetic-reload116'},allowAllWhenEmpty:true});
for(let i=0;i<2;i++){const session=kernel.sessions.create(`group:${11000+i}`);kernel.sessions.finish(session.id,'done');}
let browser;
try{
  const port=await kernel.start(),base=`http://127.0.0.1:${port}`;
  assert.notEqual(String(port),'15967');assert.deepEqual(kernel.loader.listEntries(),[]);
  const playwright=createRequire(import.meta.url)('playwright-core');
  const cache=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'ms-playwright');
  const versions=fs.readdirSync(cache).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)));
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??versions.map(version=>path.join(cache,version,'chrome-win64/chrome.exe')).find(file=>fs.existsSync(file));
  browser=await playwright.chromium.launch({executablePath,headless:true});
  const context=await browser.newContext(),page=await context.newPage(),requests=[],errors=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();outboundRequests.push(route.request().url());return route.abort();});
  page.on('request',request=>requests.push({url:request.url(),token:request.headers()['x-console-token']}));
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{if(window.top!==window){window.qa116Messages=[];window.addEventListener('message',event=>window.qa116Messages.push(JSON.stringify(event.data)));}});
  async function ready(target=page){await target.waitForFunction(()=>document.querySelectorAll('#nav button').length>0&&document.querySelector('#pause-btn')?.disabled===false&&document.querySelector('#status-dot')?.classList.contains('online'));}
  async function panelsDuring(action){const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/panels');await action();return response;}
  async function open(token){const response=await panelsDuring(()=>page.goto(`${base}/?token=${encodeURIComponent(token)}`));assert.equal(response.status(),200);await ready();}
  await open(oldToken);
  assert.equal(await page.evaluate(()=>typeof window.qqAgentShell),'undefined');
  assert.equal(new URL(page.url()).searchParams.has('token'),false);
  const navCount=await page.locator('#nav button').count();
  console.log('· URL credentials are removed, then ordinary-browser reload authenticates panels, status and SSE');
  const reloadResponse=await panelsDuring(()=>page.reload());
  assert.equal(reloadResponse.status(),200,'reload without a preload must not lose the credential');
  await ready();assert.equal(await page.locator('#nav button').count(),navCount);
  const frame=page.frameLocator('#panel-host iframe');
  await frame.locator('#list article[data-session]').nth(1).waitFor();
  assert.equal(await frame.locator('#list article[data-session]').count(),2);
  let record=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key);
  assert.equal(record.origin,base);assert.equal(record.token,oldToken);assert.ok(record.expiresAt>Date.now()&&record.expiresAt<=Date.now()+30*60*1000);
  assert.doesNotMatch(await page.evaluate(()=>JSON.stringify(localStorage)),/ordinary-browser-old-116/);
  const child=await frame.locator('body').evaluate(async()=>{
    let ownStorage,parentStorage;
    try{sessionStorage.getItem('qq-agent.console-session.v1');ownStorage='allowed';}catch(error){ownStorage=error.name;}
    try{parent.sessionStorage.getItem('qq-agent.console-session.v1');parentStorage='allowed';}catch(error){parentStorage=error.name;}
    let hostModuleBlocked=false;
    try{await import('/console-auth.js');}catch{hostModuleBlocked=true;}
    return{ownStorage,parentStorage,hostModuleBlocked,messages:window.qa116Messages};
  });
  assert.equal(child.ownStorage,'SecurityError');assert.equal(child.parentStorage,'SecurityError');assert.equal(child.hostModuleBlocked,true);
  assert.equal(await page.evaluate(async()=>{const auth=await import('/console-auth.js');return(await auth.createConsoleAuth(document.querySelector('#panel-host iframe').contentWindow)).token;}),'','the helper also rejects an actual child window');
  assert.doesNotMatch(JSON.stringify(child.messages),/ordinary-browser-old-116/);
  assert.doesNotMatch(await page.locator('#panel-host iframe').getAttribute('src'),/token|ordinary-browser/);
  for(const request of requests.filter(request=>new URL(request.url).pathname==='/api/events')){
    assert.equal(new URL(request.url).search,'');assert.equal(request.token,oldToken);
  }

  console.log('· Bare reload bootstraps the current token after rotation; explicit URL credentials retain priority');
  kernel.config.update({server:{token:newToken}});
  const revoked=await panelsDuring(()=>page.reload());assert.equal(revoked.status(),200);await ready();
  assert.equal(revoked.request().headers()['x-console-token'],newToken);
  assert.equal((await fetch(base+'/api/panels',{headers:{'x-console-token':oldToken}})).status,401,'the backend still rejects a revoked credential');
  assert.equal(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).token,key),newToken,'a bare page independently bootstraps the current local credential');
  await page.evaluate(({key,record})=>sessionStorage.setItem(key,JSON.stringify(record)),{key,record});
  const rotated=await panelsDuring(()=>page.goto(`${base}/?token=${newToken}&probe=116#sessions`));
  assert.equal(rotated.status(),200);await ready();
  assert.equal(rotated.request().headers()['x-console-token'],newToken);
  assert.equal(new URL(page.url()).search,'?probe=116');assert.equal(new URL(page.url()).hash,'#sessions');
  record=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key);assert.equal(record.token,newToken);
  assert.equal((await panelsDuring(()=>page.reload())).status(),200);await ready();
  assert.equal(await page.locator('#nav button').count(),navCount);

  console.log('· Explicit bad credentials never fall back; bare reload replaces expired or foreign-origin cache through bootstrap');
  const bootstrapBeforeBad=requests.filter(request=>new URL(request.url).pathname==='/api/console/bootstrap').length;
  let rejected=await panelsDuring(()=>page.goto(`${base}/?token=invalid-explicit-116`));
  assert.equal(rejected.status(),401);assert.equal(rejected.request().headers()['x-console-token'],'invalid-explicit-116');
  await page.locator('#panel-recovery').waitFor();
  assert.equal(requests.filter(request=>new URL(request.url).pathname==='/api/console/bootstrap').length,bootstrapBeforeBad,'an explicit invalid credential cannot silently bootstrap another credential');
  assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),key),null);
  await open(newToken);
  await page.evaluate(key=>{const record=JSON.parse(sessionStorage.getItem(key));record.origin='https://foreign.invalid';sessionStorage.setItem(key,JSON.stringify(record));},key);
  rejected=await panelsDuring(()=>page.reload());assert.equal(rejected.status(),200);await ready();assert.equal(rejected.request().headers()['x-console-token'],newToken);
  assert.equal(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).origin,key),base);
  await open(newToken);
  await page.evaluate(key=>{const record=JSON.parse(sessionStorage.getItem(key));record.expiresAt=Date.now()-1;sessionStorage.setItem(key,JSON.stringify(record));},key);
  assert.equal((await panelsDuring(()=>page.reload())).status(),200);await ready();
  assert.equal(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).token,key),newToken);

  console.log('· Closing the tab discards its session credential; a fresh bare tab bootstraps independently');
  await open(newToken);await page.close();
  const fresh=await context.newPage();
  const freshPanels=fresh.waitForResponse(response=>new URL(response.url()).pathname==='/api/panels');
  await fresh.goto(base);assert.equal((await freshPanels).status(),200);await ready(fresh);
  assert.equal(await fresh.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).token,key),newToken);
  assert.doesNotMatch(await fresh.evaluate(()=>JSON.stringify(localStorage)),/ordinary-browser-old-116|ordinary-browser-rotated-116/);
  assert.deepEqual(errors,[]);assert.deepEqual(outboundRequests,[]);assert.equal(outbound,0);
  console.log('✓ 116 Plain-browser authenticated reload/SSE, token rotation, expiry, origin/frame boundary and tab-close cleanup passed');
}finally{await browser?.close();await kernel.stop();assert.equal(path.dirname(path.resolve(dataDir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dataDir).startsWith('qqa-browser116-'));fs.rmSync(dataDir,{recursive:true,force:true});}
