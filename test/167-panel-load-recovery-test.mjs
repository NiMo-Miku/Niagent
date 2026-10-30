// Only a synthetic temporary kernel on a system-assigned port is reachable.
// The current user's console, processes, credentials and data are never opened.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createKernel} from '../src/kernel/kernel.js';
import {isSettingsSaveRequest} from './settings-save-observation.mjs';
import {CONSOLE_SESSION_KEY,CONSOLE_SESSION_TTL_MS} from '../ui/shell/console-auth.js';

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'qqa-panel-recovery167-'));
const appRoot=path.join(dataDir,'application'),sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
fs.mkdirSync(appRoot);fs.cpSync(path.join(sourceRoot,'ui'),path.join(appRoot,'ui'),{recursive:true});
for(const name of ['bundled','plugins','skills'])fs.mkdirSync(path.join(appRoot,name));
const validToken='synthetic-valid-console167',wrongToken='synthetic-wrong-console167';
const errors=[],requests=[],configWrites=[],outboundRequests=[],releases=new Set();
let outbound=0,browser,base;
const kernel=createKernel({appRoot,env:{QQ_AGENT_DATA_DIR:dataDir,QQ_AGENT_PORT:'0',QQ_AGENT_MIGRATE_FROM:path.join(dataDir,'absent-migration-source')},headless:true,
  transport:{id:'inert167',start(){},stop(){},status:()=>({connected:false}),actions:{listGroups:async()=>[],listFriends:async()=>[]}},
  priceUpdates: { refresh: async () => ({ok:true}), updateCheck: async () => ({ok:true,current:'0.5.0',latest:'0.5.0',hasUpdate:false}) },communityMarket:{syncGlobalBlocklist:async()=>({ok:true,ids:[]}),getBlocklist:()=>({ok:true,ids:[]}),listAccounts:()=>({ok:true,accounts:[]})},
  fetchImpl:async()=>{outbound++;throw new Error('QA167 outbound networking disabled');}});
kernel.log.setLevel('error');kernel.loader.startWatchers=()=>{};
kernel.config.update({server:{port:0,token:validToken},telemetry:{enabled:false},proactive:{enabled:false},ui:{refreshMs:15000},api:{baseUrl:'http://127.0.0.1:9/v1',model:'synthetic-recovery167'},allowAllWhenEmpty:true});
const seed=kernel.sessions.create('group:167');kernel.sessions.finish(seed.id,'done');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,message,timeout=7000){const deadline=Date.now()+timeout;do{if(await predicate())return;await delay(15);}while(Date.now()<deadline);assert.fail(message);}
async function saveShot(page,name){if(!process.env.QA_SCREENSHOT_DIR)return;const directory=path.resolve(process.env.QA_SCREENSHOT_DIR);fs.mkdirSync(directory,{recursive:true});await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await page.screenshot({path:path.join(directory,`panel-recovery-167-${name}.png`),fullPage:true,animations:'disabled'});}
function gate(){let release;const promise=new Promise(resolve=>{release=resolve;});releases.add(release);return{promise,release(){releases.delete(release);release();}};}
function chromiumExecutable(playwright){
  if(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const roots=[path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'ms-playwright'),path.join(os.homedir(),'.cache','ms-playwright'),path.join(os.homedir(),'Library','Caches','ms-playwright')];
  for(const root of roots){let versions;try{versions=fs.readdirSync(root).filter(name=>/^chromium-\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)));}catch{continue;}
    for(const version of versions)for(const relative of ['chrome-win64/chrome.exe','chrome-win/chrome.exe','chrome-linux64/chrome','chrome-linux/chrome','chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium','chrome-mac/Chromium.app/Contents/MacOS/Chromium']){const candidate=path.join(root,version,relative);if(fs.existsSync(candidate))return candidate;}}
  const candidate=playwright.chromium.executablePath();assert.ok(fs.existsSync(candidate),'Use installed Chromium; never download a browser');return candidate;
}
async function newContext({session=false,panels}={}){
  const context=await browser.newContext({viewport:{width:1360,height:900},reducedMotion:'reduce'});
  await context.route('**/*',route=>{if(route.request().url().startsWith(base))return route.continue();outboundRequests.push(route.request().url());return route.abort();});
  // These original scenarios deliberately exercise the manual fallback. Local
  // automatic bootstrap is covered independently by 182, with the same backend.
  await context.route('**/api/console/bootstrap',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'QA167 automatic bootstrap denied'})}));
  await context.addInitScript(({origin,key,token,ttl,session})=>{
    if(window.top===window&&location.origin===origin&&session)sessionStorage.setItem(key,JSON.stringify({version:1,origin,token,expiresAt:Date.now()+ttl}));
    if(window.top!==window){window.qa167Messages=[];window.addEventListener('message',event=>window.qa167Messages.push(JSON.stringify(event.data)));}
  },{origin:base,key:CONSOLE_SESSION_KEY,token:validToken,ttl:CONSOLE_SESSION_TTL_MS,session});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{requests.push({url:request.url(),method:request.method(),token:request.headers()['x-console-token']});if(isSettingsSaveRequest(request))configWrites.push(request.postData());});
  if(panels)await page.route('**/api/panels',panels);
  return{context,page};
}
async function sessionRecord(page){return page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'null'),CONSOLE_SESSION_KEY);}
async function authenticated(page){
  await page.waitForFunction(()=>document.querySelectorAll('#nav button[data-panel]').length===9&&document.querySelector('#panel-host iframe')&&document.querySelector('#status-dot')?.classList.contains('online'));
  await page.frameLocator('#panel-host iframe').locator(`#list article[data-session="${seed.id}"]`).waitFor();
  assert.equal(await page.locator('#panel-recovery').count(),0);
  const record=await sessionRecord(page);assert.equal(record.token,validToken);assert.equal(record.origin,base);
  assert.ok(record.expiresAt>Date.now()&&record.expiresAt<=Date.now()+CONSOLE_SESSION_TTL_MS,'recovery preserves the existing 30-minute session policy');
  assert.doesNotMatch(await page.evaluate(()=>JSON.stringify(localStorage)),/synthetic-(valid|wrong)-console167/);
  assert.equal(new URL(page.url()).searchParams.has('token'),false);
  assert.doesNotMatch(await page.locator('#panel-host iframe').getAttribute('src'),/token|console167/);
  assert.doesNotMatch(await page.frameLocator('#panel-host iframe').locator('body').evaluate(()=>JSON.stringify(window.qa167Messages)),/synthetic-(valid|wrong)-console167/);
}
async function authenticationCard(page){
  await page.locator('#panel-recovery-title').filter({hasText:'控制台认证已失效，请重新连接'}).waitFor();
  assert.equal(await page.locator('#nav button[data-panel]').count(),0);
  assert.equal(await page.getByLabel('控制台访问令牌',{exact:true}).getAttribute('type'),'password');
  assert.equal(await page.locator('#panel-host iframe').count(),0);
  assert.doesNotMatch(await page.locator('#panel-host').innerText(),/暂无已注册面板/);
}
async function submitCredential(page,value){await page.getByLabel('控制台访问令牌',{exact:true}).fill(value);await page.getByRole('button',{name:'重新连接',exact:true}).click();}

try{
  base=`http://127.0.0.1:${await kernel.start()}`;
  assert.deepEqual(kernel.loader.listEntries(),[],'no installed or bundled extension code enters this isolated application root');
  assert.notEqual(new URL(base).port,'15967','this test never opens the current user console');
  const disk=()=>fs.readFileSync(path.join(dataDir,'config.json'),'utf8'),initialConfig=disk();
  const playwright=createRequire(import.meta.url)('playwright-core');browser=await playwright.chromium.launch({executablePath:chromiumExecutable(playwright),headless:process.env.QA_HEADLESS!=='0'});

  console.log('· Missing credentials show an explicit reconnect card; failed candidates remain editable and uncommitted');
  let heldCandidate=null;
  const missing=await newContext({panels:async route=>{
    if(!heldCandidate||route.request().headers()['x-console-token']!==heldCandidate.token)return route.continue();
    const response=await route.fetch();heldCandidate.status=response.status();heldCandidate.ready=true;
    await heldCandidate.wait.promise;
    // A hostile error body must never echo the candidate into visible feedback.
    if(response.status()===401)return route.fulfill({response,json:{error:`Untrusted peer echoed ${wrongToken}`}});
    return route.fulfill({response});
  }}),page=missing.page;
  await page.goto(base);await authenticationCard(page);assert.equal(await sessionRecord(page),null);
  assert.equal(await page.getByLabel('控制台访问令牌',{exact:true}).inputValue(),'');await saveShot(page,'authentication');
  await page.setViewportSize({width:520,height:820});
  const compact=await page.locator('#panel-recovery').evaluate(node=>{const rect=node.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,left:rect.left,right:rect.right,width:innerWidth};});
  assert.equal(compact.overflow,false);assert.ok(compact.left>=0&&compact.right<=compact.width+1,'the credential recovery card fits a narrow window');
  await saveShot(page,'authentication-narrow');await page.setViewportSize({width:1360,height:900});
  const credential=await page.getByLabel('控制台访问令牌',{exact:true}).elementHandle();
  heldCandidate={token:wrongToken,wait:gate(),ready:false};
  const wrongBefore=requests.filter(request=>new URL(request.url).pathname==='/api/panels'&&request.token===wrongToken).length;
  await submitCredential(page,wrongToken);await until(()=>heldCandidate.ready,'The wrong candidate must reach real HTTP authentication');
  assert.equal(heldCandidate.status,401);assert.equal(await page.getByRole('button',{name:'重新连接',exact:true}).isDisabled(),true);
  assert.equal(await sessionRecord(page),null,'a pending or wrong candidate is never cached');
  await page.locator('#panel-recovery form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(requests.filter(request=>new URL(request.url).pathname==='/api/panels'&&request.token===wrongToken).length,wrongBefore+1,'busy state rejects duplicate submissions');
  const wrongHeld=heldCandidate;heldCandidate=null;wrongHeld.wait.release();
  await page.locator('#panel-recovery-status').filter({hasText:'访问令牌未通过验证'}).waitFor();
  assert.equal(await page.getByLabel('控制台访问令牌',{exact:true}).inputValue(),wrongToken);assert.equal(await page.getByLabel('控制台访问令牌',{exact:true}).isEnabled(),true);
  assert.doesNotMatch(await page.locator('#panel-recovery').innerText(),/synthetic-wrong-console167/);
  assert.equal(await sessionRecord(page),null);assert.equal(disk(),initialConfig);assert.deepEqual(configWrites,[]);

  console.log('· A verified current token restores nine real panels, iframe APIs and SSE without changing server configuration');
  heldCandidate={token:validToken,wait:gate(),ready:false};
  await submitCredential(page,validToken);await until(()=>heldCandidate.ready,'The good candidate must reach real panel authentication');
  assert.equal(heldCandidate.status,200);assert.equal(await sessionRecord(page),null,'adoption waits for the actual panel response');
  const goodHeld=heldCandidate;heldCandidate=null;goodHeld.wait.release();await authenticated(page);
  assert.equal(await credential.evaluate(input=>input.value),'','successful recovery clears the detached sensitive input');
  kernel.orchestrator.pause();kernel.bus.emit('status',{paused:true});await page.locator('#pause-btn').filter({hasText:'恢复运行'}).waitFor();
  kernel.orchestrator.resume();kernel.bus.emit('status',{paused:false});
  assert.ok(requests.some(request=>new URL(request.url).pathname==='/api/events'&&request.token===validToken));assert.equal(disk(),initialConfig);
  await saveShot(page,'recovered');

  console.log('· Expired tab credentials clear safely and expose the same recovery path');
  await page.evaluate(key=>{const record=JSON.parse(sessionStorage.getItem(key));record.expiresAt=Date.now()-1;sessionStorage.setItem(key,JSON.stringify(record));},CONSOLE_SESSION_KEY);
  const expired=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/panels');await page.reload();assert.equal((await expired).status(),401);
  await authenticationCard(page);assert.equal(await sessionRecord(page),null);await submitCredential(page,validToken);await authenticated(page);

  console.log('· Clear/dispose erase password inputs and invalidate an in-flight candidate before adoption');
  const lifecycle=await page.evaluate(async({token,base})=>{
    const{createPanelRecovery}=await import('/panel-recovery.js'),{ApiClient}=await import('/api-client.js');
    const host=document.createElement('div');document.body.append(host);let adopted=0,recovered=0;
    const recovery=createPanelRecovery({host,api:new ApiClient({base}),auth:{adopt(){adopted++;}},onRecovered(){recovered++;}});
    recovery.show({status:401});const input=host.querySelector('input');input.value=token;recovery.clear();const cleared=input.value==='';
    recovery.show({status:401});input.value=token;host.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));recovery.dispose();
    await new Promise(resolve=>setTimeout(resolve,50));const result={cleared,disposedInputEmpty:input.value==='',empty:host.childElementCount===0,adopted,recovered};host.remove();return result;
  },{token:validToken,base});
  assert.deepEqual(lifecycle,{cleared:true,disposedInputEmpty:true,empty:true,adopted:0,recovered:0});
  heldCandidate={token:validToken,wait:gate(),ready:false};
  await page.evaluate(async({token,base})=>{
    const{createPanelRecovery}=await import('/panel-recovery.js'),{ApiClient}=await import('/api-client.js');
    const host=document.createElement('div');document.body.append(host);
    const api=new ApiClient({base,token}),auth={token,adopt(value){this.token=value;state.adopted++;}};
    const state={host,api,auth,adopted:0,recovered:0};
    state.recovery=createPanelRecovery({host,api,auth,onRecovered(){state.recovered++;}});window.qa167Fence=state;
    state.recovery.show({status:401});host.querySelector('input').value=token;host.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));
  },{token:validToken,base});
  await until(()=>heldCandidate.ready,'The generation-fence candidate must authenticate against the real kernel');
  assert.equal(heldCandidate.status,200);
  await page.evaluate(token=>{const state=window.qa167Fence;state.api.setToken('synthetic-intermediate167');state.api.setToken(token);},validToken);
  const obsolete=heldCandidate;heldCandidate=null;obsolete.wait.release();
  await until(async()=>page.evaluate(()=>window.qa167Fence.host.textContent.includes('控制台连接已更新')),'An old successful candidate cannot override a newer shared credential generation');
  assert.deepEqual(await page.evaluate(()=>{const state=window.qa167Fence,result={adopted:state.adopted,recovered:state.recovered,version:state.api.authVersion};state.recovery.dispose();state.host.remove();delete window.qa167Fence;return result;}),{adopted:0,recovered:0,version:2});
  await missing.context.close();

  console.log('· A temporary 503 preserves a stable retry card and retries with the existing authenticated client');
  let failManifest=true,lastManifestChange=Date.now(),panelReads=0;
  const transient=await newContext({session:true,panels:async route=>{panelReads++;lastManifestChange=Date.now();if(failManifest)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA167 temporary panel peer unavailable'})});return route.continue();}});
  await transient.page.goto(base);await transient.page.locator('#panel-recovery-title').filter({hasText:'面板加载失败'}).waitFor();
  await transient.page.locator('#sse').filter({hasText:'SSE 已连接'}).waitFor();
  await until(()=>Date.now()-lastManifestChange>180,'Initial bounded manifest attempts must settle');
  const retryCard=await transient.page.locator('#panel-recovery').elementHandle();
  assert.equal(await transient.page.locator('#panel-recovery input').count(),0,'a non-authentication failure has no credential input');
  assert.doesNotMatch(await transient.page.locator('#panel-host').innerText(),/暂无已注册面板/);
  await saveShot(transient.page,'temporary-failure');
  const readsBefore=panelReads;failManifest=false;
  const retried=transient.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/panels');
  await transient.page.getByRole('button',{name:'重试加载',exact:true}).click();assert.equal((await retried).status(),200);await authenticated(transient.page);
  assert.ok(panelReads>readsBefore);assert.equal(await retryCard.evaluate(node=>node.isConnected),false);assert.equal(disk(),initialConfig);
  await transient.context.close();

  console.log('· A successful HTTP response with a malformed panel list cannot commit a candidate credential');
  let malformed=true;
  const structural=await newContext({panels:async route=>{if(!malformed||route.request().headers()['x-console-token']!==validToken)return route.continue();const response=await route.fetch();assert.equal(response.status(),200);return route.fulfill({response,json:{panels:{invalid:true}}});}});
  await structural.page.goto(base);await authenticationCard(structural.page);await submitCredential(structural.page,validToken);
  await structural.page.locator('#panel-recovery-status').filter({hasText:'连接验证失败'}).waitFor();
  assert.equal(await sessionRecord(structural.page),null);assert.equal(await structural.page.locator('#nav button[data-panel]').count(),0);
  assert.equal(await structural.page.getByLabel('控制台访问令牌',{exact:true}).inputValue(),validToken);assert.equal(disk(),initialConfig);
  malformed=false;await structural.page.getByRole('button',{name:'重新连接',exact:true}).click();await authenticated(structural.page);
  await structural.context.close();

  console.log('· A genuine empty array remains an empty registry rather than an authentication or loading failure');
  const empty=await newContext({session:true,panels:async route=>{const response=await route.fetch();assert.equal(response.status(),200);return route.fulfill({response,json:{panels:[]}});}});
  await empty.page.goto(base);await empty.page.locator('#sse').filter({hasText:'SSE 已连接'}).waitFor();
  await empty.page.locator('#workspace-description').filter({hasText:'暂无已注册面板'}).waitFor({state:'attached'});
  assert.equal(await empty.page.locator('#panel-recovery').count(),0);assert.equal(await empty.page.locator('#nav button[data-panel]').count(),0);
  assert.doesNotMatch(await empty.page.locator('#panel-host').innerText(),/认证已失效|面板加载失败/);await empty.context.close();

  assert.equal(disk(),initialConfig);assert.deepEqual(configWrites,[]);assert.deepEqual(errors,[]);assert.deepEqual(outboundRequests,[]);assert.equal(outbound,0);
  assert.ok(requests.every(request=>!new URL(request.url).searchParams.has('token')),'recovery never places credentials into URLs');
  console.log(JSON.stringify({test:'167-panel-load-recovery',result:'passed',realKernel:true,realChromium:true,recoveredNavigationCount:9,serverConfigurationWrites:configWrites.length,outboundRequests:outbound,productionConsoleAccessed:false}));
}finally{
  for(const release of releases)release();await browser?.close();await kernel.stop();
  assert.equal(path.dirname(path.resolve(dataDir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dataDir).startsWith('qqa-panel-recovery167-'));fs.rmSync(dataDir,{recursive:true,force:true});
}
